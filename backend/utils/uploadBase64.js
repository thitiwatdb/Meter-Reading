const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

function ensureDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function saveBase64({ filename, contentBase64 }) {
  ensureDir();
  const safeName = (filename || `file_${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(UPLOAD_DIR, safeName);
  const data = contentBase64.split(',').pop(); // allow data URLs or raw base64
  fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
  // public path served from /uploads
  return `/uploads/${safeName}`;
}

module.exports = { saveBase64, ensureDir, UPLOAD_DIR };

