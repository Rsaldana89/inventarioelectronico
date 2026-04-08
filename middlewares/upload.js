const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadDir = path.join(__dirname, '..', 'uploads');

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function filename(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeName = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, safeName);
  }
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowed = ['.xls', '.xlsx', '.txt', '.csv'];

  if (allowed.includes(ext)) {
    return cb(null, true);
  }

  return cb(new Error('Tipo de archivo no permitido. Solo se aceptan XLS, XLSX, TXT y CSV.'));
}

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});
