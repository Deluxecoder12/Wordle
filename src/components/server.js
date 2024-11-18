import express from 'express';
import http from 'http';
import {Server} from 'socket.io';
import fetch from 'node-fetch';
import 'dotenv/config';

import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3001; // You can choose any port

// Store rooms, player scores, and target words
let rooms = {}; // Structure: {roomId: {targetWord, players: {playerID: score}}}

// Middleware to serve static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
app.use(express.static(path.join(__dirname, '../../public')));

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.get('/api/word', async (req, res) => {
    const maxRetries = 5; // Define the maximum number of retries
    let retryCount = 0;

    // Regular expression for 5-letter English words without special characters or spaces
    const validWordRegex = /^[a-zA-Z]{5}$/;

    // Function to fetch the word and validate it
    const fetchAndValidateWord = async () => {
        try {
            const response = await fetch('https://wordsapiv1.p.rapidapi.com/words/?random=true&letters=5', {
                method: 'GET',
                headers: {
                    'X-RapidAPI-Key': process.env.API_KEY,
                    'X-RapidAPI-Host': 'wordsapiv1.p.rapidapi.com'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            const word = data.word || 'DEFAULT'; // Fallback to 'DEFAULT' if word is not found

            // Check if the word matches the regular expression
            if (validWordRegex.test(word)) {
                return word;
            } else {
                throw new Error('Invalid word fetched');
            }

        } catch (error) {
            console.error('Error during word fetch or validation:', error.message);
            return null;
        }
    };

    // Retry mechanism
    const getValidWord = async () => {
        let validWord = null;

        while (retryCount < maxRetries && !validWord) {
            retryCount++;
            console.log(`Attempt ${retryCount} to fetch a valid word...`);
            validWord = await fetchAndValidateWord();

            if (!validWord && retryCount < maxRetries) {
                console.log('Invalid word, retrying...');
            }
        }

        return validWord;
    };

    // Get a valid word
    const word = await getValidWord();

    if (word) {
        console.log('Valid word found:', word);
        res.json({ word });
    } else {
        console.error('Failed to fetch a valid word after multiple retries');
        res.status(500).json({ error: 'Failed to fetch a valid word' });
    }
});

app.get('/api/validate-word', async (req, res) => {
    const { word } = req.query; // Get the word from the query string

    try {
        const response = await fetch(`https://wordsapiv1.p.rapidapi.com/words/${word}`, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': process.env.API_KEY,
                'X-RapidAPI-Host': 'wordsapiv1.p.rapidapi.com'
            }
        });

        if (response.status === 404) {
            // If the API returns a 404 status, the word was not found
            return res.json({ success: false, message: "Word not found" });
        }

        if (!response.ok) {
            // For other HTTP errors, throw an error
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();

        // Check if the word has valid results by looking for specific fields
        const isValid = data.results && data.results.length > 0;

        res.json({ isValid });
    } catch (error) {
        console.error('Error validating word:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Constants for room management
const INITIAL_ROOM_TIMEOUT = 5 * 60 * 1000;  // 5 minutes for initial joining
const ACTIVE_ROOM_TIMEOUT = 30 * 60 * 1000; // 10 minutes in milliseconds
const EMPTY_ROOM_CLEANUP_INTERVAL = 30 * 1000; // Check for empty rooms every 30 seconds

// Function to check room expiry
function checkRoomExpiry(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const now = Date.now();
    const roomAge = now - room.createdAt;
    const hasPlayers = Object.keys(room.players).length > 0;
    
    // Different timeout based on whether room has players
    const timeoutToUse = hasPlayers ? ACTIVE_ROOM_TIMEOUT : INITIAL_ROOM_TIMEOUT;

    if (roomAge >= timeoutToUse) {
        console.log(`Room ${roomId} expired after ${timeoutToUse/1000/60} minutes`);
        // Notify all players in the room if there are any
        if (hasPlayers) {
            io.to(roomId).emit('roomExpired');
        }
        // Clean up room
        cleanupRoom(roomId);
    }
}

// Function to clean up room
function cleanupRoom(roomId) {
    if (rooms[roomId]) {
        // Clear any existing timeout
        if (rooms[roomId].timeout) {
            clearTimeout(rooms[roomId].timeout);
        }
        
        // Notify any remaining players before removing the room
        const hasPlayers = Object.keys(rooms[roomId].players).length > 0;
        if (hasPlayers) {
            io.to(roomId).emit('roomExpired');
        }
        
        // Remove room
        delete rooms[roomId];
        console.log(`Room ${roomId} cleaned up at ${new Date().toLocaleTimeString()}`);
    }
}

setInterval(() => {
    const now = Date.now();
    
    for (const roomId in rooms) {
        const room = rooms[roomId];
        const roomAge = now - room.createdAt;
        const isEmpty = Object.keys(room.players).length === 0;
        
        // Check if room should be cleaned up
        if (isEmpty) {
            if (room.isActive) {
                // Room was active but now empty
                console.log(`Cleaning up abandoned room ${roomId}`);
                cleanupRoom(roomId);
            } else if (roomAge >= INITIAL_ROOM_TIMEOUT) {
                // Inactive room that exceeded initial timeout
                console.log(`Cleaning up unused room ${roomId} after ${Math.floor(roomAge/1000/60)} minutes`);
                cleanupRoom(roomId);
            }
        } else if (roomAge >= ACTIVE_ROOM_TIMEOUT) {
            // Active room that exceeded maximum time limit
            console.log(`Cleaning up expired active room ${roomId} after ${Math.floor(roomAge/1000/60)} minutes`);
            cleanupRoom(roomId);
        }
    }
}, EMPTY_ROOM_CLEANUP_INTERVAL);

function startGameTimer(roomId) {
    rooms[roomId].timer = setTimeout(() => {
        // End the game and send the final scores to all players
        const room = rooms[roomId];
        io.to(roomId).emit('gameEnded', { players: room.players });

        // Clean up the room
        delete rooms[roomId];
    }, 5 * 60 * 1000); // 5 minutes in milliseconds
}

io.on('connect_error', (error) => {
    console.error('Socket.IO connect error:', error);
});

io.on('error', (error) => {
    console.error('Socket.IO error:', error);
});

// Socket.IO connection event
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Player joins a room
    socket.on('joinRoom', async ({ roomId, username }) => {
        console.log(`${username} attempting to join room ${roomId}`);
        
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error', { message: 'Room does not exist or has expired' });
            return;
        }

        // Check if username is already taken in this room
        const existingNames = Object.values(room.players).map(player => player.username);
        if (existingNames.includes(username)) {
            socket.emit('error', { message: 'Username already taken in this room' });
            return;
        }

        if (Object.keys(room.players).length >= room.maxPlayers) {
            socket.emit('roomFull');
            return;
        }

        try {
            // Clear the initial timeout when first player joins
            if (!room.isActive && Object.keys(room.players).length === 0) {
                room.isActive = true;
                clearTimeout(room.timeout);
                room.timeout = setTimeout(() => checkRoomExpiry(roomId), ACTIVE_ROOM_TIMEOUT);
                console.log(`Room ${roomId} activated, new expiry set to ${ACTIVE_ROOM_TIMEOUT/1000/60} minutes`);
            }

            // Add player to room
            room.players[socket.id] = {
                username: username,
                score: 0
            };

            // Join the socket room
            await socket.join(roomId);
            
            // First emit join success
            socket.emit('joinSuccess', {
                roomId,
                username,
                gameInProgress: room.gameInProgress,
                currentWord: room.gameInProgress ? room.currentWord : null
            });

            // Then emit game state to all players
            io.to(roomId).emit('gameState', {
                players: room.players,
                remainingTime: room.isActive ? 
                    ACTIVE_ROOM_TIMEOUT - (Date.now() - room.createdAt) :
                    INITIAL_ROOM_TIMEOUT - (Date.now() - room.createdAt),
                gameInProgress: room.gameInProgress
            });

            // If game is in progress, immediately send gameStarted to new player
            if (room.gameInProgress) {
                console.log(`Sending game state to new player ${username}`);
                socket.emit('gameStarted', {
                    word: room.currentWord,
                    timeLimit: 5 * 60 * 1000, // 5 minutes
                    gameAlreadyStarted: true
                });
            }

            // Notify others
            socket.broadcast.to(roomId).emit('playerJoined', { username });
            
            console.log(`${username} successfully joined room ${roomId}`);
        } catch (error) {
            console.error('Error in room join:', error);
            // Remove player if they were added
            if (room.players[socket.id]) {
                delete room.players[socket.id];
            }
            socket.emit('joinError', { message: 'Failed to join room' });
        }
    });

    // Add socket connection error handling
    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        showAlert('Connection error. Please check your internet connection.');
    });

    socket.on('connect', () => {
        console.log('Socket connected successfully');
    });

    socket.on('startGame', async (roomId) => {
        console.log(`Attempting to start game in room ${roomId}`);
        const room = rooms[roomId];
        if (!room) {
            console.log('Room not found');
            socket.emit('error', { message: 'Room not found' });
            return;
        }
    
        // Verify sender is the room creator
        const isCreator = Object.keys(room.players)[0] === socket.id;
        if (!isCreator) {
            socket.emit('error', { message: 'Only room creator can start the game' });
            return;
        }
    
        try {
            // Use the existing /api/word endpoint to get a word
            const response = await fetch(`http://localhost:${process.env.PORT || 3001}/api/word`);
            if (!response.ok) {
                throw new Error('Failed to fetch word');
            }
            
            const data = await response.json();
            const newWord = data.word.toUpperCase();
            console.log(`Generated word for room ${roomId}: ${newWord}`); // Debug log
    
            room.currentWord = newWord;
            room.gameStartTime = Date.now();
            room.gameInProgress = true;
    
            // Initialize game state for all players
            Object.keys(room.players).forEach(playerId => {
                room.players[playerId].correctGuesses = 0;
                room.players[playerId].totalAttempts = 0;
                room.players[playerId].currentAttempts = 0;
            });
    
            console.log(`Game started in room ${roomId} with word: ${newWord}`);
    
            // Notify all players in the room
            io.to(roomId).emit('gameStarted', {
                word: newWord,
                timeLimit: 5 * 60 * 1000 // 5 minutes in milliseconds
            });
    
        } catch (error) {
            console.error('Error starting game:', error);
            socket.emit('error', { message: 'Failed to start game. Please try again.' });
        }
    });

    socket.on('updateScore', ({ roomId, attempts }) => {
        const room = rooms[roomId];
        if (!room || !room.players[socket.id]) return;

        const player = room.players[socket.id];
        player.correctGuesses = (player.correctGuesses || 0) + 1;
        player.totalAttempts = (player.totalAttempts || 0) + attempts;

        // Broadcast updated scores
        io.to(roomId).emit('scoreUpdate', {
            players: room.players
        });
    });

    socket.on('leaveRoom', ({ roomId, username }) => {
        if (rooms[roomId] && rooms[roomId].players[socket.id]) {
            // Remove player from room
            delete rooms[roomId].players[socket.id];

            // If room is empty, mark as inactive
            if (Object.keys(rooms[roomId].players).length === 0) {
                rooms[roomId].isActive = false;
                console.log(`Room ${roomId} deactivated due to all players leaving`);
            }

            // Leave the Socket.IO room
            socket.leave(roomId);

            // Notify other players
            socket.broadcast.to(roomId).emit('playerLeft', { username });

            // Update game state for remaining players with correct timeout
            io.to(roomId).emit('gameState', {
                players: rooms[roomId].players,
                remainingTime: rooms[roomId].isActive ? 
                    ACTIVE_ROOM_TIMEOUT - (Date.now() - rooms[roomId].createdAt) :
                    INITIAL_ROOM_TIMEOUT - (Date.now() - rooms[roomId].createdAt)
            });

            // If room is empty, clean it up
            if (Object.keys(rooms[roomId].players).length === 0) {
                cleanupRoom(roomId);
            }

            console.log(`${username} left room ${roomId}`);
        }
    });

    // Handle player's word guess
    socket.on('guessWord', async ({ roomId, guessedWord }) => {
        console.log('Received guess:', { roomId, guessedWord });

        // Validate input
        if (!roomId || !guessedWord) {
            console.log('Invalid input:', { roomId, guessedWord });
            return;
        }

        const room = rooms[roomId];
        if (!room || !room.gameInProgress) {
            console.log('Room not found or game not in progress');
            return;
        }

        const player = room.players[socket.id];
        if (!player) {
            console.log('Player not found');
            return;
        }

        try {
            // Validate the word using the existing endpoint
            const response = await fetch(
                `http://localhost:${process.env.PORT || 3001}/api/validate-word?word=${guessedWord}`
            );
            
            if (!response.ok) {
                socket.emit('error', { message: 'Error validating word' });
                return;
            }
    
            const data = await response.json();
            if (!data.isValid && guessedWord.toLowerCase() === room.currentWord.toLowerCase()) {
                socket.emit('error', { message: 'Invalid word' });
                return;
            }
    
            player.totalAttempts = (player.totalAttempts || 0) + 1;
            player.currentAttempts = (player.currentAttempts || 0) + 1;
    
        } catch (error) {
            console.error('Error handling guess:', error);
            socket.emit('error', { message: 'Error processing guess' });
        }
    });

    socket.on('wordGuessed', async ({ roomId, word, attempts }) => {
        console.log('Word guessed correctly:', { roomId, word, attempts });

        if (!roomId || !word) {
            console.log('Invalid wordGuessed input');
            return;
        }

        const room = rooms[roomId];
        if (!room || !room.players[socket.id]) {
            console.log('Room or player not found');
            return;
        }

        const player = room.players[socket.id];
        player.correctGuesses = (player.correctGuesses || 0) + 1;
        player.totalAttempts = (player.totalAttempts || 0) + attempts;

        try {
            // Generate new word
            const newWordResponse = await fetch(`http://localhost:${process.env.PORT || 3001}/api/word`);
            if (!newWordResponse.ok) {
                throw new Error('Failed to fetch new word');
            }

            const newWordData = await newWordResponse.json();
            room.currentWord = newWordData.word.toUpperCase();

            // Notify all players
            io.to(roomId).emit('newWord', { 
                word: room.currentWord 
            });

            // Update scores
            io.to(roomId).emit('updateScores', {
                players: room.players
            });

            // Notify others about the successful guess
            socket.broadcast.to(roomId).emit('playerGuessedWord', {
                username: player.username,
                score: player.correctGuesses
            });

        } catch (error) {
            console.error('Error handling word guessed:', error);
            socket.emit('error', { message: 'Error processing correct guess' });
        }
    });

    // Handle player disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (room.players[socket.id]) {
                const username = room.players[socket.id].username;
                delete room.players[socket.id];

                // If room is empty, mark as inactive and clean up
                if (Object.keys(room.players).length === 0) {
                    room.isActive = false;
                    cleanupRoom(roomId);
                } else {
                    // Notify remaining players
                    io.to(roomId).emit('playerLeft', { username });
                    io.to(roomId).emit('gameState', {
                        players: room.players,
                        remainingTime: ACTIVE_ROOM_TIMEOUT - (Date.now() - room.createdAt)
                    });
                }
                break;
            }
        }
    });

    socket.on('getRoomPlayers', (roomCode, callback) => {
        const room = rooms[roomCode];
        if (room) {
            const players = Object.values(room.players);
            callback({ players });
        } else {
            callback({ players: [] });
        }
    });

    socket.on('getRoomState', (roomCode, callback) => {
        const room = rooms[roomCode];
        if (room) {
            callback({
                success: true,
                players: room.players,
                isActive: room.isActive,
                gameInProgress: room.gameInProgress || false
            });
        } else {
            callback({
                success: false,
                message: 'Room not found'
            });
        }
    });

    // Handle game end
    socket.on('gameEnded', () => {
        io.to(socket.room).emit('gameEnded', { players: rooms[socket.room].players });
    });
});

// Route to create a room
app.post('/api/create-room', (req, res) => {
    let roomCode;
    do {
        roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    } while (rooms[roomCode]);

    rooms[roomCode] = {
        targetWord: null,
        players: {},
        maxPlayers: 3,
        createdAt: Date.now(),
        timeout: setTimeout(() => checkRoomExpiry(roomCode), INITIAL_ROOM_TIMEOUT),
        isActive: false
    };

    console.log(`Room ${roomCode} created, will expire in ${INITIAL_ROOM_TIMEOUT/1000/60} minutes if unused.`);
    res.json({ roomCode });
});

// Route to join a room
app.get('/api/join-room', (req, res) => {
    const { roomCode } = req.query;

    if (rooms[roomCode]) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

// Graceful shutdown handling
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.once('SIGUSR2', () => {
    shutdown(() => {
        process.kill(process.pid, 'SIGUSR2');
    });
});

function shutdown(callback) {
    console.log('Received shutdown signal');

    // Notify all connected clients
    io.emit('serverShutdown', { message: 'Server is shutting down' });

    // Clean up all rooms
    Object.keys(rooms).forEach(roomId => {
        cleanupRoom(roomId);
    });

    // Add a timeout to force shutdown if cleanup takes too long
    const shutdownTimeout = setTimeout(() => {
        console.log('Forcing shutdown after timeout');
        process.exit(1);
    }, 5000); // 5 seconds timeout

    // Close all socket connections
    io.close((err) => {
        clearTimeout(shutdownTimeout); // Clear the timeout once cleanup is done
        if (err) {
            console.error('Error closing socket connections', err);
        } else {
            console.log('All socket connections closed');
            if (callback) callback(); // Call the provided callback if any
        }
    });
}


server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});