const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const {
  normalizeHeader,
  cleanString,
  cleanIdentifier,
  toNumber
} = require('./common');

const CODE_ALIASES = ['codigo', 'sku', 'clave'];
const DESCRIPTION_ALIASES = ['descripcion', 'description', 'nombre'];
const BARCODE_ALIASES = ['codigodebarras', 'barcode', 'ean', 'upc', 'barras'];
const FAMILY_ALIASES = ['familia', 'categoria', 'grupo'];
const PRICE_MENUDEO_ALIASES = ['preciomenudeo', 'precio1'];
const PRICE_MAYOREO_ALIASES = ['preciomayoreo', 'precio2'];
const PRICE_RESIDENCIAL_ALIASES = ['precioresidencial', 'precio3'];

function findIndexByAliases(headers, aliases) {
  for (let index = 0; index < headers.length; index += 1) {
    if (aliases.includes(headers[index])) {
      return index;
    }
  }

  return -1;
}

function mapCatalogRow(row, indexes) {
  const codigo = cleanIdentifier(row[indexes.codigo]);
  const descripcion = cleanString(row[indexes.descripcion]);
  const rawBarcode = cleanIdentifier(row[indexes.barcode]);
  const barcode = rawBarcode && rawBarcode !== '0' ? rawBarcode : null;
  const familia = indexes.familia > -1 ? cleanString(row[indexes.familia]) : '';
  const precioMenudeo = indexes.precioMenudeo > -1 ? toNumber(row[indexes.precioMenudeo]) : null;
  const precioMayoreo = indexes.precioMayoreo > -1 ? toNumber(row[indexes.precioMayoreo]) : null;
  const precioResidencial = indexes.precioResidencial > -1 ? toNumber(row[indexes.precioResidencial]) : null;

  if (!codigo || !descripcion) {
    return null;
  }

  return {
    codigo,
    descripcion,
    barcode,
    familia: familia || null,
    precio_menudeo: precioMenudeo,
    precio_mayoreo: precioMayoreo,
    precio_residencial: precioResidencial
  };
}

function getFixedIndexes() {
  return {
    codigo: 0,
    descripcion: 1,
    barcode: 2,
    precioMenudeo: 3,
    precioMayoreo: 4,
    precioResidencial: 5,
    familia: 6
  };
}

function parseDelimitedCatalog(filePath, delimiter) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter(function filterLine(line) {
    return line.trim() !== '';
  });

  if (!lines.length) {
    return [];
  }

  const firstLine = lines[0].split(delimiter);
  const headers = firstLine.map(normalizeHeader);
  let startIndex = 1;
  let indexes = {
    codigo: findIndexByAliases(headers, CODE_ALIASES),
    descripcion: findIndexByAliases(headers, DESCRIPTION_ALIASES),
    barcode: findIndexByAliases(headers, BARCODE_ALIASES),
    familia: findIndexByAliases(headers, FAMILY_ALIASES),
    precioMenudeo: findIndexByAliases(headers, PRICE_MENUDEO_ALIASES),
    precioMayoreo: findIndexByAliases(headers, PRICE_MAYOREO_ALIASES),
    precioResidencial: findIndexByAliases(headers, PRICE_RESIDENCIAL_ALIASES)
  };

  const hasHeader = indexes.codigo > -1 && indexes.descripcion > -1 && indexes.barcode > -1;

  if (!hasHeader) {
    indexes = getFixedIndexes();
    startIndex = 0;
  }

  const rows = [];

  for (let i = startIndex; i < lines.length; i += 1) {
    const columns = lines[i].split(delimiter);
    const mapped = mapCatalogRow(columns, indexes);

    if (mapped) {
      rows.push(mapped);
    }
  }

  return rows;
}

function parseSpreadsheetCatalog(filePath) {
  const workbook = XLSX.readFile(filePath, { raw: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: ''
  });

  let headerIndex = -1;
  let headerRow = [];

  for (let i = 0; i < rows.length; i += 1) {
    const normalized = rows[i].map(normalizeHeader);
    if (
      findIndexByAliases(normalized, CODE_ALIASES) > -1 &&
      findIndexByAliases(normalized, DESCRIPTION_ALIASES) > -1 &&
      findIndexByAliases(normalized, BARCODE_ALIASES) > -1
    ) {
      headerIndex = i;
      headerRow = normalized;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error('No se encontro un encabezado valido en el archivo de catalogo.');
  }

  const indexes = {
    codigo: findIndexByAliases(headerRow, CODE_ALIASES),
    descripcion: findIndexByAliases(headerRow, DESCRIPTION_ALIASES),
    barcode: findIndexByAliases(headerRow, BARCODE_ALIASES),
    familia: findIndexByAliases(headerRow, FAMILY_ALIASES),
    precioMenudeo: findIndexByAliases(headerRow, PRICE_MENUDEO_ALIASES),
    precioMayoreo: findIndexByAliases(headerRow, PRICE_MAYOREO_ALIASES),
    precioResidencial: findIndexByAliases(headerRow, PRICE_RESIDENCIAL_ALIASES)
  };

  const items = [];

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const mapped = mapCatalogRow(rows[i], indexes);

    if (mapped) {
      items.push(mapped);
    }
  }

  return items;
}

function parseCatalogFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.txt') {
    return parseDelimitedCatalog(filePath, '|');
  }

  if (ext === '.csv') {
    return parseDelimitedCatalog(filePath, ',');
  }

  if (ext === '.xls' || ext === '.xlsx') {
    return parseSpreadsheetCatalog(filePath);
  }

  throw new Error('Formato de catalogo no soportado.');
}

module.exports = {
  parseCatalogFile
};
