// === server.js ===
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve client folder
app.use(express.static(path.join(__dirname, 'client')));

const games = {};
function generateGameCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

io.on('connection', socket => {
  console.log('Connected:', socket.id);

  socket.on('newGame', () => {
    const code = generateGameCode();
    games[code] = { players: [socket.id], state: createState() };
    socket.join(code);
    socket.emit('gameCreated', { gameCode: code });
  });

  socket.on('joinGame', ({ gameCode }) => {
    const game = games[gameCode];
    if (!game) return socket.emit('err', { message: 'Game not found' });
    if (game.players.includes(socket.id)) return;
    if (game.players.length >= 2) return socket.emit('err', { message: 'Game full' });
    game.players.push(socket.id);
    socket.join(gameCode);
    if (game.players.length === 2) {
      game.state.phase = 'placing';
      game.state.currentTurn = game.players[0];
      io.in(gameCode).emit('gameStarted', { state: game.state });
    }
  });

  socket.on('placeShips', ({ gameCode, ships }) => {
    const game = games[gameCode]; if (!game) return;
    const idx = game.players.indexOf(socket.id);
    game.state.ships[idx] = ships;
    if (game.state.ships.every(s => s.length)) {
      game.state.phase = 'firing';
      io.in(gameCode).emit('phaseChange', { phase: 'firing' });
    }
  });

  socket.on('fire', ({ gameCode, x, y }) => {
    const game = games[gameCode];
    if (!game || game.state.phase !== 'firing') return;
    if (socket.id !== game.state.currentTurn) return;
    const opponentId = game.players.find(id => id !== socket.id);
    const oppIdx = game.players.indexOf(opponentId);
    const hit = checkHit(game.state.ships[oppIdx], x, y);
    recordShot(game.state, socket.id, x, y, hit);
    const sunk = checkSunk(game.state.ships[oppIdx]);
    const winner = checkWin(game.state.ships[oppIdx]) ? socket.id : null;
    io.in(gameCode).emit('shotResult', { shooter: socket.id, x, y, hit, sunk, winner });
    if (winner) {
      game.state.phase = 'game_over';
      io.in(gameCode).emit('gameOver', { winner });
    } else {
      game.state.currentTurn = opponentId;
      io.in(gameCode).emit('turnChange', { currentTurn: opponentId });
    }
  });

  socket.on('disconnect', () => {
    for (const code in games) {
      const game = games[code];
      const i = game.players.indexOf(socket.id);
      if (i !== -1) {
        delete games[code];
        break;
      }
    }
  });
});

function createState() {
  return { phase: 'waiting', currentTurn: null, ships: [[], []], shots: {} };
}
function checkHit(ships, x, y) {
  return ships.some(ship => ship.coords.some(c => c.x === x && c.y === y));
}
function recordShot(state, shooter, x, y, hit) {
  if (!state.shots[shooter]) state.shots[shooter] = [];
  state.shots[shooter].push({ x, y, hit });
}
function checkSunk(ships) {
  return ships.filter(s => s.coords.every(c => c.hit)).map(s => s.id);
}
function checkWin(ships) { return ships.every(s => s.coords.every(c => c.hit)); }

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server up on ${PORT}`));
