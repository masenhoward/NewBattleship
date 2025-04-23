// script.js
const socket = io();
let playerId = null;
socket.on('connect', () => { playerId = socket.id; });

const newGameBtn      = document.getElementById('newGameBtn');
const joinGameBtn     = document.getElementById('joinGameBtn');
const gameCodeInput   = document.getElementById('gameCodeInput');
const menu            = document.getElementById('menu');
const statusEl        = document.getElementById('status');
const yourBoardEl     = document.getElementById('yourBoard');
const opponentBoardEl = document.getElementById('opponentBoard');

let gameCode    = null;
let phase       = 'waiting';
let currentTurn = null;

// placement
let orientation       = 'horizontal';
const shipLengths   = [5, 4, 3, 3, 2];
let currentShipIndex = 0;
const shipsToPlace   = [];

// add rotate button
const rotateBtn = document.createElement('button');
rotateBtn.textContent = 'Orientation: Horizontal';
rotateBtn.style.marginLeft = '10px';
rotateBtn.addEventListener('click', () => {
  orientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
  rotateBtn.textContent =
    'Orientation: ' +
    orientation.charAt(0).toUpperCase() +
    orientation.slice(1);
});
menu.appendChild(rotateBtn);

// ---- Controls ----
newGameBtn.addEventListener('click', () => {
  socket.emit('newGame');
});
joinGameBtn.addEventListener('click', () => {
  const code = gameCodeInput.value.trim().toUpperCase();
  if (!code) return alert('Please enter a game code');
  gameCode = code;
  joinGameBtn.disabled   = true;
  gameCodeInput.disabled = true;
  socket.emit('joinGame', { gameCode: code });
});

// ---- Socket.io events ----
socket.on('gameCreated', ({ gameCode: code }) => {
  gameCode = code;
  alert(`Game Code: ${code}`);
  joinGameBtn.disabled   = true;
  gameCodeInput.disabled = true;
});

socket.on('playerJoined', () => {
  statusEl.textContent = 'Opponent joined. Waiting to start…';
});

socket.on('gameStarted', ({ state }) => {
  phase       = state.phase;
  currentTurn = state.currentTurn;
  statusEl.textContent = `Place ship of length ${shipLengths[currentShipIndex]}`;
  renderBoards();
});

socket.on('phaseChange', ({ phase: newPhase }) => {
  phase = newPhase;
  if (phase === 'firing') {
    statusEl.textContent =
      currentTurn === playerId ? 'Your turn to fire' : "Opponent's turn";
  }
});

socket.on('turnChange', ({ currentTurn: turn }) => {
  currentTurn = turn;
  statusEl.textContent =
    currentTurn === playerId ? 'Your turn to fire' : "Opponent's turn";
});

socket.on('shotResult', ({ shooter, x, y, hit }) => {
  const boardEl = shooter === playerId ? opponentBoardEl : yourBoardEl;
  const cell    = boardEl.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
  cell.classList.add(hit ? 'hit' : 'miss');
});

socket.on('gameOver', ({ winner }) => {
  statusEl.textContent = winner === playerId ? 'You win!' : 'You lose.';
});

socket.on('err', ({ message }) => {
  alert(message);
});

// ---- Rendering & Interaction ----
function renderBoards() {
  yourBoardEl.innerHTML     = '';
  opponentBoardEl.innerHTML = '';

  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const a = document.createElement('div');
      a.className   = 'cell';
      a.dataset.x   = x;
      a.dataset.y   = y;
      yourBoardEl.appendChild(a);

      const b = document.createElement('div');
      b.className   = 'cell';
      b.dataset.x   = x;
      b.dataset.y   = y;
      opponentBoardEl.appendChild(b);
    }
  }

  if (phase === 'placing') {
    yourBoardEl.addEventListener('mouseover', handlePreview);
    yourBoardEl.addEventListener('mouseout',   clearPreview);
    yourBoardEl.addEventListener('click',      handlePlaceShip);
  }
}

// show preview
function handlePreview(e) {
  if (!e.target.classList.contains('cell')) return;
  clearPreview();

  const x      = +e.target.dataset.x;
  const y      = +e.target.dataset.y;
  const length = shipLengths[currentShipIndex];
  const preview = [];

  for (let i = 0; i < length; i++) {
    const xx = orientation === 'horizontal' ? x + i : x;
    const yy = orientation === 'horizontal' ? y : y + i;
    const cell = yourBoardEl.querySelector(`.cell[data-x="${xx}"][data-y="${yy}"]`);
    if (!cell || cell.classList.contains('ship')) {
      clearPreview();
      return;
    }
    preview.push(cell);
  }
  preview.forEach(c => c.classList.add('preview'));
}

function clearPreview() {
  yourBoardEl.querySelectorAll('.cell.preview').forEach(c => c.classList.remove('preview'));
}

// finalize placement
function handlePlaceShip(e) {
  if (!e.target.classList.contains('cell')) return;
  const length = shipLengths[currentShipIndex];
  const previewCells = Array.from(yourBoardEl.querySelectorAll('.cell.preview'));
  if (previewCells.length !== length) return;

  const coords = previewCells.map(c => {
    c.classList.remove('preview');
    c.classList.add('ship');
    return { x: +c.dataset.x, y: +c.dataset.y, hit: false };
  });

  shipsToPlace.push({ id: currentShipIndex, coordinates: coords });
  currentShipIndex++;
  clearPreview();

  if (currentShipIndex < shipLengths.length) {
    statusEl.textContent = `Place ship of length ${shipLengths[currentShipIndex]}`;
  } else {
    // done placing
    yourBoardEl.removeEventListener('mouseover', handlePreview);
    yourBoardEl.removeEventListener('mouseout',   clearPreview);
    yourBoardEl.removeEventListener('click',      handlePlaceShip);
    rotateBtn.disabled = true;
    statusEl.textContent = 'Waiting on opponent...';

    socket.emit('placeShips', { gameCode, ships: shipsToPlace });
  }
}

// fire when it's our turn
opponentBoardEl.addEventListener('click', e => {
  if (phase !== 'firing')      return;
  if (currentTurn !== playerId) return;
  if (!e.target.classList.contains('cell')) return;

  const x = +e.target.dataset.x;
  const y = +e.target.dataset.y;
  socket.emit('fire', { gameCode, x, y });
});
