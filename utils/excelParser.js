const XLSX = require('xlsx');
const {
  normalizeHeader,
  cleanString,
  cleanIdentifier,
  toNumber
} = require('./common');

const BARCODE_ALIASES = ['barcode', 'codigodebarras', 'barras', 'ean', 'upc'];
const CODE_ALIASES = ['codigo', 'sku', 'clave', 'productoid'];
const DESCRIPTION_ALIASES = ['descripcion', 'description', 'nombre', 'producto'];
const QUANTITY_ALIASES = ['cantidad', 'existencia', 'conteo', 'unidades', 'qty'];

function readFirstSheet(filePath) {
  const workbook = XLSX.readFile(filePath, { raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: ''
  });
}

function findIndexByAliases(headers, aliases) {
  for (let index = 0; index < headers.length; index += 1) {
    if (aliases.includes(headers[index])) {
      return index;
    }
  }

  return -1;
}

function detectRetailOneHeader(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const normalized = rows[i].map(normalizeHeader);
    const hasExistencia = normalized.includes('existencia');
    const hasCodigo = normalized.includes('codigo');
    const hasDescripcion = normalized.includes('descripcion');

    if (hasExistencia && hasCodigo && hasDescripcion) {
      return {
        index: i,
        existenciaIndex: normalized.indexOf('existencia'),
        codigoIndex: normalized.indexOf('codigo'),
        descripcionIndex: normalized.indexOf('descripcion'),
        barcodeIndex: findIndexByAliases(normalized, BARCODE_ALIASES)
      };
    }
  }

  return null;
}

function parseRetailOneRows(rows) {
  const header = detectRetailOneHeader(rows);

  if (!header) {
    return [];
  }

  const items = [];

  for (let i = header.index + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const codigo = cleanIdentifier(row[header.codigoIndex]);
    const descripcion = cleanString(row[header.descripcionIndex]);
    const barcode = header.barcodeIndex > -1 ? cleanIdentifier(row[header.barcodeIndex]) : '';
    const rawCantidad = row[header.existenciaIndex];
    const hasCantidad = cleanString(rawCantidad) !== '';

    if (!codigo) {
      continue;
    }

    if (!hasCantidad && toNumber(rawCantidad) === 0) {
      continue;
    }

    items.push({
      codigo,
      barcode,
      descripcion,
      cantidad: toNumber(rawCantidad)
    });
  }

  return items;
}

function detectGenericHeader(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const normalized = rows[i].map(normalizeHeader);
    const quantityIndex = findIndexByAliases(normalized, QUANTITY_ALIASES);
    const barcodeIndex = findIndexByAliases(normalized, BARCODE_ALIASES);
    const codeIndex = findIndexByAliases(normalized, CODE_ALIASES);

    if (quantityIndex > -1 && (barcodeIndex > -1 || codeIndex > -1)) {
      return {
        index: i,
        quantityIndex,
        barcodeIndex,
        codeIndex,
        descriptionIndex: findIndexByAliases(normalized, DESCRIPTION_ALIASES)
      };
    }
  }

  return null;
}

function parseGenericRows(rows) {
  const header = detectGenericHeader(rows);

  if (!header) {
    throw new Error('No se detecto un encabezado valido. Se esperaba una columna de cantidad y otra de barcode o codigo.');
  }

  const items = [];

  for (let i = header.index + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const barcode = header.barcodeIndex > -1 ? cleanIdentifier(row[header.barcodeIndex]) : '';
    const codigo = header.codeIndex > -1 ? cleanIdentifier(row[header.codeIndex]) : '';
    const descripcion = header.descriptionIndex > -1 ? cleanString(row[header.descriptionIndex]) : '';
    const cantidad = toNumber(row[header.quantityIndex]);

    if (!barcode && !codigo) {
      continue;
    }

    items.push({
      barcode,
      codigo,
      descripcion,
      cantidad
    });
  }

  return items;
}

function parseExistenciasFile(filePath) {
  const rows = readFirstSheet(filePath);
  const retailOneRows = parseRetailOneRows(rows);

  if (retailOneRows.length) {
    return retailOneRows;
  }

  return parseGenericRows(rows);
}

function parseInventarioFile(filePath) {
  const rows = readFirstSheet(filePath);
  const retailOneRows = parseRetailOneRows(rows);

  if (retailOneRows.length) {
    return retailOneRows;
  }

  return parseGenericRows(rows);
}

module.exports = {
  parseExistenciasFile,
  parseInventarioFile
};
