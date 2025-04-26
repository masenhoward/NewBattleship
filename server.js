// server.js
const express = require('express');
const http    = require('http');
const path    = require('path');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

// serve static assets from client/
app.use(express.static(path.join(__dirname, 'client')));

// in-memory store of all games
const games = {};  // { [gameCode]: { players: [socketId,...], playerNames: [name1, name2], state: { phase, currentTurn, ships, shots } } }

// simple 6-char uppercase code generator
function generateGameCode() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// initial empty state for a new game
function createInitialState() {
  return {
    phase: 'waiting',
    currentTurn: null,
    ships: [ [], [] ],       // two player's ship arrays
    shots: {}                // { socketId: [ { x,y,hit } ] }
  };
}

// helper to see if any ship at (x,y)
function checkHit(ships, x, y) {
  return ships.some(ship =>
    ship.coordinates.some(c => c.x === x && c.y === y)
  );
}

function recordShot(state, shooter, x, y, hit) {
  state.shots[shooter] = state.shots[shooter]||[];
  state.shots[shooter].push({ x, y, hit });
}

function checkSunk(ships) {
  return ships
    .filter(ship => ship.coordinates.every(c => c.hit))
    .map(ship => ship.id);
}

function checkWin(ships) {
  return ships.every(ship =>
    ship.coordinates.every(c => c.hit)
  );

}




// THIS MIGHT NEED TO GO INTO LOGIN HTML
io.on('connection', socket => {
  console.log('connect', socket.id);

  // Host starts a new game
  socket.on('newGame', (data) => {
    const code = generateGameCode();
    games[code] = {
      players: [socket.id],
      playerNames: [data.playerName || 'Player 1'],
      state: createInitialState()
    };
    socket.join(code);
    socket.emit('gameCreated', { gameCode: code });
  });

  // Joiner enters an existing code
  socket.on('joinGame', ({ gameCode, playerName }) => {
    const game = games[gameCode];
    if (!game) {
      socket.emit('err', { message: 'Game not found' });
      return;
    }
    if (game.players.includes(socket.id)) {
      socket.emit('err', { message: 'Already joined' });
      return;
    }
    if (game.players.length >= 2) {
      socket.emit('err', { message: 'Game full' });
      return;
    }

    game.players.push(socket.id);
    game.playerNames.push(playerName || 'Player 2');
    socket.join(gameCode);
    
    // First notify both players that someone joined
    io.in(gameCode).emit('playerJoined', {
      players: game.playerNames
    });

    // start placement once two players present
    if (game.players.length === 2) {
      game.state.phase       = 'placing';
      game.state.currentTurn = game.players[0];
      io.in(gameCode).emit('gameStarted', { 
        state: game.state,
        players: game.playerNames
      });
    }
  });

// GAME PLAY


  // Both players send their ship arrays when done placing
  socket.on('placeShips', ({ gameCode, ships }) => {
    const game = games[gameCode];
    if (!game) return;
    const idx = game.players.indexOf(socket.id);
    if (idx < 0) return;

    game.state.ships[idx] = ships;
    // once both have placed
    if (game.state.ships.every(arr => arr.length > 0)) {
      game.state.phase = 'firing';
      io.in(gameCode).emit('phaseChange', { phase: 'firing' });
    }
  });

  // Handle a shot
  socket.on('fire', ({ gameCode, x, y }) => {
    const game = games[gameCode];
    if (!game || game.state.phase !== 'firing') return;
    if (socket.id !== game.state.currentTurn) return;

    // find opponent
    const oppIndex = game.players[0] === socket.id ? 1 : 0;
    const oppId    = game.players[oppIndex];

    // register hit
    const hit = checkHit(game.state.ships[oppIndex], x, y);

    // mark that coordinate “hit” if true
    if (hit) {
      game.state.ships[oppIndex]
        .find(ship => ship.coordinates.some(c=>c.x===x&&c.y===y))
        .coordinates.find(c=>c.x===x&&c.y===y).hit = true;
    }

    recordShot(game.state, socket.id, x, y, hit);
    const sunk   = checkSunk(game.state.ships[oppIndex]);
    const winner = checkWin(game.state.ships[oppIndex]) ? socket.id : null;

    // broadcast result
    io.in(gameCode).emit('shotResult', { shooter: socket.id, x, y, hit, sunk, winner });

    if (winner) {
      game.state.phase = 'game_over';
      io.in(gameCode).emit('gameOver', { winner });
    } else {
      // switch turn
      game.state.currentTurn = oppId;
      io.in(gameCode).emit('turnChange', { currentTurn: oppId });
    }
  });

  // cleanup if someone disconnects
  socket.on('disconnect', () => {
    for (let code in games) {
      const g = games[code];
      const i = g.players.indexOf(socket.id);
      if (i !== -1) {
        io.in(code).emit('playerLeft', {});
        delete games[code];
        break;
      }
    }
  });
});

// start listening
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
