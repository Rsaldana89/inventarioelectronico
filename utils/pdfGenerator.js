/**
 * Simple PDF generator for creating text-based documents without external
 * dependencies. It constructs a minimal PDF containing one dynamic-height page
 * with Helvetica text. Useful for receipt/miniprinter layouts.
 *
 * Important: PDF built-in fonts such as Helvetica do not read UTF-8 literal
 * strings. Accented characters must be written as single-byte WinAnsi/PDF
 * bytes. We keep the PDF source ASCII-only by writing non-ASCII characters as
 * octal escapes (for example ó => \363). This prevents output such as Jam�n
 * in printed PDFs when descriptions contain Spanish accents.
 */

const WIN_ANSI_MAP = {
  0x20ac: 0x80, // €
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f
};

function toWinAnsiByte(char) {
  const code = char.codePointAt(0);
  if (code <= 0x7f) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  if (Object.prototype.hasOwnProperty.call(WIN_ANSI_MAP, code)) return WIN_ANSI_MAP[code];
  return 0x3f; // ? for characters outside WinAnsi.
}

function octalEscape(byte) {
  return '\\' + byte.toString(8).padStart(3, '0');
}

function escapePdfString(str) {
  let out = '';
  for (const char of String(str || '').normalize('NFC')) {
    const byte = toWinAnsiByte(char);
    if (byte === 0x5c) {
      out += '\\\\';
    } else if (byte === 0x28) {
      out += '\\(';
    } else if (byte === 0x29) {
      out += '\\)';
    } else if (byte === 0x0a) {
      out += '\\n';
    } else if (byte === 0x0d) {
      out += '\\r';
    } else if (byte === 0x09) {
      out += '\\t';
    } else if (byte < 0x20 || byte > 0x7e) {
      out += octalEscape(byte);
    } else {
      out += String.fromCharCode(byte);
    }
  }
  return out;
}

function generateTextPdf(lines, options = {}) {
  const width = options.width || 300;
  const fontSize = options.fontSize || 9;
  const lineHeight = options.lineHeight || fontSize + 3;
  const margin = options.margin || 20;
  const lineCount = Array.isArray(lines) ? lines.length : 0;
  const height = Math.max(margin * 2 + lineCount * lineHeight + 10, 140);

  let stream = 'BT\n';
  stream += `/F1 ${fontSize} Tf\n`;
  for (let i = 0; i < lineCount; i += 1) {
    const y = height - margin - fontSize - i * lineHeight;
    stream += `1 0 0 1 ${margin} ${y.toFixed(2)} Tm\n`;
    stream += `(${escapePdfString(lines[i])}) Tj\n`;
  }
  stream += 'ET';

  const streamLength = Buffer.byteLength(stream, 'latin1');
  const objects = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width.toFixed(2)} ${height.toFixed(2)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n`
  );
  objects.push(`4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`);
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  let currentOffset = Buffer.byteLength(pdf, 'latin1');
  for (const obj of objects) {
    offsets.push(currentOffset);
    pdf += obj;
    currentOffset += Buffer.byteLength(obj, 'latin1');
  }

  const xrefOffset = currentOffset;
  pdf += 'xref\n';
  pdf += `0 ${offsets.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'latin1');
}

module.exports = { generateTextPdf, escapePdfString };
