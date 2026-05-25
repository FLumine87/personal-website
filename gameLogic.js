// gm_config
const SHAPES = ['circle', 'square', 'triangle', 'star'];
const COLORS = ['red', 'blue', 'green', 'yellow'];

// gm_state
let gameState = {
    board: Array(16).fill(null),
    availableBlocks: [],
    players: [],
    currentPlayerIndex: -1,
    turnTimeout: null,
    turnTimeoutDuration: 60000,
    turnStartTime: null,
    turnTimeRemaining: 60000
};

let onPlayerRemovedCallback = null;

function setOnPlayerRemovedCallback(callback) {
    onPlayerRemovedCallback = callback;
}

// utils

function generateAllBlocks() {
    const blocks = [];
    for (const shape of SHAPES) {
        for (const color of COLORS) {
            blocks.push({
                id: `${shape}_${color}`,
                shape: shape,
                color: color
            });
        }
    }
    return blocks;
}

function getRandomBlock() {
    if (gameState.availableBlocks.length === 0) {
        gameState.availableBlocks = generateAllBlocks();
    }
    const randomIndex = Math.floor(Math.random() * gameState.availableBlocks.length);
    const block = gameState.availableBlocks[randomIndex];
    gameState.availableBlocks.splice(randomIndex, 1);
    return block;
}

function getIndex(row, col) {
    return row * 4 + col;
}

// gm_core

function checkAndClearLines(row, col) {
    const board = gameState.board;
    const block = board[getIndex(row, col)];
    if (!block) return { clearedIndices: [], points: 0 };
    
    const linesToClear = new Set();
    
    function getLineIndices(startRow, startCol, deltaRow, deltaCol, compareFunc) {
        const indices = [];
        
        let r = startRow, c = startCol;
        while (r >= 0 && r < 4 && c >= 0 && c < 4) {
            const idx = getIndex(r, c);
            const currentBlock = board[idx];
            if (currentBlock && compareFunc(currentBlock)) {
                indices.push(idx);
            } else {
                break;
            }
            r += deltaRow;
            c += deltaCol;
        }
        
        r = startRow - deltaRow;
        c = startCol - deltaCol;
        while (r >= 0 && r < 4 && c >= 0 && c < 4) {
            const idx = getIndex(r, c);
            const currentBlock = board[idx];
            if (currentBlock && compareFunc(currentBlock)) {
                indices.push(idx);
            } else {
                break;
            }
            r -= deltaRow;
            c -= deltaCol;
        }
        
        return indices;
    }
    
    const sameShape = (b) => b.shape === block.shape;
    const sameColor = (b) => b.color === block.color;
    
    const directions = [
        { dr: 0, dc: 1 },
        { dr: 1, dc: 0 },
        { dr: 1, dc: 1 },
        { dr: 1, dc: -1 }
    ];
    
    for (const dir of directions) {
        const shapeLine = getLineIndices(row, col, dir.dr, dir.dc, sameShape);
        if (shapeLine.length >= 3) {
            shapeLine.forEach(idx => linesToClear.add(idx));
        }
        
        const colorLine = getLineIndices(row, col, dir.dr, dir.dc, sameColor);
        if (colorLine.length >= 3) {
            colorLine.forEach(idx => linesToClear.add(idx));
        }
    }
    
    const clearedIndices = Array.from(linesToClear);
    
    if (clearedIndices.length === 0) {
        return { clearedIndices: [], points: 0 };
    }
    
    const clearedBlocks = [];
    for (const idx of clearedIndices) {
        const clearedBlock = board[idx];
        if (clearedBlock) {
            clearedBlocks.push(clearedBlock);
            board[idx] = null;
        }
    }
    
    for (const clearedBlock of clearedBlocks) {
        const exists = gameState.availableBlocks.some(
            b => b.shape === clearedBlock.shape && b.color === clearedBlock.color
        );
        if (!exists) {
            gameState.availableBlocks.push(clearedBlock);
        }
    }
    
    return { clearedIndices, points: clearedIndices.length };
}

function isBoardFull() {
    return gameState.board.every(cell => cell !== null);
}

function moveToNextPlayer() {
    if (gameState.turnTimeout) {
        clearTimeout(gameState.turnTimeout);
        gameState.turnTimeout = null;
    }
    
    if (gameState.players.length === 0) {
        gameState.currentPlayerIndex = -1;
        gameState.turnStartTime = null;
        gameState.turnTimeRemaining = 0;
        return null;
    }
    
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
    const nextPlayer = gameState.players[gameState.currentPlayerIndex];
    
    const newBlock = getRandomBlock();
    nextPlayer.currentBlock = newBlock;
    
    gameState.turnStartTime = Date.now();
    gameState.turnTimeRemaining = gameState.turnTimeoutDuration;
    
    gameState.turnTimeout = setTimeout(() => {
        const currentPlayer = gameState.players[gameState.currentPlayerIndex];
        if (currentPlayer) {
            removePlayer(currentPlayer.id, true);
        }
    }, gameState.turnTimeoutDuration);
    
    return nextPlayer;
}

function executePlacement(playerId, row, col) {
    const player = gameState.players.find(p => p.id === playerId);
    if (!player) {
        return { success: false, error: 'Player not found' };
    }
    
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
        return { success: false, error: 'Not your turn' };
    }
    
    const index = getIndex(row, col);
    if (index < 0 || index >= 16) {
        return { success: false, error: 'Invalid position' };
    }
    if (gameState.board[index] !== null) {
        return { success: false, error: 'Position already occupied' };
    }
    
    if (!player.currentBlock) {
        return { success: false, error: 'No block to place' };
    }
    
    const placedBlock = player.currentBlock;
    gameState.board[index] = placedBlock;
    player.currentBlock = null;
    
    let totalPoints = 0;
    let clearedIndices = [];
    let jackpot = false;
    if (isBoardFull()) {
        const allBlocks = gameState.board.filter(cell => cell !== null);
        gameState.availableBlocks.push(...allBlocks);
        gameState.board.fill(null);
        player.score += 16;
        totalPoints += 16;
        jackpot = true;
    } else {
        // 棋盘未满时才检查消除条件
        const elimination = checkAndClearLines(row, col);
        if (elimination.points > 0) {
            player.score += elimination.points;
            totalPoints += elimination.points;
            clearedIndices = elimination.clearedIndices;
        }
    }
    
    const nextPlayer = moveToNextPlayer();
    
    return {
        success: true,
        pointsEarned: totalPoints,
        clearedIndices: clearedIndices,
        jackpot: jackpot,
        nextPlayer: nextPlayer ? {
            id: nextPlayer.id,
            name: nextPlayer.name,
            block: nextPlayer.currentBlock
        } : null
    };
}

// gm_player

function addPlayer(socketId, playerName) {
    if (gameState.players.some(p => p.name === playerName)) {
        return { success: false, error: 'Name already taken' };
    }
    
    const newPlayer = {
        id: socketId,
        name: playerName,
        score: 0,
        currentBlock: null
    };
    
    gameState.players.push(newPlayer);
    
    if (gameState.players.length === 1) {
        gameState.currentPlayerIndex = 0;
        const firstBlock = getRandomBlock();
        gameState.players[0].currentBlock = firstBlock;
        
        gameState.turnStartTime = Date.now();
        gameState.turnTimeRemaining = gameState.turnTimeoutDuration;
        
        gameState.turnTimeout = setTimeout(() => {
            if (gameState.players[0]) {
                removePlayer(gameState.players[0].id, true);
            }
        }, gameState.turnTimeoutDuration);
    }
    
    return { success: true, playerId: socketId };
}

function removePlayer(playerId, isTimeout = false) {
    const index = gameState.players.findIndex(p => p.id === playerId);
    if (index === -1) return false;
    
    const removedPlayer = gameState.players[index];
    const wasCurrentPlayer = (gameState.currentPlayerIndex === index);
    
    if (removedPlayer.currentBlock) {
        gameState.availableBlocks.push(removedPlayer.currentBlock);
    }
    
    gameState.players.splice(index, 1);
    
    if (gameState.players.length === 0) {
        if (gameState.turnTimeout) {
            clearTimeout(gameState.turnTimeout);
            gameState.turnTimeout = null;
        }
        gameState.currentPlayerIndex = -1;
        gameState.board.fill(null);
        gameState.availableBlocks = generateAllBlocks();
        
        if (onPlayerRemovedCallback) {
            onPlayerRemovedCallback({ removedPlayer, wasCurrentPlayer, isTimeout });
        }
        return { removedPlayer, wasCurrentPlayer, isTimeout };
    }
    
    if (wasCurrentPlayer) {
        if (gameState.turnTimeout) {
            clearTimeout(gameState.turnTimeout);
            gameState.turnTimeout = null;
        }
        
        if (gameState.players.length > 0) {
            gameState.currentPlayerIndex = Math.min(index, gameState.players.length - 1);
            const nextPlayer = gameState.players[gameState.currentPlayerIndex];
            const newBlock = getRandomBlock();
            nextPlayer.currentBlock = newBlock;
            
            gameState.turnStartTime = Date.now();
            gameState.turnTimeRemaining = gameState.turnTimeoutDuration;
            
            gameState.turnTimeout = setTimeout(() => {
                if (gameState.players[gameState.currentPlayerIndex]) {
                    removePlayer(gameState.players[gameState.currentPlayerIndex].id, true);
                }
            }, gameState.turnTimeoutDuration);
        } else {
            gameState.currentPlayerIndex = -1;
            gameState.turnStartTime = null;
            gameState.turnTimeRemaining = 0;
        }
    } else if (gameState.currentPlayerIndex > index) {
        gameState.currentPlayerIndex--;
    }
    
    if (onPlayerRemovedCallback) {
        onPlayerRemovedCallback({ removedPlayer, wasCurrentPlayer, isTimeout });
    }
    return { removedPlayer, wasCurrentPlayer, isTimeout };
}

// gm_getters

function getGameState() {
    return {
        board: [...gameState.board],
        players: gameState.players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score
        })),
        currentPlayer: gameState.currentPlayerIndex >= 0 && gameState.players.length > 0 ? {
            id: gameState.players[gameState.currentPlayerIndex].id,
            name: gameState.players[gameState.currentPlayerIndex].name
        } : null,
        timeRemaining: getTimeRemaining()
    };
}

function getTimeRemaining() {
    if (gameState.turnStartTime === null) {
        return 0;
    }
    const elapsed = Date.now() - gameState.turnStartTime;
    const remaining = Math.max(0, gameState.turnTimeoutDuration - elapsed);
    return Math.ceil(remaining / 1000);
}

function getBoardAndScores() {
    return {
        board: [...gameState.board],
        scores: gameState.players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score
        }))
    };
}

function getCurrentPlayer() {
    if (gameState.currentPlayerIndex >= 0 && gameState.players.length > 0) {
        return gameState.players[gameState.currentPlayerIndex];
    }
    return null;
}

function getPlayerCurrentBlock(playerId) {
    const player = gameState.players.find(p => p.id === playerId);
    return player ? player.currentBlock : null;
}

function getPlayerName(playerId) {
    const player = gameState.players.find(p => p.id === playerId);
    return player ? player.name : null;
}

function playerExists(playerId) {
    return gameState.players.some(p => p.id === playerId);
}

function resetGame() {
    if (gameState.turnTimeout) {
        clearTimeout(gameState.turnTimeout);
        gameState.turnTimeout = null;
    }
    gameState.board = Array(16).fill(null);
    gameState.availableBlocks = generateAllBlocks();
    gameState.players = [];
    gameState.currentPlayerIndex = -1;
}

// exports
module.exports = {
    addPlayer,
    removePlayer,
    executePlacement,
    resetGame,
    setOnPlayerRemovedCallback,
    
    getGameState,
    getBoardAndScores,
    getCurrentPlayer,
    getPlayerCurrentBlock,
    getPlayerName,
    playerExists,
    getTimeRemaining,
    getPlayers: () => gameState.players,
    
    getTurnTimeoutDuration: () => gameState.turnTimeoutDuration,
    
    SHAPES,
    COLORS
};