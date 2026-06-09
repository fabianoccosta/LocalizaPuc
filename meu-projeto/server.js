const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database setup ──────────────────────────────────────────────────────────
const db = new Database('localiza.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT    NOT NULL UNIQUE,
    password  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    local_id   TEXT    NOT NULL,
    username   TEXT    NOT NULL,
    rating     INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    created_at TEXT    DEFAULT (datetime('now'))
  );
`);

// ── Helpers ─────────────────────────────────────────────────────────────────
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Simple in-memory session tokens  {token -> username}
const sessions = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  req.username = sessions.get(token);
  next();
}

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth routes ──────────────────────────────────────────────────────────────
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }
  try {
    const hashed = hashPassword(password);
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashed);
    const token = generateToken();
    sessions.set(token, username);
    res.json({ token, username });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Nome de usuário já existe' });
    }
    res.status(500).json({ error: 'Erro interno' });
  }
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
  }
  const hashed = hashPassword(password);
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, hashed);
  if (!user) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos' });
  }
  const token = generateToken();
  sessions.set(token, username);
  res.json({ token, username });
});

app.post('/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

// ── Reviews routes ───────────────────────────────────────────────────────────
app.get('/reviews/:localId', (req, res) => {
  const rows = db.prepare(
    'SELECT username, rating, created_at FROM reviews WHERE local_id = ? ORDER BY created_at DESC'
  ).all(req.params.localId);
  res.json(rows);
});

app.post('/reviews', requireAuth, (req, res) => {
  const { localId, rating } = req.body;
  if (!localId || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  // One review per user per location (upsert behaviour — update if exists)
  const existing = db.prepare(
    'SELECT id FROM reviews WHERE local_id = ? AND username = ?'
  ).get(localId, req.username);

  if (existing) {
    db.prepare('UPDATE reviews SET rating = ?, created_at = datetime(\'now\') WHERE id = ?')
      .run(rating, existing.id);
  } else {
    db.prepare('INSERT INTO reviews (local_id, username, rating) VALUES (?, ?, ?)')
      .run(localId, req.username, rating);
  }

  // Return fresh aggregate
  const rows = db.prepare('SELECT rating FROM reviews WHERE local_id = ?').all(localId);
  const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
  res.json({ media: avg.toFixed(1), total: rows.length });
});

// ── Test route ───────────────────────────────────────────────────────────────
app.get('/teste', (req, res) => {
  res.send('O servidor back-end está funcionando e respondendo!');
});

app.listen(PORT, () => {
  console.log(`Servidor rodando com sucesso na porta ${PORT}`);
});
