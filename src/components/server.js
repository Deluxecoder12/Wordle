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

const RATE_LIMIT = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests, please try again later',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false // Disable the `X-RateLimit-*` headers
};

const API_LIMITS = {
    dailyLimit: 1000, // Maximum API calls per day
    hourlyLimit: 100, // Maximum API calls per hour
    minuteLimit: 20   // Maximum API calls per minute
};

// Create a simple in-memory store for tracking API usage
const apiUsageStore = {
    daily: new Map(),
    hourly: new Map(),
    minute: new Map(),
    
    // Reset all counters
    resetCounters() {
        this.daily = new Map();
        this.hourly = new Map();
        this.minute = new Map();
    },
    
    // Get current timestamp for different intervals
    getTimeKey(interval) {
        const now = new Date();
        switch(interval) {
            case 'daily':
                return now.toISOString().split('T')[0];
            case 'hourly':
                return `${now.toISOString().split(':')[0]}:00`;
            case 'minute':
                return `${now.toISOString().split(':')[0]}:${now.getMinutes()}`;
            default:
                return now.toISOString();
        }
    },
    
    // Check if limit is exceeded
    isLimitExceeded(ip) {
        const dailyKey = this.getTimeKey('daily');
        const hourlyKey = this.getTimeKey('hourly');
        const minuteKey = this.getTimeKey('minute');
        
        const dailyCount = (this.daily.get(`${ip}-${dailyKey}`) || 0);
        const hourlyCount = (this.hourly.get(`${ip}-${hourlyKey}`) || 0);
        const minuteCount = (this.minute.get(`${ip}-${minuteKey}`) || 0);
        
        return dailyCount >= API_LIMITS.dailyLimit ||
               hourlyCount >= API_LIMITS.hourlyLimit ||
               minuteCount >= API_LIMITS.minuteLimit;
    },
    
    // Increment counters for an IP
    incrementCounters(ip) {
        const dailyKey = this.getTimeKey('daily');
        const hourlyKey = this.getTimeKey('hourly');
        const minuteKey = this.getTimeKey('minute');
        
        this.daily.set(`${ip}-${dailyKey}`, (this.daily.get(`${ip}-${dailyKey}`) || 0) + 1);
        this.hourly.set(`${ip}-${hourlyKey}`, (this.hourly.get(`${ip}-${hourlyKey}`) || 0) + 1);
        this.minute.set(`${ip}-${minuteKey}`, (this.minute.get(`${ip}-${minuteKey}`) || 0) + 1);
    }
};

import rateLimit from 'express-rate-limit';
import geoip from 'geoip-lite';
const { lookup } = geoip;

// Create rate limiter middleware
const limiter = rateLimit(RATE_LIMIT);

// Apply rate limiter to all routes
app.use(limiter);

// API Usage tracking middleware
const trackApiUsage = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    
    // Check if IP is already blocked
    if (apiUsageStore.isLimitExceeded(ip)) {
        console.warn(`Rate limit exceeded for IP: ${ip}`);
        return res.status(429).json({
            error: 'Rate limit exceeded. Please try again later.',
            retryAfter: '15 minutes'
        });
    }
    
    // Increment counters
    apiUsageStore.incrementCounters(ip);
    
    // Log API usage
    console.log(`API call from IP: ${ip}, Daily: ${apiUsageStore.daily.get(`${ip}-${apiUsageStore.getTimeKey('daily')}`)} calls`);
    
    next();
};

// Apply tracking middleware to API routes
app.use('/api/*', trackApiUsage);

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

class ApiRateLimiter {
    constructor() {
        this.requests = new Map();
        this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
    }

    getKey(ip, window) {
        const now = new Date();
        switch(window) {
            case 'minute':
                return `${ip}-${now.toISOString().slice(0, 16)}`;
            case 'hour':
                return `${ip}-${now.toISOString().slice(0, 13)}`;
            case 'day':
                return `${ip}-${now.toISOString().slice(0, 10)}`;
            default:
                return `${ip}-${now.toISOString()}`;
        }
    }

    isLimitExceeded(ip) {
        const minuteKey = this.getKey(ip, 'minute');
        const hourKey = this.getKey(ip, 'hour');
        const dayKey = this.getKey(ip, 'day');

        const minuteCount = this.requests.get(minuteKey) || 0;
        const hourCount = this.requests.get(hourKey) || 0;
        const dayCount = this.requests.get(dayKey) || 0;

        return minuteCount >= 20 || hourCount >= 100 || dayCount >= 1000;
    }

    increment(ip) {
        const keys = ['minute', 'hour', 'day'].map(window => this.getKey(ip, window));
        keys.forEach(key => {
            this.requests.set(key, (this.requests.get(key) || 0) + 1);
        });
    }

    cleanup() {
        const now = new Date();
        for (const [key] of this.requests) {
            const [ip, timestamp] = key.split('-');
            if (new Date(timestamp) < new Date(now - 24 * 60 * 60 * 1000)) {
                this.requests.delete(key);
            }
        }
    }

    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

// Create rate limiter instance
const apiLimiter = new ApiRateLimiter();

const rateLimitMiddleware = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    
    if (apiLimiter.isLimitExceeded(ip)) {
        console.warn(`Rate limit exceeded for IP: ${ip}`);
        return res.status(429).json({
            error: 'Rate limit exceeded. Please try again later.',
            retryAfter: '15 minutes'
        });
    }

    apiLimiter.increment(ip);
    next();
};

// Apply the limiter middleware to all API routes
app.use('/api/*', rateLimitMiddleware);

app.get('/api/validate-word', async (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    const { word } = req.query; // Get the word from the query string

    try {
        const response = await fetch(`https://wordsapiv1.p.rapidapi.com/words/${word}`, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': process.env.API_KEY,
                'X-RapidAPI-Host': 'wordsapiv1.p.rapidapi.com'
            }
        });

        if (!word || typeof word !== 'string' || word.length !== 5) {
            return res.status(400).json({ error: 'Invalid word format' });
        }

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

setInterval(() => {
    const now = new Date();
    
    // Clean up expired entries from all stores
    ['daily', 'hourly', 'minute'].forEach(interval => {
        const store = apiUsageStore[interval];
        const currentKey = apiUsageStore.getTimeKey(interval);
        
        for (const [key] of store) {
            if (!key.includes(currentKey)) {
                store.delete(key);
            }
        }
    });
}, 60 * 1000); 

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

        if (room.gameInProgress) {
            socket.emit('error', { message: 'Cannot join room - game in progress' });
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
                score: 0,
                isAdmin: Object.keys(room.players).length === 0,
                isReady: false
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

    socket.on('kickPlayer', ({ roomId, playerId }) => {
        const room = rooms[roomId];
        if (!room) return;
    
        // Verify request is from admin
        const isAdmin = room.players[socket.id]?.isAdmin;
        if (!isAdmin) return;
    
        const playerToKick = room.players[playerId];
        if (playerToKick) {
            // Remove player from room
            delete room.players[playerId];

            // Notify player they're being kicked
            io.to(playerId).emit('forceKick');
            
            // Update other players
            io.to(roomId).emit('gameState', {
                players: room.players,
                remainingTime: room.isActive ? 
                    ACTIVE_ROOM_TIMEOUT - (Date.now() - room.createdAt) :
                    INITIAL_ROOM_TIMEOUT - (Date.now() - room.createdAt),
                gameInProgress: room.gameInProgress
            });
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

    socket.on('playerReady', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || !room.players[socket.id]) return;
     
        room.players[socket.id].isReady = true;
     
        const adminPlayer = Object.entries(room.players)
            .find(([, player]) => player.isAdmin);
        
        const nonAdminPlayers = Object.values(room.players)
            .filter(player => !player.isAdmin);
        const allPlayersReady = nonAdminPlayers.length > 0 && 
            nonAdminPlayers.every(player => player.isReady);
     
        console.log('Ready status check:', {
            nonAdminPlayers: nonAdminPlayers.length,
            allReady: allPlayersReady
        });
     
        // Broadcast updated game state
        io.to(roomId).emit('gameState', { 
            players: room.players,
            remainingTime: room.isActive ? 
                ACTIVE_ROOM_TIMEOUT - (Date.now() - room.createdAt) :
                INITIAL_ROOM_TIMEOUT - (Date.now() - room.createdAt),
            gameInProgress: room.gameInProgress,
            allPlayersReady: allPlayersReady
        });
     });

    socket.on('getTimeRemaining', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            socket.emit('updateTime', {
                remainingTime: room.expiryTime - Date.now()
            });
        }
    });
     
    socket.on('startGame', async (roomId) => {
        console.log(`Attempting to start game in room ${roomId}`);
        const room = rooms[roomId];
        if (!room) {
            console.log('Room not found');
            socket.emit('error', { message: 'Room not found' });
            return;
        }
     
        const isCreator = Object.keys(room.players)[0] === socket.id;
        if (!isCreator) {
            socket.emit('error', { message: 'Only room creator can start the game' });
            return;
        }
     
        try {
            room.wordSequence = [];
            for(let i = 0; i < 30; i++) {
                const response = await fetch(`http://localhost:${process.env.PORT || 3001}/api/word`);
                const data = await response.json();
                room.wordSequence.push(data.word.toUpperCase());
            }
            // Reset scores while preserving admin status and username
            for (let playerId in room.players) {
                const isAdmin = room.players[playerId].isAdmin;
                room.players[playerId] = {
                    username: room.players[playerId].username,
                    isAdmin: isAdmin,
                    isReady: false,
                    currentWordIndex: 0,
                    correctGuesses: 0,
                    totalAttempts: 0,
                    currentAttempts: 0
                };
            }
    
            // Set up game state with timer
            room.gameStartTime = Date.now();
            room.gameExpiryTime = Date.now() + (5 * 60 * 1000);
            room.gameInProgress = true;
    
            // Get new word
            const response = await fetch(`http://localhost:${process.env.PORT || 3001}/api/word`);
            if (!response.ok) throw new Error('Failed to fetch word');
            
            const data = await response.json();
            room.currentWord = data.word.toUpperCase();
    
            // Start game timer
            room.gameTimer = setInterval(() => {
                const timeLeft = room.gameExpiryTime - Date.now();
                
                if (timeLeft <= 0) {
                    clearInterval(room.gameTimer);
                    room.gameInProgress = false;
                    io.to(roomId).emit('gameEnded', { players: room.players });
                } else {
                    io.to(roomId).emit('updateGameTime', { timeLeft });
                }
            }, 1000);
    
            console.log(`Game started in room ${roomId} with word: ${room.currentWord}`);
    
            io.to(roomId).emit('gameStarted', {
                word: room.wordSequence[0],
                timeLimit: 5 * 60 * 1000,
                players: room.players
            });
    
        } catch (error) {
            console.error('Error starting game:', error);
            socket.emit('error', { message: 'Failed to start game. Please try again.' });
        }
    });

    socket.on('updateGameTime', ({ roomId, timeRemaining }) => {
        const room = rooms[roomId];
        if (room) {
            io.to(roomId).emit('gameTimeSync', { timeRemaining });
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
            // if (data.isValid || guessedWord.toLowerCase() === room.currentWord.toLowerCase()) {
            //     player.totalAttempts++;
                
            //     // Update all players about the attempt
            //     io.to(roomId).emit('updateScores', {
            //         players: room.players
            //     });
            // }
            player.currentAttempts = (player.currentAttempts || 0);

            // Update all players about the attempt
            io.to(roomId).emit('updateScores', {
                players: room.players
            });
    
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

        try {
            const currentWord = room.wordSequence[player.currentWordIndex];

            if (word.toUpperCase() === currentWord) {
                // Correct guess
                if (player.currentAttempts >= 6) {
                    player.totalAttempts = (player.totalAttempts || 0) + 6;
                }
                player.totalAttempts = (player.totalAttempts || 0) + attempts;
                player.correctGuesses++;
                player.currentAttempts = 0;
            
                player.currentWordIndex++;

                // Notify about player's success
                socket.broadcast.to(roomId).emit('playerGuessedWord', {
                    username: player.username,
                    score: player.correctGuesses
                });

                if (player.currentWordIndex < room.wordSequence.length) {
                    // Send next word to this player only
                    socket.emit('newWord', {
                        word: room.wordSequence[player.currentWordIndex]
                    });
                } else {
                    // Player finished all words
                    socket.emit('completedAllWords');
                }

            } else if (player.currentAttempts >= 6) {
                // All attempts used
                socket.emit('allAttemptsUsed', {
                    correctWord: currentWord,
                    nextWord: room.wordSequence[player.currentWordIndex + 1]
                });
                player.totalAttempts = (player.totalAttempts || 0) + 6;
                player.currentWordIndex++;
                player.currentAttempts = 0;
            }

            // Update everyone's scores
            io.to(roomId).emit('updateScores', {
                players: room.players,
                gameInProgress: true
            });

        } catch (error) {
            console.error('Error handling guess:', error);
            socket.emit('error', { message: 'Error processing guess' });
        }
    });

    socket.on('maxAttemptsReached', ({ roomId }) => {
        const room = rooms[roomId];
        const player = room.players[socket.id];
        
        if (!room || !player) return;
    
        const currentWord = room.wordSequence[player.currentWordIndex];
        player.currentWordIndex++;
        player.currentAttempts = 0;
        player.totalAttempts = (player.totalAttempts || 0) + 6;
    
        if (player.currentWordIndex < room.wordSequence.length) {
            socket.emit('allAttemptsUsed', {
                correctWord: currentWord,
                nextWord: room.wordSequence[player.currentWordIndex]
            });
        } else {
            socket.emit('completedAllWords');
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

    socket.on('getRoomTime', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            const remainingTime = room.isActive ? 
                ACTIVE_ROOM_TIMEOUT - (Date.now() - room.createdAt) :
                INITIAL_ROOM_TIMEOUT - (Date.now() - room.createdAt);
            
            socket.emit('roomTimeUpdate', { remainingTime });
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
    socket.on('gameEnded', ({ roomId }) => {
        const room = rooms[roomId];
        if (room) {
            room.gameInProgress = false;
            // Clear room's game timer
            if (room.gameTimer) {
                clearTimeout(room.gameTimer);
            }
            // Notify all players in the room
            io.to(roomId).emit('gameEnded', { 
                players: room.players,
                remainingTime: ACTIVE_ROOM_TIMEOUT - (Date.now() - room.createdAt),
                isCreator: Object.keys(room.players)[0] // Send first player's ID (creator)
            });
        }
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
        expiryTime: Date.now() + ACTIVE_ROOM_TIMEOUT,  // Add this
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

process.on('SIGTERM', () => {
    console.log('Cleaning up API limiter...');
    apiLimiter.stop();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Cleaning up API limiter...');
    apiLimiter.stop();
    process.exit(0);
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