const XLSX = require('xlsx');
const {
  normalizeHeader,
  cleanIdentifier,
  cleanString,
  toNumber
} = require('./common');

function normalizePlainNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const rounded = Math.round(number);
  return rounded.toLocaleString('fullwide', { useGrouping: false });
}

function normalizeBarcode(value, codigo) {
  if (value == null || value === '') return codigo;

  if (typeof value === 'number') {
    const normalized = normalizePlainNumber(value);
    if (!normalized || normalized === '0') return codigo;
    return normalized;
  }

  const raw = String(value).trim();
  if (!raw) return codigo;

  // If Excel already gave us a scientific-notation string, the barcode was
  // probably rounded.  Use the SKU instead of saving a bad duplicated barcode.
  if (/^[0-9.]+e[+-]?[0-9]+$/i.test(raw)) {
    return codigo;
  }

  const cleaned = cleanIdentifier(raw).replace(/\.0+$/, '');
  if (!cleaned || cleaned === '0') return codigo;
  return cleaned;
}

function parseProformaFile(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  if (!rows || !rows.length) return [];

  const headerRow = rows[0].map(normalizeHeader);

  const findIndex = (aliases) => {
    for (let i = 0; i < headerRow.length; i += 1) {
      if (aliases.includes(headerRow[i])) return i;
    }
    return -1;
  };

  const sucursalIndex = findIndex([
    'codigodealmacen',
    'almacen',
    'sucursal',
    'codigosucursal',
    'whscode'
  ]);
  const codigoIndex = findIndex([
    'numerodearticulo',
    'codigo',
    'sku',
    'productoid',
    'codigoarticulo',
    'codigo_producto'
  ]);
  const barcodeIndex = findIndex([
    'codigobarras',
    'barcode',
    'barras',
    'ean',
    'upc'
  ]);
  const descripcionIndex = findIndex([
    'descripciondelarticulo',
    'descripcion',
    'nombre',
    'producto'
  ]);
  const cantidadIndex = findIndex([
    'enstock',
    'existencia',
    'cantidad',
    'stock',
    'unidades'
  ]);

  if (sucursalIndex < 0 || codigoIndex < 0 || descripcionIndex < 0 || cantidadIndex < 0) {
    return [];
  }

  const items = [];
  const seenBarcodeBySucursal = new Set();

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const sucursalId = Number(String(row[sucursalIndex]).trim());
    const codigo = normalizeBarcode(row[codigoIndex], '');
    const descripcion = cleanString(row[descripcionIndex]);
    const cantidad = toNumber(row[cantidadIndex]);

    if (!codigo || !sucursalId || Number.isNaN(sucursalId)) continue;
    if (!cantidad || cantidad === 0) continue;

    let barcode = barcodeIndex > -1 ? normalizeBarcode(row[barcodeIndex], codigo) : codigo;
    let key = `${sucursalId}-${barcode}`;

    // The database uses (sucursal_id, barcode) as a unique key.  If the
    // barcode repeats inside the same proforma, use the SKU as the identifier
    // for the repeated record.  This also protects against Excel-rounded
    // barcode values such as 7.50169E+12.
    if (seenBarcodeBySucursal.has(key)) {
      barcode = codigo;
      key = `${sucursalId}-${barcode}`;
    }

    // If even SKU is duplicated, skip the repeated row to avoid a crash.
    if (seenBarcodeBySucursal.has(key)) continue;
    seenBarcodeBySucursal.add(key);

    items.push({ sucursalId, codigo, barcode, descripcion, cantidad });
  }

  return items;
}

module.exports = { parseProformaFile };
