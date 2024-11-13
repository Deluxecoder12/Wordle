document.addEventListener('DOMContentLoaded', async function() {
    
    // Initialize game variables
    let attempts = 0;
    const maxAttempts = 6;
    let targetWord;

    // Function to get or generate the daily challenge word
    const getDailyChallengeWord = async () => {
        const savedWordData = JSON.parse(localStorage.getItem('dailyChallenge'));
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format

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

            console.log(`New daily challenge word: ${newWord}`);
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

        return result;
    }

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
    function createFirework(container) {
        const fireworkContainer = document.createElement('div');
        fireworkContainer.classList.add('firework-container');
        container.appendChild(fireworkContainer);
    
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
            fireworkContainer.remove();
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
                
                // Check the guess against the target word
                const result = await checkGuess(guess, targetWord);
                
                if (!result) {
                    return; // If checkGuess returned undefined, stop further execution
                }

                // Validate the guess against hard mode rules
                if (hardModeEnabled) {
                    const stateUpdated = await updateHardModeState(guess, targetWord);
                    if (!stateUpdated) {
                        console.log('State update failed.');
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
                        const wordContainer = document.querySelector(`#box-${rowId}-1`).closest('section');
                        createFirework(wordContainer);

                        showAlert(`<span class="bold-text">Congratulations!</span> You've guessed the word: ${targetWord}`);
                        setTimeout(() => window.location.reload(), 3000); // Reload the page after alert
                    }, 550);
                    return;
                }

                // Move focus to the next row if there are more attempts left
                attempts++;
                if (attempts >= maxAttempts) {
                    showAlert(`<span class="bold-text">Game Over!</span> The word was: ${targetWord}`);
                    setTimeout(() => window.location.reload(), 1500); // Reload the page after alert
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
        // Use the last focused input box instead of document.activeElement
        const activeInput = lastFocusedInput;
    
        if (!activeInput || !activeInput.classList.contains('guess-box')) {
            console.log('No active input box found or the active element is not a guess-box.');
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
        if (element.classList.contains('hidden')) {
            element.classList.remove('hidden');
            element.classList.add('visible');
            overlay.classList.remove('hidden');
        } else {
            element.classList.remove('visible');
            element.classList.add('hidden');
            overlay.classList.add('hidden');
        }
    
        // Reset modal state if it's the multiplayer modal
        if (element.id === 'multiplayer-modal' && element.classList.contains('hidden')) {
            if (lobbySection) lobbySection.classList.remove('hidden');
            if (roomInfoSection) roomInfoSection.classList.add('hidden');
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
        console.log(`Switching to ${theme} mode`);
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
            console.log("Hard mode toggled:", hardModeEnabled);
        } else {
            // Prevent hard mode change if the game has already started
            console.log("Cannot toggle hard mode after the game has started");
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

    // Show modal when clicking multiplayer icon
    multiplayerIcon.addEventListener('click', (e) => {
        e.preventDefault();
        toggleCardVisibility(multiplayerModal);
    });
    
    // Update the close button handler
    closeButtonMultiplayer.addEventListener('click', () => {
        e.preventDefault();
        toggleCardVisibility(multiplayerModal);
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
        const dailyWord = await getDailyChallengeWord(); // Get the word for today
        localStorage.setItem('targetWord', dailyWord);
    
        localStorage.setItem('dailyChallengeMode', 'true'); // Flag to indicate daily challenge mode
        location.reload(); // Refresh the page to apply the changes
    });
    
    // Handle opting out by clicking on the title
    document.querySelector('.Heading a').addEventListener('click', () => {
        localStorage.removeItem('dailyChallengeMode'); // Remove the flag for daily challenge mode
        localStorage.removeItem('targetWord'); // Optionally, remove the target word
    
        // Refresh the page to exit the daily challenge mode
        location.reload();
    });

    // Hide the settings card when the close button is clicked
    closeButtonSettings.addEventListener('click', () => toggleCardVisibility(settingsCard));

    setRowEditable(1); // Enable the first row and disable others
    guessBoxes[0].focus(); // Set focus on the first input box on page load
});
