const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { saveBase64 } = require('../utils/uploadBase64');

router.post('/base64', verifyToken, (req, res) => {
  try {
    const { filename, contentBase64 } = req.body || {};
    if (!contentBase64) return res.status(400).json({ message: 'contentBase64 required' });
    const path = saveBase64({ filename, contentBase64 });
    return res.status(201).json({ path });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Upload failed' });
  }
});

module.exports = router;

