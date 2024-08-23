document.addEventListener('DOMContentLoaded', async function() {
    
    // Initialize game variables
    let targetWord = await getRandomWord();
    let attempts = 0;
    const maxAttempts = 6;
    
    // For alerts
    let isAlertActive = false;

    // For virtual keyboard's focus
    let lastFocusedInput = null;

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

        const result = Array(5).fill('red'); // Default background color
        const targetLetterCount = {}; // Track letter frequencies in the target word

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

    // FIXME: MIGHT BE NEEDED IN MULTIPLAYER MODE
    // Function to reset the game
    // function resetGame() {
    //     // Clear all inputs
    //     const allInputs = document.querySelectorAll('.guess-box');
    //     allInputs.forEach(input => {
    //         input.value = '';
    //         input.disabled = false;
    //         input.classList.remove('no-caret');
    //         input.classList.remove('green', 'yellow', 'red');
    //     });

    //     // Reset game variables
    //     targetWord = getRandomWord();
    //     attempts = 0;

    //     // Set focus on the first input box
    //     document.querySelector('#box-1-1').focus();
    // }

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

    // -----------------HOW-TO-PLAY-CARD-----------------------------
    const instructionCard = document.getElementById('instruction-card');
    const overlay = document.getElementById('overlay');
    const closeButton = document.getElementById('close-button');

    const toggleCardVisibility = (e) => {
        e.preventDefault();
        if (instructionCard.classList.contains('hidden')) {
            instructionCard.classList.remove('hidden');
            instructionCard.classList.add('visible');
            overlay.classList.remove('hidden');
            overlay.classList.add('visible');
        } else {
            instructionCard.classList.remove('visible');
            instructionCard.classList.add('hidden');
            overlay.classList.remove('visible');
            overlay.classList.add('hidden');
        }
    };

    // Show the card and overlay when the question mark icon is clicked
    document.querySelector('.Left a[href="#"]').addEventListener('click', toggleCardVisibility);

    // Hide the card and overlay when the close button is clicked or clicking outside of the card
    closeButton.addEventListener('click', toggleCardVisibility);
    overlay.addEventListener('click', toggleCardVisibility);

    setRowEditable(1); // Enable the first row and disable others
    guessBoxes[0].focus(); // Set focus on the first input box on page load
});
