// TODO: Allow custom names
// create game ID generation server side
// create log in area

let isHorizontal = true;
let draggedShip = null;
const placedShips = new Map(); // Tracks which ships have been placed

// Socket.io connection - use existing global socket or create new one
let socket = window.socket || io("http://localhost:3000");
let gameCode;
let currentTurn = null;

document.addEventListener('DOMContentLoaded', function() {
    // Get DOM elements
    const loginScreen = document.getElementById('login-screen');
    const gameScreen = document.getElementById('game-screen');
    
    try {
        // Socket already initialized in HTML
        console.log("Using pre-initialized Socket.IO");
        
        // Setup login form handlers
        document.getElementById('create-game-btn')?.addEventListener('click', function() {
            const playerName = document.getElementById('player-name')?.value || 'Player';
            socket.emit('newGame', { playerName });
        });
        
        document.getElementById('join-game-btn')?.addEventListener('click', function() {
            const playerName = document.getElementById('player-name')?.value || 'Player';
            const code = document.getElementById('game-code-input')?.value;
            if (code) {
                // Set the gameCode variable when joining
                gameCode = code;
                socket.emit('joinGame', { gameCode: code, playerName });
            }
        });
        
        // Handle socket events for game creation/joining
        socket.on('gameCreated', function(data) {
            gameCode = data.gameCode;
            document.getElementById('game-code-display').textContent = gameCode;
            console.log('Game created with code:', gameCode);
        });
        
        socket.on('gameStarted', function(data) {
            // Ensure gameCode is set for both players
            if (data.gameCode) {
                gameCode = data.gameCode;
                document.getElementById('game-code-display').textContent = gameCode;
            }
            
            // Switch from login to game screen
            loginScreen.style.display = 'none';
            gameScreen.style.display = 'block';
            
            // Generate the grids
            generateGrids();
            
            // Set up ship drag events AFTER grid generation
            setupShipDragging();
            
            console.log('Game started', data);
            currentTurn = data.state.currentTurn;
            updateTurnIndicator();
        });
        
        // Add this to your socket event handlers section
        socket.on('turnChange', function(data) {
            console.log('Turn changed:', data);
            currentTurn = data.currentTurn;
            updateTurnIndicator();
        });

        socket.on('shotResult', function(data) {
            console.log('Shot result:', data);
            // Mark the shot on the appropriate grid
            markShot(data.x, data.y, data.hit, data.shooter === socket.id);
        });

        socket.on('gameOver', function(data) {
            console.log('Game over event received:', data);
            
            // Check if this player is the winner
            const isWinner = data.winner === socket.id;
            
            // Get the turn indicator
            const turnIndicator = document.getElementById('turn-indicator');
            if (turnIndicator) {
                // Change text and style based on win/lose
                if (isWinner) {
                    turnIndicator.textContent = "🎉 YOU WIN! 🎉";
                    turnIndicator.style.color = "#009900";
                    turnIndicator.style.fontWeight = "bold";
                    turnIndicator.style.fontSize = "24px";
                } else {
                    turnIndicator.textContent = "💥 YOU LOSE 💥";
                    turnIndicator.style.color = "#cc0000";
                    turnIndicator.style.fontWeight = "bold";
                    turnIndicator.style.fontSize = "24px";
                }
            }
            
            // Disable all opponent grid cells
            const opponentCells = document.querySelectorAll('.opponent-grid .grid-item');
            opponentCells.forEach(cell => {
                cell.disabled = true;
                cell.style.cursor = 'not-allowed';
            });
            
            // Add a play again button
            const gameScreen = document.getElementById('game-screen');
            if (gameScreen) {
                const playAgainBtn = document.createElement('button');
                playAgainBtn.textContent = "Play Again";
                playAgainBtn.style.marginTop = "20px";
                playAgainBtn.style.padding = "10px 20px";
                playAgainBtn.style.fontSize = "16px";
                playAgainBtn.style.backgroundColor = "#4CAF50";
                playAgainBtn.style.color = "white";
                playAgainBtn.style.border = "none";
                playAgainBtn.style.borderRadius = "4px";
                playAgainBtn.style.cursor = "pointer";
                
                playAgainBtn.addEventListener('click', function() {
                    window.location.reload(); // Reload page to start new game
                });
                
                gameScreen.appendChild(playAgainBtn);
            }
            
            // Add confetti effect on win
            if (isWinner) {
                createConfetti();
            }
        });

        // Simple confetti effect
        function createConfetti() {
            for (let i = 0; i < 150; i++) {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                confetti.style.left = Math.random() * 100 + 'vw';
                confetti.style.animationDuration = Math.random() * 3 + 2 + 's';
                confetti.style.animationDelay = Math.random() * 2 + 's';
                confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
                document.body.appendChild(confetti);
                
                // Remove after animation
                setTimeout(() => {
                    confetti.remove();
                }, 5000);
            }
        }

        // Add this style to your document
        const style = document.createElement('style');
        style.textContent = `
            .confetti {
                position: fixed;
                top: -10px;
                width: 10px;
                height: 10px;
                z-index: 1000;
                animation: fall linear forwards;
            }
            
            @keyframes fall {
                to {
                    transform: translateY(100vh) rotate(720deg);
                }
            }
        `;
        document.head.appendChild(style);
        
        // Other socket event handlers...
        
    } catch (e) {
        console.error("Failed to connect to Socket.IO server:", e);
        
        // Create a visible error message
        const errorDiv = document.createElement('div');
        errorDiv.style.backgroundColor = '#ffcccc';
        errorDiv.style.color = '#cc0000';
        errorDiv.style.padding = '15px';
        errorDiv.style.margin = '10px 0';
        errorDiv.style.borderRadius = '5px';
        errorDiv.style.fontWeight = 'bold';
        errorDiv.style.textAlign = 'center';
        errorDiv.innerHTML = `
            <p>⚠️ Could not connect to game server! ⚠️</p>
            <p>Make sure your server is running on port 3000</p>
            <p>Error: ${e.message || 'Unknown error'}</p>
        `;
        
        // Insert at the top of the page
        document.body.prepend(errorDiv);
    }

    // Add this after your other event handlers
    
    // Add event listener for the Ready button
    document.getElementById('ready-button').addEventListener('click', function() {
        if (placedShips.size >= 5) {
            // Convert ship placements to the format expected by server
            const shipPlacements = [];
            placedShips.forEach((ship, shipType) => {
                const coordinates = [];
                for (let i = 0; i < ship.length; i++) {
                    const x = ship.horizontal ? ship.col + i : ship.col;
                    const y = (ship.horizontal ? ship.row : ship.row + i) - 1; // Adjust to 0-based
                    coordinates.push({ x, y, hit: false });
                }
                
                shipPlacements.push({
                    id: shipType,
                    coordinates: coordinates
                });
            });
            
            // Send to server using Socket.IO
            if (gameCode) {
                socket.emit('placeShips', { 
                    gameCode: gameCode,
                    ships: shipPlacements
                });
                console.log('Ships sent to server:', shipPlacements);
                this.disabled = true;
                this.textContent = "Waiting for opponent...";
            } else {
                console.error('No game code available');
            }
        } else {
            alert("You need to place all 5 ships first!");
        }
    });
    
    // Set up drag and drop for player grid after load
    const playerGridItems = document.querySelectorAll('.player-grid .grid-item');
    playerGridItems.forEach(cell => {
        cell.addEventListener('dragover', handleDragOver);
        cell.addEventListener('dragenter', handleDragEnter);
        cell.addEventListener('dragleave', handleDragLeave);
        cell.addEventListener('drop', handleDrop);
    });
    
    // Add this function to set up ship dragging
    function setupShipDragging() {
        console.log("Setting up ship drag events");
        const ships = document.querySelectorAll('.ship');
        console.log(`Found ${ships.length} ships to make draggable`);
        
        ships.forEach(ship => {
            ship.setAttribute('draggable', 'true');
            ship.addEventListener('dragstart', handleDragStart);
            ship.addEventListener('dragend', handleDragEnd);
            console.log(`Added drag handlers to ${ship.getAttribute('data-ship-type')}`);
        });
        
        // Set up rotation button
        const rotateButton = document.getElementById('rotate-button');
        if (rotateButton) {
            rotateButton.addEventListener('click', function() {
                isHorizontal = !isHorizontal;
                this.textContent = isHorizontal ? "Switch to Vertical" : "Switch to Horizontal";
                console.log(`Ship orientation changed to ${isHorizontal ? 'horizontal' : 'vertical'}`);
            });
        }
    }
});

// Create a separate function for grid generation
function generateGrids() {
    console.log("Generating grids...");
    const boardContainers = document.querySelectorAll('.board-container');
    console.log("Found board containers:", boardContainers.length); // Debug log
    
    if (boardContainers.length >= 2) {
        generateGrid(boardContainers[0], 'player');
        generateGrid(boardContainers[1], 'opponent');
        return true;
    } else {
        console.error("Not enough board containers found");
        return false;
    }
}

console.log("About to expose generateGrids to window");
window.generateGrids = generateGrids;
console.log("Successfully exposed generateGrids to window");

// Function to update turn indicator
function updateTurnIndicator() {
    const isMyTurn = currentTurn === socket.id;
    const turnIndicator = document.getElementById('turn-indicator');
    
    console.log(`Turn indicator update: isMyTurn=${isMyTurn}, currentTurn=${currentTurn}, myId=${socket.id}`);
    
    if (turnIndicator) {
        if (isMyTurn) {
            turnIndicator.textContent = "YOUR TURN - Click opponent's grid to fire!";
            turnIndicator.style.color = '#009900';
            turnIndicator.style.fontWeight = 'bold';
        } else {
            turnIndicator.textContent = "Opponent's turn - waiting...";
            turnIndicator.style.color = '#990000';
            turnIndicator.style.fontWeight = 'normal';
        }
    }
    
    // Visually enable/disable cells based on turn
    const opponentCells = document.querySelectorAll('.opponent-grid .grid-item');
    opponentCells.forEach(cell => {
        // Don't allow clicking on cells already hit or missed
        if (cell.classList.contains('hit') || cell.classList.contains('miss')) {
            cell.disabled = true;
            cell.style.cursor = 'not-allowed';
        } else {
            cell.disabled = !isMyTurn;
            cell.style.cursor = isMyTurn ? 'pointer' : 'not-allowed';
            cell.title = isMyTurn ? 'Click to fire!' : 'Not your turn';
        }
    });
}

// Function to generate grid cells for opponent and player

function generateGrid(gridContainer, gridType) {
    console.log(`Generating ${gridType} grid...`);
    
    // Clear any existing content
    gridContainer.innerHTML = '';
    
    // Create a table for better structure
    const table = document.createElement('table');
    table.className = 'grid-table';
    
    // Create header row with column letters
    const headerRow = document.createElement('tr');
    headerRow.appendChild(document.createElement('th')); // Empty corner cell
    
    // Add column headers (A-J)
    for (let col = 0; col < 10; col++) {
        const th = document.createElement('th');
        th.textContent = String.fromCharCode(65 + col); // A-J
        headerRow.appendChild(th);
    }
    table.appendChild(headerRow);
    
    // Create all 10 rows
    for (let row = 1; row <= 10; row++) {
        const tr = document.createElement('tr');
        
        // Add row number
        const rowHeader = document.createElement('th');
        rowHeader.textContent = row;
        tr.appendChild(rowHeader);
        
        // Add grid cells for this row
        for (let col = 0; col < 10; col++) {
            const colLetter = String.fromCharCode(65 + col); // A-J
            
            const td = document.createElement('td');
            const cell = document.createElement('button');
            cell.className = 'grid-item';
            cell.setAttribute('data-row', row);
            cell.setAttribute('data-col', colLetter);
            cell.id = `${gridType}-${colLetter}${row}`;
            
            // For opponent grid - add click handler for firing
            if (gridType === 'opponent') {
                cell.addEventListener('click', function() {
                    console.log(`Cell clicked: ${colLetter}${row}`);
                    
                    if (currentTurn !== socket.id) {
                        console.log("Not your turn!");
                        return;
                    }
                    
                    const x = col;  // 0-9
                    const y = row - 1;  // 0-9 (adjust from 1-10)
                    
                    if (gameCode) {
                        socket.emit('fire', {
                            gameCode: gameCode,
                            x: x,
                            y: y
                        });
                        console.log(`Attack sent: x=${x}, y=${y}`);
                    } else {
                        console.error("No game code available for firing");
                    }
                });
                
                // Add hover effect to show it's clickable
                cell.classList.add('clickable');
            } 
            // For player grid - add drag-and-drop handlers
            else if (gridType === 'player') {
                cell.addEventListener('dragover', handleDragOver);
                cell.addEventListener('dragenter', handleDragEnter);
                cell.addEventListener('dragleave', handleDragLeave);
                cell.addEventListener('drop', handleDrop);
            }
            
            td.appendChild(cell);
            tr.appendChild(td);
        }
        
        table.appendChild(tr);
    }
    
    gridContainer.appendChild(table);
    console.log(`Finished generating ${gridType} grid with ${table.querySelectorAll('tr').length - 1} rows`);
    return table;
}

// DRAGABLE ITEMS FUNCTIONS

function handleDragStart(e) { 
    // Don't allow dragging if already placed, no muligans
    if (this.classList.contains('placed')) {
        e.preventDefault();
        return;
    }
    
    draggedShip = this;
    this.classList.add('dragging');
    e.dataTransfer.setData('text/plain', this.getAttribute('data-ship-type'));
}

function handleDragEnd() {
    this.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault(); // Allow drop
    const isValid = checkValidPlacement(this);
    
    // Visual feedback
    this.classList.toggle('valid-target', isValid);
    this.classList.toggle('invalid-target', !isValid);
}

function handleDragEnter(e) {
    e.preventDefault();
    const isValid = checkValidPlacement(this);
    
    this.classList.toggle('valid-target', isValid);
    this.classList.toggle('invalid-target', !isValid);
}

function handleDragLeave() {
    this.classList.remove('valid-target', 'invalid-target');
}

function handleDrop(e) {
    e.preventDefault();
    
    // Remove highlighting
    this.classList.remove('valid-target', 'invalid-target');
    
    // Check if valid placement
    if (!checkValidPlacement(this)) {
        return; // Invalid placement
    }
    
    const shipType = e.dataTransfer.getData('text/plain');
    const shipLength = parseInt(draggedShip.getAttribute('data-ship-length'));
    
    const row = parseInt(this.getAttribute('data-row'));
    const col = this.getAttribute('data-col').charCodeAt(0) - 65; // Convert A-J to 0-9

    //to note
    placeShip(row, col, shipLength, shipType);
    draggedShip.classList.add('placed');

    placedShips.set(shipType, {
        row: row,
        col: col,
        length: shipLength,
        horizontal: isHorizontal
    });
    
    if (checkAllShipsPlaced()) {
        return true;
    }
}

function checkValidPlacement(cell) {
    if (!draggedShip) return false;
    
    const shipLength = parseInt(draggedShip.getAttribute('data-ship-length'));
    const row = parseInt(cell.getAttribute('data-row'));
    const col = cell.getAttribute('data-col').charCodeAt(0) - 65; // Convert A-J to 0-9
    
    // Check if ship fits on board
    if (isHorizontal) {
        if (col + shipLength > 10) return false;
    } else {
        if (row + shipLength > 10) return false;
    }
    
    // Check if cells are already occupied
    for (let i = 0; i < shipLength; i++) {
        let checkRow = isHorizontal ? row : row + i;
        let checkCol = isHorizontal ? col + i : col;
        let checkCell = document.querySelector(`.player-grid .grid-item[data-row="${checkRow}"][data-col="${String.fromCharCode(65 + checkCol)}"]`);
        
        if (checkCell && checkCell.classList.contains('ship-placed')) {
            return false;
        }
    }
    
    return true;
}

function placeShip(row, col, length, shipType) {
    for (let i = 0; i < length; i++) {
        let placementRow = isHorizontal ? row : row + i;
        let placementCol = isHorizontal ? col + i : col;
        let cell = document.querySelector(`.player-grid .grid-item[data-row="${placementRow}"][data-col="${String.fromCharCode(65 + placementCol)}"]`);
        
        if (cell) {
            cell.classList.add('ship-placed');
            cell.classList.add(`ship-${shipType}`);
            cell.setAttribute('data-ship', shipType);
        }
    }
}


function markShot(x, y, hit, isMyShot) {
    // Convert 0-9 coordinates to the grid format
    const col = String.fromCharCode(65 + x);
    const row = y + 1;
    
    // Determine which grid to mark
    const gridPrefix = isMyShot ? 'opponent' : 'player';
    const cell = document.getElementById(`${gridPrefix}-${col}${row}`);
    
    if (cell) {
        if (hit) {
            cell.classList.add('hit');
        } else {
            cell.classList.add('miss');
        }
    }
}

// Modify checkAllShipsPlaced to use Socket.IO
function checkAllShipsPlaced() {
    const unplacedShips = document.querySelectorAll('.ship:not(.placed)');
    
    if (unplacedShips.length === 0) {
        console.log("All ships have been placed!");
        
        // Convert ship placements to the format expected by server
        const shipPlacements = [];
        placedShips.forEach((ship, shipType) => {
            const coordinates = [];
            for (let i = 0; i < ship.length; i++) {
                const x = ship.horizontal ? ship.col + i : ship.col;
                const y = (ship.horizontal ? ship.row : ship.row + i) - 1; // Adjust to 0-based
                coordinates.push({ x, y, hit: false });
            }
            
            shipPlacements.push({
                id: shipType,
                coordinates: coordinates
            });
        });
        
        // Send to server using Socket.IO
        if (gameCode) {
            socket.emit('placeShips', { 
                gameCode: gameCode,
                ships: shipPlacements
            });
            console.log('Ships sent to server:', shipPlacements);
        } else {
            console.error('No game code available');
        }
        
        return true;
    }
    return false;
}

// You can call this function when the game starts to get all ship placements
function getShipPlacements() {
    return Object.fromEntries(placedShips);
}


// sources used:
// https://expressjs.com/en/4x/api.html

