const {
  cleanIdentifier,
  cleanString,
  toNumber,
  isValidInventorySku
} = require('./common');

function resolveScan(input, lookup) {
  const scan = cleanIdentifier(input);

  if (!scan) {
    return { barcode: '', codigo: '', descripcion: '' };
  }

  const product =
    (lookup.byBarcode && lookup.byBarcode.get(scan)) ||
    (lookup.byCodigo && lookup.byCodigo.get(scan)) ||
    null;

  if (!product) {
    return { barcode: scan, codigo: scan, descripcion: '' };
  }

  return {
    barcode: product.barcode || product.codigo || scan,
    codigo: product.codigo || scan,
    descripcion: product.descripcion || ''
  };
}

function normalizeImportedRows(rows, lookup, options) {
  const settings = options || {};
  const enforceSkuRange = settings.enforceSkuRange !== false;
  const aggregated = new Map();

  rows.forEach(function eachRow(row) {
    const codigo = cleanIdentifier(row.codigo);
    const rawBarcode = cleanIdentifier(row.barcode);

    if (enforceSkuRange && codigo && !isValidInventorySku(codigo)) {
      return;
    }

    const product =
      (rawBarcode && lookup.byBarcode && lookup.byBarcode.get(rawBarcode)) ||
      (codigo && lookup.byCodigo && lookup.byCodigo.get(codigo)) ||
      null;

    const resolvedCodigo = codigo || (product && product.codigo) || '';
    if (enforceSkuRange && resolvedCodigo && !isValidInventorySku(resolvedCodigo)) {
      return;
    }

    let barcode = rawBarcode;
    if (!barcode || barcode === '0') {
      barcode = product && product.barcode ? product.barcode : resolvedCodigo;
    }

    if (!barcode) {
      return;
    }

    const descripcion = cleanString(row.descripcion) || (product && product.descripcion) || '';
    const cantidad = toNumber(row.cantidad);
    const key = barcode;

    if (!aggregated.has(key)) {
      aggregated.set(key, {
        codigo: resolvedCodigo || null,
        barcode,
        descripcion: descripcion || null,
        cantidad: 0
      });
    }

    const current = aggregated.get(key);
    current.cantidad = Number((current.cantidad + cantidad).toFixed(2));

    if (!current.codigo && resolvedCodigo) {
      current.codigo = resolvedCodigo;
    }

    if (!current.descripcion && descripcion) {
      current.descripcion = descripcion;
    }
  });

  return Array.from(aggregated.values());
}

module.exports = {
  resolveScan,
  normalizeImportedRows
};
