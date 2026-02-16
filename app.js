// Application state
let state = {
    rules: [],
    history: []
};

let language = 'ru';
let currentCard = null;
let placementType = null; // 'rules' or 'history'
let navigationContext = null; // { type: 'rules' | 'history', currentIndex: number }

// Initialize application
async function init() {
    // Load language from localStorage
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage) {
        language = savedLanguage;
        updateLanguageButtons();
    }

    // Load state from localStorage or initialState.json
    const savedState = localStorage.getItem('state');
    if (savedState) {
        try {
            state = JSON.parse(savedState);
        } catch (e) {
            console.error('Error parsing saved state:', e);
            await loadInitialState();
        }
    } else {
        await loadInitialState();
    }

    // Setup event listeners
    setupEventListeners();

    // Render initial UI
    renderCurrentTab();
}

// Load initial state from JSON
async function loadInitialState() {
    try {
        const response = await fetch('initialState.json');
        if (!response.ok) {
            throw new Error('Failed to load initial state');
        }
        state = await response.json();
        saveState();
    } catch (e) {
        showError('Ошибка загрузки начального состояния');
        console.error(e);
    }
}

// Save state to localStorage
function saveState() {
    localStorage.setItem('state', JSON.stringify(state));
}

// Save language to localStorage
function saveLanguage() {
    localStorage.setItem('language', language);
}

// Setup all event listeners
function setupEventListeners() {
    // Open card button
    document.getElementById('openCardBtn').addEventListener('click', openCard);
    
    // Enter key on card input
    document.getElementById('archiveNumInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            openCard();
        }
    });

    // Language toggle
    document.getElementById('langRu').addEventListener('click', () => switchLanguage('ru'));
    document.getElementById('langEn').addEventListener('click', () => switchLanguage('en'));

    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });

    // Dialog actions
    document.getElementById('closeDialog').addEventListener('click', closeCardDialog);
    document.getElementById('placeInRulesBtn').addEventListener('click', () => showPlacementDialog('rules'));
    document.getElementById('placeInHistoryBtn').addEventListener('click', () => showPlacementDialog('history'));

    // Card navigation buttons
    document.getElementById('prevCardBtn').addEventListener('click', navigateToPrevCard);
    document.getElementById('nextCardBtn').addEventListener('click', navigateToNextCard);

    // Placement dialog actions
    document.getElementById('confirmPlacement').addEventListener('click', confirmPlacement);
    document.getElementById('cancelPlacement').addEventListener('click', closePlacementDialog);

    // Import/Export
    document.getElementById('exportBtn').addEventListener('click', exportState);
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', importState);

    // Close dialogs on backdrop click
    document.getElementById('cardDialog').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeCardDialog();
        }
    });
    document.getElementById('placementDialog').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closePlacementDialog();
        }
    });
}

// Switch language
// Switch language
function switchLanguage(lang) {
    language = lang;
    saveLanguage();
    updateLanguageButtons();
    renderCurrentTab();
    
    // Update card image if dialog is open
    if (currentCard !== null && document.getElementById('cardDialog').open) {
        const spinner = document.getElementById('loadingSpinner');
        const cardImage = document.getElementById('cardImage');
        
        // Show spinner while loading new language image
        spinner.style.display = 'flex';
        cardImage.style.display = 'none';
        
        loadCardImage().then(() => {
            spinner.style.display = 'none';
            cardImage.style.display = 'block';
        }).catch(() => {
            spinner.style.display = 'none';
            showError('Ошибка загрузки изображения');
        });
    }
}

// Update language button states
function updateLanguageButtons() {
    document.getElementById('langRu').classList.toggle('active', language === 'ru');
    document.getElementById('langEn').classList.toggle('active', language === 'en');
}

// Switch tab
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });

    if (tabName === 'rules') {
        document.getElementById('rulesTab').classList.add('active');
        renderRules();
    } else if (tabName === 'history') {
        document.getElementById('historyTab').classList.add('active');
        renderHistory();
    }
}

// Render current active tab
function renderCurrentTab() {
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab) {
        switchTab(activeTab.dataset.tab);
    }
}

// Open card by number
// Open card by number
async function openCard() {
    const input = document.getElementById('archiveNumInput');
    const cardNumber = parseInt(input.value);

    if (!cardNumber || cardNumber < 1) {
        showError('Введите корректный номер карточки');
        return;
    }

    const openBtn = document.getElementById('openCardBtn');
    openBtn.disabled = true;
    openBtn.textContent = 'Загрузка...';

    const cardPath = `cards/${language}/${cardNumber}.jpg`;

    // Check if image exists and load it
    try {
        const exists = await checkImageExists(cardPath);
        if (!exists) {
            showError(`Карточка №${cardNumber} не найдена`);
            openBtn.disabled = false;
            openBtn.textContent = 'Открыть';
            return;
        }

        currentCard = cardNumber;
        navigationContext = null; // No navigation when opening directly
        showCardDialog();
        
        openBtn.disabled = false;
        openBtn.textContent = 'Открыть';
    } catch (e) {
        showError('Ошибка при загрузке карточки');
        console.error(e);
        openBtn.disabled = false;
        openBtn.textContent = 'Открыть';
    }
}

// Check if image exists
function checkImageExists(path) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = path;
    });
}

// Show card dialog
// Show card dialog
function showCardDialog() {
    const dialog = document.getElementById('cardDialog');
    const actions = document.getElementById('dialogActions');
    const navigation = document.getElementById('cardNavigation');
    const spinner = document.getElementById('loadingSpinner');
    const cardImage = document.getElementById('cardImage');
    
    // Show spinner, hide image initially
    spinner.style.display = 'flex';
    cardImage.style.display = 'none';
    actions.style.display = 'none';
    
    // Open dialog first
    dialog.showModal();
    
    // Load image
    loadCardImage().then(() => {
        // Hide spinner, show image
        spinner.style.display = 'none';
        cardImage.style.display = 'block';
        
        // Show/hide navigation based on context
        if (navigationContext) {
            navigation.style.display = 'flex';
            updateNavigationUI();
            // When viewing from list, never show action buttons (card is already placed)
            actions.style.display = 'none';
        } else {
            navigation.style.display = 'none';
            // When opened directly via input, show action buttons only if card is not placed
            const isPlaced = isCardPlaced(currentCard);
            actions.style.display = isPlaced ? 'none' : 'flex';
        }
    }).catch((error) => {
        // Hide spinner and show error
        spinner.style.display = 'none';
        showError('Ошибка загрузки изображения');
        closeCardDialog();
    });
}

// Update card image in dialog
function updateCardImage() {
    const img = document.getElementById('cardImage');
    const cardPath = `cards/${language}/${currentCard}.jpg`;
    img.src = cardPath;
}

// Load card image and return promise
function loadCardImage() {
    return new Promise((resolve, reject) => {
        const img = document.getElementById('cardImage');
        const cardPath = `cards/${language}/${currentCard}.jpg`;
        
        // Create temporary image to preload
        const tempImg = new Image();
        
        tempImg.onload = () => {
            img.src = cardPath;
            resolve();
        };
        
        tempImg.onerror = () => {
            reject(new Error('Failed to load image'));
        };
        
        tempImg.src = cardPath;
    });
}

// Close card dialog
function closeCardDialog() {
    document.getElementById('cardDialog').close();
    currentCard = null;
    navigationContext = null;
}

// Check if card is placed anywhere
function isCardPlaced(cardNumber) {
    const inRules = state.rules.some(rule => rule.card === cardNumber);
    const inHistory = state.history.some(item => item.card === cardNumber);
    return inRules || inHistory;
}

// Show placement dialog
function showPlacementDialog(type) {
    placementType = type;
    const dialog = document.getElementById('placementDialog');
    const title = document.getElementById('placementTitle');
    const input = document.getElementById('slotInput');

    if (type === 'rules') {
        title.textContent = 'Выберите правило (1-29)';
        input.setAttribute('max', '29');
        input.value = '';
    } else if (type === 'history') {
        title.textContent = 'Выберите слот истории (1-18)';
        input.setAttribute('max', '18');
        
        // Find nearest empty slot
        const emptySlot = findNearestEmptyHistorySlot();
        input.value = emptySlot || '';
    }

    dialog.showModal();
}

// Close placement dialog
function closePlacementDialog() {
    document.getElementById('placementDialog').close();
    placementType = null;
}

// Find nearest empty history slot
function findNearestEmptyHistorySlot() {
    for (let i = 0; i < state.history.length; i++) {
        if (state.history[i].card === null) {
            return state.history[i].index;
        }
    }
    return null;
}

// Confirm placement
function confirmPlacement() {
    const input = document.getElementById('slotInput');
    const slotNumber = parseInt(input.value);

    if (!slotNumber || slotNumber < 1) {
        showError('Введите корректный номер слота');
        return;
    }

    if (placementType === 'rules') {
        if (slotNumber > 29) {
            showError('Номер правила должен быть от 1 до 29');
            return;
        }
        placeCardInRules(currentCard, slotNumber);
    } else if (placementType === 'history') {
        if (slotNumber > 18) {
            showError('Номер слота должен быть от 1 до 18');
            return;
        }
        placeCardInHistory(currentCard, slotNumber);
    }

    closePlacementDialog();
    closeCardDialog();
    renderCurrentTab();
}

// Place card in rules
function placeCardInRules(cardNumber, ruleNumber) {
    // Remove card from everywhere first
    removeCardFromEverywhere(cardNumber);

    // Find and update the rule
    const ruleIndex = state.rules.findIndex(r => r.ruleNumber === ruleNumber);
    if (ruleIndex !== -1) {
        state.rules[ruleIndex].card = cardNumber;
        saveState();
    }
}

// Place card in history
function placeCardInHistory(cardNumber, index) {
    // Remove card from everywhere first
    removeCardFromEverywhere(cardNumber);

    // Find and update the history slot
    const historyIndex = state.history.findIndex(h => h.index === index);
    if (historyIndex !== -1) {
        state.history[historyIndex].card = cardNumber;
        saveState();
    }
}

// Remove card from all locations
function removeCardFromEverywhere(cardNumber) {
    // Remove from rules
    state.rules.forEach(rule => {
        if (rule.card === cardNumber) {
            rule.card = null;
        }
    });

    // Remove from history
    state.history.forEach(item => {
        if (item.card === cardNumber) {
            item.card = null;
        }
    });
}

// Render rules list
function renderRules() {
    const container = document.getElementById('rulesList');
    container.innerHTML = '';

    state.rules.forEach(rule => {
        const slot = createSlotElement(rule.ruleNumber, rule.card, 'rule');
        container.appendChild(slot);
    });
}

// Render history list
function renderHistory() {
    const container = document.getElementById('historyList');
    container.innerHTML = '';

    state.history.forEach(item => {
        const slot = createSlotElement(item.index, item.card, 'history');
        container.appendChild(slot);
    });
}

// Create slot element
function createSlotElement(number, cardNumber, type) {
    const slot = document.createElement('div');
    slot.className = cardNumber ? 'slot' : 'slot empty';

    const numberSpan = document.createElement('span');
    numberSpan.className = 'slot-number';
    numberSpan.textContent = `#${number}`;
    slot.appendChild(numberSpan);

    if (cardNumber) {
        const thumbnail = document.createElement('img');
        thumbnail.className = 'slot-thumbnail';
        thumbnail.src = `cards/${language}/${cardNumber}.jpg`;
        thumbnail.alt = `Card ${cardNumber}`;
        thumbnail.loading = 'lazy';
        slot.appendChild(thumbnail);

        // Click to view card with navigation
        slot.addEventListener('click', () => {
            openCardWithNavigation(cardNumber, type, number);
        });
    } else {
        const emptyText = document.createElement('span');
        emptyText.className = 'slot-empty-text';
        emptyText.textContent = 'Пусто';
        slot.appendChild(emptyText);
    }

    return slot;
}

// Open card with navigation context
function openCardWithNavigation(cardNumber, type, slotNumber) {
    currentCard = cardNumber;
    
    // Find the index in the appropriate list
    const list = type === 'rule' ? state.rules : state.history;
    const index = list.findIndex(item => {
        const itemNumber = type === 'rule' ? item.ruleNumber : item.index;
        return itemNumber === slotNumber;
    });
    
    navigationContext = {
        type: type,
        currentIndex: index
    };
    
    showCardDialog();
}

// Navigate to previous card in the list
// Navigate to previous card in the list
function navigateToPrevCard() {
    if (!navigationContext) return;
    
    const list = navigationContext.type === 'rule' ? state.rules : state.history;
    let newIndex = navigationContext.currentIndex - 1;
    
    // Find previous non-empty slot
    while (newIndex >= 0) {
        if (list[newIndex].card !== null) {
            navigationContext.currentIndex = newIndex;
            currentCard = list[newIndex].card;
            
            // Show loading state
            const spinner = document.getElementById('loadingSpinner');
            const cardImage = document.getElementById('cardImage');
            spinner.style.display = 'flex';
            cardImage.style.display = 'none';
            
            loadCardImage().then(() => {
                spinner.style.display = 'none';
                cardImage.style.display = 'block';
                updateNavigationUI();
            }).catch(() => {
                spinner.style.display = 'none';
                showError('Ошибка загрузки изображения');
            });
            return;
        }
        newIndex--;
    }
}

// Navigate to next card in the list
// Navigate to next card in the list
function navigateToNextCard() {
    if (!navigationContext) return;
    
    const list = navigationContext.type === 'rule' ? state.rules : state.history;
    let newIndex = navigationContext.currentIndex + 1;
    
    // Find next non-empty slot
    while (newIndex < list.length) {
        if (list[newIndex].card !== null) {
            navigationContext.currentIndex = newIndex;
            currentCard = list[newIndex].card;
            
            // Show loading state
            const spinner = document.getElementById('loadingSpinner');
            const cardImage = document.getElementById('cardImage');
            spinner.style.display = 'flex';
            cardImage.style.display = 'none';
            
            loadCardImage().then(() => {
                spinner.style.display = 'none';
                cardImage.style.display = 'block';
                updateNavigationUI();
            }).catch(() => {
                spinner.style.display = 'none';
                showError('Ошибка загрузки изображения');
            });
            return;
        }
        newIndex++;
    }
}

// Update navigation UI (info text and button states)
function updateNavigationUI() {
    if (!navigationContext) return;
    
    const list = navigationContext.type === 'rule' ? state.rules : state.history;
    const currentItem = list[navigationContext.currentIndex];
    const itemNumber = navigationContext.type === 'rule' ? currentItem.ruleNumber : currentItem.index;
    const typeName = navigationContext.type === 'rule' ? 'Правило' : 'История';
    
    // Update info text
    const navInfo = document.getElementById('navInfo');
    navInfo.textContent = `${typeName} #${itemNumber}`;
    
    // Update button states
    const prevBtn = document.getElementById('prevCardBtn');
    const nextBtn = document.getElementById('nextCardBtn');
    
    // Check if there's a previous non-empty slot
    let hasPrev = false;
    for (let i = navigationContext.currentIndex - 1; i >= 0; i--) {
        if (list[i].card !== null) {
            hasPrev = true;
            break;
        }
    }
    
    // Check if there's a next non-empty slot
    let hasNext = false;
    for (let i = navigationContext.currentIndex + 1; i < list.length; i++) {
        if (list[i].card !== null) {
            hasNext = true;
            break;
        }
    }
    
    prevBtn.disabled = !hasPrev;
    nextBtn.disabled = !hasNext;
}

// Export state
function exportState() {
    const dataStr = JSON.stringify(state, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `charterstone-state-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
}

// Import state
async function importState(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const importedState = JSON.parse(text);

        // Validate structure
        if (!validateState(importedState)) {
            showError('Неверная структура файла');
            return;
        }

        state = importedState;
        saveState();
        renderCurrentTab();
        showError('Импорт выполнен успешно', false);
    } catch (e) {
        showError('Ошибка импорта файла');
        console.error(e);
    }

    // Reset file input
    event.target.value = '';
}

// Validate state structure
function validateState(importedState) {
    if (!importedState || typeof importedState !== 'object') {
        return false;
    }

    // Check rules array
    if (!Array.isArray(importedState.rules) || importedState.rules.length !== 29) {
        return false;
    }

    // Check history array
    if (!Array.isArray(importedState.history) || importedState.history.length !== 18) {
        return false;
    }

    // Validate rules structure
    for (let i = 0; i < importedState.rules.length; i++) {
        const rule = importedState.rules[i];
        if (!rule || typeof rule.ruleNumber !== 'number' || 
            (rule.card !== null && typeof rule.card !== 'number')) {
            return false;
        }
    }

    // Validate history structure
    for (let i = 0; i < importedState.history.length; i++) {
        const item = importedState.history[i];
        if (!item || typeof item.index !== 'number' || 
            (item.card !== null && typeof item.card !== 'number')) {
            return false;
        }
    }

    return true;
}

// Show error message
function showError(message, isError = true) {
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    if (!isError) {
        errorDiv.style.background = '#4CAF50';
    }
    
    document.body.appendChild(errorDiv);

    setTimeout(() => {
        errorDiv.remove();
    }, 3000);
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}