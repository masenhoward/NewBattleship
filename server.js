// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static client files
app.use(express.static(path.join(__dirname, 'client')));

// In-memory games store
const games = {}; // { gameCode: { players: [socketIds], state: { ... } } }

// Generate a simple 6-char game code
function generateGameCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 1) Create a new game
  socket.on('newGame', () => {
    const gameCode = generateGameCode();
    games[gameCode] = {
      players: [socket.id],
      state: createInitialState()
    };
    socket.join(gameCode);
    socket.emit('gameCreated', { gameCode });
  });

  // 2) Join an existing game
  socket.on('joinGame', ({ gameCode }) => {
    const game = games[gameCode];
    if (!game) {
      socket.emit('err', { message: 'Game not found' });
      return;
    }
    if (game.players.length > 2) {
      socket.emit('err', { message: 'Game full' });
      return;
    }

    game.players.push(socket.id);
    socket.join(gameCode);
    io.in(gameCode).emit('playerJoined', {});
    
    // Start game once two players are in
    if (game.players.length === 2) {
      game.state.phase = 'placing';
      game.state.currentTurn = game.players[0];
      io.in(gameCode).emit('gameStarted', { state: game.state });
    }
  });

  // 3) Handle ship placement
  socket.on('placeShips', ({ gameCode, ships }) => {
    const game = games[gameCode];
    if (!game) return;

    const idx = game.players.indexOf(socket.id);
    game.state.ships[idx] = ships;

    // If both have placed, move to firing phase
    if (game.state.ships.every(arr => arr.length > 0)) {
      game.state.phase = 'firing';
      io.in(gameCode).emit('phaseChange', { phase: 'firing' });
    }
  });

  // 4) Handle firing shots
  socket.on('fire', ({ gameCode, x, y }) => {
    const game = games[gameCode];
    if (!game || game.state.phase !== 'firing') return;
    if (socket.id !== game.state.currentTurn) return;

    // Determine opponent index (0 or 1)
    const opponentId = game.players.find(id => id !== socket.id);
    const opponentIndex = (opponentId === game.players[0] ? 0 : 1);

    // Check hit
    const hit = checkHit(game.state.ships[opponentIndex], x, y);
    recordShot(game.state, socket.id, x, y, hit);

    // Check for sunk ships and win
    const sunk = checkSunk(game.state.ships[opponentIndex]);
    const winner = checkWin(game.state.ships[opponentIndex]) ? socket.id : null;

    io.in(gameCode).emit('shotResult', { shooter: socket.id, x, y, hit, sunk, winner });

    if (winner) {
      game.state.phase = 'game_over';
      io.in(gameCode).emit('gameOver', { winner });
    } else {
      // Switch turn
      game.state.currentTurn = opponentId;
      io.in(gameCode).emit('turnChange', { currentTurn: opponentId });
    }
  });

  // 5) Clean up on disconnect
  socket.on('disconnect', () => {
    for (const code in games) {
      const game = games[code];
      const idx = game.players.indexOf(socket.id);
      if (idx !== -1) {
        game.players.splice(idx, 1);
        io.in(code).emit('playerLeft', {});
        delete games[code];
        break;
      }
    }
  });
});

// Helper to initialize a new game's state
function createInitialState() {
  return {
    phase: 'waiting',
    currentTurn: null,
    ships: [[], []],        // Each player’s array of placed ships
    shots: {}               // { socketId: [ { x, y, hit } ] }
  };
}

// Returns true if any ship occupies (x,y)
function checkHit(ships, x, y) {
  return ships.some(ship =>
    ship.coordinates.some(c => c.x === x && c.y === y)
  );
}

// Record shot in state
function recordShot(state, shooter, x, y, hit) {
  if (!state.shots[shooter]) state.shots[shooter] = [];
  state.shots[shooter].push({ x, y, hit });
}

// Return list of ship IDs that are fully hit
function checkSunk(ships) {
  return ships
    .filter(ship => ship.coordinates.every(c => c.hit))
    .map(ship => ship.id);
}

// True if all ships are sunk
function checkWin(ships) {
  return ships.every(ship =>
    ship.coordinates.every(c => c.hit)
  );
}

// Start Express/Socket.io server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
