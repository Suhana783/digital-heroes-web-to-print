import path from 'node:path';
import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const FONT_FAMILIES = new Set(['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana']);
const ELEMENT_KEYS = new Set(['id', 'type', 'x', 'y', 'width', 'height', 'rotation', 'text', 'fontFamily', 'fontSize', 'color', 'assetId']);

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function number(value, label, { min = 0, max = 100000 } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw invalid(`${label} must be between ${min} and ${max}`);
  return result;
}

export function validateTemplateInput(input = {}) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 120) throw invalid('Template name must be between 1 and 120 characters');
  if (!UUID.test(input.product_id || '')) throw invalid('Choose a valid product');
  if (typeof input.is_active !== 'boolean') throw invalid('Template active status must be true or false');

  const canvasWidth = number(input.canvas_width, 'Canvas width', { min: 1 });
  const canvasHeight = number(input.canvas_height, 'Canvas height', { min: 1 });
  const printableX = number(input.printable_x, 'Printable area X');
  const printableY = number(input.printable_y, 'Printable area Y');
  const printableWidth = number(input.printable_width, 'Printable area width', { min: 1 });
  const printableHeight = number(input.printable_height, 'Printable area height', { min: 1 });
  if (printableX + printableWidth > canvasWidth || printableY + printableHeight > canvasHeight) {
    throw invalid('Printable boundaries must fit inside the canvas');
  }
  const background = typeof input.background_color === 'string' ? input.background_color : '';
  if (!HEX_COLOR.test(background)) throw invalid('Background color must be a six-digit hex color');

  const allowed = input.allowed_elements;
  if (!Array.isArray(allowed) || !allowed.length || allowed.length > 2
    || new Set(allowed).size !== allowed.length || allowed.some((value) => !['text', 'image'].includes(value))) {
    throw invalid('Allowed elements can contain text and/or image');
  }

  const placeholderConfig = input.placeholder_config;
  if (!placeholderConfig || typeof placeholderConfig !== 'object' || Array.isArray(placeholderConfig)
    || !Array.isArray(placeholderConfig.placeholders) || placeholderConfig.placeholders.length > 100) {
    throw invalid('Placeholder configuration must be an object with a placeholders array');
  }
  const placeholderKeys = new Set();
  for (const placeholder of placeholderConfig.placeholders) {
    if (!placeholder || typeof placeholder !== 'object' || Array.isArray(placeholder)
      || typeof placeholder.key !== 'string' || !/^[a-z][a-z0-9_]{0,59}$/i.test(placeholder.key)
      || typeof placeholder.label !== 'string' || !placeholder.label.trim() || placeholder.label.length > 120
      || !['text', 'number'].includes(placeholder.type)) {
      throw invalid('Each placeholder needs a key, label, and text or number type');
    }
    if (placeholderKeys.has(placeholder.key)) throw invalid('Placeholder keys must be unique');
    placeholderKeys.add(placeholder.key);
    if (placeholder.minFontSize !== undefined) number(placeholder.minFontSize, 'Placeholder minimum font size', { min: 1, max: 500 });
    if (placeholder.maxFontSize !== undefined) number(placeholder.maxFontSize, 'Placeholder maximum font size', { min: 1, max: 500 });
    if (placeholder.minFontSize !== undefined && placeholder.maxFontSize !== undefined
      && Number(placeholder.minFontSize) > Number(placeholder.maxFontSize)) throw invalid('Placeholder minimum font size cannot exceed its maximum');
  }

  return {
    product_id: input.product_id,
    name,
    canvas_width: canvasWidth,
    canvas_height: canvasHeight,
    printable_x: printableX,
    printable_y: printableY,
    printable_width: printableWidth,
    printable_height: printableHeight,
    background_color: background.toLowerCase(),
    allowed_elements: allowed,
    placeholder_config: placeholderConfig,
    is_active: input.is_active,
  };
}

export function templateSnapshot(template) {
  return {
    id: template.id,
    name: template.name,
    productId: template.product_id,
    canvas: { width: Number(template.canvas_width), height: Number(template.canvas_height) },
    printableArea: {
      x: Number(template.printable_x), y: Number(template.printable_y),
      width: Number(template.printable_width), height: Number(template.printable_height),
    },
    backgroundColor: template.background_color,
    allowedElements: template.allowed_elements,
    placeholderConfig: template.placeholder_config,
  };
}

function rotatedBounds(element) {
  const radians = Math.abs(element.rotation) * Math.PI / 180;
  const halfWidth = (Math.abs(Math.cos(radians)) * element.width + Math.abs(Math.sin(radians)) * element.height) / 2;
  const halfHeight = (Math.abs(Math.sin(radians)) * element.width + Math.abs(Math.cos(radians)) * element.height) / 2;
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  return { left: centerX - halfWidth, right: centerX + halfWidth, top: centerY - halfHeight, bottom: centerY + halfHeight };
}

export function validateDesignElements(elements, template, assets = []) {
  if (!Array.isArray(elements) || elements.length > 100) throw invalid('A design can contain at most 100 elements');
  const allowedTypes = new Set(template.allowedElements || []);
  const area = template.printableArea;
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const seenIds = new Set();

  return elements.map((input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Each design element must be an object');
    if (Object.keys(input).some((key) => !ELEMENT_KEYS.has(key))) throw invalid('Design elements contain unsupported fields');
    if (!['text', 'image'].includes(input.type) || !allowedTypes.has(input.type)) throw invalid('This template does not allow that element type');
    const id = UUID.test(input.id || '') ? input.id : randomUUID();
    if (seenIds.has(id)) throw invalid('Design element IDs must be unique');
    seenIds.add(id);
    const element = {
      id,
      type: input.type,
      x: number(input.x, 'Element X position'),
      y: number(input.y, 'Element Y position'),
      width: number(input.width, 'Element width', { min: 1 }),
      height: number(input.height, 'Element height', { min: 1 }),
      rotation: number(input.rotation ?? 0, 'Element rotation', { min: -360, max: 360 }),
    };
    if (element.width > template.canvas.width || element.height > template.canvas.height) throw invalid('Element dimensions exceed the canvas');

    if (input.type === 'text') {
      if (typeof input.text !== 'string' || input.text.length > 3000) throw invalid('Text must be 3,000 characters or fewer');
      if (!FONT_FAMILIES.has(input.fontFamily)) throw invalid('Choose a supported font family');
      if (!HEX_COLOR.test(input.color || '')) throw invalid('Text color must be a six-digit hex color');
      element.text = input.text;
      element.fontFamily = input.fontFamily;
      element.fontSize = number(input.fontSize, 'Font size', { min: 1, max: 1000 });
      element.color = input.color.toLowerCase();
    } else {
      if (!UUID.test(input.assetId || '')) throw invalid('Choose a valid uploaded image');
      const asset = assetById.get(input.assetId);
      if (!asset || !asset.is_previewable || !['image/png', 'image/jpeg'].includes(asset.mime_type)) {
        throw invalid('Only uploaded PNG and JPG images can be placed on the canvas');
      }
      element.assetId = asset.id;
    }

    const bounds = rotatedBounds(element);
    if (bounds.left < area.x - 0.001 || bounds.top < area.y - 0.001
      || bounds.right > area.x + area.width + 0.001 || bounds.bottom > area.y + area.height + 0.001) {
      throw invalid('Every element, including its rotation, must stay inside the printable area');
    }
    return element;
  });
}

const ASSET_TYPES = new Map([
  ['.pdf', { mime: 'application/pdf', previewable: false, signature: (bytes) => bytes.subarray(0, 5).toString('ascii') === '%PDF-' }],
  ['.png', { mime: 'image/png', previewable: true, signature: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
  ['.jpg', { mime: 'image/jpeg', previewable: true, signature: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ['.jpeg', { mime: 'image/jpeg', previewable: true, signature: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ['.svg', { mime: 'image/svg+xml', previewable: false, signature: (bytes) => /^\uFEFF?\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(bytes.toString('utf8')) }],
  ['.ai', { mime: 'application/postscript', previewable: false, signature: (bytes) => bytes.subarray(0, 11).toString('ascii').startsWith('%!PS-Adobe') || bytes.subarray(0, 5).toString('ascii') === '%PDF-' }],
]);

export function validateDesignAsset({ filename, mimeType, size, buffer }) {
  if (!filename || typeof filename !== 'string' || !Buffer.isBuffer(buffer)) throw invalid('Choose one design file to upload');
  if (size < 1 || size > 10 * 1024 * 1024 || size !== buffer.length) {
    const error = new Error('Design files must be between 1 byte and 10 MB');
    error.statusCode = size > 10 * 1024 * 1024 ? 413 : 400;
    throw error;
  }
  const originalFilename = path.basename(filename.replaceAll('\\', '/')).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!originalFilename || Buffer.byteLength(originalFilename, 'utf8') > 255) throw invalid('The filename must be 255 bytes or fewer');
  const format = ASSET_TYPES.get(path.extname(originalFilename).toLowerCase());
  if (!format || mimeType !== format.mime || !format.signature(buffer)) {
    throw invalid('Upload a matching PDF, PNG, JPG, SVG, or AI file. Only PNG and JPG can be placed on the canvas.');
  }
  return { originalFilename, mimeType: format.mime, size, buffer, extension: path.extname(originalFilename).toLowerCase(), previewable: format.previewable };
}

export function validateDesignerId(request, response, next) {
  const values = ['templateId', 'designId', 'assetId'].filter((key) => request.params[key] !== undefined).map((key) => request.params[key]);
  if (values.some((value) => !UUID.test(value))) return response.status(400).json({ success: false, message: 'A valid designer resource ID is required' });
  next();
}
