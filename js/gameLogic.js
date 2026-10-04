/*
 * gameLogic.js - browser edition
 *
 * Local hot-seat (2 players, one computer, taking turns) version of the
 * block puzzle. This file used to be the authoritative Socket.IO server
 * logic; all networking has been removed so the game runs as a plain
 * static page with no server and no network access.
 *
 * Exposes window.GameLogic for game.html, and module.exports when a
 * CommonJS loader is present (so the file can be smoke-tested with node).
 *
 * Rules kept from the original game:
 *   - 4x4 board, 16 possible blocks (4 shapes x 4 colors)
 *   - placing the 16th block clears the whole board and pays a jackpot (+16)
 *   - otherwise a line of >= 3 matching shapes or >= 3 matching colors
 *     through the placed cell is removed; each removed block = 1 point
 *   - cleared blocks return to the block pool
 */

(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (root) {
        root.GameLogic = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    // gm_config
    var BOARD_SIZE = 4;
    var CELL_COUNT = BOARD_SIZE * BOARD_SIZE; // 16
    var SHAPES = ['circle', 'square', 'triangle', 'star'];
    var COLORS = ['red', 'blue', 'green', 'yellow'];
    var DEFAULT_TURN_TIMEOUT = 60000; // ms

    // gm_state
    var gameState = {
        board: new Array(CELL_COUNT).fill(null),
        availableBlocks: [],
        players: [],
        currentPlayerIndex: -1,
        turnTimeoutDuration: DEFAULT_TURN_TIMEOUT,
        turnStartTime: null,
        turnTimeRemaining: DEFAULT_TURN_TIMEOUT,
        onTimeout: null,
        onTurnChange: null
    };

    // local_timer (replaces the old server-side socket timeout bookkeeping)
    var turnTimer = null;

    function clearTurnTimer() {
        if (turnTimer !== null) {
            clearTimeout(turnTimer);
            turnTimer = null;
        }
    }

    // utils

    function generateAllBlocks() {
        var blocks = [];
        for (var s = 0; s < SHAPES.length; s++) {
            for (var c = 0; c < COLORS.length; c++) {
                blocks.push({
                    id: SHAPES[s] + '_' + COLORS[c],
                    shape: SHAPES[s],
                    color: COLORS[c]
                });
            }
        }
        return blocks;
    }

    function getRandomBlock() {
        if (gameState.availableBlocks.length === 0) {
            gameState.availableBlocks = generateAllBlocks();
        }
        var randomIndex = Math.floor(Math.random() * gameState.availableBlocks.length);
        var block = gameState.availableBlocks[randomIndex];
        gameState.availableBlocks.splice(randomIndex, 1);
        return block;
    }

    function getIndex(row, col) {
        return row * BOARD_SIZE + col;
    }

    function inBounds(row, col) {
        return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
    }

    // gm_core

    /**
     * Look for lines (>= 3 cells; horizontal / vertical / both diagonals)
     * of matching shapes or matching colors running through (row, col).
     * Returns { clearedIndices: number[], points: number }.
     */
    function checkAndClearLines(row, col) {
        var board = gameState.board;
        var block = board[getIndex(row, col)];
        if (!block) {
            return { clearedIndices: [], points: 0 };
        }

        var linesToClear = new Set();

        function getLineIndices(startRow, startCol, deltaRow, deltaCol, compareFunc) {
            var indices = [];
            var r, c, idx, current;

            r = startRow;
            c = startCol;
            while (inBounds(r, c)) {
                idx = getIndex(r, c);
                current = board[idx];
                if (current && compareFunc(current)) {
                    indices.push(idx);
                } else {
                    break;
                }
                r += deltaRow;
                c += deltaCol;
            }

            r = startRow - deltaRow;
            c = startCol - deltaCol;
            while (inBounds(r, c)) {
                idx = getIndex(r, c);
                current = board[idx];
                if (current && compareFunc(current)) {
                    indices.push(idx);
                } else {
                    break;
                }
                r -= deltaRow;
                c -= deltaCol;
            }

            return indices;
        }

        function sameShape(b) { return b.shape === block.shape; }
        function sameColor(b) { return b.color === block.color; }

        var directions = [
            { dr: 0, dc: 1 },
            { dr: 1, dc: 0 },
            { dr: 1, dc: 1 },
            { dr: 1, dc: -1 }
        ];

        for (var d = 0; d < directions.length; d++) {
            var dir = directions[d];

            var shapeLine = getLineIndices(row, col, dir.dr, dir.dc, sameShape);
            if (shapeLine.length >= 3) {
                shapeLine.forEach(function (i) { linesToClear.add(i); });
            }

            var colorLine = getLineIndices(row, col, dir.dr, dir.dc, sameColor);
            if (colorLine.length >= 3) {
                colorLine.forEach(function (i) { linesToClear.add(i); });
            }
        }

        var clearedIndices = Array.from(linesToClear);

        if (clearedIndices.length === 0) {
            return { clearedIndices: [], points: 0 };
        }

        var clearedBlocks = [];
        for (var i = 0; i < clearedIndices.length; i++) {
            var index = clearedIndices[i];
            var clearedBlock = board[index];
            if (clearedBlock) {
                clearedBlocks.push(clearedBlock);
                board[index] = null;
            }
        }

        // cleared blocks go back into the draw pool (no duplicates)
        for (var j = 0; j < clearedBlocks.length; j++) {
            var cb = clearedBlocks[j];
            var exists = gameState.availableBlocks.some(function (b) {
                return b.shape === cb.shape && b.color === cb.color;
            });
            if (!exists) {
                gameState.availableBlocks.push(cb);
            }
        }

        return { clearedIndices: clearedIndices, points: clearedIndices.length };
    }

    function isBoardFull() {
        return gameState.board.every(function (cell) { return cell !== null; });
    }

    function isBoardEmpty() {
        return gameState.board.every(function (cell) { return cell === null; });
    }

    /** Current player forfeits; the turn simply passes to the next local player. */
    function handleTurnTimeout() {
        var timedOutPlayer = getCurrentPlayer();
        if (!timedOutPlayer) return null;
        var next = moveToNextPlayer();
        if (typeof gameState.onTimeout === 'function') {
            gameState.onTimeout({
                playerId: timedOutPlayer.id,
                playerName: timedOutPlayer.name,
                nextPlayer: next ? { id: next.id, name: next.name, block: next.currentBlock } : null
            });
        }
        return next;
    }

    function moveToNextPlayer() {
        clearTurnTimer();

        if (gameState.players.length === 0) {
            gameState.currentPlayerIndex = -1;
            gameState.turnStartTime = null;
            gameState.turnTimeRemaining = 0;
            return null;
        }

        gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
        var nextPlayer = gameState.players[gameState.currentPlayerIndex];
        nextPlayer.currentBlock = getRandomBlock();

        startTurnClock();

        if (typeof gameState.onTurnChange === 'function') {
            gameState.onTurnChange({
                id: nextPlayer.id,
                name: nextPlayer.name,
                block: nextPlayer.currentBlock
            });
        }

        return nextPlayer;
    }

    function startTurnClock() {
        clearTurnTimer();
        gameState.turnStartTime = Date.now();
        gameState.turnTimeRemaining = gameState.turnTimeoutDuration;

        if (!gameState.turnTimeoutDuration || gameState.turnTimeoutDuration <= 0) {
            return;
        }

        turnTimer = setTimeout(function () {
            turnTimer = null;
            handleTurnTimeout();
        }, gameState.turnTimeoutDuration);
    }

    /**
     * Place the current player's block on the board.
     * Returns points, cleared cells and the next-turn information.
     */
    function executePlacement(playerId, row, col) {
        var player = gameState.players.filter(function (p) { return p.id === playerId; })[0];
        if (!player) {
            return { success: false, error: 'Player not found' };
        }

        var currentPlayer = gameState.players[gameState.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.id !== playerId) {
            return { success: false, error: 'Not your turn' };
        }

        if (!inBounds(row, col)) {
            return { success: false, error: 'Invalid position' };
        }

        var index = getIndex(row, col);
        if (gameState.board[index] !== null) {
            return { success: false, error: 'Position already occupied' };
        }

        if (!player.currentBlock) {
            return { success: false, error: 'No block to place' };
        }

        var placedBlock = player.currentBlock;
        gameState.board[index] = placedBlock;
        player.currentBlock = null;

        var totalPoints = 0;
        var clearedIndices = [];
        var jackpot = false;

        if (isBoardFull()) {
            // board completed: full clear + jackpot
            var allBlocks = gameState.board.filter(function (cell) { return cell !== null; });
            gameState.availableBlocks.push.apply(gameState.availableBlocks, allBlocks);
            gameState.board.fill(null);
            player.score += CELL_COUNT;
            totalPoints += CELL_COUNT;
            jackpot = true;
        } else {
            // lines are only checked while the board is not full
            var elimination = checkAndClearLines(row, col);
            if (elimination.points > 0) {
                player.score += elimination.points;
                totalPoints += elimination.points;
                clearedIndices = elimination.clearedIndices;
            }
        }

        var nextPlayer = moveToNextPlayer();

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

    // gm_player (local hot-seat players, ids are generated locally)

    function nextPlayerId() {
        var n = 1;
        while (gameState.players.some(function (p) { return p.id === 'p' + n; })) {
            n++;
        }
        return 'p' + n;
    }

    /** Add a local player. Names must be unique and non-empty. */
    function addPlayer(playerName) {
        var name = (playerName || '').trim();
        if (!name) {
            return { success: false, error: 'Please enter a name' };
        }
        if (gameState.players.length >= 2) {
            return { success: false, error: 'This game supports two local players' };
        }
        if (gameState.players.some(function (p) { return p.name === name; })) {
            return { success: false, error: 'Name already taken' };
        }

        var id = nextPlayerId();
        var newPlayer = {
            id: id,
            name: name,
            score: 0,
            currentBlock: null
        };
        gameState.players.push(newPlayer);

        if (gameState.players.length === 1) {
            gameState.currentPlayerIndex = 0;
            newPlayer.currentBlock = getRandomBlock();
            startTurnClock();
            if (typeof gameState.onTurnChange === 'function') {
                gameState.onTurnChange({
                    id: newPlayer.id,
                    name: newPlayer.name,
                    block: newPlayer.currentBlock
                });
            }
        }

        return { success: true, playerId: id };
    }

    /**
     * Remove a local player (restart / leave). The held block goes back to the
     * pool. When players remain, the turn moves on to the next one.
     */
    function removePlayer(playerId) {
        var index = gameState.players.map(function (p) { return p.id; }).indexOf(playerId);
        if (index === -1) return false;

        var removedPlayer = gameState.players[index];
        var wasCurrentPlayer = gameState.currentPlayerIndex === index;

        if (removedPlayer.currentBlock) {
            gameState.availableBlocks.push(removedPlayer.currentBlock);
            removedPlayer.currentBlock = null;
        }

        gameState.players.splice(index, 1);

        if (gameState.players.length === 0) {
            clearTurnTimer();
            gameState.currentPlayerIndex = -1;
            gameState.turnStartTime = null;
            gameState.turnTimeRemaining = 0;
            return { removedPlayer: removedPlayer, wasCurrentPlayer: wasCurrentPlayer };
        }

        if (wasCurrentPlayer) {
            clearTurnTimer();
            // step back one so moveToNextPlayer lands on the player who
            // inherited the removed player's slot
            gameState.currentPlayerIndex = Math.min(index, gameState.players.length - 1) - 1;
            moveToNextPlayer();
        } else if (gameState.currentPlayerIndex > index) {
            gameState.currentPlayerIndex--;
        }

        return { removedPlayer: removedPlayer, wasCurrentPlayer: wasCurrentPlayer };
    }

    // gm_getters

    function getGameState() {
        var currentPlayer = getCurrentPlayer();
        return {
            board: gameState.board.slice(),
            players: gameState.players.map(function (p) {
                return { id: p.id, name: p.name, score: p.score };
            }),
            currentPlayer: currentPlayer ? {
                id: currentPlayer.id,
                name: currentPlayer.name
            } : null,
            timeRemaining: getTimeRemaining()
        };
    }

    function getTimeRemaining() {
        if (gameState.turnStartTime === null || gameState.currentPlayerIndex < 0) {
            return 0;
        }
        var elapsed = Date.now() - gameState.turnStartTime;
        var remaining = Math.max(0, gameState.turnTimeoutDuration - elapsed);
        return Math.ceil(remaining / 1000);
    }

    function getBoardAndScores() {
        return {
            board: gameState.board.slice(),
            scores: gameState.players.map(function (p) {
                return { id: p.id, name: p.name, score: p.score };
            })
        };
    }

    function getCurrentPlayer() {
        if (gameState.currentPlayerIndex >= 0 && gameState.players.length > 0) {
            return gameState.players[gameState.currentPlayerIndex];
        }
        return null;
    }

    function getPlayerCurrentBlock(playerId) {
        var player = gameState.players.filter(function (p) { return p.id === playerId; })[0];
        return player ? player.currentBlock : null;
    }

    function getPlayerName(playerId) {
        var player = gameState.players.filter(function (p) { return p.id === playerId; })[0];
        return player ? player.name : null;
    }

    function playerExists(playerId) {
        return gameState.players.some(function (p) { return p.id === playerId; });
    }

    function resetGame() {
        clearTurnTimer();
        gameState.board = new Array(CELL_COUNT).fill(null);
        gameState.availableBlocks = generateAllBlocks();
        gameState.players = [];
        gameState.currentPlayerIndex = -1;
        gameState.turnStartTime = null;
        gameState.turnTimeRemaining = gameState.turnTimeoutDuration;
    }

    // callbacks (local replacements for the old socket broadcasts)
    function setOnTimeoutCallback(callback) { gameState.onTimeout = callback; }
    function setOnTurnChangeCallback(callback) { gameState.onTurnChange = callback; }

    function getTurnTimeoutDuration() { return gameState.turnTimeoutDuration; }
    function setTurnTimeoutDuration(ms) {
        gameState.turnTimeoutDuration = ms;
        gameState.turnTimeRemaining = ms;
    }

    return {
        // config
        SHAPES: SHAPES,
        COLORS: COLORS,
        BOARD_SIZE: BOARD_SIZE,
        CELL_COUNT: CELL_COUNT,

        // core
        generateAllBlocks: generateAllBlocks,
        getRandomBlock: getRandomBlock,
        getIndex: getIndex,
        checkAndClearLines: checkAndClearLines,
        isBoardFull: isBoardFull,
        isBoardEmpty: isBoardEmpty,
        executePlacement: executePlacement,
        moveToNextPlayer: moveToNextPlayer,
        handleTurnTimeout: handleTurnTimeout,

        // players
        addPlayer: addPlayer,
        removePlayer: removePlayer,
        resetGame: resetGame,

        // getters
        getGameState: getGameState,
        getBoardAndScores: getBoardAndScores,
        getCurrentPlayer: getCurrentPlayer,
        getPlayerCurrentBlock: getPlayerCurrentBlock,
        getPlayerName: getPlayerName,
        playerExists: playerExists,
        getTimeRemaining: getTimeRemaining,
        getPlayers: function () { return gameState.players; },
        getTurnTimeoutDuration: getTurnTimeoutDuration,
        setTurnTimeoutDuration: setTurnTimeoutDuration,

        // callbacks
        setOnTimeoutCallback: setOnTimeoutCallback,
        setOnTurnChangeCallback: setOnTurnChangeCallback,

        getBoard: function () { return gameState.board.slice(); }
    };
});
