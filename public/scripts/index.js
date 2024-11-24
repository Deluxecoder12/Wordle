document.addEventListener('DOMContentLoaded', async function() {
    
    // Initialize game variables
    let attempts = 0;
    const maxAttempts = 6;
    let targetWord;
    let statsIconDisabled = false;

    let currentUsername = null;
    let currentRoomPlayers = new Set();
    let isRoomCreator = false;
    const DAILY_ATTEMPTS_KEY = 'dailyChallengeAttempts';
    const DAILY_STATS_KEY = 'dailyChallengeStats';

    const socketURL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3001' 
    : 'https://wordle-unlimited.onrender.com'; 

    // Initialize socket connection
    const socket = io(socketURL, {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling']
    });

    window.onbeforeunload = (e) => {
        if (currentRoom && gameInProgress) {
            e.preventDefault();
            return "Are you sure you want to leave the game?";
        }
    };
    
    // Handle closing/reloading with socket
    window.addEventListener('beforeunload', () => {
        if (currentRoom && gameInProgress) {
            socket.emit('leaveRoom', {
                roomId: currentRoom,
                username: currentUsername
            });
        }
    });

    const loadDailyChallengeState = () => {
        if (localStorage.getItem('dailyChallengeMode') === 'true') {
            const today = new Date().toISOString().slice(0, 10);
            const attemptsData = JSON.parse(localStorage.getItem(DAILY_ATTEMPTS_KEY)) || {};
            const todayAttempts = attemptsData[today]?.attempts || [];
            
            // Restore previous attempts to the grid
            todayAttempts.forEach((attempt, index) => {
                const row = index + 1;
                // Fill in the letters
                attempt.guess.split('').forEach((letter, col) => {
                    const box = document.getElementById(`box-${row}-${col + 1}`);
                    if (box) {
                        box.value = letter;
                        box.classList.add('glow');
                        box.disabled = true;
                    }
                });
    
                // Apply the colors
                attempt.result.forEach((color, col) => {
                    const box = document.getElementById(`box-${row}-${col + 1}`);
                    if (box) {
                        box.classList.add('flip');
                        setTimeout(() => {
                            box.classList.add(color);
                        }, 150);
                    }
                });
            });
    
            // Set proper attempts count
            attempts = todayAttempts.length;
            
            // Enable the correct row for continued play
            if (attempts < 6 && !attemptsData[today]?.completed) {
                setRowEditable(attempts + 1);
            }
    
            // Check if challenge is already completed
            if (attemptsData[today]?.completed) {
                const stats = JSON.parse(localStorage.getItem(DAILY_STATS_KEY)) || {};
                const message = stats[today]?.success ? 
                    'You\'ve already completed today\'s challenge!' :
                    'You\'ve used all attempts for today. Try again tomorrow!';
                
                setTimeout(() => {
                    showAlert(message);
                    localStorage.removeItem('dailyChallengeMode');
                    location.reload();
                }, 500);
            }
        }
    };    

    const statsModalHTML = `
        <div id="stats-modal" class="modal-card hidden">
            <button id="close-button-stats" class="close-button">×</button>
            <h2>Daily Challenge Statistics</h2>
            <div class="stats-content">
                <div class="stats-summary">
                    <h3>Today's Progress</h3>
                    <div id="today-stats"></div>
                </div>
                <div class="calendar-container">
                    <h3>Challenge History</h3>
                    <div id="calendar-grid"></div>
                </div>
            </div>
        </div>
    `;

    function updateStatsIconState() {
        const statsIcon = document.getElementById('stats-icon');
        if (!statsIcon) return;
        
        if (currentRoom && gameInProgress) {
            statsIcon.style.opacity = '0.5';
            statsIcon.style.cursor = 'not-allowed';
            statsIcon.parentElement.setAttribute('disabled', 'true');
            statsIcon.parentElement.setAttribute('aria-disabled', 'true');
            statsIconDisabled = true;
        } else {
            statsIcon.style.opacity = '1';
            statsIcon.style.cursor = 'pointer';
            statsIcon.parentElement.removeAttribute('disabled');
            statsIcon.parentElement.setAttribute('aria-disabled', 'false');
            statsIconDisabled = false;
        }
    }

    // Add this CSS to your existing styles
    const statsModalStyles = `
        .modal-card {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 500px;
            max-height: 80vh;
            background: #000000;
            border: 1px solid #ccc;
            color: rgb(245, 245, 245);
            padding: 30px;
            padding-top: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            z-index: 1000;
            transition: opacity 0.3s ease-in-out;
            overflow-y: auto;
        }

        .modal-card.hidden {
            opacity: 0;
            pointer-events: none;
        }

        .modal-card.visible {
            opacity: 1;
            pointer-events: auto;
        }

        .close-button {
            position: sticky;
            top: 0;
            left: 100%;
            width: 35px;
            height: 35px;
            font-size: 20px;
            background: transparent;
            color: whitesmoke;
            border: none;
            cursor: pointer;
            outline: none;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1010;
        }

        .close-button:hover {
            background-color: rgba(255, 255, 255, 0.3);
        }

        .close-button:active {
            background-color: rgba(255, 255, 255, 0.5);
        }

        .stats-content {
            margin-top: 20px;
        }

        .stats-summary {
            background: rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
        }

        .calendar-container {
            background: rgba(255, 255, 255, 0.1);
            padding: 15px;
            border-radius: 8px;
        }

        .calendar-grid {
            display: flex;
            flex-direction: column;
            gap: 3px;
            padding: 10px;
        }

        .calendar-week {
            display: flex;
            gap: 3px;
        }

        .calendar-day {
            width: 15px;
            height: 15px;
            border-radius: 2px;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .calendar-day:hover {
            transform: scale(1.2);
            box-shadow: 0 0 5px rgba(255, 255, 255, 0.5);
        }

        .intensity-empty { background-color: rgba(255, 255, 255, 0.1); }
        .intensity-0 { background-color: #ff4444; }
        .intensity-1 { background-color: #00ff00; }
        .intensity-2 { background-color: #00dd00; }
        .intensity-3 { background-color: #00bb00; }
        .intensity-4 { background-color: #009900; }
        .intensity-5 { background-color: #007700; }
        .intensity-6 { background-color: #005500; }
    `;
    
    document.body.insertAdjacentHTML('beforeend', statsModalHTML);

    // Add the styles to document
    const modalStyleSheet = document.createElement('style');
    modalStyleSheet.textContent = statsModalStyles;
    document.head.appendChild(modalStyleSheet);

    document.getElementById('stats-icon').addEventListener('click', (e) => {
        if (statsIconDisabled) {
            e.preventDefault();
            e.stopPropagation();
            showAlert('Stats are disabled in multiplayer mode');
            return false;
        }
        const statsModal = document.getElementById('stats-modal');
        const overlay = document.getElementById('overlay');
        
        // Update today's stats
        const today = new Date().toISOString().slice(0, 10);
        const attemptsData = JSON.parse(localStorage.getItem(DAILY_ATTEMPTS_KEY)) || {};
        const stats = JSON.parse(localStorage.getItem(DAILY_STATS_KEY)) || {};
        
        const todayStatsDiv = document.getElementById('today-stats');
        todayStatsDiv.innerHTML = attemptsData[today] ? `
            <p>Attempts: ${attemptsData[today].attempts.length}/6</p>
            <p>Status: ${attemptsData[today].completed ? 
                (stats[today]?.success ? 'Completed!' : 'Better luck tomorrow!') : 
                'In Progress'}</p>
        ` : 'No attempts yet today';

        // Update calendar grid
        const calendarDiv = document.getElementById('calendar-grid');
        calendarDiv.innerHTML = '';
            
        const weeks = 7;
        const days = 7;
        const currentDate = new Date();
            
        for (let w = 0; w < weeks; w++) {
            const weekDiv = document.createElement('div');
            weekDiv.className = 'calendar-week';

            for (let d = 0; d < days; d++) {
                const date = new Date(currentDate);
                date.setDate(date.getDate() - (((weeks - 1) - w) * 7 + ((days - 1) - d)));
                const dateStr = date.toISOString().slice(0, 10);

                const dayDiv = document.createElement('div');
                dayDiv.className = 'calendar-day';

                const dayStats = stats[dateStr];
                const intensity = dayStats ? 
                    (dayStats.success ? Math.max(1, 7 - dayStats.attempts) : 0) : 
                    'empty';

                dayDiv.classList.add(`intensity-${intensity}`);
                dayDiv.title = `${dateStr}${dayStats ? 
                    `: ${dayStats.success ? 
                        `Solved in ${dayStats.attempts} attempts` : 
                        'Not solved'}` : 
                    ''}`;
                
                weekDiv.appendChild(dayDiv);
            }
            calendarDiv.appendChild(weekDiv);
        }

        // Show modal and overlay
        statsModal.classList.remove('hidden');
        statsModal.classList.add('visible');
        overlay.classList.remove('hidden');

        // Disable keyboard input while modal is open
        const keyboardHandler = (e) => {
            if (e.key === 'Escape') {
                closeStatsModal();
            }
            e.preventDefault();
        };

        document.addEventListener('keydown', keyboardHandler);

        // Close modal function
        function closeStatsModal() {
            statsModal.classList.remove('visible');
            statsModal.classList.add('hidden');
            overlay.classList.add('hidden');
            document.removeEventListener('keydown', keyboardHandler);
        }

        // Close button handler
        document.getElementById('close-button-stats').onclick = closeStatsModal;

        // Close on overlay click
        overlay.onclick = closeStatsModal;
    });



    function createCalendarHeatmap(stats) {
        const weeks = 7;
        const days = 7;
        const today = new Date();
        let heatmapHTML = '<div class="calendar-grid">';
    
        for (let w = 0; w < weeks; w++) {
            heatmapHTML += '<div class="calendar-week">';
            for (let d = 0; d < days; d++) {
                const date = new Date(today);
                date.setDate(date.getDate() - (((weeks - 1) - w) * 7 + ((days - 1) - d)));
                const dateStr = date.toISOString().slice(0, 10);
                
                const dayStats = stats[dateStr];
                const intensity = dayStats ? 
                    (dayStats.success ? Math.max(1, 7 - dayStats.attempts) : 0) : 
                    'empty';
                
                heatmapHTML += `
                    <div class="calendar-day intensity-${intensity}" 
                         title="${dateStr}${dayStats ? 
                             `: ${dayStats.success ? 
                                 `Solved in ${dayStats.attempts} attempts` : 
                                 'Not solved'}` : 
                             ''}">
                    </div>`;
            }
            heatmapHTML += '</div>';
        }
        heatmapHTML += '</div>';
        
        return heatmapHTML;
    }
    
    // Add these styles to your CSS
    const calendarStyles = `
        .calendar-grid {
            display: flex;
            flex-direction: column;
            gap: 3px;
            padding: 10px;
            background: var(--background-color);
        }

        .calendar-week {
            display: flex;
            gap: 3px;
        }

        .calendar-day {
            width: 15px;
            height: 15px;
            border-radius: 2px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            cursor: pointer;
            transition: transform 0.2s;
        }

        .calendar-day:hover {
            transform: scale(1.2);
        }

        .calendar-day.intensity-empty {
            background-color: rgba(255, 255, 255, 0.1);
        }

        .calendar-day.intensity-0 {
            background-color: #ff4444;
        }

        .calendar-day.intensity-1 {
            background-color: #00ff00;
        }

        .calendar-day.intensity-2 {
            background-color: #00dd00;
        }

        .calendar-day.intensity-3 {
            background-color: #00bb00;
        }

        .calendar-day.intensity-4 {
            background-color: #009900;
        }

        .calendar-day.intensity-5 {
            background-color: #007700;
        }

        .calendar-day.intensity-6 {
            background-color: #005500;
        }

        .stats-content {
            max-width: 500px;
            width: 90%;
            padding: 20px;
            color: var(--text-color);
        }

        .stats-summary {
            margin: 20px 0;
            padding: 15px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.1);
        }

        .stats-summary h3 {
            margin-bottom: 10px;
        }

        .calendar-container {
            margin-top: 20px;
        }

        .calendar-container h3 {
            margin-bottom: 15px;
        }
    `;
    
    // Add the styles to the document
    const styleSheet = document.createElement('style');
    styleSheet.textContent = calendarStyles;
    document.head.appendChild(styleSheet);

    // Function to get or generate the daily challenge word
    const getDailyChallengeWord = async () => {
        const savedWordData = JSON.parse(localStorage.getItem('dailyChallenge'));
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format

        // Initialize or get today's attempts
        let attemptsData = JSON.parse(localStorage.getItem(DAILY_ATTEMPTS_KEY)) || {};
        if (!attemptsData[today]) {
            attemptsData[today] = {
                attempts: [],
                completed: false
            };
            localStorage.setItem(DAILY_ATTEMPTS_KEY, JSON.stringify(attemptsData));
        }

        // Check if the stored word is for today
        if (savedWordData && savedWordData.date === today) {
            return savedWordData.word; // Return today's word
        } else {
            // Generate a new word for the day
            const newWord = await getRandomWord();

            // Save the new word and today's date in localStorage
            localStorage.setItem('dailyChallenge', JSON.stringify({
                word: newWord,
                date: today
            }));

            return newWord;
        }
    };

    const dailyChallengeMode = localStorage.getItem('dailyChallengeMode');
    
    if (dailyChallengeMode === 'true') {
        const dailyWord = await getDailyChallengeWord();
        targetWord = dailyWord;
    } else {
        // Regular mode, choose a word as normal
        targetWord = await getRandomWord();
    }

    function isDailyChallengeAvailable() {
        const today = new Date().toISOString().slice(0, 10);
        const attemptsData = JSON.parse(localStorage.getItem(DAILY_ATTEMPTS_KEY)) || {};
        const todayData = attemptsData[today];
    
        return !todayData || (!todayData.completed && todayData.attempts.length < 6);
    }
    
    // For alerts
    let isAlertActive = false;

    // For virtual keyboard's focus
    let lastFocusedInput = null;

    // For Hard Mode
    let hardModeEnabled = false;
    let gameStarted = false;
    let correctPositions = {};
    let requiredLetters = {};

    // For Sound
    let soundEffectsEnabled = true;
    const keyboardSound = document.getElementById('keyboard-sound');

    // Accessible Fonts
    function changeFontSize(action) {
        const currentSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-size'));
        let newSize = currentSize;

        if (action === 'increase') {
            newSize += 2; // Increase by 2px
        } else if (action === 'decrease') {
            newSize -= 2; // Decrease by 2px
        }

        // Set minimum and maximum font size limits if needed
        if (newSize < 12) newSize = 12;
        if (newSize > 36) newSize = 36;

        // Apply the new font size
        document.documentElement.style.setProperty('--font-size', `${newSize}px`);

        // Optionally save the preference in local storage
        localStorage.setItem('font-size', `${newSize}px`);
    }

    // Load the saved font size from local storage (if any) on page load
    const savedFontSize = localStorage.getItem('font-size');
    if (savedFontSize) {
        document.documentElement.style.setProperty('--font-size', savedFontSize);
    }

    // Attach event listeners to buttons
    document.getElementById('increase-font').addEventListener('click', () => changeFontSize('increase'));
    document.getElementById('decrease-font').addEventListener('click', () => changeFontSize('decrease'));
    

    // Function to show the custom alert
    function showAlert(message) {
        isAlertActive = true; // Alert is now active

        const alertContainer = document.createElement('div');
        alertContainer.classList.add('alert-container');
        alertContainer.innerHTML = `
            <p>${message}</p>
            <button id="alert-close-button">Close</button>
        `;
        document.body.appendChild(alertContainer);
    
        // Add event listener to close alert with Enter key
        function handleEnter(event) {
            if (event.key === 'Enter') {
                closeAlert();
            }
        }
    
        // Add event listener to the document for Enter key
        document.addEventListener('keydown', handleEnter);
    
        // Add event listener to the close button
        const closeButton = document.getElementById('alert-close-button');
        closeButton.addEventListener('click', closeAlert);
    
        // Remove event listener when alert closes
        function closeAlert() {
            alertContainer.remove();
            document.removeEventListener('keydown', handleEnter);
            isAlertActive = false;
        }
    
        // Automatically close the alert after 10 seconds
        setTimeout(closeAlert, 10000);
    }

    // Color for fireworks
    function getRandomColor() {
        const letters = '0123456789ABCDEF';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    // Function to get a random 5-letter word: API and Backup
    async function getRandomWord() {
        try {
            const response = await fetch('/api/word');
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();
            return data.word.toUpperCase();
        } catch (error) {
            console.error('Error fetching word:', error);
            const words = [
                'APPLE', 'CRANE', 'GRAPE', 'LEMON', 'MANGO',
                'ABODE', 'ADORE', 'AGILE', 'ALONE', 'ANGRY',
                'BAKER', 'BEACH', 'BIRTH', 'BLINK', 'BLUSH',
                'CARGO', 'CAREF', 'CHALK', 'CHEER', 'CHILL',
                'DAISY', 'DANDY', 'DEBUT', 'DELAY', 'DELTA',
                'EARTH', 'EMPTY', 'EVENT', 'EXTRA', 'FAIRY',
                'GAMER', 'GHOST', 'GREEN', 'GROWL', 'GUILT',
                'HAPPY', 'HAUNT', 'HEAVY', 'HELLO', 'HELPS',
                'IGLOO', 'IMAGE', 'INDEX', 'INLET', 'IRONY',
                'JACKET', 'JOKER', 'JUDGE', 'JUMBO', 'JUNIOR',
                'KETCH', 'KNACK', 'KNOCK', 'KNOWS', 'KYRIE',
                'LABEL', 'LADLE', 'LAUGH', 'LEARN', 'LEMON',
                'MAGIC', 'MAKER', 'MALLET', 'MARCH', 'MATES',
                'NASTY', 'NIGHT', 'NOISE', 'NORTH', 'NURSE',
                'OCEAN', 'OFFER', 'ORDER', 'OVERT', 'OWNER',
                'PANEL', 'PARTY', 'PEACE', 'PHONE', 'PHOTO',
                'QUIET', 'QUEEN', 'QUEST', 'QUICK', 'QUIZ',
                'RADIO', 'RAISE', 'RANGE', 'REACH', 'READY',
                'SAILS', 'SAUNA', 'SCALE', 'SCARE', 'SCOPE',
                'TABLE', 'TASTE', 'TEACH', 'TEETH', 'TEMPO',
                'UNCLE', 'UNDER', 'UNITE', 'UNZIP', 'UPHILL',
                'VAGUE', 'VALET', 'VALUE', 'VAPOR', 'VEGAN',
                'WAGER', 'WAIST', 'WALKER', 'WATCH', 'WATER',
                'XEROX', 'XYLON', 'YEARN', 'YELLOW', 'YOUNG',
                'ZESTY', 'ZIGZAG', 'ZIPPER', 'ZOMBIE', 'ZONE'
              ];
            const randomIndex = Math.floor(Math.random() * words.length);
            return words[randomIndex]; // Fallback word
        }
    }
      
    // Function to check user's input
    async function isValidWord(word) {
        const response = await fetch(`/api/validate-word?word=${word}`, {
            method: 'GET',
        });
    
        if (response.ok) {
            const data = await response.json();
            return data.isValid;
        } else {
            throw new Error('Error validating word');
        }
    }
    
    // Function to check user guesses
    async function checkGuess(guess, targetWord) {
        try {
            // Check if the user's guess is valid using the API
            const isValid = await isValidWord(guess);
             
            // Invalid case: check if it matches the fetched target word. (This API is not the best, but it's free!)
            if (!isValid && guess !== targetWord) {
                showAlert('Invalid word!');
                return;
            }
        } catch (error) { 
            showAlert('Error validating word. Please try again.');
            return;
        }

        // Check hard mode rules if enabled
        if (hardModeEnabled) {
            if (!validateHardModeGuess(guess)) {
                showAlert('Guess does not meet hard mode requirements!');
                return;
            }
        }

        const result = Array(5).fill('red'); // Default background color
        const targetLetterCount = {}; // Track letter frequencies in the target word
        gameStarted = true;

        // Count occurrences of each letter in the target word
        for (let letter of targetWord) {
            targetLetterCount[letter] = (targetLetterCount[letter] || 0) + 1;
        }

        // First pass: Check for correct placements (green)
        for (let i = 0; i < 5; i++) {
            if (guess[i] === targetWord[i]) {
                result[i] = 'green';
                targetLetterCount[guess[i]]--; // Reduce the count for correctly placed letters
            }
        }

        // Second pass: Check for incorrect placements (yellow)
        for (let i = 0; i < 5; i++) {
            if (result[i] === 'red' && targetLetterCount[guess[i]] > 0) {
                result[i] = 'yellow';
                targetLetterCount[guess[i]]--; // Reduce the count for incorrectly placed letters
            }
        }

        // If in daily challenge mode, save the attempt
        if (localStorage.getItem('dailyChallengeMode') === 'true') {
            const today = new Date().toISOString().slice(0, 10);
            const attemptsData = JSON.parse(localStorage.getItem(DAILY_ATTEMPTS_KEY)) || {};

            if (!attemptsData[today]) {
                attemptsData[today] = {
                    attempts: [],
                    completed: false
                };
            }

            // Save the attempt
            attemptsData[today].attempts.push({
                guess,
                result,
                timestamp: new Date().toISOString()
            });

            // Check if word is guessed correctly or max attempts reached
            if (guess === targetWord || attemptsData[today].attempts.length >= 6) {
                attemptsData[today].completed = true;

                // Save stats
                const stats = JSON.parse(localStorage.getItem(DAILY_STATS_KEY)) || {};
                stats[today] = {
                    success: guess === targetWord,
                    attempts: attemptsData[today].attempts.length,
                    date: today
                };
                localStorage.setItem(DAILY_STATS_KEY, JSON.stringify(stats));
                localStorage.setItem(DAILY_ATTEMPTS_KEY, JSON.stringify(attemptsData));

                setTimeout(() => {
                    showAlert(guess === targetWord ? 
                        'Congratulations! Come back tomorrow for a new challenge!' :
                        `The word was ${targetWord}. Try again tomorrow!`);
                    localStorage.removeItem('dailyChallengeMode');
                    setTimeout(() => location.reload(), 2000);
                }, 500);
            } else {
                localStorage.setItem(DAILY_ATTEMPTS_KEY, JSON.stringify(attemptsData));
            }
        }

        if (currentRoom) {
            socket.emit('guessWord', {
                roomId: currentRoom,
                guessedWord: guess
            });
        }

        return result;
    }

    loadDailyChallengeState();

    // Function to update hard mode state based on the user's guess
    const updateHardModeState = async (guess, targetWord) => {
        // First, validate the guess
        const isValid = await validateHardModeGuess(guess);
        if (!isValid) {
            return false; // Don't update state if the guess is invalid
        }
       
        guess.split('').forEach((letter, index) => {
            if (targetWord[index] === letter) {
                correctPositions[index] = letter; // Letter in correct position
            } else if (targetWord.includes(letter)) {
                requiredLetters[letter] = true; // Letter exists but in incorrect position
            }
        });

        return true; 
    };

    // Function to validate a guess in hard mode
    const validateHardModeGuess = async (guess) => {
        // Check correct positions
        for (const [index, letter] of Object.entries(correctPositions)) {
            if (guess[index] !== letter) {
                showAlert(`Hard Mode!! Index ${Number(index) + 1} must be letter ${letter}!`);
                return false; // Letter in correct position doesn't match
            }
        }

        // Check required letters
        for (const letter in requiredLetters) {
            if (!guess.includes(letter)) {
                showAlert(`Hard Mode!! Guess does not include required letter: ${letter}!`);
                return false; // Required letter is missing
            }
        }

        return true;
    };

    // Function to enable only the current row and disable others
    function setRowEditable(rowId) {
        const allRows = document.querySelectorAll('.guess-row');
        allRows.forEach((row, index) => {
            const isCurrentRow = index + 1 === rowId;
            const rowInputs = row.querySelectorAll('.guess-box');
            rowInputs.forEach(input => {
                input.disabled = !isCurrentRow; // Enable only the current row
                if (isCurrentRow) {
                    input.classList.remove('no-caret'); // Ensure caret is visible in the current row
                } else {
                    input.classList.add('no-caret'); // Hide caret in other rows
                }
            });
        });
    }

    // Function to move focus to the next input box
    function moveFocus(event) {
        const currentInput = event.target;
        const rowId = currentInput.id.split('-')[1]; // Get the row number from the id
        const columnId = parseInt(currentInput.id.split('-')[2]); // Get the column number from the id

        if (currentInput.value.length === 1 && /^[A-Za-z]$/.test(currentInput.value)) {
            const nextInput = document.getElementById(`box-${rowId}-${columnId + 1}`);
            if (nextInput) {
                nextInput.focus();
            }
        } else if (currentInput.value.length === 0) {
            const previousInput = document.getElementById(`box-${rowId}-${columnId - 1}`);
            if (previousInput) {
                previousInput.focus();
            }
        }

        // Manage the glow effect based on input length
        if (currentInput.value.length > 0) {
            currentInput.classList.add('glow');
        } else {
            currentInput.classList.remove('glow');
        }
    }

    // Function to check if all inputs in the row are filled
    function isRowFilled(rowId) {
        for (let col = 1; col <= 5; col++) {
            const input = document.getElementById(`box-${rowId}-${col}`);
            if (!input || input.value.length === 0) {
                return false;
            }
        }
        return true;
    }

    // Function to create Celebratory Fireworks
    function createFirework() {
        const fireworkContainer = document.createElement('div');
        fireworkContainer.classList.add('firework-container');
        document.body.appendChild(fireworkContainer);
    
        for (let i = 0; i < 40; i++) {
            const firework = document.createElement('div');
            firework.classList.add('firework');
    
            // Position each firework randomly within the container
            firework.style.top = `${Math.random() * 100}%`;
            firework.style.left = `${Math.random() * 100}%`;

            firework.style.background = getRandomColor();
            fireworkContainer.appendChild(firework);
        }
    
        // Remove the firework effect after animation ends
        setTimeout(() => {
            document.body.removeChild(fireworkContainer);
        }, 2400);
    }
    
    // Function to handle Enter key press
    async function handleEnter(event) {
        // Only for Standard Events
        const isStandardEvent = event && typeof event.preventDefault === 'function';
        const key = isStandardEvent ? event.key : 'Enter';

        if (key === 'Enter') {
            if(soundEffectsEnabled) playKeyboardSound();
            else keyboardSound.pause();
            
            if (isAlertActive) {
                // If the alert is active, don't handle Enter key events
                return;
            }

            // Prevent default behavior only if event.preventDefault is available
            if (isStandardEvent) {
                event.preventDefault();
            }

            const currentInput = event.target;
            const rowId = parseInt(currentInput.id.split('-')[1]); // Get the row number from the id

            // Check if the row is fully filled
            if (isRowFilled(rowId)) {
                const guess = Array.from({ length: 5 }, (_, i) => document.getElementById(`box-${rowId}-${i + 1}`).value).join('').toUpperCase();
                
                // For multiplayer, check if game is in progress
                if (currentRoom && gameInProgress) {
                    // Emit guess to server
                    socket.emit('guessWord', {
                        roomId: currentRoom,
                        guess: guess
                    });
                }
                
                // Check the guess against the target word
                const result = await checkGuess(guess, targetWord);
                
                if (!result) {
                    return; // If checkGuess returned undefined, stop further execution
                }

                // Validate the guess against hard mode rules
                if (hardModeEnabled) {
                    const stateUpdated = await updateHardModeState(guess, targetWord);
                    if (!stateUpdated) {
                        return; // Exit if the state was not updated
                    }
                }

                // Apply flip animation to each guess box
                for (let i = 0; i < 5; i++) {
                    const inputBox = document.getElementById(`box-${rowId}-${i + 1}`);
                    inputBox.classList.add('flip');

                    // Delay applying the color until after the flip starts
                    setTimeout(() => {
                        inputBox.classList.add(result[i]); // Add new color class based on the result
                    }, 150);
                }

                // Disable editing and hide text cursor
                const rowInputs = document.querySelectorAll(`.guess-row:nth-of-type(${rowId}) .guess-box`);
                rowInputs.forEach(input => {
                    input.disabled = true;
                    input.classList.add('no-caret'); // Add class to hide caret
                });

                // Check if the guess is correct
                if (guess === targetWord) {
                    setTimeout(() => {
                        // Trigger the firework effect
                        createFirework();

                        if (currentRoom && gameInProgress) {
                            // In multiplayer, wait for server to handle the correct guess
                            socket.emit('wordGuessed', {
                                roomId: currentRoom,
                                word: guess,
                                attempts: rowId
                            });
                            showAlert(`<span class="bold-text">Correct!</span> Waiting for next word...`);
                        } else {
                            // In single player, handle as before
                            showAlert(`<span class="bold-text">Congratulations!</span> You've guessed the word: ${targetWord}`);
                            setTimeout(() => window.location.reload(), 3000); // Reload the page after alert
                        } 
                    }, 550);
                    return;
                }

                // Move focus to the next row if there are more attempts left
                attempts++;
                if (attempts >= maxAttempts) {
                    if (currentRoom && gameInProgress) {
                        socket.emit('maxAttemptsReached', { roomId: currentRoom });
                        showAlert(`<span class="bold-text">Word not guessed!</span> The word was: ${targetWord}. Waiting for next word...`);
                    } else {
                        showAlert(`<span class="bold-text">Game Over!</span> The word was: ${targetWord}`);
                        setTimeout(() => window.location.reload(), 1500);
                    }
                } else {
                    setRowEditable(rowId + 1); // Enable the next row and disable previous rows
                    const nextRow = document.querySelector(`#box-${rowId + 1}-1`);
                    if (nextRow) {
                        nextRow.focus();
                    }
                }  
            }
        }
    }

    // Convert input to uppercase
    function toUpperCase(event) {
        event.target.value = event.target.value.toUpperCase();
    }

    // Function to filter input to only allow alphabets
    function filterInput(event) {
        const input = event.target;
        const value = input.value;
        if (/[^A-Za-z]/.test(value)) { // If input contains non-alphabetic characters
            input.value = value.replace(/[^A-Za-z]/g, ''); // Replace with empty string
        }
    }

    socket.on('completedAllWords', () => {
        showAlert('You have completed all words in this game!');
    });
    
    socket.on('allAttemptsUsed', ({ correctWord, nextWord }) => {
        showAlert(`The word was: ${correctWord}`);
        setTimeout(() => {
            resetGrid();
            targetWord = nextWord;
            attempts = 0;
            setRowEditable(1);
        }, 2000);
    });

    // Function to handle Backspace key press
    function handleBackspace(event) {
        if (event.key === 'Backspace') {
            if(soundEffectsEnabled) playKeyboardSound();
            else keyboardSound.pause();
            const currentInput = event.target;
            const rowId = currentInput.id.split('-')[1]; // Get the row number from the id
            const columnId = parseInt(currentInput.id.split('-')[2]); // Get the column number from the id

            if (currentInput.value.length === 0) {
                const previousInput = document.getElementById(`box-${rowId}-${columnId - 1}`);
                if (previousInput) {
                    event.preventDefault(); // Prevent the default Backspace behavior
                    previousInput.focus();
                }
            } else {
                // Delete the character and stay in the same box
                currentInput.value = currentInput.value.slice(0, -1);  
                if (currentInput.value.length === 0) {
                    currentInput.classList.remove('glow');
                } else {
                    currentInput.classList.add('glow');
                }
            }
        }
    }

    function handleKeyPress(key) {
        if (!gameInProgress && currentRoom) return;
        // Use the last focused input box instead of document.activeElement
        const activeInput = lastFocusedInput;
    
        if (!activeInput || !activeInput.classList.contains('guess-box')) {
            return; // If no active input box, return
        }
    
        const rowId = activeInput.id.split('-')[1];
        const columnId = parseInt(activeInput.id.split('-')[2]);
    
        if (key === 'Backspace') {
            if (activeInput.value.length > 0) {
                activeInput.value = activeInput.value.slice(0, -1); // Remove the last character
                activeInput.classList.remove('glow'); // Remove glow effect
            } else {
                // Move focus to the previous input in the same row
                if (columnId > 1) {
                    const previousInput = document.getElementById(`box-${rowId}-${columnId - 1}`);
                    if (previousInput) {
                        previousInput.focus(); // Move focus to the previous input
                        previousInput.value = ''; // Clear previous input value
                        previousInput.classList.remove('glow'); // Remove glow effect
                    }
                } else {
                    // If it's the first column, keep the focus here
                    activeInput.focus();
                }
            }
        } else if (key === 'Enter') {
            handleEnter({ key: 'Enter', target: activeInput }); // Handle Enter key press
        } else if (/^[A-Z]$/.test(key)) {
            if (activeInput.value.length === 0) { // Only set the value if the input is empty
                activeInput.value = key; // Set the value of the active input
                activeInput.classList.add('glow'); // Add glow effect

                 // Trigger the enlarge animation
                activeInput.classList.add('enlarge');
                setTimeout(() => {
                    activeInput.classList.remove('enlarge');
                }, 200);
                
                // Move focus to the next input in the same row
                const nextInput = document.getElementById(`box-${rowId}-${columnId + 1}`);
                if (nextInput) {
                    nextInput.focus(); // Move focus to the next input
                    lastFocusedInput = nextInput; // Update the last focused input
                } else {
                    // If no next input in the current row, keep focus on the last input in the row
                    activeInput.focus();
                    lastFocusedInput = activeInput; // Ensure last box in the row is focused
                }
            }
        }
    }

    function handleVirtualKeyClick(event) {
        let key;
        if (event.target.id === 'backspace') {
            key = 'Backspace';
        } else if (event.target.id === 'enter') {
            key = 'Enter';
        } else {
            key = event.target.dataset.key;
        }
        if (key) {
            handleKeyPress(key);
        }
    }

    document.querySelectorAll('.key').forEach(key => {
        key.addEventListener('click', handleVirtualKeyClick);
    });


    // Event listeners in all guess boxes
    const guessBoxes = document.querySelectorAll('.guess-box');
    guessBoxes.forEach(box => {
        box.addEventListener('input', filterInput); // Filter input to allow only alphabets
        box.addEventListener('input', (event) => {
            // To trigger the animation
            event.target.classList.add('enlarge');
    
            // Remove the class after the animation completes so it can be triggered again
            setTimeout(() => {
                event.target.classList.remove('enlarge');
            }, 200); 
        });

        box.addEventListener('focus', () => {
            lastFocusedInput = box;
        });

        box.addEventListener('input', moveFocus);
        box.addEventListener('input', toUpperCase); // Convert input to uppercase
        
        box.addEventListener('keydown', handleEnter);
        box.addEventListener('keydown', handleBackspace); // Handle Backspace key
        
    });

    // -----------------NAV-BAR-ICON-FUNCTIONALITY-----------------------------
    const instructionCard = document.getElementById('instruction-card');
    const settingsCard = document.getElementById('settings-card');
    const overlay = document.getElementById('overlay');
    const closeButtonInstruction = document.getElementById('close-button');
    const closeButtonSettings = document.getElementById('close-button-settings');
    const settingsLink = document.getElementById('settings-link');

    function toggleCardVisibility(element) {
        // For instruction and settings cards
        if (element.id !== 'multiplayer-modal') {
            if (element.classList.contains('hidden')) {
                element.classList.remove('hidden');
                element.classList.add('visible');
                overlay.classList.remove('hidden');
            } else {
                element.classList.remove('visible');
                element.classList.add('hidden');
                overlay.classList.add('hidden');
            }
        }
        // Special handling for multiplayer modal
        else {
            if (element.classList.contains('hidden')) {
                element.classList.remove('hidden');
                element.classList.add('visible');
                if (lobbySection) lobbySection.classList.remove('hidden');
                if (roomInfoSection) roomInfoSection.classList.add('hidden');
                overlay.classList.remove('hidden');
            } else {
                element.classList.remove('visible');
                element.classList.add('hidden');
                overlay.classList.add('hidden');
            }
        }
    }

    // Show the instruction card and overlay when the question mark icon is clicked
    document.querySelector('.Left.question').addEventListener('click', (e) => {
        e.preventDefault();
        toggleCardVisibility(instructionCard);
    });

    // Show the settings card when the settings button is clicked
    settingsLink.addEventListener('click', (e) => {
        e.preventDefault();
        toggleCardVisibility(settingsCard);
    });

    // Hide the instruction card, settings card and overlay when the close button or overlay is clicked
    closeButtonInstruction.addEventListener('click', () => toggleCardVisibility(instructionCard));
    overlay.addEventListener('click', closeAllModals);

    function closeAllModals() {
        // Close instruction card
        if (instructionCard.classList.contains('visible')) {
            toggleCardVisibility(instructionCard);
        }
        // Close settings card
        if (settingsCard.classList.contains('visible')) {
            toggleCardVisibility(settingsCard);
        }
        // Close multiplayer modal
        if (multiplayerModal.classList.contains('visible')) {
            if (currentRoom) {
                showLeaveConfirmation();
                return;
            }
            toggleCardVisibility(multiplayerModal);
        }
    }

    const toggleSlider = (div, checkbox, icons) => {
        if (!icons) {
            console.warn('Icons object is not defined for', div.id);
            return;
        }
        const updateBackground = () => {
            if (div.id === 'theme-option') {
                if (checkbox.checked) {
                    div.style.backgroundImage = `url('${icons.checked}')`;
                    div.style.backgroundColor = '#001f3f';
                    div.style.borderColor = '#a9a9a9';
                    document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                    div.style.backgroundImage = `url('${icons.unchecked}')`;
                    div.style.backgroundColor = 'lightblue';
                    div.style.borderColor = '#fff';
                    document.documentElement.setAttribute('data-theme', 'light');
                }
            } else if(div.id === 'hard-mode-option'){
                if (checkbox.checked) {
                    div.style.backgroundImage = `url('${icons.checked}')`;
                    div.style.borderColor = '#f00';
                } else {
                    div.style.backgroundImage = `url('${icons.unchecked}')`;
                    div.style.borderColor = 'transparent';
                }
            } else if(div.id === 'sound-effects-option'){
                if (checkbox.checked) {
                    div.style.backgroundImage = `url('${icons.checked}')`;
                    div.style.borderColor = '#fff';
                } else {
                    div.style.backgroundImage = `url('${icons.unchecked}')`;
                    div.style.borderColor = 'transparent';
                }
            }   
        };
 
        // Add event listener for the div click
        div.addEventListener('click', (e) => {
            if(div.id === 'hard-mode-option') {
                if(gameStarted) {
                    showAlert("Cannot change settings after the game has started!");
                    return;
                }
            }

            // Only toggle if the click is not on the checkbox itself
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                updateBackground();
                // Dispatch the change event to handle additional logic
                checkbox.dispatchEvent(new Event('change'));
            }
        });
    
        // Ensure the checkbox click works normally and updates the background
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop propagation to prevent triggering the div click event
            if(div.id === 'hard-mode-option') {
                if(gameStarted) {
                    e.preventDefault();
                    showAlert("Cannot change settings after the game has started!");
                    return;
                }
            } 
            updateBackground(); // Allow the checkbox to update the background
        });
    
        updateBackground();
    };
    
    // Function to update the icons based on the current theme
    const updateIcons = () => {
        const theme = document.documentElement.getAttribute('data-theme');
    
        const icons = {
            stats: document.getElementById('stats-icon'),
            question: document.getElementById('question-icon'),
            multiplayer: document.getElementById('multiplayer-icon'),
            settings: document.getElementById('settings-icon'),
        };
    
        if (theme === 'dark') {
            icons.stats.src = '../assets/images/Stats_icon.png';
            icons.question.src = 'assets/images/Question_icon.png';
            icons.multiplayer.src = 'assets/images/Multiplayer_icon.png';
            icons.settings.src = 'assets/images/Settings_icon.png';
        } else {
            icons.stats.src = 'assets/images/Stats_icon-dark-mode.png';
            icons.question.src = 'assets/images/Question_icon-dark-mode.png';
            icons.multiplayer.src = 'assets/images/Multiplayer_icon-dark-mode.png';
            icons.settings.src = 'assets/images/Settings_icon-dark-mode.png';  
        }
    };

    // Function to enable or disable sound effects
    const toggleSoundEffects = (enabled) => {   
        if (enabled) {
            // Enable sound effects
            soundEffectsEnabled = true;
            
            document.addEventListener('keypress', playKeyboardSound);

            document.querySelector('.virtual-keyboard').addEventListener('click', playKeyboardSound);

        } else {
            // Disable sound effects
            soundEffectsEnabled = false;
            
            document.removeEventListener('keypress', playKeyboardSound);

            document.querySelector('.virtual-keyboard').removeEventListener('click', playKeyboardSound);
        }
    };

    const playKeyboardSound = () => {
        if (soundEffectsEnabled) {
            const keyboardSound = document.getElementById('keyboard-sound');
            if (keyboardSound) {
                keyboardSound.currentTime = 0; // Restart the audio
                keyboardSound.play().catch(error => {
                    console.error('Error playing audio:', error);
                });
            }
        }
    };

    // Function to enable or disable hard mode
    const toggleHardMode = (enabled) => {
        if (enabled) {
            hardModeEnabled = true;
            correctPositions = {};
            requiredLetters = {};
        } else {
            hardModeEnabled = false;
        }
    };

    const loadSettings = () => {
        // Load theme
        const savedTheme = localStorage.getItem('data-theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            themeToggle.checked = savedTheme === 'dark';
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            themeToggle.checked = false;
        }

        // Load sound effects setting
        const savedSound = localStorage.getItem('sound-effects-enabled');
        if (savedSound) {
            soundToggle.checked = savedSound === 'true'; // Set checkbox based on saved sound setting
            toggleSoundEffects(soundToggle.checked);
        } else {
            // Default to sound effects enabled
            soundToggle.checked = true;
            toggleSoundEffects(true);
        }

        // Load hard mode setting
        const savedHardMode = localStorage.getItem('hard-mode-enabled');
        if (savedHardMode) {
            hardModeToggle.checked = savedHardMode === 'true'; // Set checkbox based on saved hard mode setting
            toggleHardMode(hardModeToggle.checked);
        } else {
            hardModeToggle.checked = false; // Default to hard mode disabled
            toggleHardMode(false);
        }
    };
    
    const handleThemeChange = (event) => {
        const theme = event.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('data-theme', theme);
        updateIcons(); // Ensure icons update
    };

    // Handle sound effects toggle change
    const handleSoundChange = (event) => {
        const soundEnabled = event.target.checked;
        localStorage.setItem('sound-effects-enabled', soundEnabled);
        toggleSoundEffects(soundEnabled);
    };

    // Handle hard mode toggle change
    const handleHardModeChange = (event) => {
        event.preventDefault();

        const hardModeEnabled = event.target.checked;

        if (!gameStarted) {
            localStorage.setItem('hard-mode-enabled', hardModeEnabled);
            toggleHardMode(hardModeEnabled);
        } else {
            // Prevent hard mode change if the game has already started
            event.target.checked = !hardModeEnabled;
        }
    };

    // Add event listener for the settings toggle
    const themeToggle = document.getElementById('theme-toggle');
    const soundToggle = document.getElementById('sound-effects-toggle');
    const hardModeToggle = document.getElementById('hard-mode-toggle');
    themeToggle.addEventListener('change', handleThemeChange);
    soundToggle.addEventListener('change', handleSoundChange);
    hardModeToggle.addEventListener('change', handleHardModeChange);

    //Add event 
    loadSettings();
    updateIcons();

    const multiplayerIcon = document.getElementById('multiplayer-icon');
    const multiplayerModal = document.getElementById('multiplayer-modal');
    const closeButtonMultiplayer = multiplayerModal.querySelector('.close');
    const roomInfoSection = document.getElementById('room-info');
    const lobbySection = document.getElementById('lobby-section');

    // Socket connection setup
    let currentRoom = null;

    // Get DOM elements
    const nameInputModal = document.getElementById('name-input-modal');
    const playerNameInput = document.getElementById('player-name-input');
    const nameError = document.getElementById('name-error');
    const createRoomBtn = document.getElementById('create-room-btn');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const roomCodeInput = document.getElementById('room-code-input');
    const roomCodeDisplay = document.getElementById('room-code-display');
    const playerListContainer = document.getElementById('player-list-container');
    const startGameBtn = document.getElementById('start-game-btn');
    const timerDisplay = document.getElementById('timer-display');

    const COLOR_NAMES = ['Blue', 'Pink', 'Violet', 'Red', 'Yellow', 'Indigo', 'Orange', 'Green'];
    const COLOR_SUFFIXES = ['Star', 'Moon', 'Sun', 'Cloud', 'Rain', 'Wind', 'Storm', 'Snow'];

    // Create room functionality
    createRoomBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/create-room', {
                method: 'POST'
            });
            const data = await response.json();
            
            if (data.roomCode) {
                currentRoom = data.roomCode;
                // Show name input modal
                nameInputModal.classList.remove('hidden');
                isRoomCreator = true; 
                showNameInputModal(data.roomCode);
            }
        } catch (error) {
            console.error('Error creating room:', error);
            showAlert('Failed to create room');
        }
    });

    // Join room functionality
    joinRoomBtn.addEventListener('click', async () => {
        const roomCode = roomCodeInput.value.trim().toUpperCase();
        if (!roomCode) {
            showAlert('Please enter a room code');
            return;
        }
    
        try {
            const response = await fetch(`/api/join-room?roomCode=${roomCode}`);
            const data = await response.json();
    
            if (data.success) {
                currentRoom = roomCode; // Store room code
                
                // Hide the join/create buttons and show name input
                lobbySection.classList.add('hidden');
                
                // Show name input modal
                showNameInputModal(roomCode);
    
                // Update room info display for consistency
                const roomCodeDisplay = document.getElementById('room-code-display');
                if (roomCodeDisplay && currentRoom) {
                    roomCodeDisplay.textContent = `Room Code: ${currentRoom}`;
                }
            } else {
                showAlert('Invalid room code');
            }
        } catch (error) {
            console.error('Error joining room:', error);
            showAlert('Failed to join room');
        }
    });

    // Start game button
    startGameBtn.addEventListener('click', () => {
        if (currentRoom) {
            socket.emit('startGame', currentRoom);
        }
    });

    function updateRoomDisplay(roomCode) {
        roomCodeDisplay.textContent = `Room Code: ${roomCode}`;
    }
    
    socket.on('roomJoined', ({ roomId }) => {
        updateRoomDisplay(roomId);
    });


    socket.on('disconnect', () => {
        showAlert('Lost connection to server. Please refresh the page.');
    });

    socket.on('playerJoined', ({ username }) => {
        currentRoomPlayers.add(username);
        showAlert(`${username} joined the room`);
    });

    socket.on('playerLeft', ({ username }) => {
        currentRoomPlayers.delete(username);
        showAlert(`${username} has left the room`);
        
        // If this is the current player, reset the game state
        if (username === currentUsername) {
            resetGame();
        }
    });

    socket.on('playerGuessedWord', ({ username, score }) => {
        showAlert(`${username} guessed their word correctly! (Score: ${score})`);
    });

    socket.on('gameStarted', ({ word, timeLimit, gameAlreadyStarted}) => {
        gameInProgress = true;
        targetWord = word.toUpperCase();
        attempts = 0;

        resetGrid();
        updateStatsIconState();

        const playerList = document.querySelectorAll('.player-list li');
        playerList.forEach(li => {
            li.classList.remove('player-ready');
        });

        // Get all necessary UI elements
        const multiplayerModal = document.getElementById('multiplayer-modal');
        const roomInfo = document.getElementById('room-info');
        const leaderboard = document.getElementById('leaderboard');
        const gameControls = roomInfo?.querySelector('.game-controls');

        // Keep room info visible but hide lobby sections
        const lobbySection = document.getElementById('lobby-section');
        const nameInputModal = document.getElementById('name-input-modal');
        if (lobbySection) lobbySection.classList.add('hidden');
        if (nameInputModal) nameInputModal.classList.add('hidden');
        
        // Ensure room info is visible
        if (roomInfo) roomInfo.classList.remove('hidden');

        let startButton = document.getElementById('start-game-btn');
        if (!startButton && gameControls) {
            startButton = document.createElement('button');
            startButton.id = 'start-game-btn';
            startButton.className = 'game-btn primary-btn';
            gameControls.insertBefore(startButton, gameControls.firstChild);
        }

        if (startButton) {
            const newButton = startButton.cloneNode(true);
            startButton.parentNode.replaceChild(newButton, startButton);
            startButton = newButton;

            startButton.classList.remove('hidden');
            if (gameAlreadyStarted) {
                startButton.textContent = 'Continue Game';
                startButton.disabled = false;
            } else {
                startButton.textContent = 'Starting...';
                startButton.disabled = true;
                window.startButtonTimeout = setTimeout(() => {
                    startButton.textContent = 'Continue Game';
                    startButton.disabled = false;
                }, 2000);
            }

            startButton.addEventListener('click', setupGameUI);
        }

        startGameTimer(timeLimit || GAME_DURATION);
        showAlert(gameAlreadyStarted ? 
            'Game in progress! Click Continue Game to play' : 
            'Game started! Click Continue Game to play'
        );
    });

    function createGameContainer() {
        return null;
    }

    function setupGameUI() {
        // Hide modal and overlay
        const multiplayerModal = document.getElementById('multiplayer-modal');
        const overlay = document.getElementById('overlay');
        if (multiplayerModal) {
            multiplayerModal.classList.remove('visible');
            multiplayerModal.classList.add('hidden');
        }
        if (overlay) {
            overlay.classList.add('hidden');
        }
    
        // Create or get game layout
        let gameLayout = document.querySelector('.game-layout');
        if (!gameLayout) {
            gameLayout = document.createElement('div');
            gameLayout.className = 'game-layout';
            
            // Create three sections: player profile, game section, leaderboard
            const playerProfile = document.createElement('div');
            playerProfile.className = 'player-profile';
            playerProfile.innerHTML = `
                <div class="profile-content">
                    <div class="player-name">${currentUsername}</div>
                    <div class="player-score">0 correct (0 attempts)</div>
                </div>
            `;
    
            const gameSection = document.createElement('div');
            gameSection.className = 'game-section';
    
            let leaderboard = document.getElementById('leaderboard');
            if (!leaderboard) {
                leaderboard = document.createElement('div');
                leaderboard.id = 'leaderboard';
                leaderboard.className = 'leaderboard';
                leaderboard.innerHTML = `
                    <h3>Leaderboard</h3>
                    <div id="leaderboard-content"></div>
                `;
            } else {
                leaderboard.classList.remove('hidden');
                // Remove from current location if it exists somewhere else
                if (leaderboard.parentElement) {
                    leaderboard.remove();
                }
            }
            
            // Add sections to layout in correct order
            gameLayout.appendChild(playerProfile);
            gameLayout.appendChild(gameSection);
            if (leaderboard) {
                gameLayout.appendChild(leaderboard);
            }
    
            const header = document.querySelector('header');
            header.insertAdjacentElement('afterend', gameLayout);
        }
    
        // Move game elements to game section
        const gameSection = gameLayout.querySelector('.game-section');
        const gameGrid = document.querySelector('.word-guess');
        const keyboard = document.querySelector('.virtual-keyboard');
    
        if (gameSection) {
            if (gameGrid) {
                gameGrid.classList.remove('hidden');
                gameSection.appendChild(gameGrid);
            }
            if (keyboard) {
                keyboard.classList.remove('hidden');
                gameSection.appendChild(keyboard);
            }
        }
    
        // Enable current row and set focus
        setRowEditable(attempts + 1);
        const firstInput = document.querySelector(`#box-${attempts + 1}-1`);
        if (firstInput) {
            firstInput.focus();
        }
    
        // Remove game-container if it exists
        const gameContainer = document.querySelector('.game-container');
        if (gameContainer) {
            // Move any remaining content to appropriate places
            const leaderboard = gameContainer.querySelector('.leaderboard');
            if (leaderboard) {
                leaderboard.remove(); // Remove if it exists in game-container
            }
            // Remove the container
            gameContainer.remove();
        }
    }

    socket.on('forceKick', () => {
        console.log("Kicked lmao!");
        if (multiplayerModal) {
            if (multiplayerModal.classList.contains('visible')) {
                toggleCardVisibility(multiplayerModal);
            }
        }
        window.location.reload();
    });

    socket.on('joinSuccess', ({ roomId, username, gameInProgress }) => {
        currentRoom = roomId; // Set current room immediately
        currentUsername = username;
        
        socket.emit('getRoomState', roomId, (response) => {
            if (response.success) {
                updateLeaderboard(response.players, response.gameInProgress);
            }
        });
        updateStatsIconState();
        
        // Show room info section and hide other sections
        const multiplayerModal = document.getElementById('multiplayer-modal');
        const roomInfo = document.getElementById('room-info');
        const lobbySection = document.getElementById('lobby-section');
        const nameInputModal = document.getElementById('name-input-modal');
        const gameControls = roomInfo?.querySelector('.game-controls');
    
        // Update room code display
        const roomCodeDisplay = document.getElementById('room-code-display');
        if (roomCodeDisplay) {
            roomCodeDisplay.textContent = `Room Code: ${roomId}`;
        }
    
        // Show/hide appropriate sections
        if (multiplayerModal.classList.contains('hidden')) {
            toggleCardVisibility(multiplayerModal);
        }
        if (roomInfo) roomInfo.classList.remove('hidden');
        if (lobbySection) lobbySection.classList.add('hidden');
        if (nameInputModal) nameInputModal.classList.add('hidden');
    
        if (gameControls) {
            let startButton = document.getElementById('start-game-btn');
            if (!startButton) {
                startButton = document.createElement('button');
                startButton.id = 'start-game-btn';
                startButton.className = 'game-btn primary-btn';
                gameControls.insertBefore(startButton, gameControls.firstChild);
            }
    
            if (gameInProgress) {
                startButton.textContent = 'Continue Game';
                startButton.disabled = false;
                startButton.classList.remove('hidden');
                startButton.onclick = () => setupGameUI();
            } else {
                const isCreator = Object.keys(currentRoomPlayers)[0] === socket.id;
                if (isCreator) {
                    startButton.textContent = 'Start Game';
                    startButton.disabled = false;
                    startButton.classList.remove('hidden');
                } else {
                    startButton.classList.add('hidden');
                }
            }
        }
    });
    
    socket.on('allAttemptsUsed', ({ correctWord, nextWord }) => {
        showAlert(`The word was: ${correctWord}`);
        setTimeout(() => {
            resetGrid();
            targetWord = nextWord;
            attempts = 0;
            setRowEditable(1);
        }, 2000);
    });
    
    socket.on('wordGuessed', ({ username, word, attempts }) => {
        if (username !== currentUsername) {
            showAlert(`${username} guessed the word ${word}!`);
            // The server will send a new word automatically
        }
        // Update leaderboard when someone guesses correctly
        socket.emit('getRoomState', currentRoom, (response) => {
            if (response.success && response.players) {
                updateLeaderboard(response.players, true);
            }
        });
    });
    
    socket.on('updateScores', ({ players, newGame }) => {
        // Update leaderboard with new scores
        updateLeaderboard(players, !newGame);
        if (gameInProgress) {
            const leaderboard = document.getElementById('leaderboard');
            if (leaderboard && leaderboard.parentElement.id === 'room-info') {
                const gameContainer = document.querySelector('.game-container') || createGameContainer();
                leaderboard.remove();
                gameContainer.appendChild(leaderboard);
            }
        }
    });

    socket.on('newWord', ({ word }) => {
        targetWord = word.toUpperCase();
        resetGrid();
        attempts = 0;
        setRowEditable(1);

        socket.emit('getRoomState', currentRoom, (response) => {
            if (response.success && response.players) {
                updateLeaderboard(response.players, true);
            }
        });
        
        // Clear any existing alerts
        const alerts = document.querySelectorAll('.alert-container');
        alerts.forEach(alert => alert.remove());

        // Focus on first input
        const firstInput = document.querySelector('#box-1-1');
        if (firstInput) {
            firstInput.focus();
        }

        showAlert('New word started!');
    });


    function resetGrid() {
        // Clear all input boxes
        const allInputs = document.querySelectorAll('.guess-box');
        allInputs.forEach(input => {
            input.value = '';
            input.disabled = true;
            input.classList.remove('green', 'yellow', 'red', 'flip', 'glow', 'no-caret');
        });
    
        // Reset any game state needed
        correctPositions = {};
        requiredLetters = {};
    }

    socket.on('roomFull', () => {
        showAlert('Room is full!');
    });

    socket.on('connect', () => {
        console.log('Socket connected');
    });

    socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        showAlert('Connection error. Please try again.');
    });
    
    socket.on('connect_timeout', () => {
        console.error('Socket connection timeout');
        showAlert('Connection timeout. Please try again.');
    });

    function handleSuccessfulJoin(roomCode, username) {
        // Hide all modals
        const multiplayerModal = document.getElementById('multiplayer-modal');
        const nameInputModal = document.getElementById('name-input-modal');
        const lobbySection = document.getElementById('lobby-section');
        const roomInfoSection = document.getElementById('room-info');
        const gameControls = roomInfoSection?.querySelector('.game-controls');
    
        // Hide modals
        if (!multiplayerModal.classList.contains('visible')) {
            toggleCardVisibility(multiplayerModal);
        }
        if (nameInputModal) nameInputModal.classList.add('hidden');
        if (lobbySection) lobbySection.classList.add('hidden');
        
        // Show room info
        if (roomInfoSection) {
            roomInfoSection.classList.remove('hidden');
            // Update room code display
            const roomCodeDisplay = document.getElementById('room-code-display');
            if (roomCodeDisplay) {
                roomCodeDisplay.textContent = `Room Code: ${roomCode}`;
            }
        }

        socket.emit('getRoomState', roomCode, (response) => {
            if (response.success) {
                const players = response.players;
                const startButton = document.getElementById('start-game-btn');
                
                // Determine if current player is admin
                const isAdmin = Object.values(players)[0]?.username === username;
                isRoomCreator = isAdmin; // Set global variable

                // Handle game control buttons
                if (gameControls) {
                    const startButton = document.getElementById('start-game-btn');
                    const readyButton = document.getElementById('ready-btn');

                    // Remove existing buttons if any
                    if (startButton) startButton.remove();
                    if (readyButton) readyButton.remove();

                    if (isAdmin && !response.gameInProgress) {
                        // Create start button for admin
                        const newStartButton = document.createElement('button');
                        newStartButton.id = 'start-game-btn';
                        newStartButton.className = 'game-btn primary-btn';
                        newStartButton.textContent = 'Start Game';
                        newStartButton.disabled = false;
                        newStartButton.addEventListener('click', () => startGame(roomCode));
                        gameControls.insertBefore(newStartButton, gameControls.firstChild);
                    } else if (!isAdmin && !response.gameInProgress) {
                        // Create ready button for non-admin players
                        const newReadyButton = document.createElement('button');
                        newReadyButton.id = 'ready-btn';
                        newReadyButton.className = 'game-btn primary-btn';
                        newReadyButton.textContent = 'Ready';
                        newReadyButton.addEventListener('click', () => {
                            socket.emit('playerReady', { roomId: roomCode });
                            newReadyButton.disabled = true;
                            newReadyButton.textContent = 'Ready ✓';
                        });
                        gameControls.insertBefore(newReadyButton, gameControls.querySelector('.danger-btn')); // Insert before Leave Room button
                    }
                }
            }
        });
    
        // Clear any input fields
        const nameInput = document.getElementById('player-name-input');
        const roomCodeInput = document.getElementById('room-code-input');
        if (nameInput) nameInput.value = '';
        if (roomCodeInput) roomCodeInput.value = '';
    }

    // Show name input modal
    function showNameInputModal(roomCode) {
    
        const confirmBtn = document.getElementById('confirm-name-btn');
        const randomBtn = document.getElementById('random-name-btn');
        const nameInput = document.getElementById('player-name-input');
        let originalValue = '';
        let isProcessing = false;

        nameInputModal.classList.remove('hidden');
        
        // Add input event listener to store original value
        nameInput.addEventListener('input', (e) => {
            originalValue = e.target.value;
            originalValue = originalValue.replace(/👑/g, ''); // Remove crown emoji
            if (originalValue.length > 10) {
                originalValue = originalValue.slice(0, 10);
            }
            e.target.value = originalValue;
            // Enable confirm button whenever there's input
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm';
        });

        // Add keyboard event listener for Enter key
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !isProcessing) {
                e.preventDefault();
                handleConfirm();
            }
        });

        // Function to handle name confirmation
        async function handleConfirm() {
            if (isProcessing) return;
            const name = nameInput.value.trim();
            if (!name) {
                const nameError = document.getElementById('name-error');
                if (nameError) nameError.classList.remove('hidden');
                return;
            }

            isProcessing = true;
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Joining...';

            try {
                // Create a Promise to handle the socket response
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        cleanup();
                        reject(new Error('Join room timeout'));
                    }, 10000);

                    function cleanup() {
                        clearTimeout(timeout);
                        socket.off('joinSuccess');
                        socket.off('joinError');
                        socket.off('roomFull');
                    }

                    socket.once('joinSuccess', () => {
                        cleanup();
                        resolve(true);
                    });

                    socket.once('joinError', (error) => {
                        cleanup();
                        reject(new Error(error.message || 'Failed to join room'));
                    });

                    socket.once('roomFull', () => {
                        cleanup();
                        reject(new Error('Room is full'));
                    });

                    socket.emit('joinRoom', {
                        roomId: roomCode,
                        username: name
                    });
                });

                // If we get here, join was successful
                currentUsername = name;

                // Use the new handler for successful join
                handleSuccessfulJoin(roomCode, name);

            } catch (error) {
                console.error('Error joining room:', error);
                showAlert(error.message || 'Failed to join room. Please try again.');
                nameInput.focus();
            } finally {
                isProcessing = false;
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Confirm';
            }
        }
        
        // Function to handle random name generation
        function handleRandomName() {
            // Store current input value if it exists
            if (nameInput.value.trim()) {
                originalValue = nameInput.value;
            }
            
            randomBtn.disabled = true;
            let randomName;
    
            socket.emit('getRoomPlayers', roomCode, (response) => {
                const existingNames = response.players.map(player => player.username);
                currentRoomPlayers = new Set(existingNames);
                
                const availableColors = COLOR_NAMES.filter(color => 
                    !currentRoomPlayers.has(color)
                );
            
                if (availableColors.length > 0) {
                    randomName = availableColors[Math.floor(Math.random() * availableColors.length)];
                } else {
                    // Generate compound name
                    let isUnique = false;
                    let attempts = 0;
                    const maxAttempts = 50;
            
                    while (!isUnique && attempts < maxAttempts) {
                        const color = COLOR_NAMES[Math.floor(Math.random() * COLOR_NAMES.length)];
                        const suffix = COLOR_SUFFIXES[Math.floor(Math.random() * COLOR_SUFFIXES.length)];
                        const compound = `${color}${suffix}`;
                        
                        if (!currentRoomPlayers.has(compound)) {
                            randomName = compound;
                            isUnique = true;
                        }
                        attempts++;
                    }
            
                    if (!randomName) {
                        const baseColor = COLOR_NAMES[Math.floor(Math.random() * COLOR_NAMES.length)];
                        let number = 1;
                        while (currentRoomPlayers.has(`${baseColor}${number}`)) {
                            number++;
                        }
                        randomName = `${baseColor}${number}`;
                    }
                }
                
                nameInput.value = randomName;
                nameInput.focus();
                confirmBtn.disabled = false;
                
                setTimeout(() => {
                    randomBtn.disabled = false;
                }, 100);
            });
        }
    
        // Remove old event listeners and create new buttons
        const newConfirmBtn = confirmBtn.cloneNode(true);
        const newRandomBtn = randomBtn.cloneNode(true);
    
        newConfirmBtn.addEventListener('click', handleConfirm);
    
        newRandomBtn.addEventListener('click', () => {
            if (!isProcessing) {
                isProcessing = true;
                handleRandomName();
                setTimeout(() => {
                    isProcessing = false;
                }, 100);
            }
        });
    
        // Replace old buttons
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        randomBtn.parentNode.replaceChild(newRandomBtn, randomBtn);

        nameInput.focus();
    }

    let roomTimer = null;

    let gameInProgress = false;
    let gameTimer = null;
    const GAME_DURATION = 1 * 30 * 1000; // 5 minutes

    // Function to update leaderboard
    function updateLeaderboard(players, isGameStarted = false) {
        // Update the final leaderboard content
        const leaderboardContent = document.getElementById('leaderboard-content');
        const playerProfile = document.querySelector('.profile-content');
    
        // Update player profile
        if (playerProfile && currentUsername) {
            const currentPlayer = Object.values(players).find(p => p.username === currentUsername);
            if (currentPlayer) {
                playerProfile.innerHTML = `
                   <h3>${currentUsername}</h3>
                   <div class="player-stats">
                       ${currentPlayer.correctGuesses || 0} correct 
                       (${currentPlayer.totalAttempts || 0} attempts)
                       ${isGameStarted ? `<br>Current attempts: ${currentPlayer.currentAttempts || 0}` : ''}
                   </div>
                `;
            }
        }
    
        if (leaderboardContent) {
            if (!isGameStarted) {
                // Simple player list before game starts
                leaderboardContent.innerHTML = `
                    <h3>Players</h3>
                    <div class="leaderboard-content">
                        ${Object.values(players)
                            .map(player => `
                                <div class="leaderboard-item">
                                    • ${player.username}
                                </div>
                            `).join('')}
                    </div>
                `;
            } else {
                // Sorted scores during game
                const sortedPlayers = Object.values(players)
                    .sort((a, b) => {
                        if (b.correctGuesses !== a.correctGuesses) {
                            return b.correctGuesses - a.correctGuesses;
                        }
                        return (a.totalAttempts || 0) - (b.totalAttempts || 0);
                    });
     
                leaderboardContent.innerHTML = `
                    <div class="leaderboard-content">
                        ${sortedPlayers.map((player, index) => `
                            <div class="leaderboard-item">
                                <span class="rank">#${index + 1}</span>
                                <span class="name">
                                    ${player.username}${player.isAdmin ? ' 👑' : ''}
                                </span>
                                <div class="score">
                                    <div>${player.correctGuesses || 0} correct</div>
                                    <div class="attempts">
                                        Total: ${player.totalAttempts || 0}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        }
    }

    function updateRoomTimer(timeLeft) {
        if (roomTimer) {
            clearInterval(roomTimer);
        }
    
        const timerDiv = document.getElementById('room-timer');
        if (!timerDiv) return;
    
        socket.emit('getTimeRemaining', currentRoom);
        
        roomTimer = setInterval(() => {
            if (currentRoom) {
                socket.emit('getTimeRemaining', currentRoom);
            } else {
                clearInterval(roomTimer);
            }
        }, 1000); // Request time from server every second
    
        socket.on('updateTime', ({ remainingTime }) => {
            const minutes = Math.floor(remainingTime / 60000);
            const seconds = Math.floor((remainingTime % 60000) / 1000);
            timerDiv.textContent = `Room expires in: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    
            if (remainingTime <= 0) {
                clearInterval(roomTimer);
                showFinalLeaderboard(true);
            }
        });
    }

    // Update the socket event handlers
    socket.on('gameState', ({ players, remainingTime, gameInProgress }) => {
        const roomInfo = document.getElementById('room-info');
        if (roomInfo) {
            roomInfo.classList.remove('hidden');
        }
    
        updatePlayerList(players);
        updateRoomTimer(remainingTime);
        
        updateLeaderboard(players, gameInProgress);

        const readyButton = document.getElementById('ready-btn');
        const startButton = document.getElementById('start-game-btn');
        const currentPlayer = Object.values(players).find(p => p.username === currentUsername);

        if (currentPlayer) {
            if (currentPlayer.isAdmin) {
                if (startButton) {
                    const allPlayersReady = Object.values(players)
                        .filter(p => !p.isAdmin)
                        .every(p => p.isReady);
                    
                    startButton.disabled = !allPlayersReady;
                    if (allPlayersReady) {
                        startButton.classList.add('all-ready');
                    } else {
                        startButton.classList.remove('all-ready');
                    }
                }
            } else if (readyButton) {
                readyButton.disabled = currentPlayer.isReady;
                if (currentPlayer.isReady) {
                    readyButton.textContent = 'Ready ✓';
                }
            }
        }
    });

    function showFinalLeaderboard(roomExpired = false) {
        gameInProgress = false;
        if (gameTimer) {
            clearInterval(gameTimer);
        }
    
        // Hide game layout 
        const gameLayout = document.querySelector('.game-layout');
        if (gameLayout) {
            gameLayout.classList.add('hidden');
        }

        // Disable all input boxes and virtual keyboard
        const guessBoxes = document.querySelectorAll('.guess-box');
        guessBoxes.forEach(box => {
            box.disabled = true;
            box.classList.add('no-caret');
        });

        // Disable virtual keyboard clicks
        const virtualKeyboard = document.querySelector('.virtual-keyboard');
        if (virtualKeyboard) {
            virtualKeyboard.style.pointerEvents = 'none';
            virtualKeyboard.classList.add('disabled');
        }

        // Add overlay to prevent any clicks on the game grid
        const gameContainer = document.querySelector('.game-container');
        if (gameContainer) {
            gameContainer.classList.add('disabled');
        }
    
        // Create final leaderboard overlay
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.id = 'final-leaderboard-overlay';
    
        const leaderboardModal = document.createElement('div');
        leaderboardModal.className = 'final-leaderboard-modal';
        
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '×';
        closeButton.className = 'close-button';

        const title = document.createElement('h2');
        title.textContent = 'Game Results';
        title.style.textAlign = 'center';
        title.style.marginBottom = '20px';
    
        // Get leaderboard content and clone it
        const leaderboardContent = document.getElementById('leaderboard').cloneNode(true);
        leaderboardModal.appendChild(closeButton);
        leaderboardModal.appendChild(title); 
        leaderboardModal.appendChild(leaderboardContent);
        overlay.appendChild(leaderboardModal);
        document.body.appendChild(overlay);

        // Create a unique ID for the style element
        const styleId = 'final-leaderboard-styles';
        // Remove existing style if it exists
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
            existingStyle.remove();
        }

        const styles = document.createElement('style');
        styles.id = styleId; // Add ID to style element
        styles.textContent = `
            .disabled {
                pointer-events: none;
                opacity: 0.7;
            }

            .virtual-keyboard.disabled .key {
                cursor: not-allowed;
                opacity: 0.7;
            }
        `;
        document.head.appendChild(styles);
    
        const handleClose = () => {
            const styleElement = document.getElementById(styleId);
            if (styleElement) {
                styleElement.remove();
            }

            overlay.remove();

            const finalLeaderboardModal = document.querySelector('.final-leaderboard-modal');
            if (finalLeaderboardModal) {
                finalLeaderboardModal.remove();
            }

            if (gameContainer) {
                gameContainer.classList.remove('disabled');
            }
            if (virtualKeyboard) {
                virtualKeyboard.style.pointerEvents = 'auto';
                virtualKeyboard.classList.remove('disabled');
            }
            
            // Show multiplayer modal with updated state
            const multiplayerModal = document.getElementById('multiplayer-modal');
            const roomInfo = document.getElementById('room-info');
            const gameControls = roomInfo?.querySelector('.game-controls');
            
            if (multiplayerModal && roomInfo) {
                multiplayerModal.classList.remove('hidden');
                multiplayerModal.classList.add('visible');
                roomInfo.classList.remove('hidden');
    
                if (gameControls) {
                    // Remove any existing control buttons first
                    const existingStartButton = document.getElementById('start-game-btn');
                    const existingReadyButton = document.getElementById('ready-btn');
                    if (existingStartButton) existingStartButton.remove();
                    if (existingReadyButton) existingReadyButton.remove();
        
                    if (isRoomCreator && !roomExpired) {
                        // Create Start New Game button for admin
                        const startButton = document.createElement('button');
                        startButton.id = 'start-game-btn';
                        startButton.textContent = 'Start New Game';
                        startButton.className = 'game-btn primary-btn';
                        startButton.disabled = true; // Disabled until all players ready
                        startButton.addEventListener('click', () => {
                            socket.emit('startGame', currentRoom);
                        });
                        gameControls.insertBefore(startButton, gameControls.firstChild);
                    } else if (!roomExpired) {
                        // Create Ready button for players
                        const readyButton = document.createElement('button');
                        readyButton.id = 'ready-btn';
                        readyButton.textContent = 'Ready';
                        readyButton.className = 'game-btn primary-btn';
                        readyButton.addEventListener('click', () => {
                            socket.emit('playerReady', { roomId: currentRoom });
                            readyButton.disabled = true;
                            readyButton.textContent = 'Ready ✓';
                        });
                        gameControls.insertBefore(readyButton, gameControls.querySelector('.danger-btn'));
                    }
                }
            }
        };
    
        closeButton.onclick = handleClose;
        overlay.onclick = (e) => {
            if (e.target === overlay) handleClose();
        };
    
        if (roomExpired) {
            showAlert('Room has expired. Returning to single player mode...');
            setTimeout(() => window.location.reload(), 2000);
        }
    }
    
    // Add client-side handler for game end
    socket.on('gameEnded', ({ players, remainingTime, isCreator }) => {
        
        gameInProgress = false;
        if (gameTimer) {
            clearInterval(gameTimer);
        }
        updateStatsIconState();
    
        // Update scores before showing final leaderboard
        updateLeaderboard(players, true);
        
        // Update room timer
        updateRoomTimer(remainingTime);
    
        // Show final state
        showFinalLeaderboard(false);
    
        // Update start button state
        const startButton = document.getElementById('start-game-btn');
        if (startButton) {
            if (socket.id === isCreator) {
                startButton.textContent = 'Start Game';
                startButton.disabled = false;
                startButton.classList.remove('hidden');
                
                // Remove old event listeners
                const newButton = startButton.cloneNode(true);
                startButton.parentNode.replaceChild(newButton, startButton);
                
                // Add new click handler
                newButton.addEventListener('click', () => {
                    socket.emit('startGame', currentRoom);
                });
            } else {
                startButton.classList.add('hidden');
            }
        }
    
        // Reset game timer display
        const timerDisplay = document.getElementById('game-timer');
        if (timerDisplay) {
            timerDisplay.textContent = 'Time remaining: 0:00';
        }
    });

    // Update player list
    function updatePlayerList(players) {
        const playerListContainer = document.querySelector('.player-list');
        if (!playerListContainer) return;
    
        const ul = document.createElement('ul');
        Object.entries(players).forEach(([playerId, player]) => {
            const li = document.createElement('li');
            li.style.padding = '8px 12px';
            li.style.margin = '4px 0';
            li.style.borderRadius = '4px';
            li.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            
            // Add ready status class if player is ready
            if (player.isReady) {
                li.classList.add('player-ready');
            }
    
            // Make non-admin players clickable for admin
            const canKick = isRoomCreator && 
                      !player.isAdmin && 
                      socket.id !== playerId && 
                      !gameInProgress &&
                      !player.isReady;
       
           if (canKick) {
               li.style.cursor = 'pointer';
               li.style.position = 'relative';
               li.innerHTML = `
                   ${player.username}
                   ${player.isReady ? ' <span class="ready-check">✓</span>' : ''}
                   <span class="kick-icon">❌</span>
               `;

               li.addEventListener('click', () => {
                   showKickConfirmation(playerId, player.username);
               });
           } else {
               li.innerHTML = `
                   ${player.username}
                   ${player.isAdmin ? ' 👑' : ''}
                   ${player.isReady ? ' <span class="ready-check">✓</span>' : ''}
               `;
           }

           ul.appendChild(li);
        });
    
        playerListContainer.innerHTML = '';
        playerListContainer.appendChild(ul);
    }

    function showKickConfirmation(playerId, username) {
        const overlay = document.createElement('div');
        overlay.className = 'overlay';
        overlay.style.display = 'flex';
        overlay.style.zIndex = '1000';

        const modal = document.createElement('div');
        modal.className = 'kick-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Kick Player</h3>
                <p>Are you sure you want to kick ${username}?</p>
                <div class="modal-buttons">
                    <button class="confirm-btn">Yes, Kick</button>
                    <button class="cancel-btn">Cancel</button>
                </div>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const confirmBtn = modal.querySelector('.confirm-btn');
        const cancelBtn = modal.querySelector('.cancel-btn');

        confirmBtn.onclick = () => {
            socket.emit('kickPlayer', { roomId: currentRoom, playerId });
            overlay.remove();
        };

        cancelBtn.onclick = () => overlay.remove();
    }
    
    // Add handler for being kicked
    socket.on('kicked', () => {
        showAlert('You have been kicked from the room');
        setTimeout(() => window.location.reload(), 2000);
    });

    socket.on('roomFull', () => {
        showAlert('Room is full! Maximum 8 players allowed.');
        // Reset room view
        lobbySection.classList.remove('hidden');
        roomInfoSection.classList.add('hidden');
    });

    socket.on('roomTimeUpdate', ({ remainingTime }) => {
        updateRoomTimer(remainingTime);
    });

    function startGameTimer(timeLimit) {
    
        if (gameTimer) {
            clearInterval(gameTimer);
        }
    
        let timeRemaining = timeLimit;
        const timerDisplay = document.createElement('div');
        timerDisplay.id = 'game-timer';
        timerDisplay.className = 'game-timer';
    
        // Remove any existing timer display
        const existingTimer = document.getElementById('game-timer');
        if (existingTimer) {
            existingTimer.remove();
        }
    
        // Add new timer to room info
        const roomInfo = document.getElementById('room-info');
        if (roomInfo) {
            roomInfo.insertBefore(timerDisplay, roomInfo.firstChild);
        }
    
        // Listen for server time updates
        socket.on('updateGameTime', ({ timeLeft }) => {
            if (timerDisplay) {
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);
                timerDisplay.textContent = `Time remaining: ${minutes}:${seconds.toString().padStart(2, '0')}`;
            }
        });
    
        socket.on('gameEnded', ({ players }) => {
            if (gameTimer) {
                clearInterval(gameTimer);
            }
            showFinalLeaderboard(false);
        });
    }

    socket.on('gameTimeSync', ({ timeRemaining }) => {
        const timerDisplay = document.getElementById('game-timer');
        if (timerDisplay) {
            const minutes = Math.floor(timeRemaining / 60000);
            const seconds = Math.floor((timeRemaining % 60000) / 1000);
            timerDisplay.textContent = `Time remaining: ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    });

    socket.on('roomExpired', () => {
        showAlert('Room has expired');
        if (roomTimer) clearInterval(roomTimer);
        resetGame();
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log('Reconnected to server after', attemptNumber, 'attempts');
    });
    
    socket.on('reconnect_failed', () => {
        showAlert('Unable to connect to server. Please refresh the page.');
    });

    socket.on('serverShutdown', ({ message }) => {
        showAlert('Server is shutting down. Please refresh the page later.');
        resetGame();
    });

    // Function to handle game start
    function startGame(roomCode) {
        const startButton = document.getElementById('start-game-btn');
        if (startButton) {
            startButton.disabled = true;
            startButton.textContent = 'Starting...';
        }
        updateStatsIconState();
    
        socket.emit('startGame', roomCode);
    }

    const leaveRoomBtn = document.getElementById('leave-room-btn');
    const leaveModal = document.getElementById('leave-confirmation-modal');
    const confirmLeaveBtn = document.getElementById('confirm-leave');
    const cancelLeaveBtn = document.getElementById('cancel-leave');

    function showLeaveConfirmation() {
        if (!leaveModal) {
            console.error('Leave modal not found');
            return;
        }

        leaveModal.classList.remove('hidden');

        const cleanup = () => {
            // Remove all event listeners when hiding the modal
            confirmLeaveBtn.removeEventListener('click', handleConfirm);
            cancelLeaveBtn.removeEventListener('click', handleCancel);
            document.removeEventListener('keydown', handleKeyPress);
        };

        const handleConfirm = () => {
            leaveRoom();
            hideLeaveConfirmation();
            cleanup();
        };
    
        const handleCancel = () => {
            hideLeaveConfirmation();
            cleanup();
        };
    
        // Handle keyboard events
        const handleKeyPress = (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            } else if (e.key === 'Enter' && document.activeElement === confirmBtn) {
                handleConfirm();
            }
        };
    
        // Add event listeners
        confirmLeaveBtn.addEventListener('click', handleConfirm);
        cancelLeaveBtn.addEventListener('click', handleCancel);
        document.addEventListener('keydown', handleKeyPress);
        // Focus on cancel button by default (safer option)
        cancelLeaveBtn.focus();
    }

    function hideLeaveConfirmation() {
        if (leaveModal) {
            leaveModal.classList.add('hidden');
        }
    }

    // Get the leave room button
    document.getElementById('leave-room-btn').addEventListener('click', (e) => {
        e.preventDefault();
        showLeaveConfirmation();
    });

    document.addEventListener('keydown', (e) => {
        if (!leaveModal.classList.contains('hidden')) {
            if (e.key === 'Escape') {
                hideLeaveConfirmation();
            } else if (e.key === 'Enter' && document.activeElement === confirmLeaveBtn) {
                leaveRoom();
                hideLeaveConfirmation();
            }
        }
    });

    // Function to handle leaving room
    function leaveRoom() {
        if (currentRoom) {
            // Notify server
            socket.emit('leaveRoom', { 
                roomId: currentRoom, 
                username: currentUsername
            });
    
            // Hide confirmation modal
            hideLeaveConfirmation();

            updateStatsIconState();
    
            // Reset local state
            resetGame();

            // Hide the multiplayer modal
            toggleCardVisibility(multiplayerModal);
    
            // Show confirmation
            showAlert('You have left the room');
        }
    }

    function setupModalKeyboardSupport() {
        const modal = document.getElementById('leave-confirmation-modal');
        const confirmBtn = document.getElementById('confirm-leave');
        const cancelBtn = document.getElementById('cancel-leave');
    
        // Keep track of which button is focused
        let currentFocus = confirmBtn;
    
        modal.addEventListener('keydown', (e) => {
            if (modal.classList.contains('hidden')) return;
    
            switch (e.key) {
                case 'Tab':
                    e.preventDefault();
                    currentFocus = currentFocus === confirmBtn ? cancelBtn : confirmBtn;
                    currentFocus.focus();
                    break;
                case 'Enter':
                    currentFocus.click();
                    break;
                case 'Escape':
                    hideLeaveConfirmation();
                    break;
            }
        });
    }
    
    // Call this when the page loads
    setupModalKeyboardSupport();

    // Update reset game function
    function resetGame() {
        /// Clear room data
        currentRoom = null;
        currentUsername = null;

        // Clear timers
        if (roomTimer) {
            clearInterval(roomTimer);
            roomTimer = null;
        }

        const nameInputModal = document.getElementById('name-input-modal');
        const multiplayerModal = document.getElementById('multiplayer-modal');
        const roomInfoSection = document.getElementById('room-info');
        const lobbySection = document.getElementById('lobby-section');

        // Hide modals
        if (nameInputModal) nameInputModal.classList.add('hidden');
        if (multiplayerModal) multiplayerModal.classList.add('hidden');
        if (roomInfoSection) roomInfoSection.classList.add('hidden');
        
        // Show lobby
        if (lobbySection) lobbySection.classList.remove('hidden');

        // Clear inputs
        const nameInput = document.getElementById('player-name-input');
        const roomCodeInput = document.getElementById('room-code-input');
        if (nameInput) nameInput.value = '';
        if (roomCodeInput) roomCodeInput.value = '';

        // Clear player list
        const playerListContainer = document.querySelector('.player-list');
        if (playerListContainer) playerListContainer.innerHTML = '';

        // Remove timer display if it exists
        const timerDisplay = document.getElementById('room-timer');
        if (timerDisplay) {
            timerDisplay.remove();
        }
    }

    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showLeaveConfirmation();
        });
    }

    if (confirmLeaveBtn) {
        confirmLeaveBtn.addEventListener('click', () => {
            leaveRoom();
            hideLeaveConfirmation();
        });
    }

    if (cancelLeaveBtn) {
        cancelLeaveBtn.addEventListener('click', () => {
            hideLeaveConfirmation();
        });
    }

    // Show modal when clicking multiplayer icon
    multiplayerIcon.addEventListener('click', (e) => {
        e.preventDefault();
        const multiplayerModal = document.getElementById('multiplayer-modal');
        const roomInfo = document.getElementById('room-info');
        const lobbySection = document.getElementById('lobby-section');

        if (currentRoom) {
            // If in a room, show room info instead of lobby
            if (multiplayerModal) {
                toggleCardVisibility(multiplayerModal);
                if (roomInfo) roomInfo.classList.remove('hidden');
                if (lobbySection) lobbySection.classList.add('hidden');
            }
        } else {
            // Not in a room, show default join/create view
            toggleCardVisibility(multiplayerModal);
        }

        // Make sure name input is hidden
        nameInputModal.classList.add('hidden');
    });
    
    closeButtonMultiplayer.addEventListener('click', () => {
        nameError.classList.add('hidden');
        if (currentRoom) {
            showLeaveConfirmation();
            return;
        }
        toggleCardVisibility(multiplayerModal);
        // Reset all states
        nameInputModal.classList.add('hidden');
        roomInfoSection.classList.add('hidden');
        lobbySection.classList.remove('hidden');
        if (playerNameInput) playerNameInput.value = '';
    });

    // Prevent modal from closing when clicking inside the modal
    const modalContent = multiplayerModal.querySelector('.modal-content');
    modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Attach event listeners to each setting option with their corresponding icons
    document.querySelectorAll('.setting-option').forEach(option => {
        const checkbox = option.querySelector('.slider-toggle');
        let icons;
    
        // Define icons based on option ID
        if (option.id === 'theme-option') {
            icons = {
                unchecked: '../assets/images/sun-icon.png',
                checked: '../assets/images/moon-icon.png'
            };
        } else if (option.id === 'hard-mode-option') {
            icons = {
                unchecked: '../assets/images/baby-icon.png',
                checked: '../assets/images/skull-darkmode.png'
            };
        } else if (option.id === 'sound-effects-option') {
            icons = {
                unchecked: '../assets/images/sound-off.png',
                checked: '../assets/images/sound-on.png'
            };
        } 
    
        if (checkbox && icons) {
            toggleSlider(option, checkbox, icons);
        }
    });

    document.getElementById('daily-challenge-option').addEventListener('click', async () => {
        if (currentRoom && gameInProgress) {
            showAlert('You must leave the multiplayer room first to play daily challenge');
            return;
        }
        
        const today = new Date().toISOString().slice(0, 10);
        const attemptsData = JSON.parse(localStorage.getItem(DAILY_ATTEMPTS_KEY)) || {};
        const todayData = attemptsData[today];
        
        if (todayData?.completed) {
            showAlert('You\'ve already completed today\'s challenge. Come back tomorrow!');
            return;
        }
    
        const dailyWord = await getDailyChallengeWord();
        localStorage.setItem('dailyChallengeMode', 'true');
        location.reload();
    });

    function getAttemptColors(date) {
        const attemptsData = JSON.parse(localStorage.getItem(DAILY_ATTEMPTS_KEY)) || {};
        const dayData = attemptsData[date];
        
        if (!dayData || !dayData.attempts.length) return [];
        
        return dayData.attempts.map(attempt => attempt.result);
    }

    function createAttemptGrid(date) {
        const colors = getAttemptColors(date);
        if (!colors.length) return '';
    
        let gridHTML = '<div class="attempt-grid">';
        colors.forEach(attempt => {
            gridHTML += '<div class="attempt-row">';
            attempt.forEach(color => {
                gridHTML += `<div class="attempt-box ${color}"></div>`;
            });
            gridHTML += '</div>';
        });
        gridHTML += '</div>';
        
        return gridHTML;
    }
    
    // Add these styles to your CSS
    const attemptGridStyles = `
    .attempt-grid {
        margin: 10px 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    
    .attempt-row {
        display: flex;
        gap: 4px;
        justify-content: center;
    }
    
    .attempt-box {
        width: 20px;
        height: 20px;
        border-radius: 2px;
    }
    
    .calendar-day:hover .attempt-grid {
        display: flex;
        position: absolute;
        background: var(--background-color);
        padding: 8px;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        z-index: 1020;
    }
    `;
    
    // Add styles to document
    const gridStyleSheet = document.createElement('style');
    gridStyleSheet.textContent = attemptGridStyles;
    document.head.appendChild(gridStyleSheet);
    
    // Handle opting out by clicking on the title
    // Handle opting out by clicking on the title
    document.querySelector('.Heading a').addEventListener('click', (e) => {
        e.preventDefault();

        // If in daily challenge mode
        if (localStorage.getItem('dailyChallengeMode')) {
            localStorage.removeItem('dailyChallengeMode');
            localStorage.removeItem('targetWord');
            location.reload();
        }
        // If in multiplayer mode
        else if (currentRoom && gameInProgress) {
            // Create and show confirmation modal
            const confirmationHTML = `
                <div id="leave-multiplayer-modal" class="modal">
                    <div class="modal-content leave-confirmation">
                        <h2>Leave Multiplayer Mode?</h2>
                        <p>Are you sure you want to leave multiplayer mode? Your progress will be lost.</p>
                        <div class="modal-buttons">
                            <button id="confirm-leave-multiplayer" class="modal-btn confirm-btn">Yes, Leave</button>
                            <button id="cancel-leave-multiplayer" class="modal-btn cancel-btn">Cancel</button>
                        </div>
                    </div>
                </div>
            `;

            // Add modal to body if it doesn't exist
            if (!document.getElementById('leave-multiplayer-modal')) {
                document.body.insertAdjacentHTML('beforeend', confirmationHTML);
            }

            const modal = document.getElementById('leave-multiplayer-modal');
            const confirmBtn = document.getElementById('confirm-leave-multiplayer');
            const cancelBtn = document.getElementById('cancel-leave-multiplayer');

            // Show modal
            modal.classList.remove('hidden');

            // Handle confirmation
            confirmBtn.onclick = () => {
                // Leave room
                if (currentRoom) {
                    socket.emit('leaveRoom', {
                        roomId: currentRoom,
                        username: currentUsername
                    });
                }

                // Reset game state
                currentRoom = null;
                gameInProgress = false;

                // Reload page
                location.reload();
            };

            // Handle cancellation
            cancelBtn.onclick = () => {
                modal.classList.add('hidden');
            };

            // Handle ESC key
            document.addEventListener('keydown', function handleEsc(e) {
                if (e.key === 'Escape') {
                    modal.classList.add('hidden');
                    document.removeEventListener('keydown', handleEsc);
                }
            });
        }
        // If in regular mode, just reload
        else {
            location.reload();
        }
     });

    // Hide the settings card when the close button is clicked
    closeButtonSettings.addEventListener('click', () => toggleCardVisibility(settingsCard));

    setRowEditable(1); // Enable the first row and disable others
    guessBoxes[0].focus(); // Set focus on the first input box on page load
});
