import { randomUUID } from 'node:crypto';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { getServiceRoleSupabaseClient } from '../config/supabase.js';
import { extractDesignPlaceholders, sanitizeOutputName, validatePlaceholderMapping } from '../validators/csvValidators.js';

const DESIGN_ASSET_BUCKET = 'designer-assets';
const OUTPUT_BUCKET = 'generated-print-files';
const URL_SECONDS = 60;
const MAX_BATCH_OUTPUT_BYTES = 100 * 1024 * 1024;
const BATCH_FIELDS = 'id, customer_id, design_id, original_csv_filename, total_rows, successful_outputs, failed_rows, status, created_at, updated_at';
const OUTPUT_FIELDS = 'id, batch_id, design_id, row_number, original_filename, file_size, created_at';

function failure(statusCode, message, cause) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (cause) error.cause = cause;
  return error;
}

function check(error, message) {
  if (error) throw failure(503, message, error);
}

function fontFor(family) {
  if (family === 'Georgia' || family === 'Times New Roman') return StandardFonts.TimesRoman;
  if (family === 'Courier New') return StandardFonts.Courier;
  return StandardFonts.Helvetica;
}

function colorFromHex(value) {
  const color = String(value || '#20231f').replace('#', '');
  return rgb(Number.parseInt(color.slice(0, 2), 16) / 255, Number.parseInt(color.slice(2, 4), 16) / 255, Number.parseInt(color.slice(4, 6), 16) / 255);
}

function wrapParagraph(paragraph, font, size, maxWidth) {
  const words = paragraph.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { line = candidate; continue; }
    if (line) lines.push(line);
    line = '';
    let segment = '';
    for (const character of word) {
      if (font.widthOfTextAtSize(character, size) > maxWidth) throw failure(422, 'Personalized text does not fit its saved text element');
      const next = segment + character;
      if (segment && font.widthOfTextAtSize(next, size) > maxWidth) { lines.push(segment); segment = character; }
      else segment = next;
    }
    line = segment;
  }
  if (line) lines.push(line);
  return lines;
}

function wrapText(text, font, size, maxWidth, maxHeight) {
  if (!String(text)) return [];
  const lineHeight = size * 1.05;
  const maxLines = Math.max(0, Math.floor(maxHeight / lineHeight));
  if (String(text) && !maxLines) throw failure(422, 'Personalized text does not fit its saved text element');
  const lines = String(text).split(/\r?\n/).flatMap((paragraph) => wrapParagraph(paragraph, font, size, maxWidth));
  if (lines.length > maxLines) throw failure(422, 'Personalized text does not fit its saved text element');
  return lines.map((line) => line.slice(0, 3000));
}

function replacePlaceholders(text, values) {
  return text.replace(/\{\{\s*([a-z][a-z0-9_]{0,59})\s*\}\}/gi, (_whole, key) => values[key] ?? '');
}

function rotatePoint(x, y, centerX, centerY, degreesClockwise) {
  const radians = degreesClockwise * Math.PI / 180;
  const dx = x - centerX;
  const dy = y - centerY;
  return {
    x: centerX + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: centerY + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

async function getOwnedDesign(client, customerId, designId) {
  const { data, error } = await client.from('customer_designs')
    .select('id, customer_id, product_id, template_id, name, design_data, product_templates(name)')
    .eq('id', designId).eq('customer_id', customerId).maybeSingle();
  if (error) throw failure(503, 'Saved design details are temporarily unavailable', error);
  if (!data) throw failure(404, 'Saved design not found');
  const elements = data.design_data?.elements;
  const canvas = data.design_data?.template?.canvas;
  const area = data.design_data?.template?.printableArea;
  if (!Array.isArray(elements) || !canvas?.width || !canvas?.height || !area) {
    throw failure(409, 'This saved design does not have a supported template layout');
  }
  return data;
}

async function fetchImageBytes(client, assetId, customerId, designId, assetMap) {
  const asset = assetMap.get(assetId);
  if (!asset || asset.customer_id !== customerId || asset.design_id !== designId
    || !asset.is_previewable || !['image/png', 'image/jpeg'].includes(asset.mime_type)) {
    throw failure(400, 'A design image is missing or is not available for PDF generation');
  }
  const { data, error } = await client.storage.from(DESIGN_ASSET_BUCKET).download(asset.storage_path);
  if (error || !data) throw failure(503, 'A saved design image could not be read from private storage', error);
  return { bytes: Buffer.from(await data.arrayBuffer()), mimeType: asset.mime_type };
}

async function makePersonalizedPdf(client, design, row, mapping, assetMap, rowNumber) {
  const { template, elements } = design.design_data;
  const canvas = template.canvas;
  if (Number(canvas.width) > 14400 || Number(canvas.height) > 14400) {
    throw failure(422, 'The saved canvas is too large for this basic PDF export (maximum 14,400 coordinate units per side)');
  }
  const values = Object.fromEntries(Object.entries(mapping).map(([placeholder, column]) => [placeholder, row[column] ?? '']));
  const document = await PDFDocument.create();
  const page = document.addPage([Number(canvas.width), Number(canvas.height)]);
  page.drawRectangle({ x: 0, y: 0, width: Number(canvas.width), height: Number(canvas.height), color: colorFromHex(template.backgroundColor) });

  for (const element of elements) {
    const centerX = Number(element.x) + Number(element.width) / 2;
    const centerY = Number(canvas.height) - Number(element.y) - Number(element.height) / 2;
    if (element.type === 'text') {
      const font = await document.embedFont(fontFor(element.fontFamily));
      const size = Number(element.fontSize);
      const outputText = replacePlaceholders(element.text, values);
      const lines = wrapText(outputText, font, size, Number(element.width), Number(element.height));
      const rotation = -Number(element.rotation || 0);
      lines.forEach((line, index) => {
        const localX = Number(element.x);
        const localY = Number(canvas.height) - Number(element.y) - size - index * size * 1.05;
        const point = rotatePoint(localX, localY, centerX, centerY, rotation);
        page.drawText(line, {
          x: point.x, y: point.y, size, font, color: colorFromHex(element.color), rotate: degrees(rotation),
          maxWidth: Number(element.width),
        });
      });
    } else if (element.type === 'image') {
      const { bytes, mimeType } = await fetchImageBytes(client, element.assetId, design.customer_id, design.id, assetMap);
      const image = mimeType === 'image/png' ? await document.embedPng(bytes) : await document.embedJpg(bytes);
      const scale = Math.min(Number(element.width) / image.width, Number(element.height) / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      const rotation = -Number(element.rotation || 0);
      const radians = rotation * Math.PI / 180;
      page.drawImage(image, {
        x: centerX - (width / 2 * Math.cos(radians) - height / 2 * Math.sin(radians)),
        y: centerY - (width / 2 * Math.sin(radians) + height / 2 * Math.cos(radians)),
        width,
        height,
        rotate: degrees(rotation),
      });
    }
  }

  document.setTitle(`${design.name} — ${rowNumber}`.slice(0, 200));
  document.setCreator('Digital Heroes Web-to-Print');
  document.setSubject('Variable-data artwork preview. Canvas coordinate units are represented as PDF points; physical print dimensions and prepress are not validated.');
  return Buffer.from(await document.save());
}

function rowOutputName(design, row, mapping, rowNumber) {
  const firstMappedColumn = Object.values(mapping)[0];
  const rowValue = firstMappedColumn ? row[firstMappedColumn] : '';
  const reference = sanitizeOutputName(rowValue, `row-${rowNumber - 1}`);
  return `${sanitizeOutputName(design.name, 'design')}-${reference}-${rowNumber - 1}.pdf`.slice(0, 120);
}

export async function previewVariableDataCsv({ filename, csv }) {
  return { original_filename: filename, headers: csv.headers, total_rows: csv.rows.length, preview_rows: csv.rows.slice(0, 5) };
}

export async function listVariableDataBatches(customerId) {
  const client = getServiceRoleSupabaseClient();
  const { data, error } = await client.from('variable_data_batches')
    .select(`${BATCH_FIELDS}, customer_designs(name, product_templates(name)), variable_data_outputs(${OUTPUT_FIELDS})`)
    .eq('customer_id', customerId).order('created_at', { ascending: false });
  check(error, 'Variable-data batch history is temporarily unavailable');
  return data.map((batch) => ({
    ...batch,
    design: batch.customer_designs,
    outputs: [...(batch.variable_data_outputs || [])].sort((a, b) => a.row_number - b.row_number),
  })).map(({ customer_designs: _design, variable_data_outputs: _outputs, ...batch }) => batch);
}

export async function generateVariableDataBatch({ customerId, designId, filename, csv, mapping }) {
  const client = getServiceRoleSupabaseClient();
  const design = await getOwnedDesign(client, customerId, designId);
  const placeholders = extractDesignPlaceholders(design.design_data.elements);
  const parsedMapping = typeof mapping === 'string' ? (() => {
    try { return JSON.parse(mapping); } catch { throw failure(400, 'Placeholder mapping must be valid JSON'); }
  })() : mapping;
  const validatedMapping = validatePlaceholderMapping(parsedMapping, placeholders, csv.headers);

  const { data: assets, error: assetsError } = await client.from('design_assets')
    .select('id, customer_id, design_id, storage_path, mime_type, is_previewable')
    .eq('customer_id', customerId).eq('design_id', design.id);
  check(assetsError, 'Design assets are temporarily unavailable');
  const assetMap = new Map((assets || []).map((asset) => [asset.id, asset]));

  const { data: batch, error: batchError } = await client.from('variable_data_batches').insert({
    customer_id: customerId,
    design_id: design.id,
    original_csv_filename: filename,
    total_rows: csv.rows.length,
    status: 'processing',
  }).select(BATCH_FIELDS).single();
  check(batchError, 'Variable-data batch could not be created');

  const failures = [];
  let successfulOutputs = 0;
  let totalOutputBytes = 0;
  try {
    for (let index = 0; index < csv.rows.length; index += 1) {
      const rowNumber = index + 2;
      const row = csv.rows[index];
      try {
        const bytes = await makePersonalizedPdf(client, design, row, validatedMapping, assetMap, rowNumber);
        if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw failure(413, 'Generated PDF exceeds the 20 MB output limit');
        if (totalOutputBytes + bytes.length > MAX_BATCH_OUTPUT_BYTES) throw failure(413, 'This batch reached its 100 MB total output limit');
        const originalFilename = rowOutputName(design, row, validatedMapping, rowNumber);
        const storagePath = `${customerId}/${batch.id}/${randomUUID()}.pdf`;
        const { error: uploadError } = await client.storage.from(OUTPUT_BUCKET).upload(storagePath, bytes, {
          contentType: 'application/pdf', cacheControl: '3600', upsert: false,
        });
        if (uploadError) throw failure(503, 'The personalized PDF could not be stored privately', uploadError);
        const { error: outputError } = await client.from('variable_data_outputs').insert({
          batch_id: batch.id,
          customer_id: customerId,
          design_id: design.id,
          row_number: rowNumber,
          original_filename: originalFilename,
          storage_path: storagePath,
          file_size: bytes.length,
        });
        if (outputError) {
          await client.storage.from(OUTPUT_BUCKET).remove([storagePath]);
          throw failure(503, 'Personalized PDF metadata could not be saved', outputError);
        }
        successfulOutputs += 1;
        totalOutputBytes += bytes.length;
      } catch (error) {
        failures.push({ row: rowNumber, message: String(error.message || 'Output generation failed').slice(0, 240) });
      }
      const progress = await client.from('variable_data_batches').update({
        successful_outputs: successfulOutputs,
        failed_rows: failures,
      }).eq('id', batch.id).eq('customer_id', customerId);
      check(progress.error, 'Variable-data batch progress could not be saved');
    }
    const status = successfulOutputs === csv.rows.length ? 'completed' : successfulOutputs > 0 ? 'partial' : 'failed';
    const { data: completed, error: completeError } = await client.from('variable_data_batches')
      .update({ successful_outputs: successfulOutputs, failed_rows: failures, status })
      .eq('id', batch.id).eq('customer_id', customerId).select(BATCH_FIELDS).single();
    check(completeError, 'Variable-data batch result could not be saved');
    const { data: outputs, error: outputsError } = await client.from('variable_data_outputs')
      .select(OUTPUT_FIELDS).eq('batch_id', batch.id).eq('customer_id', customerId).order('row_number');
    check(outputsError, 'Variable-data outputs could not be listed');
    return { ...completed, outputs };
  } catch (error) {
    const failedRows = [...failures, { row: 0, message: String(error.message || 'Batch processing failed').slice(0, 240) }];
    await client.from('variable_data_batches').update({
      status: successfulOutputs > 0 ? 'partial' : 'failed', successful_outputs: successfulOutputs, failed_rows: failedRows,
    }).eq('id', batch.id).eq('customer_id', customerId);
    throw error;
  }
}

export async function downloadVariableDataOutput(customerId, batchId, outputId) {
  const client = getServiceRoleSupabaseClient();
  const { data, error } = await client.from('variable_data_outputs')
    .select('storage_path, original_filename')
    .eq('id', outputId).eq('batch_id', batchId).eq('customer_id', customerId).maybeSingle();
  if (error) throw failure(503, 'Variable-data file access is temporarily unavailable', error);
  if (!data) throw failure(404, 'Variable-data output not found');
  const { data: link, error: linkError } = await client.storage.from(OUTPUT_BUCKET)
    .createSignedUrl(data.storage_path, URL_SECONDS, { download: data.original_filename });
  if (linkError || !link?.signedUrl) throw failure(503, 'A secure output download link could not be created', linkError);
  return { url: link.signedUrl, expiresIn: URL_SECONDS };
}
