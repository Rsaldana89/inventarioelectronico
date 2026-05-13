function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim();
}

function cleanString(value) {
  return String(value == null ? '' : value).trim();
}

function cleanIdentifier(value) {
  return cleanString(value).replace(/\s+/g, '');
}

function toNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  }

  const normalized = cleanString(value)
    .replace(/,/g, '')
    .replace(/[^0-9.-]/g, '');

  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function hasLetters(value) {
  return /[A-Za-z]/.test(String(value || ''));
}

function isNumericSku(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function isValidInventorySku(value) {
  const sku = String(value || '').trim();
  if (!isNumericSku(sku)) {
    return false;
  }
  const numeric = Number(sku);
  // The valid SKU range has been expanded to accommodate the full product catalog
  // supplied by the new proforma workflow.  Only numeric SKUs between 1101001
  // and 9905007 (inclusive) are considered valid for inventory operations.
  return numeric >= 1101001 && numeric <= 9905007;
}

function buildPagination(totalItems, currentPage, pageSize) {
  const safePageSize = Math.max(Number(pageSize) || 50, 1);
  const totalPages = Math.max(Math.ceil(Number(totalItems || 0) / safePageSize), 1);
  const safeCurrentPage = Math.min(Math.max(Number(currentPage) || 1, 1), totalPages);

  return {
    totalItems: Number(totalItems || 0),
    totalPages,
    currentPage: safeCurrentPage,
    pageSize: safePageSize,
    offset: (safeCurrentPage - 1) * safePageSize,
    hasPrev: safeCurrentPage > 1,
    hasNext: safeCurrentPage < totalPages,
    prevPage: safeCurrentPage > 1 ? safeCurrentPage - 1 : 1,
    nextPage: safeCurrentPage < totalPages ? safeCurrentPage + 1 : totalPages
  };
}

module.exports = {
  normalizeHeader,
  cleanString,
  cleanIdentifier,
  toNumber,
  chunkArray,
  hasLetters,
  isNumericSku,
  isValidInventorySku,
  buildPagination
};
