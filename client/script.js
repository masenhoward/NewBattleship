// script.js
const socket = io();

// Track our own socket ID
let playerId = null;
socket.on('connect', () => {
  playerId = socket.id;
});

const newGameBtn      = document.getElementById('newGameBtn');
const joinGameBtn     = document.getElementById('joinGameBtn');
const gameCodeInput   = document.getElementById('gameCodeInput');
const menu            = document.getElementById('menu');
const statusEl        = document.getElementById('status');
const yourBoardEl     = document.getElementById('yourBoard');
const opponentBoardEl = document.getElementById('opponentBoard');

let gameCode      = null;
let phase         = 'waiting';
let currentTurn   = null;

// Placement state
let orientation        = 'horizontal';
const shipLengths     = [5, 4, 3, 3, 2];
let currentShipIndex  = 0;
const shipsToPlace    = [];

// ── Orientation toggle ─────────────────────────────────────────
const rotateBtn = document.createElement('button');
rotateBtn.id = 'rotateBtn';
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

// ── Game setup controls ────────────────────────────────────────
newGameBtn.addEventListener('click', () => {
  socket.emit('newGame');
});

joinGameBtn.addEventListener('click', () => {
  const code = gameCodeInput.value.trim().toUpperCase();
  if (!code) return alert('Please enter a game code');
  // Save it locally so we use the right code when placing ships
  gameCode = code;
  joinGameBtn.disabled = true;
  gameCodeInput.disabled = true;

  socket.emit('joinGame', { gameCode: code });
});

// ── Socket.io events ──────────────────────────────────────────
socket.on('gameCreated', ({ gameCode: code }) => {
  gameCode    = code;
  alert(`Game Code: ${code}`);
  joinGameBtn.disabled      = true;
  gameCodeInput.disabled    = true;
});

socket.on('playerJoined', () => {
  statusEl.textContent = 'Opponent joined. Waiting to start…';
});

socket.on('gameStarted', ({ state }) => {
  phase       = state.phase;
  currentTurn = state.currentTurn;
  statusEl.textContent =
    `Place ship of length ${shipLengths[currentShipIndex]}`;
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

// ── Draw and interact with boards ─────────────────────────────
function renderBoards() {
  yourBoardEl.innerHTML     = '';
  opponentBoardEl.innerHTML = '';

  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const cellA = document.createElement('div');
      cellA.className = 'cell';
      cellA.dataset.x = x;
      cellA.dataset.y = y;
      yourBoardEl.appendChild(cellA);

      const cellB = document.createElement('div');
      cellB.className = 'cell';
      cellB.dataset.x = x;
      cellB.dataset.y = y;
      opponentBoardEl.appendChild(cellB);
    }
  }

  if (phase === 'placing') {
    statusEl.textContent =
      `Place ship of length ${shipLengths[currentShipIndex]}`;
    yourBoardEl.addEventListener('mouseover', handlePreview);
    yourBoardEl.addEventListener('mouseout',   clearPreview);
    yourBoardEl.addEventListener('click',      handlePlaceShip);
  }
}

// Show a dashed outline for valid preview cells
function handlePreview(e) {
  if (!e.target.classList.contains('cell')) return;
  clearPreview();

  const x      = +e.target.dataset.x;
  const y      = +e.target.dataset.y;
  const length = shipLengths[currentShipIndex];
  const previewCells = [];

  for (let i = 0; i < length; i++) {
    const xx = orientation === 'horizontal' ? x + i : x;
    const yy = orientation === 'horizontal' ? y : y + i;
    const cell = yourBoardEl.querySelector(
      `.cell[data-x="${xx}"][data-y="${yy}"]`
    );
    if (!cell || cell.classList.contains('ship')) {
      clearPreview();
      return;
    }
    previewCells.push(cell);
  }

  previewCells.forEach(c => c.classList.add('preview'));
}

function clearPreview() {
  yourBoardEl.querySelectorAll('.cell.preview')
    .forEach(c => c.classList.remove('preview'));
}

// Finalize placement on click
function handlePlaceShip(e) {
  if (!e.target.classList.contains('cell')) return;
  const length = shipLengths[currentShipIndex];
  const previewCells = Array.from(
    yourBoardEl.querySelectorAll('.cell.preview')
  );
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
    statusEl.textContent =
      `Place ship of length ${shipLengths[currentShipIndex]}`;
  } else {
    // Finished placing all ships
    yourBoardEl.removeEventListener('mouseover', handlePreview);
    yourBoardEl.removeEventListener('mouseout',   clearPreview);
    yourBoardEl.removeEventListener('click',      handlePlaceShip);
    rotateBtn.disabled = true;
    statusEl.textContent = 'Waiting on opponent...';

    // Now we have the code saved, send to server
    socket.emit('placeShips', {
      gameCode,
      ships: shipsToPlace
    });
  }
}

// Fire at opponent when it's our turn
opponentBoardEl.addEventListener('click', e => {
  if (phase !== 'firing')      return;
  if (currentTurn !== playerId) return;
  if (!e.target.classList.contains('cell')) return;

  const x = +e.target.dataset.x;
  const y = +e.target.dataset.y;
  socket.emit('fire', { gameCode, x, y });
});
