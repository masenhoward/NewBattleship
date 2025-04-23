// script.js
const socket = io();
let playerId;
let gameCode;
let phase;

// DOM elements
const newGameBtn = document.getElementById('newGameBtn');
const joinGameBtn = document.getElementById('joinGameBtn');
const gameCodeInput = document.getElementById('gameCodeInput');
const menu = document.getElementById('menu');
const gameUI = document.getElementById('gameUI');
const ownBoard = document.getElementById('ownBoard');
const opponentBoard = document.getElementById('opponentBoard');
const statusDiv = document.getElementById('status');

// Utility to build a 10x10 grid
function renderBoards() {
  ownBoard.innerHTML = '';
  opponentBoard.innerHTML = '';
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const cellA = document.createElement('div');
      cellA.classList.add('cell');
      cellA.dataset.x = x;
      cellA.dataset.y = y;
      ownBoard.appendChild(cellA);

      const cellB = document.createElement('div');
      cellB.classList.add('cell');
      cellB.dataset.x = x;
      cellB.dataset.y = y;
      opponentBoard.appendChild(cellB);

      // Click handlers
      cellA.addEventListener('click', () => onOwnBoardClick(x, y));
      cellB.addEventListener('click', () => onOpponentBoardClick(x, y));
    }
  }
}

function onOwnBoardClick(x, y) {
  if (phase !== 'placing') return;
  // TODO: allow user to toggle ship placement here (horizontal/vertical)
  // For now, just send single-cell ship for demo
  socket.emit('placeShips', { gameCode, ships: [{ coordinates: [{ x, y }] }] });
}

function onOpponentBoardClick(x, y) {
  if (phase !== 'firing') return;
  socket.emit('fire', { gameCode, x, y });
}

newGameBtn.onclick = () => socket.emit('newGame');
joinGameBtn.onclick = () => socket.emit('joinGame', { gameCode: gameCodeInput.value.toUpperCase() });

socket.on('gameCreated', ({ gameCode: code }) => {
  gameCode = code;
  playerId = socket.id;
  alert(`Game Code: ${code}`);
});

socket.on('gameStarted', ({ state }) => {
  phase = state.phase;
  menu.style.display = 'none';
  gameUI.style.display = 'block';
  renderBoards();
  statusDiv.textContent = 'Place your ships';
});

socket.on('phaseChange', ({ phase: newPhase }) => {
  phase = newPhase;
  statusDiv.textContent = phase === 'firing' ? 'Take your shot' : `Phase: ${phase}`;
});

socket.on('turnChange', ({ currentTurn }) => {
  statusDiv.textContent = currentTurn === socket.id ? 'Your turn' : "Opponent's turn";
});

socket.on('shotResult', ({ shooter, x, y, hit, sunk, winner }) => {
  const board = shooter === socket.id ? opponentBoard : ownBoard;
  const cells = board.querySelectorAll('.cell');
  for (const cell of cells) {
    if (+cell.dataset.x === x && +cell.dataset.y === y) {
      cell.classList.add(hit ? 'hit' : 'miss');
      break;
    }
  }
  if (sunk && sunk.length) statusDiv.textContent += ' Ship sunk!';
  if (winner) socket.emit(''); // no-op
});

socket.on('gameOver', ({ winner }) => {
  statusDiv.textContent = winner === socket.id ? 'You win!' : 'You lose.';
});

socket.on('err', ({ message }) => alert(message));
