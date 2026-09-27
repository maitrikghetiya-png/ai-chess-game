'use strict';

/* =========================================================================
   ♟️ AI Chess Game
   Board representation: 0-63 index. index 0 = a8 (top-left), 63 = h1.
   rank = Math.floor(i / 8)  (0 = rank 8 ... 7 = rank 1)
   file = i % 8              (0 = file a ... 7 = file h)
   Pieces: uppercase = White, lowercase = Black. Empty = '.'
   ========================================================================= */

const GLYPH = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

// Piece-square tables (from White's perspective, index 0 = a8).
const PST = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function initialState() {
  const empty = '........';
  let board = '';
  board += 'rnbqkbnr';        // rank 8 (black back)
  board += 'pppppppp';        // rank 7
  board += empty + empty + empty + empty; // ranks 6-3
  board += 'PPPPPPPP';        // rank 2
  board += 'RNBQKBNR';        // rank 1 (white back)

  return {
    board: board.split(''),
    turn: 'w',
    castling: { K: true, Q: true, k: true, q: true },
    ep: -1,            // en-passant target square index, or -1
    halfmove: 0,       // for 50-move rule
    fullmove: 1,
  };
}

function cloneState(s) {
  return {
    board: s.board.slice(),
    turn: s.turn,
    castling: Object.assign({}, s.castling),
    ep: s.ep,
    halfmove: s.halfmove,
    fullmove: s.fullmove,
  };
}

const isWhite = (p) => p !== '.' && p === p.toUpperCase();
const isBlack = (p) => p !== '.' && p === p.toLowerCase();
const colorOf = (p) => (p === '.' ? null : isWhite(p) ? 'w' : 'b');
const onBoard = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const idx = (r, c) => r * 8 + c;
const rankOf = (i) => Math.floor(i / 8);
const fileOf = (i) => i % 8;
const sqName = (i) => 'abcdefgh'[fileOf(i)] + (8 - rankOf(i));

// ---------------------------------------------------------------------------
// Move generation
// ---------------------------------------------------------------------------

const KNIGHT_D = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_D = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BISHOP_D = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_D = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function generateMoves(state, color, capturesOnly = false) {
  const moves = [];
  const b = state.board;

  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (p === '.' || colorOf(p) !== color) continue;
    const r = rankOf(i), c = fileOf(i);
    const type = p.toLowerCase();

    if (type === 'p') {
      const dir = color === 'w' ? -1 : 1;
      const startRank = color === 'w' ? 6 : 1;
      const promoRank = color === 'w' ? 0 : 7;
      // forward
      const fr = r + dir;
      if (!capturesOnly && onBoard(fr, c) && b[idx(fr, c)] === '.') {
        addPawnMove(moves, i, idx(fr, c), p, null, fr === promoRank, null);
        // double push
        const fr2 = r + 2 * dir;
        if (r === startRank && b[idx(fr2, c)] === '.') {
          moves.push({ from: i, to: idx(fr2, c), piece: p, captured: null, promo: null, double: true });
        }
      }
      // captures
      for (const dc of [-1, 1]) {
        const cr = r + dir, cc = c + dc;
        if (!onBoard(cr, cc)) continue;
        const t = idx(cr, cc);
        const target = b[t];
        if (target !== '.' && colorOf(target) !== color) {
          addPawnMove(moves, i, t, p, target, cr === promoRank, null);
        } else if (t === state.ep && target === '.') {
          moves.push({ from: i, to: t, piece: p, captured: color === 'w' ? 'p' : 'P', promo: null, ep: true });
        }
      }
    } else if (type === 'n' || type === 'k') {
      const deltas = type === 'n' ? KNIGHT_D : KING_D;
      for (const [dr, dc] of deltas) {
        const nr = r + dr, nc = c + dc;
        if (!onBoard(nr, nc)) continue;
        const t = idx(nr, nc);
        const target = b[t];
        if (target === '.') {
          if (!capturesOnly) moves.push({ from: i, to: t, piece: p, captured: null, promo: null });
        } else if (colorOf(target) !== color) {
          moves.push({ from: i, to: t, piece: p, captured: target, promo: null });
        }
      }
    } else {
      const dirs = type === 'b' ? BISHOP_D : type === 'r' ? ROOK_D : BISHOP_D.concat(ROOK_D);
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (onBoard(nr, nc)) {
          const t = idx(nr, nc);
          const target = b[t];
          if (target === '.') {
            if (!capturesOnly) moves.push({ from: i, to: t, piece: p, captured: null, promo: null });
          } else {
            if (colorOf(target) !== color) moves.push({ from: i, to: t, piece: p, captured: target, promo: null });
            break;
          }
          nr += dr; nc += dc;
        }
      }
    }
  }

  // Castling
  if (!capturesOnly) addCastling(state, color, moves);
  return moves;
}

function addPawnMove(moves, from, to, piece, captured, isPromo, _unused) {
  if (isPromo) {
    for (const promo of ['q', 'r', 'b', 'n']) {
      moves.push({ from, to, piece, captured, promo });
    }
  } else {
    moves.push({ from, to, piece, captured, promo: null });
  }
}

function addCastling(state, color, moves) {
  const b = state.board;
  if (color === 'w') {
    const kingSq = 60; // e1
    if (b[kingSq] !== 'K') return;
    if (state.castling.K && b[61] === '.' && b[62] === '.' && b[63] === 'R' &&
        !isSquareAttacked(state, 60, 'b') && !isSquareAttacked(state, 61, 'b') && !isSquareAttacked(state, 62, 'b')) {
      moves.push({ from: 60, to: 62, piece: 'K', captured: null, promo: null, castle: 'K' });
    }
    if (state.castling.Q && b[59] === '.' && b[58] === '.' && b[57] === '.' && b[56] === 'R' &&
        !isSquareAttacked(state, 60, 'b') && !isSquareAttacked(state, 59, 'b') && !isSquareAttacked(state, 58, 'b')) {
      moves.push({ from: 60, to: 58, piece: 'K', captured: null, promo: null, castle: 'Q' });
    }
  } else {
    const kingSq = 4; // e8
    if (b[kingSq] !== 'k') return;
    if (state.castling.k && b[5] === '.' && b[6] === '.' && b[7] === 'r' &&
        !isSquareAttacked(state, 4, 'w') && !isSquareAttacked(state, 5, 'w') && !isSquareAttacked(state, 6, 'w')) {
      moves.push({ from: 4, to: 6, piece: 'k', captured: null, promo: null, castle: 'k' });
    }
    if (state.castling.q && b[3] === '.' && b[2] === '.' && b[1] === '.' && b[0] === 'r' &&
        !isSquareAttacked(state, 4, 'w') && !isSquareAttacked(state, 3, 'w') && !isSquareAttacked(state, 2, 'w')) {
      moves.push({ from: 4, to: 2, piece: 'k', captured: null, promo: null, castle: 'q' });
    }
  }
}

function isSquareAttacked(state, square, byColor) {
  const b = state.board;
  const r = rankOf(square), c = fileOf(square);

  // Pawn attacks
  const dir = byColor === 'w' ? -1 : 1; // attacker pawn sits "behind" relative to its advance
  const pawn = byColor === 'w' ? 'P' : 'p';
  for (const dc of [-1, 1]) {
    const pr = r - dir, pc = c + dc; // pawn attacking `square` is at r-dir
    if (onBoard(pr, pc) && b[idx(pr, pc)] === pawn) return true;
  }
  // Knight
  const knight = byColor === 'w' ? 'N' : 'n';
  for (const [dr, dc] of KNIGHT_D) {
    const nr = r + dr, nc = c + dc;
    if (onBoard(nr, nc) && b[idx(nr, nc)] === knight) return true;
  }
  // King
  const king = byColor === 'w' ? 'K' : 'k';
  for (const [dr, dc] of KING_D) {
    const nr = r + dr, nc = c + dc;
    if (onBoard(nr, nc) && b[idx(nr, nc)] === king) return true;
  }
  // Sliding: bishop/queen
  const bishop = byColor === 'w' ? 'B' : 'b';
  const queen = byColor === 'w' ? 'Q' : 'q';
  for (const [dr, dc] of BISHOP_D) {
    let nr = r + dr, nc = c + dc;
    while (onBoard(nr, nc)) {
      const pc = b[idx(nr, nc)];
      if (pc !== '.') {
        if (pc === bishop || pc === queen) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  // Sliding: rook/queen
  const rook = byColor === 'w' ? 'R' : 'r';
  for (const [dr, dc] of ROOK_D) {
    let nr = r + dr, nc = c + dc;
    while (onBoard(nr, nc)) {
      const pc = b[idx(nr, nc)];
      if (pc !== '.') {
        if (pc === rook || pc === queen) return true;
        break;
      }
      nr += dr; nc += dc;
    }
  }
  return false;
}

function findKing(state, color) {
  const k = color === 'w' ? 'K' : 'k';
  for (let i = 0; i < 64; i++) if (state.board[i] === k) return i;
  return -1;
}

function inCheck(state, color) {
  const k = findKing(state, color);
  if (k < 0) return false;
  return isSquareAttacked(state, k, color === 'w' ? 'b' : 'w');
}

function makeMove(state, move) {
  const s = cloneState(state);
  const b = s.board;
  const color = colorOf(move.piece);

  b[move.from] = '.';
  let target = move.to;

  // En passant: remove captured pawn
  if (move.ep) {
    const capSq = color === 'w' ? move.to + 8 : move.to - 8;
    b[capSq] = '.';
  }

  // Promotion
  const placed = move.promo
    ? (color === 'w' ? move.promo.toUpperCase() : move.promo.toLowerCase())
    : move.piece;
  b[target] = placed;

  // Castling: move rook
  if (move.castle) {
    if (move.castle === 'K') { b[63] = '.'; b[61] = 'R'; }
    else if (move.castle === 'Q') { b[56] = '.'; b[59] = 'R'; }
    else if (move.castle === 'k') { b[7] = '.'; b[5] = 'r'; }
    else if (move.castle === 'q') { b[0] = '.'; b[3] = 'r'; }
  }

  // Update castling rights
  if (move.piece === 'K') { s.castling.K = false; s.castling.Q = false; }
  if (move.piece === 'k') { s.castling.k = false; s.castling.q = false; }
  const touch = (sq) => {
    if (sq === 63) s.castling.K = false;
    if (sq === 56) s.castling.Q = false;
    if (sq === 7) s.castling.k = false;
    if (sq === 0) s.castling.q = false;
  };
  touch(move.from); touch(move.to);

  // En-passant target
  s.ep = move.double ? (move.from + move.to) / 2 : -1;

  // Clocks
  if (move.piece.toLowerCase() === 'p' || move.captured) s.halfmove = 0;
  else s.halfmove = state.halfmove + 1;
  if (color === 'b') s.fullmove = state.fullmove + 1;

  s.turn = color === 'w' ? 'b' : 'w';
  return s;
}

function legalMoves(state, color = state.turn, capturesOnly = false) {
  const pseudo = generateMoves(state, color, capturesOnly);
  const legal = [];
  for (const m of pseudo) {
    const next = makeMove(state, m);
    if (!inCheck(next, color)) legal.push(m);
  }
  return legal;
}

// ---------------------------------------------------------------------------
// Game status
// ---------------------------------------------------------------------------

function gameStatus(state) {
  const color = state.turn;
  const moves = legalMoves(state, color);
  const check = inCheck(state, color);

  if (moves.length === 0) {
    if (check) return { over: true, result: 'checkmate', winner: color === 'w' ? 'b' : 'w' };
    return { over: true, result: 'stalemate', winner: null };
  }
  if (state.halfmove >= 100) return { over: true, result: 'fifty-move', winner: null };
  if (insufficientMaterial(state)) return { over: true, result: 'material', winner: null };
  return { over: false, check, result: 'ongoing', winner: null };
}

function insufficientMaterial(state) {
  const pieces = state.board.filter((p) => p !== '.');
  if (pieces.length === 2) return true; // K vs K
  const minors = pieces.filter((p) => 'nb'.includes(p.toLowerCase()));
  if (pieces.length === 3 && minors.length === 1) return true; // K+minor vs K
  return false;
}

// ---------------------------------------------------------------------------
// AI: minimax + alpha-beta
// ---------------------------------------------------------------------------

function evaluate(state) {
  let score = 0;
  const b = state.board;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (p === '.') continue;
    const type = p.toLowerCase();
    const white = isWhite(p);
    let v = PIECE_VALUE[type];
    const table = PST[type];
    const pstVal = white ? table[i] : table[(7 - rankOf(i)) * 8 + fileOf(i)];
    v += pstVal;
    score += white ? v : -v;
  }
  return score; // positive = good for White
}

function orderMoves(moves) {
  // Prefer captures/promotions for better pruning (MVV-LVA-ish).
  return moves.sort((a, bMove) => score(bMove) - score(a));
  function score(m) {
    let s = 0;
    if (m.captured) s += 10 * PIECE_VALUE[m.captured.toLowerCase()] - PIECE_VALUE[m.piece.toLowerCase()];
    if (m.promo) s += PIECE_VALUE[m.promo];
    return s;
  }
}

function search(state, depth, alpha, beta, maximizing) {
  if (depth === 0) return quiesce(state, alpha, beta, maximizing);

  const color = state.turn;
  let moves = legalMoves(state, color);
  if (moves.length === 0) {
    return inCheck(state, color)
      ? (maximizing ? -100000 - depth : 100000 + depth)
      : 0;
  }
  moves = orderMoves(moves);

  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      const val = search(makeMove(state, m), depth - 1, alpha, beta, false);
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const val = search(makeMove(state, m), depth - 1, alpha, beta, true);
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }
}

// Quiescence: only explore captures to reduce horizon effect.
function quiesce(state, alpha, beta, maximizing) {
  const stand = evaluate(state);
  if (maximizing) {
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
  } else {
    if (stand <= alpha) return alpha;
    if (stand < beta) beta = stand;
  }

  const color = state.turn;
  let captures = legalMoves(state, color, true);
  captures = orderMoves(captures);

  if (maximizing) {
    let best = stand;
    for (const m of captures) {
      const val = quiesce(makeMove(state, m), alpha, beta, false);
      if (val > best) best = val;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = stand;
    for (const m of captures) {
      const val = quiesce(makeMove(state, m), alpha, beta, true);
      if (val < best) best = val;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }
}

const DIFFICULTY = {
  easy: { depth: 1, randomness: 60 },
  medium: { depth: 2, randomness: 20 },
  hard: { depth: 3, randomness: 0 },
};

function chooseAIMove(state, difficulty) {
  const cfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;
  const color = state.turn;
  const maximizing = color === 'w';
  let moves = legalMoves(state, color);
  if (moves.length === 0) return null;
  moves = orderMoves(moves);

  const scored = [];
  for (const m of moves) {
    const val = search(makeMove(state, m), cfg.depth - 1, -Infinity, Infinity, !maximizing);
    scored.push({ move: m, val });
  }

  scored.sort((a, bMove) => (maximizing ? bMove.val - a.val : a.val - bMove.val));

  // Add randomness among near-equal best moves for lower difficulties.
  if (cfg.randomness > 0) {
    const best = scored[0].val;
    const window = cfg.randomness;
    const candidates = scored.filter((s) => Math.abs(s.val - best) <= window);
    const pool = candidates.length ? candidates : scored;
    return pool[Math.floor(Math.random() * pool.length)].move;
  }
  // On hard, pick randomly among strictly-equal best moves for variety.
  const best = scored[0].val;
  const equals = scored.filter((s) => s.val === best);
  return equals[Math.floor(Math.random() * equals.length)].move;
}

// ---------------------------------------------------------------------------
// SAN (algebraic notation) for move history
// ---------------------------------------------------------------------------

function moveToSAN(state, move, allLegal) {
  if (move.castle === 'K' || move.castle === 'k') return 'O-O';
  if (move.castle === 'Q' || move.castle === 'q') return 'O-O-O';
  const type = move.piece.toLowerCase();
  const pieceLetter = type === 'p' ? '' : type.toUpperCase();
  let disambig = '';

  if (type !== 'p') {
    const ambiguous = allLegal.filter((m) =>
      m.piece === move.piece && m.to === move.to && m.from !== move.from);
    if (ambiguous.length) {
      const sameFile = ambiguous.some((m) => fileOf(m.from) === fileOf(move.from));
      const sameRank = ambiguous.some((m) => rankOf(m.from) === rankOf(move.from));
      if (!sameFile) disambig = 'abcdefgh'[fileOf(move.from)];
      else if (!sameRank) disambig = String(8 - rankOf(move.from));
      else disambig = sqName(move.from);
    }
  }

  const capture = move.captured || move.ep;
  let san = pieceLetter + disambig;
  if (capture) {
    if (type === 'p') san += 'abcdefgh'[fileOf(move.from)];
    san += 'x';
  }
  san += sqName(move.to);
  if (move.promo) san += '=' + move.promo.toUpperCase();

  const next = makeMove(state, move);
  const oppColor = next.turn;
  if (inCheck(next, oppColor)) {
    const oppMoves = legalMoves(next, oppColor);
    san += oppMoves.length === 0 ? '#' : '+';
  }
  return san;
}

// ===========================================================================
// UI Layer
// ===========================================================================

const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const turnText = document.getElementById('turn-text');
const turnDot = document.getElementById('turn-dot');
const historyEl = document.getElementById('history');
const capturedTop = document.getElementById('captured-top');
const capturedBottom = document.getElementById('captured-bottom');
const nameTop = document.getElementById('name-top');
const nameBottom = document.getElementById('name-bottom');

const sideSelect = document.getElementById('side-select');
const difficultySelect = document.getElementById('difficulty-select');
const modeSelect = document.getElementById('mode-select');
const newGameBtn = document.getElementById('new-game');
const undoBtn = document.getElementById('undo');
const flipBtn = document.getElementById('flip');

const onlineCard = document.getElementById('online-card');
const onlineLobby = document.getElementById('online-lobby');
const onlineRoom = document.getElementById('online-room');
const onlineActions = document.getElementById('online-actions');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const joinCodeInput = document.getElementById('join-code');
const roomCodeEl = document.getElementById('room-code');
const copyCodeBtn = document.getElementById('copy-code');
const connStatusEl = document.getElementById('conn-status');
const resignBtn = document.getElementById('resign');
const leaveBtn = document.getElementById('leave');

const promotionOverlay = document.getElementById('promotion-overlay');
const promotionChoices = document.getElementById('promotion-choices');
const gameoverOverlay = document.getElementById('gameover-overlay');
const gameoverTitle = document.getElementById('gameover-title');
const gameoverText = document.getElementById('gameover-text');
const gameoverNew = document.getElementById('gameover-new');

let game = null;
let net = null;   // { code, session, color, es, started } for online mode

function newGame() {
  const mode = modeSelect.value;
  const online = mode === 'online';
  const myColor = online && net ? net.color : (sideSelect.value === 'black' ? 'b' : 'w');

  game = {
    state: initialState(),
    history: [],          // { move, san, stateBefore }
    humanColor: online ? (net ? net.color : null) : myColor,
    mode,
    difficulty: difficultySelect.value,
    orientation: online ? (net ? net.color : 'w') : myColor,
    selected: -1,
    legalCache: [],
    capturedByWhite: [],  // black pieces captured
    capturedByBlack: [],  // white pieces captured
    busy: false,
    pendingPromotion: null,
  };
  gameoverOverlay.classList.add('hidden');
  render();
  if (!online) maybeAIMove();
}

function currentLegal() {
  return legalMoves(game.state, game.state.turn);
}

// Map a board index to a DOM square based on orientation.
function squaresInOrder() {
  const order = [];
  for (let vr = 0; vr < 8; vr++) {
    for (let vc = 0; vc < 8; vc++) {
      const r = game.orientation === 'w' ? vr : 7 - vr;
      const c = game.orientation === 'w' ? vc : 7 - vc;
      order.push(idx(r, c));
    }
  }
  return order;
}

function render() {
  const st = game.state;
  const status = gameStatus(st);
  boardEl.innerHTML = '';

  const order = squaresInOrder();
  const lastMove = game.history.length ? game.history[game.history.length - 1].move : null;
  const checkedKing = status.check || status.result === 'checkmate'
    ? findKing(st, st.turn) : -1;

  const legalTargets = new Set(
    game.legalCache.filter((m) => m.from === game.selected).map((m) => m.to)
  );

  order.forEach((sq, i) => {
    const r = rankOf(sq), c = fileOf(sq);
    const el = document.createElement('div');
    const isLight = (r + c) % 2 === 0;
    el.className = 'square ' + (isLight ? 'light' : 'dark');
    el.dataset.sq = sq;

    // coordinates on edges
    const vc = i % 8, vr = Math.floor(i / 8);
    if (vc === 0) {
      const rank = document.createElement('span');
      rank.className = 'coord rank';
      rank.textContent = 8 - r;
      el.appendChild(rank);
    }
    if (vr === 7) {
      const file = document.createElement('span');
      file.className = 'coord file';
      file.textContent = 'abcdefgh'[c];
      el.appendChild(file);
    }

    const p = st.board[sq];
    if (p !== '.') {
      const span = document.createElement('span');
      span.className = 'piece ' + (isWhite(p) ? 'white' : 'black');
      span.textContent = GLYPH[p];
      el.appendChild(span);
    }

    if (sq === game.selected) el.classList.add('selected');
    if (lastMove && (sq === lastMove.from || sq === lastMove.to)) el.classList.add('last-move');
    if (sq === checkedKing) el.classList.add('check');
    if (game.selected >= 0 && legalTargets.has(sq)) {
      el.classList.add('legal');
      const isEpCapture = game.legalCache.some((m) => m.from === game.selected && m.to === sq && m.ep);
      if (st.board[sq] !== '.' || isEpCapture) el.classList.add('capture-hint');
      const hint = document.createElement('span');
      hint.className = 'hint';
      el.appendChild(hint);
    }

    el.addEventListener('click', () => onSquareClick(sq));
    boardEl.appendChild(el);
  });

  renderStatus(status);
  renderCaptured();
  renderHistory();
  renderPlayerBars();

  const online = game.mode === 'online';
  undoBtn.disabled = online || game.history.length === 0 || game.busy;
  newGameBtn.disabled = online && !!net;
}

function renderStatus(status) {
  const st = game.state;
  const mover = st.turn === 'w' ? 'White' : 'Black';
  turnText.textContent = mover + "'s turn";
  turnDot.className = 'dot' + (st.turn === 'b' ? ' black' : '');

  if (status.over) {
    if (status.result === 'checkmate') {
      const w = status.winner === 'w' ? 'White' : 'Black';
      statusEl.textContent = `Checkmate — ${w} wins!`;
    } else if (status.result === 'stalemate') {
      statusEl.textContent = 'Stalemate — Draw';
    } else if (status.result === 'fifty-move') {
      statusEl.textContent = 'Draw — 50-move rule';
    } else {
      statusEl.textContent = 'Draw — Insufficient material';
    }
  } else if (status.check) {
    statusEl.textContent = `${mover} is in check!`;
  } else {
    statusEl.textContent = `${mover} to move`;
  }
}

function renderPlayerBars() {
  const topColor = game.orientation === 'w' ? 'Black' : 'White';
  const bottomColor = game.orientation === 'w' ? 'White' : 'Black';
  nameTop.textContent = topColor + labelFor(topColor);
  nameBottom.textContent = bottomColor + labelFor(bottomColor);

  function labelFor(name) {
    const color = name === 'White' ? 'w' : 'b';
    if (game.mode === 'human') return ' (Player)';
    if (game.mode === 'online') return color === game.humanColor ? ' (You)' : ' (Opponent)';
    return color === game.humanColor ? ' (You)' : ' (AI)';
  }

  // Captured pieces: top bar shows pieces captured BY the top player.
  const topIsBlack = topColor === 'Black';
  capturedTop.innerHTML = '';
  capturedBottom.innerHTML = '';
  const topCaptured = topIsBlack ? game.capturedByBlack : game.capturedByWhite;
  const bottomCaptured = topIsBlack ? game.capturedByWhite : game.capturedByBlack;
  for (const p of topCaptured) capturedTop.appendChild(glyphSpan(p));
  for (const p of bottomCaptured) capturedBottom.appendChild(glyphSpan(p));
}

function glyphSpan(p) {
  const s = document.createElement('span');
  s.textContent = GLYPH[p];
  s.style.color = isWhite(p) ? '#fff' : '#1b1b1b';
  s.style.textShadow = '0 1px 2px rgba(0,0,0,0.5)';
  return s;
}

function renderCaptured() {
  // Recompute captured pieces from history to stay consistent after undo.
  game.capturedByWhite = [];
  game.capturedByBlack = [];
  for (const h of game.history) {
    const m = h.move;
    if (m.captured) {
      if (colorOf(m.piece) === 'w') game.capturedByWhite.push(m.captured);
      else game.capturedByBlack.push(m.captured);
    }
  }
}

function renderHistory() {
  historyEl.innerHTML = '';
  for (let i = 0; i < game.history.length; i += 2) {
    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = (i / 2 + 1) + '.';
    const w = document.createElement('span');
    w.className = 'w';
    w.textContent = game.history[i].san;
    li.appendChild(num);
    li.appendChild(w);
    if (game.history[i + 1]) {
      const b = document.createElement('span');
      b.className = 'b';
      b.textContent = game.history[i + 1].san;
      li.appendChild(b);
    }
    historyEl.appendChild(li);
  }
  historyEl.scrollTop = historyEl.scrollHeight;
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

function onSquareClick(sq) {
  if (game.busy) return;
  const st = game.state;
  const status = gameStatus(st);
  if (status.over) return;

  // Only allow the side you control to move (AI / online lock the opponent's turn).
  if (game.mode !== 'human' && st.turn !== game.humanColor) return;
  if (game.mode === 'online' && (!net || !net.started)) return;

  const piece = st.board[sq];

  // If a piece is selected and this square is a legal target -> move.
  if (game.selected >= 0) {
    const move = game.legalCache.find((m) => m.from === game.selected && m.to === sq);
    if (move) {
      attemptMove(game.selected, sq);
      return;
    }
  }

  // Select own piece
  if (piece !== '.' && colorOf(piece) === st.turn) {
    game.selected = sq;
    game.legalCache = currentLegal();
    render();
    return;
  }

  // Deselect
  game.selected = -1;
  game.legalCache = [];
  render();
}

function attemptMove(from, to) {
  const candidates = game.legalCache.filter((m) => m.from === from && m.to === to);
  if (candidates.length === 0) return;

  // Promotion?
  if (candidates.length > 1 && candidates[0].promo) {
    showPromotion(from, to, candidates);
    return;
  }
  commitMove(candidates[0]);
}

function showPromotion(from, to, candidates) {
  const color = game.state.turn;
  game.pendingPromotion = { from, to, candidates };
  promotionChoices.innerHTML = '';
  for (const type of ['q', 'r', 'b', 'n']) {
    const btn = document.createElement('button');
    const glyphKey = color === 'w' ? type.toUpperCase() : type;
    btn.textContent = GLYPH[glyphKey];
    btn.addEventListener('click', () => {
      const chosen = candidates.find((m) => m.promo === type);
      promotionOverlay.classList.add('hidden');
      game.pendingPromotion = null;
      if (chosen) commitMove(chosen);
    });
    promotionChoices.appendChild(btn);
  }
  promotionOverlay.classList.remove('hidden');
}

function applyMove(move) {
  const st = game.state;
  const allLegal = game.legalCache.length ? game.legalCache : currentLegal();
  const san = moveToSAN(st, move, allLegal);

  game.history.push({ move, san, stateBefore: cloneState(st) });
  game.state = makeMove(st, move);
  game.selected = -1;
  game.legalCache = [];

  render();
  checkGameOver();
  maybeAIMove();
}

function checkGameOver() {
  const status = gameStatus(game.state);
  if (!status.over) return false;
  let title = 'Game Over';
  let text = '';
  if (status.result === 'checkmate') {
    const w = status.winner === 'w' ? 'White' : 'Black';
    title = 'Checkmate!';
    text = `${w} wins the game.`;
  } else if (status.result === 'stalemate') {
    title = 'Stalemate';
    text = 'The game is a draw — no legal moves.';
  } else if (status.result === 'fifty-move') {
    title = 'Draw';
    text = '50-move rule reached.';
  } else {
    title = 'Draw';
    text = 'Insufficient material to checkmate.';
  }
  gameoverTitle.textContent = title;
  gameoverText.textContent = text;
  gameoverOverlay.classList.remove('hidden');
  return true;
}

function maybeAIMove() {
  if (game.mode !== 'ai') return;
  if (game.state.turn === game.humanColor) return;
  const status = gameStatus(game.state);
  if (status.over) return;

  game.busy = true;
  statusEl.textContent = 'AI is thinking…';
  render();

  // Defer so the UI paints before the (blocking) search runs.
  setTimeout(() => {
    const move = chooseAIMove(game.state, game.difficulty);
    game.busy = false;
    if (!move) { render(); return; }
    game.legalCache = legalMoves(game.state, game.state.turn);
    applyMove(move);
  }, 60);
}

function undo() {
  if (game.history.length === 0 || game.busy) return;
  // In AI mode, undo both the AI's reply and the human's move.
  const steps = (game.mode === 'ai' && game.history.length >= 2) ? 2 : 1;
  for (let i = 0; i < steps && game.history.length; i++) {
    const last = game.history.pop();
    game.state = last.stateBefore;
  }
  game.selected = -1;
  game.legalCache = [];
  gameoverOverlay.classList.add('hidden');
  render();
}

function flipBoard() {
  game.orientation = game.orientation === 'w' ? 'b' : 'w';
  render();
}

// ---------------------------------------------------------------------------
// Online multiplayer
// ---------------------------------------------------------------------------

function commitMove(move) {
  if (game.mode === 'online' && net) { sendMove(move); return; }
  applyMove(move);
}

async function sendMove(move) {
  if (!net) return;
  try {
    const r = await fetch(`/api/rooms/${net.code}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: net.session, move }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setConn('Move rejected: ' + (j.error || 'error'), 'bad');
    }
  } catch (e) {
    setConn('Network error — move not sent', 'bad');
  }
}

function applyRemoteMove(move) {
  const st = game.state;
  const allLegal = legalMoves(st, st.turn);
  const san = moveToSAN(st, move, allLegal);
  game.history.push({ move, san, stateBefore: cloneState(st) });
  game.state = makeMove(st, move);
  game.selected = -1;
  game.legalCache = [];
  render();
  updateTurnConn();
  checkGameOver();
}

function setConn(text, cls) {
  connStatusEl.textContent = text;
  connStatusEl.className = 'conn-status' + (cls ? ' ' + cls : '');
}

function updateTurnConn() {
  if (!net || !net.started) return;
  const mine = game.state.turn === game.humanColor;
  setConn(mine ? 'Your move' : "Opponent's move", mine ? 'good' : '');
}

function cap(c) { return c === 'w' ? 'White' : 'Black'; }

function showGameOverDialog(title, text) {
  gameoverTitle.textContent = title;
  gameoverText.textContent = text;
  gameoverOverlay.classList.remove('hidden');
}

function openEvents() {
  if (!net) return;
  if (net.es) net.es.close();
  const es = new EventSource(`/api/events?room=${net.code}&session=${net.session}`);
  net.es = es;
  es.onmessage = (e) => {
    let ev;
    try { ev = JSON.parse(e.data); } catch { return; }
    handleNetEvent(ev);
  };
  es.onerror = () => setConn('Connection lost — retrying…', 'bad');
}

function handleNetEvent(ev) {
  if (!net) return;
  switch (ev.type) {
    case 'sync': {
      net.color = ev.color;
      net.started = ev.status === 'playing';
      game.humanColor = ev.color;
      game.orientation = ev.color;
      // Rebuild the board from the authoritative move log.
      let st = initialState();
      game.history = [];
      for (const mv of ev.moves) {
        const allLegal = legalMoves(st, st.turn);
        const san = moveToSAN(st, mv, allLegal);
        game.history.push({ move: mv, san, stateBefore: cloneState(st) });
        st = makeMove(st, mv);
      }
      game.state = st;
      game.selected = -1;
      game.legalCache = [];
      if (net.started) onlineActions.classList.remove('hidden');
      setConn(ev.players >= 2 ? 'Connected' : 'Waiting for opponent…', ev.players >= 2 ? 'good' : '');
      render();
      updateTurnConn();
      break;
    }
    case 'presence': {
      if (ev.color === net.color) break;
      setConn(ev.connected ? 'Opponent connected' : 'Opponent disconnected — waiting…',
        ev.connected ? 'good' : 'bad');
      break;
    }
    case 'start': {
      net.started = true;
      onlineActions.classList.remove('hidden');
      render();
      updateTurnConn();
      break;
    }
    case 'move': {
      applyRemoteMove(ev.move);
      break;
    }
    case 'resign': {
      net.started = false;
      const winner = ev.color === 'w' ? 'b' : 'w';
      showGameOverDialog('Resignation', `${cap(ev.color)} resigned — ${cap(winner)} wins.`);
      render();
      break;
    }
  }
}

function disconnectNet() {
  if (net && net.es) net.es.close();
  net = null;
}

function showLobby() {
  onlineLobby.classList.remove('hidden');
  onlineRoom.classList.add('hidden');
  onlineActions.classList.add('hidden');
}

function startOnlineSession(code, session, color) {
  disconnectNet();
  net = { code, session, color, es: null, started: false };
  onlineLobby.classList.add('hidden');
  onlineRoom.classList.remove('hidden');
  roomCodeEl.textContent = code;
  setConn('Connecting…', '');
  newGame();
  openEvents();
}

function setMode(mode) {
  if (mode !== 'online') disconnectNet();
  onlineCard.classList.toggle('hidden', mode !== 'online');
  if (mode === 'online') showLobby();
  newGame();
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

newGameBtn.addEventListener('click', newGame);
gameoverNew.addEventListener('click', newGame);
undoBtn.addEventListener('click', undo);
flipBtn.addEventListener('click', flipBoard);
sideSelect.addEventListener('change', newGame);
modeSelect.addEventListener('change', () => setMode(modeSelect.value));
difficultySelect.addEventListener('change', () => {
  game.difficulty = difficultySelect.value;
});

createRoomBtn.addEventListener('click', async () => {
  try {
    const r = await fetch('/api/rooms', { method: 'POST' });
    const j = await r.json();
    startOnlineSession(j.code, j.session, j.color);
  } catch (e) {
    setConn('Could not reach server', 'bad');
  }
});

joinRoomBtn.addEventListener('click', async () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) return;
  try {
    const r = await fetch(`/api/rooms/${code}/join`, { method: 'POST' });
    const j = await r.json();
    if (!r.ok) {
      onlineLobby.classList.add('hidden');
      onlineRoom.classList.remove('hidden');
      onlineActions.classList.remove('hidden');
      roomCodeEl.textContent = code;
      setConn(j.error || 'Join failed', 'bad');
      return;
    }
    startOnlineSession(code, j.session, j.color);
  } catch (e) {
    setConn('Could not reach server', 'bad');
  }
});

copyCodeBtn.addEventListener('click', () => {
  if (navigator.clipboard) navigator.clipboard.writeText(roomCodeEl.textContent);
});

resignBtn.addEventListener('click', async () => {
  if (!net) return;
  await fetch(`/api/rooms/${net.code}/resign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session: net.session }),
  });
});

leaveBtn.addEventListener('click', () => {
  disconnectNet();
  modeSelect.value = 'ai';
  setMode('ai');
});

// Boot
newGame();
