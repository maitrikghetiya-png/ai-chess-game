'use strict';

/*
 * ♟️ AI Chess — multiplayer server (zero dependencies, Node stdlib only).
 *
 * Serves the static client and provides a lightweight realtime relay:
 *   POST /api/rooms                  create a room            -> { code, session, color }
 *   POST /api/rooms/:code/join       join a room as opponent   -> { session, color }
 *   POST /api/rooms/:code/move       submit a move             -> { ok }
 *   POST /api/rooms/:code/resign     resign                    -> { ok }
 *   GET  /api/events?room&session    SSE stream of room events
 *
 * The server relays moves and enforces turn order / colour; move legality is
 * validated by each client's own chess engine.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8765;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// code -> room
const rooms = new Map();

function randToken(bytes = 12) {
  return crypto.randomBytes(bytes).toString('hex');
}

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let s = '';
  for (let i = 0; i < 5; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return s;
}

function newRoom(code) {
  return {
    code,
    players: new Map(),   // session -> { color, res, connected }
    ply: 0,               // number of moves played; even = White to move
    moves: [],            // move log for sync on (re)connect
    status: 'waiting',    // waiting | playing | finished
    result: null,
  };
}

function broadcast(room, event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const p of room.players.values()) {
    if (p.res && !p.res.writableEnded) p.res.write(payload);
  }
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// API handlers
// ---------------------------------------------------------------------------

function handleCreateRoom(res) {
  let code = roomCode();
  while (rooms.has(code)) code = roomCode();
  const room = newRoom(code);
  const session = randToken();
  room.players.set(session, { color: 'w', res: null, connected: false });
  rooms.set(code, room);
  sendJSON(res, 200, { code, session, color: 'w' });
}

function handleJoinRoom(res, code) {
  const room = rooms.get(code);
  if (!room) return sendJSON(res, 404, { error: 'Room not found' });
  if (room.players.size >= 2) return sendJSON(res, 409, { error: 'Room is full' });
  if (room.status === 'finished') return sendJSON(res, 409, { error: 'Game already finished' });

  const color = room.players.size === 0 ? 'w' : 'b';
  const session = randToken();
  room.players.set(session, { color, res: null, connected: false });
  sendJSON(res, 200, { session, color });
}

function colorToMove(room) {
  return room.ply % 2 === 0 ? 'w' : 'b';
}

function handleMove(res, code, body) {
  const room = rooms.get(code);
  if (!room) return sendJSON(res, 404, { error: 'Room not found' });
  const player = room.players.get(body.session);
  if (!player) return sendJSON(res, 403, { error: 'Not in this room' });
  if (room.status === 'finished') return sendJSON(res, 409, { error: 'Game finished' });
  if (room.players.size < 2) return sendJSON(res, 409, { error: 'Waiting for opponent' });

  // Enforce turn order and that the mover's pieces match their colour.
  if (player.color !== colorToMove(room)) {
    return sendJSON(res, 409, { error: 'Not your turn' });
  }
  const move = body.move;
  if (!move || typeof move.from !== 'number' || typeof move.to !== 'number') {
    return sendJSON(res, 400, { error: 'Bad move' });
  }
  const piece = move.piece || '';
  const pieceIsWhite = piece === piece.toUpperCase();
  if ((player.color === 'w') !== pieceIsWhite) {
    return sendJSON(res, 400, { error: 'Cannot move opponent piece' });
  }

  room.moves.push(move);
  room.ply += 1;
  broadcast(room, { type: 'move', move, ply: room.ply });
  sendJSON(res, 200, { ok: true, ply: room.ply });
}

function handleResign(res, code, body) {
  const room = rooms.get(code);
  if (!room) return sendJSON(res, 404, { error: 'Room not found' });
  const player = room.players.get(body.session);
  if (!player) return sendJSON(res, 403, { error: 'Not in this room' });
  if (room.status === 'finished') return sendJSON(res, 409, { error: 'Already finished' });
  room.status = 'finished';
  room.result = { type: 'resign', winner: player.color === 'w' ? 'b' : 'w' };
  broadcast(room, { type: 'resign', color: player.color });
  sendJSON(res, 200, { ok: true });
}

function handleEvents(req, res, query) {
  const code = query.get('room');
  const session = query.get('session');
  const room = rooms.get(code);
  if (!room) { res.writeHead(404); return res.end(); }
  const player = room.players.get(session);
  if (!player) { res.writeHead(403); return res.end(); }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive',
  });
  res.write(': connected\n\n');

  player.res = res;
  player.connected = true;

  // Sync this client: its colour, full move log, and room status.
  res.write(`data: ${JSON.stringify({
    type: 'sync',
    color: player.color,
    moves: room.moves,
    ply: room.ply,
    status: room.status,
    players: room.players.size,
  })}\n\n`);

  // Tell everyone who is present, and start the game once both are connected.
  broadcast(room, { type: 'presence', color: player.color, connected: true });
  if (room.players.size === 2 && room.status === 'waiting') {
    const both = [...room.players.values()].every((p) => p.connected);
    if (both) {
      room.status = 'playing';
      broadcast(room, { type: 'start' });
    }
  }

  // Heartbeat to keep proxies/clients alive.
  const hb = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(hb);
    if (player.res === res) {
      player.res = null;
      player.connected = false;
      broadcast(room, { type: 'presence', color: player.color, connected: false });
    }
  });
}

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------

function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const safe = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
  const file = path.join(ROOT, safe);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  try {
    if (p === '/api/events' && req.method === 'GET') {
      return handleEvents(req, res, url.searchParams);
    }
    if (p === '/api/rooms' && req.method === 'POST') {
      return handleCreateRoom(res);
    }
    let m = p.match(/^\/api\/rooms\/([A-Z0-9]+)\/join$/);
    if (m && req.method === 'POST') return handleJoinRoom(res, m[1]);
    m = p.match(/^\/api\/rooms\/([A-Z0-9]+)\/move$/);
    if (m && req.method === 'POST') {
      const body = await readBody(req);
      return handleMove(res, m[1], body);
    }
    m = p.match(/^\/api\/rooms\/([A-Z0-9]+)\/resign$/);
    if (m && req.method === 'POST') {
      const body = await readBody(req);
      return handleResign(res, m[1], body);
    }
    if (req.method === 'GET') return serveStatic(req, res, p);
    res.writeHead(405); res.end();
  } catch (e) {
    sendJSON(res, 400, { error: 'Bad request' });
  }
});

// Purge abandoned rooms periodically.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyConnected = [...room.players.values()].some((p) => p.connected);
    if (!anyConnected && room.players.size > 0 && room.status !== 'playing') {
      // keep for a while to allow reconnect; drop after 10 min idle
      room.lastIdle = room.lastIdle || now;
      if (now - room.lastIdle > 10 * 60 * 1000) rooms.delete(code);
    } else {
      room.lastIdle = null;
    }
  }
}, 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`♟️  Chess server running at http://localhost:${PORT}`);
});
