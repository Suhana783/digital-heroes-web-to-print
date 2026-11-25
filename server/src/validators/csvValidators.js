import path from 'node:path';

const MAX_CSV_BYTES = 1024 * 1024;
const MAX_CSV_ROWS = 100;
const MAX_COLUMNS = 50;
const MAX_CELL_CHARS = 3000;
const MAX_HEADER_CHARS = 100;

function invalid(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function safeCsvFilename(filename) {
  if (typeof filename !== 'string' || path.extname(filename).toLowerCase() !== '.csv') {
    throw invalid('Upload a CSV file with a .csv extension');
  }
  const result = path.basename(filename.replaceAll('\\', '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!result || Buffer.byteLength(result, 'utf8') > 255) throw invalid('CSV filename must be 255 bytes or fewer');
  return result;
}

export function parseCsvBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1) throw invalid('The CSV file is empty');
  if (buffer.length > MAX_CSV_BYTES) throw invalid('CSV files must be 1 MB or smaller', 413);

  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw invalid('CSV files must use valid UTF-8 text'); }
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  if (source.includes('\0')) throw invalid('The CSV contains invalid binary data');

  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let closedQuote = false;
  function appendCell() {
    if (cell.length > MAX_CELL_CHARS) throw invalid(`CSV cells must be ${MAX_CELL_CHARS} characters or fewer`);
    row.push(cell);
    cell = '';
    closedQuote = false;
    if (row.length > MAX_COLUMNS) throw invalid(`CSV files can contain at most ${MAX_COLUMNS} columns`);
  }
  function appendRow() {
    appendCell();
    if (row.some((value) => value.trim() !== '')) rows.push(row);
    row = [];
    if (rows.length > MAX_CSV_ROWS + 1) throw invalid(`CSV files can contain at most ${MAX_CSV_ROWS} data rows`);
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') { quoted = false; closedQuote = true; }
      else cell += character;
      continue;
    }
    if (closedQuote && character !== ',' && character !== '\r' && character !== '\n') {
      throw invalid('The CSV has characters after a closing quote');
    }
    if (character === '"') {
      if (cell.length) throw invalid('The CSV contains a quote inside an unquoted value');
      quoted = true;
    } else if (character === ',') appendCell();
    else if (character === '\r' || character === '\n') {
      appendRow();
      if (character === '\r' && source[index + 1] === '\n') index += 1;
    } else cell += character;
  }
  if (quoted) throw invalid('The CSV has an unterminated quoted value');
  if (cell.length || row.length) appendRow();

  if (rows.length < 2) throw invalid('CSV needs a header row and at least one data row');
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header || header.length > MAX_HEADER_CHARS)) {
    throw invalid(`Every CSV header must contain 1 to ${MAX_HEADER_CHARS} characters`);
  }
  const normalizedHeaders = headers.map((header) => header.toLocaleLowerCase('en-US'));
  if (new Set(normalizedHeaders).size !== headers.length) throw invalid('CSV headers must be unique');
  const records = rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) throw invalid(`CSV row ${index + 2} has ${values.length} values; expected ${headers.length}`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column]]));
  });
  return { headers, rows: records };
}

export function validatePlaceholderMapping(mapping, placeholders, headers) {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw invalid('Map CSV columns to every design placeholder');
  const required = [...new Set(placeholders)];
  if (!required.length) throw invalid('Add {{placeholder}} text to the saved design before running a CSV merge');
  if (Object.keys(mapping).some((key) => !required.includes(key))) throw invalid('The mapping contains a placeholder that is not in the design');
  for (const placeholder of required) {
    if (typeof mapping[placeholder] !== 'string' || !headers.includes(mapping[placeholder])) {
      throw invalid(`Choose a CSV column for the {{${placeholder}}} placeholder`);
    }
  }
  return Object.fromEntries(required.map((key) => [key, mapping[key]]));
}

export function extractDesignPlaceholders(elements) {
  const found = new Set();
  for (const element of elements || []) {
    if (element.type !== 'text' || typeof element.text !== 'string') continue;
    for (const match of element.text.matchAll(/\{\{\s*([a-z][a-z0-9_]{0,59})\s*\}\}/gi)) found.add(match[1]);
  }
  return [...found];
}

export function sanitizeOutputName(value, fallback = 'record') {
  const normalized = String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  const slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 56);
  return slug || fallback;
}
