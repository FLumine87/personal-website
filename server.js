const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const gameLogic = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 8080;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.render('index'));
app.get('/about', (req, res) => res.render('about'));
app.get('/game', (req, res) => res.render('game'));
app.get('/report', (req, res) => res.sendFile(path.join(__dirname, 'report.html')));

// socket_events

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.emit('gameStateUpdate', gameLogic.getGameState());
    
    socket.on('joinGame', (data, callback) => {
        const { playerName } = data;
        const result = gameLogic.addPlayer(socket.id, playerName);
        
        if (result.success) {
            io.emit('gameStateUpdate', gameLogic.getGameState());
            io.emit('playerJoined', { playerId: socket.id, playerName: playerName });
            
            const currentPlayer = gameLogic.getCurrentPlayer();
            if (currentPlayer && currentPlayer.id === socket.id) {
                const currentBlock = gameLogic.getPlayerCurrentBlock(socket.id);
                socket.emit('yourTurn', {
                    block: currentBlock,
                    timeLimit: gameLogic.getTurnTimeoutDuration() / 1000
                });
            }
        }
        
        if (callback) callback(result);
    });
    
    socket.on('placeBlock', (data, callback) => {
        const { row, col } = data;
        const result = gameLogic.executePlacement(socket.id, row, col);
        
        if (result.success) {
            io.emit('boardUpdate', gameLogic.getBoardAndScores());
            io.emit('gameStateUpdate', gameLogic.getGameState());
            
            if (result.clearedIndices && result.clearedIndices.length > 0) {
                io.emit('blocksCleared', {
                    indices: result.clearedIndices,
                    points: result.pointsEarned
                });
            }
            
            if (result.jackpot) {
                const playerName = gameLogic.getPlayerName(socket.id);
                io.emit('jackpot', { playerName: playerName, points: 16 });
            }
            
            if (result.nextPlayer) {
                io.emit('turnChange', {
                    playerId: result.nextPlayer.id,
                    playerName: result.nextPlayer.name
                });
                io.to(result.nextPlayer.id).emit('yourTurn', {
                    block: result.nextPlayer.block,
                    timeLimit: gameLogic.getTurnTimeoutDuration() / 1000
                });
            }
        }
        
        if (callback) callback(result);
    });
    
    socket.on('requestGameState', () => {
        socket.emit('gameStateUpdate', gameLogic.getGameState());
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        const result = gameLogic.removePlayer(socket.id);
        
        if (result && result.removedPlayer) {
            io.emit('gameStateUpdate', gameLogic.getGameState());
            io.emit('playerLeft', {
                playerId: socket.id,
                playerName: result.removedPlayer.name,
                reason: result.isTimeout ? 'timeout' : 'disconnect'
            });
            
            const currentPlayer = gameLogic.getCurrentPlayer();
            if (currentPlayer && !result.wasCurrentPlayer) {
                io.emit('turnChange', {
                    playerId: currentPlayer.id,
                    playerName: currentPlayer.name
                });
                const currentBlock = gameLogic.getPlayerCurrentBlock(currentPlayer.id);
                io.to(currentPlayer.id).emit('yourTurn', {
                    block: currentBlock,
                    timeLimit: gameLogic.getTurnTimeoutDuration() / 1000
                });
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`  - Home: http://localhost:${PORT}/`);
    console.log(`  - About: http://localhost:${PORT}/about`);
    console.log(`  - Game: http://localhost:${PORT}/game`);
    console.log(`  - Report: http://localhost:${PORT}/report`);
});