const express = require('express');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb, persist } = require('./db');

// --- Config loader ---
function loadConfig(filePath) {
  const config = {};
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    config[key] = value;
  }
  return config;
}

const config = loadConfig(path.join(__dirname, 'config.properties'));
const PASSWORD = config['app.password'];
const SESSION_SECRET = config['app.sessionSecret'];
const VALID_STATUSES = ['todo', 'in_progress', 'done'];

// --- Auth helpers ---
function signToken(value) {
  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(value);
  return `${value}.${hmac.digest('hex')}`;
}

function verifyToken(token) {
  if (!token) return false;
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return false;
  const value = token.slice(0, lastDot);
  const expected = signToken(value);
  return token === expected;
}

// --- Express setup ---
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- Auth middleware ---
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies['auth'];
  if (verifyToken(token)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// --- Auth routes ---
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (!password || password !== PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  const token = signToken('authenticated');
  res.cookie('auth', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('auth');
  res.json({ ok: true });
});

// --- DB helpers ---
function dbOne(db, sql, params) {
  const result = db.exec(sql, params);
  if (!result.length) return null;
  const [{ columns, values }] = result;
  if (!values.length) return null;
  return Object.fromEntries(columns.map((col, i) => [col, values[0][i]]));
}

function dbAll(db, sql, params) {
  const result = db.exec(sql, params);
  if (!result.length) return [];
  const [{ columns, values }] = result;
  return values.map(row => Object.fromEntries(columns.map((col, i) => [col, row[i]])));
}

const ITEM_COLS = 'id, title, description, status, created_at';

// --- Work item routes (all require auth) ---
app.get('/api/items', requireAuth, async (req, res) => {
  const db = await getDb();
  res.json(dbAll(db, `SELECT ${ITEM_COLS} FROM work_items ORDER BY created_at ASC`));
});

app.post('/api/items', requireAuth, async (req, res) => {
  const { title = 'Untitled' } = req.body;
  const db = await getDb();
  db.run('INSERT INTO work_items (title) VALUES (?)', [title]);
  const row = dbOne(db, 'SELECT last_insert_rowid() as id');
  const newId = row ? row.id : null;
  persist();
  const item = dbOne(db, `SELECT ${ITEM_COLS} FROM work_items WHERE id = ?`, [newId]);
  res.status(201).json(item);
});

app.get('/api/items/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const item = dbOne(db, `SELECT ${ITEM_COLS} FROM work_items WHERE id = ?`, [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

app.put('/api/items/:id', requireAuth, async (req, res) => {
  const { title, description, status } = req.body;
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const db = await getDb();
  const existing = dbOne(db, `SELECT ${ITEM_COLS} FROM work_items WHERE id = ?`, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const newTitle = title !== undefined ? title : existing.title;
  const newDesc = description !== undefined ? description : existing.description;
  const newStatus = status !== undefined ? status : existing.status;

  db.run(
    'UPDATE work_items SET title = ?, description = ?, status = ? WHERE id = ?',
    [newTitle, newDesc, newStatus, req.params.id]
  );
  persist();

  const item = dbOne(db, `SELECT ${ITEM_COLS} FROM work_items WHERE id = ?`, [req.params.id]);
  res.json(item);
});

app.delete('/api/items/:id', requireAuth, async (req, res) => {
  const db = await getDb();
  const existing = dbOne(db, 'SELECT id FROM work_items WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.run('DELETE FROM work_items WHERE id = ?', [req.params.id]);
  persist();
  res.status(204).end();
});

// --- Catch-all: serve index.html ---
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Start ---
const PORT = process.env.PORT || 3000;
getDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
