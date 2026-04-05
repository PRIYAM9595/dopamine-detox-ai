const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const JWT_SECRET = 'dopamine_detox_secret_key_change_me';
const db = new sqlite3.Database('./database.sqlite');

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password TEXT,
    name TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS user_stats (
    user_id INTEGER PRIMARY KEY,
    distraction_score INTEGER DEFAULT 52,
    interruptions INTEGER DEFAULT 14,
    screen_time_minutes INTEGER DEFAULT 261,
    focus_sessions_completed INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS distraction_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    reason TEXT,
    points INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS focus_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    duration_seconds INTEGER,
    completed BOOLEAN,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// Helper functions
function getUserStats(userId, callback) {
  db.get('SELECT * FROM user_stats WHERE user_id = ?', [userId], (err, stats) => {
    if (err || !stats) callback({ distraction_score: 52, interruptions: 14, screen_time_minutes: 261, focus_sessions_completed: 0 });
    else callback(stats);
  });
}

function updateUserStats(userId, updates, callback) {
  const fields = [], values = [];
  for (const [key, val] of Object.entries(updates)) { fields.push(`${key} = ?`); values.push(val); }
  values.push(userId);
  db.run(`UPDATE user_stats SET ${fields.join(', ')}, last_updated = CURRENT_TIMESTAMP WHERE user_id = ?`, values, callback);
}

// Main function to create a new app/server for each port attempt
function startServerOnPort(port) {
  const app = express();
  const server = http.createServer(app);
  const io = socketIo(server, { cors: { origin: '*' } });

  app.use(cors());
  app.use(express.json());
  app.use(express.static('public'));

  // Registration (name only – email auto‑generated)
  app.post('/api/register', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const email = `${name.toLowerCase().replace(/\s/g, '')}@detox.local`;
    const dummyPassword = bcrypt.hashSync('auto', 10);
    db.run('INSERT INTO users (email, password, name) VALUES (?, ?, ?)', [email, dummyPassword, name], function(err) {
      if (err && err.message.includes('UNIQUE')) {
        // User already exists – just log them in
        db.get('SELECT id, name FROM users WHERE email = ?', [email], (err2, user) => {
          if (err2 || !user) return res.status(500).json({ error: 'Error' });
          const token = jwt.sign({ id: user.id, email }, JWT_SECRET);
          return res.json({ token, user: { id: user.id, email, name: user.name } });
        });
      } else if (err) {
        return res.status(500).json({ error: 'Registration error' });
      } else {
        const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET);
        db.run('INSERT INTO user_stats (user_id) VALUES (?)', [this.lastID]);
        res.json({ token, user: { id: this.lastID, email, name } });
      }
    });
  });

  // Login (supports any email/password, will auto‑register if needed via frontend)
  app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
      if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
      if (!bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
      const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET);
      res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    });
  });

  // Auth middleware
  function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'No token' });
    try {
      const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
      req.userId = decoded.id;
      next();
    } catch (e) { res.status(401).json({ error: 'Invalid token' }); }
  }

  // Get current stats
  app.get('/api/stats', authMiddleware, (req, res) => {
    getUserStats(req.userId, (stats) => res.json(stats));
  });

  // Add a distraction event (manual)
  app.post('/api/add-distraction', authMiddleware, (req, res) => {
    const { reason, points } = req.body;
    db.run('INSERT INTO distraction_logs (user_id, reason, points) VALUES (?, ?, ?)', [req.userId, reason, points]);
    getUserStats(req.userId, (stats) => {
      let newScore = Math.min(100, Math.max(0, stats.distraction_score + points));
      let newInterruptions = stats.interruptions + 1;
      let newScreenTime = stats.screen_time_minutes + 1;
      updateUserStats(req.userId, { distraction_score: newScore, interruptions: newInterruptions, screen_time_minutes: newScreenTime }, () => {
        res.json({ newScore, newInterruptions, newScreenTime });
        io.to(`user_${req.userId}`).emit('stats_update', { distraction_score: newScore, interruptions: newInterruptions, screen_time_minutes: newScreenTime, reason });
      });
    });
  });

  // Quick detox
  app.post('/api/quick-detox', authMiddleware, (req, res) => {
    getUserStats(req.userId, (stats) => {
      let newScore = Math.max(0, stats.distraction_score - 15);
      let newScreenTime = Math.max(0, stats.screen_time_minutes - 5);
      updateUserStats(req.userId, { distraction_score: newScore, screen_time_minutes: newScreenTime }, () => {
        res.json({ newScore, newScreenTime });
        io.to(`user_${req.userId}`).emit('stats_update', { distraction_score: newScore, screen_time_minutes: newScreenTime, detox: true });
      });
    });
  });

  // Complete a focus session
  app.post('/api/complete-focus', authMiddleware, (req, res) => {
    const { duration_seconds, completed } = req.body;
    db.run('INSERT INTO focus_sessions (user_id, duration_seconds, completed) VALUES (?, ?, ?)', [req.userId, duration_seconds, completed ? 1 : 0]);
    if (completed) {
      getUserStats(req.userId, (stats) => {
        let newScore = Math.max(0, stats.distraction_score - 10);
        let newCompleted = (stats.focus_sessions_completed || 0) + 1;
        updateUserStats(req.userId, { distraction_score: newScore, focus_sessions_completed: newCompleted }, () => {
          res.json({ newScore, newCompleted });
          io.to(`user_${req.userId}`).emit('stats_update', { distraction_score: newScore, focus_sessions_completed: newCompleted });
        });
      });
    } else { res.json({ success: true }); }
  });

  // Socket.io authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (err) { next(new Error('Invalid token')); }
  });

  // Socket connection – simulate random distractions every 15–25 sec
  io.on('connection', (socket) => {
    console.log('User connected:', socket.userId);
    socket.join(`user_${socket.userId}`);
    const interval = setInterval(() => {
      const apps = ["Instagram Reel scroll", "YouTube Shorts", "TikTok feed", "WhatsApp notification", "X timeline", "Snapchat streak"];
      const randomApp = apps[Math.floor(Math.random() * apps.length)];
      const points = Math.floor(Math.random() * 5) + 2;
      db.run('INSERT INTO distraction_logs (user_id, reason, points) VALUES (?, ?, ?)', [socket.userId, randomApp, points]);
      getUserStats(socket.userId, (stats) => {
        let newScore = Math.min(100, stats.distraction_score + points);
        let newInterruptions = stats.interruptions + 1;
        let newScreenTime = stats.screen_time_minutes + 1;
        updateUserStats(socket.userId, { distraction_score: newScore, interruptions: newInterruptions, screen_time_minutes: newScreenTime }, () => {
          io.to(`user_${socket.userId}`).emit('distraction_alert', { reason: randomApp, points, newScore, newInterruptions, newScreenTime });
        });
      });
    }, 15000 + Math.random() * 10000);
    socket.on('disconnect', () => clearInterval(interval));
  });

  // Try to listen on the given port
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is busy, trying ${port + 1}...`);
      startServerOnPort(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(port, () => {
    console.log(`🚀 Dopamine Detox AI server running on http://localhost:${port}`);
  });
}

// Start the server on port 3000 (will automatically try next ports if busy)
const START_PORT = process.env.PORT || 3000;
startServerOnPort(START_PORT);