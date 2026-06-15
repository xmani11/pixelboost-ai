const express = require('express');
const multer = require('multer');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ---------- Multer config ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ---------- Routes ----------

// Upload an image
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileInfo = {
    id: Date.now().toString(),
    name: req.file.originalname,
    size: req.file.size,
    type: req.file.mimetype,
    url: `/uploads/${req.file.filename}`,
    uploadedAt: new Date().toISOString()
  };

  // Store metadata in JSON file (replace with a database later)
  const dbPath = './uploads_data.json';
  let data = [];
  if (fs.existsSync(dbPath)) {
    data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  }
  data.push(fileInfo);
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));

  res.status(201).json(fileInfo);
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token });
});

// Middleware to protect routes
function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Get all uploads (admin only)
app.get('/api/uploads', authenticateAdmin, (req, res) => {
  const dbPath = './uploads_data.json';
  if (!fs.existsSync(dbPath)) {
    return res.json([]);
  }
  const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  // Return newest first
  res.json(data.reverse());
});

// Delete an upload (admin only)
app.delete('/api/uploads/:id', authenticateAdmin, (req, res) => {
  const dbPath = './uploads_data.json';
  if (!fs.existsSync(dbPath)) {
    return res.status(404).json({ error: 'No data found' });
  }
  let data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const index = data.findIndex(item => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Image not found' });
  }

  // Remove file from disk
  const fileUrl = data[index].url;
  if (fileUrl) {
    const filePath = path.join(__dirname, fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  data.splice(index, 1);
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});