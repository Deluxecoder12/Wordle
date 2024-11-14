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
const ROOM_TIMEOUT = 30 * 60 * 1000; // 10 minutes in milliseconds
const EMPTY_ROOM_CLEANUP_INTERVAL = 30 * 1000; // Check for empty rooms every 30 seconds

// Function to check room expiry
function checkRoomExpiry(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const now = Date.now();
    const roomAge = now - room.createdAt;

    if (roomAge >= ROOM_TIMEOUT) {
        // Room expired
        console.log(`Room ${roomId} expired after 10 minutes`);
        // Notify all players in the room
        io.to(roomId).emit('roomExpired');
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
        // Remove room
        delete rooms[roomId];
        console.log(`Room ${roomId} cleaned up`);
    }
}

// Setup room cleanup interval
setInterval(() => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        // Check if room is empty
        if (Object.keys(room.players).length === 0) {
            console.log(`Cleaning up empty room ${roomId}`);
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

        if (Object.keys(room.players).length >= room.maxPlayers) {
            socket.emit('roomFull');
            return;
        }

        // Add player to room
        room.players[socket.id] = {
            username: username,
            score: 0
        };

        socket.join(roomId);
        
        // Emit game state
        io.to(roomId).emit('gameState', {
            players: room.players,
            remainingTime: ROOM_TIMEOUT - (Date.now() - room.createdAt)
        });

        socket.broadcast.to(roomId).emit('playerJoined', { username });
    });

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            // Check if all players are ready to start the game
            if (Object.keys(room.players).length === room.maxPlayers) {
                startGameTimer(roomId);
                io.to(roomId).emit('gameStarted');
            } else {
                // Notify the player that the game hasn't started yet
                socket.emit('notEnoughPlayers');
            }
        }
    });

    // Handle player's word guess
    socket.on('guessWord', async ({ roomId, guessedWord }) => {
        const room = rooms[roomId];
        if (!room) return; // Exit if room doesn't exist

        const targetWord = room.targetWord;

        if (guessedWord === targetWord) {
            // Player guessed correctly
            room.players[socket.id].score += 1; // Increment player's score
            const newWord = await getRandomWord(); // Get new target word
            room.targetWord = newWord; // Update room's target word

            // Broadcast new game state to all players in the room
            io.to(roomId).emit('newWord', {
                newWord,
                players: room.players,
                winner: room.players[socket.id].username
            });
        } else {
            // Notify the player their guess is incorrect
            socket.emit('incorrectGuess', { guessedWord });
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

                // If room is empty, clean it up
                if (Object.keys(room.players).length === 0) {
                    cleanupRoom(roomId);
                } else {
                    // Notify remaining players
                    io.to(roomId).emit('playerLeft', { username });
                    io.to(roomId).emit('gameState', { 
                        players: room.players,
                        remainingTime: ROOM_TIMEOUT - (Date.now() - room.createdAt)
                    });
                }
                break;
            }
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
        maxPlayers: 8,
        createdAt: Date.now(),
        timeout: setTimeout(() => checkRoomExpiry(roomCode), ROOM_TIMEOUT)
    };

    console.log(`Room ${roomCode} created, will expire in 30 minutes`);
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

function shutdown() {
    console.log('Received shutdown signal');
    
    // Notify all connected clients
    io.emit('serverShutdown', { message: 'Server is shutting down' });
    
    // Clean up all rooms
    Object.keys(rooms).forEach(roomId => {
        cleanupRoom(roomId);
    });
    
    // Close all socket connections
    io.close(() => {
        console.log('All socket connections closed');
        process.exit(0);
    });
}


server.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});