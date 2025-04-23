// === client/script.js ===
const socket = io();
let gameCode; let playerId; let phase;
let orient = 'H';
const shipsToPlace = [];
let draggedShip = null; // track the ship being dragged

// DOM elements
const newGameBtn = document.getElementById('newGameBtn');
const joinGameBtn = document.getElementById('joinGameBtn');
const gameCodeInput = document.getElementById('gameCodeInput');
const menu = document.getElementById('menu');
const gameUI = document.getElementById('gameUI');
const shipPicker = document.getElementById('shipPicker');
const orientSpan = document.getElementById('orient');
const ownBoard = document.getElementById('ownBoard');
const oppBoard = document.getElementById('opponentBoard');
const statusDiv = document.getElementById('status');

// Setup boards
defunction renderBoards() {
  ownBoard.innerHTML = ''; oppBoard.innerHTML = '';
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      [ownBoard, oppBoard].forEach(board => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.x = x;
        cell.dataset.y = y;
        board.appendChild(cell);
      });
    }
  }
}

// Drag & drop handlers
shipPicker.addEventListener('dragstart', e => {
  if (e.target.classList.contains('ship')) {
    draggedShip = e.target;
    e.dataTransfer.setData('text/plain', e.target.dataset.length);
  }
});
ownBoard.addEventListener('dragover', e => e.preventDefault());
ownBoard.addEventListener('drop', e => {
  e.preventDefault();
  const len = +e.dataTransfer.getData('text/plain');
  const x0 = +e.target.dataset.x;
  const y0 = +e.target.dataset.y;
  const coords = [];
  for (let i = 0; i < len; i++) {
    const x = orient === 'H' ? x0 + i : x0;
    const y = orient === 'V' ? y0 + i : y0;
    if (x > 9 || y > 9) return alert('Out of bounds');
    coords.push({ x, y, hit: false });
  }
  // mark on UI
  coords.forEach(c => {
    ownBoard.querySelector(`.cell[data-x='${c.x}'][data-y='${c.y}']`).classList.add('ship');
  });
  shipsToPlace.push({ id: Date.now() + Math.random(), coords });
  // remove the ship element from picker
  if (draggedShip && draggedShip.parentNode === shipPicker) {
    shipPicker.removeChild(draggedShip);
    draggedShip = null;
  }
  if (shipsToPlace.length === 5) {
    socket.emit('placeShips', { gameCode, ships: shipsToPlace });
    statusDiv.textContent = 'Waiting for opponent...';
    shipPicker.hidden = true;
  }
});

// Orientation toggle
document.getElementById('orientationToggle').addEventListener('click', () => {
  orient = orient === 'H' ? 'V' : 'H';
  orientSpan.textContent = orient;
});

newGameBtn.onclick = () => socket.emit('newGame');
joinGameBtn.onclick = () => {
  const code = gameCodeInput.value.toUpperCase();
  gameCode = code;
  socket.emit('joinGame', { gameCode: code });
};

socket.on('gameCreated', ({ gameCode: code }) => {
  gameCode = code;
  playerId = socket.id;
  alert('Game Code: ' + code);
});

socket.on('gameStarted', ({ state }) => {
  phase = state.phase;
  menu.hidden = true;
  gameUI.hidden = false;
  renderBoards();
  statusDiv.textContent = 'Place ships';
});

socket.on('phaseChange', ({ phase: newPhase }) => {
  phase = newPhase;
  statusDiv.textContent = 'Firing phase';
});

socket.on('turnChange', ({ currentTurn }) => {
  statusDiv.textContent = currentTurn === socket.id ? 'Your turn' : 'Opponent turn';
});

oppBoard.addEventListener('click', e => {
  if (phase !== 'firing') return;
  const x = +e.target.dataset.x;
  const y = +e.target.dataset.y;
  socket.emit('fire', { gameCode, x, y });
});

socket.on('shotResult', ({ shooter, x, y, hit, sunk, winner }) => {
  const board = shooter === socket.id ? oppBoard : ownBoard;
  const cell = board.querySelector(`.cell[data-x='${x}'][data-y='${y}']`);
  cell.classList.add(hit ? 'hit' : 'miss');
  if (sunk.length) statusDiv.textContent += ' Ship sunk!';
  if (winner) statusDiv.textContent = winner === socket.id ? 'You win!' : 'You lose.';
});

socket.on('err', ({ message }) => alert(message));
