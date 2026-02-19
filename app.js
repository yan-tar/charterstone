// Application state
let state = {
    rules: [],
    history: [],
    minions: [] // Dynamic list: [{ card: 227, new: true }, ...]
};

let language = 'ru';
let currentCard = null;
let placementType = null; // 'rules' | 'history'
let navigationContext = null; // { type: 'rule' | 'history' | 'minion', currentIndex: number }
let navigationStack = null;   // { type: 'crate', crateId: string }
let cratesData = null;

const categoryInfo = {
    story:          { title: 'ИСТОРИЯ',      subtitle: 'прочитать первым' },
    rules:          { title: 'ПРАВИЛА',       subtitle: 'прочитать после истории (если есть)' },
    various:        { title: 'РАЗНОЕ',        subtitle: 'см. инструкции' },
    gain:           { title: 'ПОЛУЧИТЬ',      subtitle: 'получает игрок, открывший ящик' },
    general_supply: { title: 'ОБЩИЙ ЗАПАС',   subtitle: '' },
    tuckbox:        { title: 'КОРОБКА',       subtitle: 'для iv, извлечь только один тип жетонов' }
};

function isDesktop() {
    return !('ontouchstart' in window || navigator.maxTouchPoints > 0);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

async function init() {
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage) { language = savedLanguage; updateLanguageButtons(); }

    try {
        const r = await fetch('crates.json');
        if (r.ok) cratesData = await r.json();
    } catch (e) { console.error('Error loading crates data:', e); }

    let initialState;
    try {
        const r = await fetch('initialState.json');
        if (!r.ok) throw new Error('Failed to load initial state');
        initialState = await r.json();
    } catch (e) {
        showError('Ошибка загрузки начального состояния');
        console.error(e);
        return;
    }

    const savedState          = localStorage.getItem('state');
    const savedCurrentVersion = localStorage.getItem('currentVersion');

    if (savedState) {
        try {
            const parsed         = JSON.parse(savedState);
            const currentVersion = savedCurrentVersion
                ? parseInt(savedCurrentVersion)
                : (initialState.version || 1);

            document.getElementById('versionInput').value = currentVersion;

            const initialVersion = initialState.version || 1;
            if (initialVersion > currentVersion) {
                // Auto-update but preserve minions from old save
                state          = { ...initialState };
                state.minions  = Array.isArray(parsed.minions) ? parsed.minions : [];
                saveState();
                localStorage.setItem('currentVersion', initialVersion.toString());
                document.getElementById('versionInput').value = initialVersion;
                showError(`Правила обновлены до версии ${initialVersion}`, false);
            } else {
                state = parsed;
                if (!state.minions) state.minions = [];
            }
        } catch (e) {
            console.error('Error parsing saved state:', e);
            state         = initialState;
            state.minions = [];
            saveState();
            const version = initialState.version || 1;
            localStorage.setItem('currentVersion', version.toString());
            document.getElementById('versionInput').value = version;
        }
    } else {
        state         = initialState;
        state.minions = [];
        saveState();
        const version = initialState.version || 1;
        localStorage.setItem('currentVersion', version.toString());
        document.getElementById('versionInput').value = version;
    }

    setupEventListeners();
    renderCurrentTab();
}

async function loadInitialState() {
    try {
        const r = await fetch('initialState.json');
        if (!r.ok) throw new Error('Failed to load initial state');
        const loaded       = await r.json();
        const savedMinions = state.minions || []; // preserve minions on reset
        state              = loaded;
        state.minions      = savedMinions;
        saveState();
    } catch (e) {
        showError('Ошибка загрузки начального состояния');
        console.error(e);
    }
}

function saveState()    { localStorage.setItem('state',    JSON.stringify(state)); }
function saveLanguage() { localStorage.setItem('language', language); }

// ─── EVENTS ───────────────────────────────────────────────────────────────────

function setupEventListeners() {
    document.getElementById('openCardBtn').addEventListener('click', openCard);
    document.getElementById('archiveNumInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') openCard();
    });

    document.getElementById('openCrateBtn').addEventListener('click', openCrate);
    document.getElementById('crateInput').addEventListener('keypress', e => {
        if (e.key === 'Enter') openCrate();
    });

    document.getElementById('langRu').addEventListener('click', () => switchLanguage('ru'));
    document.getElementById('langEn').addEventListener('click', () => switchLanguage('en'));

    document.querySelectorAll('.tab-btn').forEach(btn =>
        btn.addEventListener('click', () => switchTab(btn.dataset.tab))
    );

    document.getElementById('closeDialog').addEventListener('click', closeCardDialog);
    document.getElementById('closeCrateDialog').addEventListener('click', closeCrateDialog);
    document.getElementById('placeInRulesBtn').addEventListener('click', () => showPlacementDialog('rules'));
    document.getElementById('placeInHistoryBtn').addEventListener('click', () => showPlacementDialog('history'));
    document.getElementById('placeInMinionsBtn').addEventListener('click', placeInMinions);
    document.getElementById('backToCrateBtn').addEventListener('click', returnToCrate);
    document.getElementById('prevCardBtn').addEventListener('click', navigateToPrevCard);
    document.getElementById('nextCardBtn').addEventListener('click', navigateToNextCard);

    document.getElementById('placementForm').addEventListener('submit', e => {
        e.preventDefault(); confirmPlacement();
    });
    document.getElementById('cancelPlacement').addEventListener('click', closePlacementDialog);

    document.getElementById('exportBtn').addEventListener('click', exportState);
    document.getElementById('importBtn').addEventListener('click', () =>
        document.getElementById('importFile').click()
    );
    document.getElementById('importFile').addEventListener('change', importState);
    document.getElementById('resetBtn').addEventListener('click', resetToInitial);

    document.getElementById('versionInput').addEventListener('change', e => {
        const version = parseInt(e.target.value) || 1;
        localStorage.setItem('currentVersion', version.toString());
        showError(`Версия закреплена: ${version}`, false);
    });

    document.getElementById('cardDialog').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeCardDialog();
    });
    document.getElementById('placementDialog').addEventListener('click', e => {
        if (e.target === e.currentTarget) closePlacementDialog();
    });
    document.getElementById('crateDialog').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeCrateDialog();
    });
}

// ─── LANGUAGE ─────────────────────────────────────────────────────────────────

function switchLanguage(lang) {
    language = lang;
    saveLanguage();
    updateLanguageButtons();
    renderCurrentTab();

    if (currentCard !== null && document.getElementById('cardDialog').open) {
        const spinner   = document.getElementById('loadingSpinner');
        const cardImage = document.getElementById('cardImage');
        spinner.style.display   = 'flex';
        cardImage.style.display = 'none';
        loadCardImage()
            .then(() => { spinner.style.display = 'none'; cardImage.style.display = 'block'; })
            .catch(() => { spinner.style.display = 'none'; showError('Ошибка загрузки изображения'); });
    }
}

function updateLanguageButtons() {
    document.getElementById('langRu').classList.toggle('active', language === 'ru');
    document.getElementById('langEn').classList.toggle('active', language === 'en');
}

// ─── TABS ─────────────────────────────────────────────────────────────────────

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn =>
        btn.classList.toggle('active', btn.dataset.tab === tabName)
    );
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    if (tabName === 'rules') {
        document.getElementById('rulesTab').classList.add('active');
        renderRules();
    } else if (tabName === 'history') {
        document.getElementById('historyTab').classList.add('active');
        renderHistory();
        renderMinions();
    }
}

function renderCurrentTab() {
    const active = document.querySelector('.tab-btn.active');
    if (active) switchTab(active.dataset.tab);
}

// ─── OPEN CARD ────────────────────────────────────────────────────────────────

async function openCard() {
    const input      = document.getElementById('archiveNumInput');
    const cardNumber = parseInt(input.value);
    if (!cardNumber || cardNumber < 1) {
        showError('Введите корректный номер карточки'); return;
    }

    const openBtn        = document.getElementById('openCardBtn');
    openBtn.disabled     = true;
    openBtn.textContent  = 'Загрузка...';

    try {
        const exists = await checkImageExists(cardNumber);
        if (!exists) {
            showError(`Карточка №${cardNumber} не найдена`);
            openBtn.disabled    = false;
            openBtn.textContent = 'Открыть';
            return;
        }
        currentCard     = cardNumber;
        navigationContext = null;
        showCardDialog();
        openBtn.disabled    = false;
        openBtn.textContent = 'Открыть';
    } catch (e) {
        showError('Ошибка при загрузке карточки');
        console.error(e);
        openBtn.disabled    = false;
        openBtn.textContent = 'Открыть';
    }
}

function checkImageExists(cardNumber, lang) {
    return new Promise(resolve => {
        const pLang = lang || language;
        const fLang = pLang === 'ru' ? 'en' : 'ru';
        const img   = new Image();
        img.onload  = () => resolve(true);
        img.onerror = () => {
            const fb    = new Image();
            fb.onload  = () => resolve(true);
            fb.onerror = () => resolve(false);
            fb.src = `cards/${fLang}/${cardNumber}.jpg`;
        };
        img.src = `cards/${pLang}/${cardNumber}.jpg`;
    });
}

// ─── CARD DIALOG ──────────────────────────────────────────────────────────────

function showCardDialog() {
    const dialog    = document.getElementById('cardDialog');
    const actions   = document.getElementById('dialogActions');
    const nav       = document.getElementById('cardNavigation');
    const spinner   = document.getElementById('loadingSpinner');
    const cardImage = document.getElementById('cardImage');
    const backBtn   = document.getElementById('backToCrateBtn');

    spinner.style.display   = 'flex';
    cardImage.style.display = 'none';
    actions.style.display   = 'none';
    backBtn.style.display   = navigationStack ? 'block' : 'none';

    if (!dialog.open) dialog.showModal();

    loadCardImage().then(() => {
        spinner.style.display   = 'none';
        cardImage.style.display = 'block';

        if (navigationContext) {
            nav.style.display = 'flex';
            updateNavigationUI();
            actions.style.display = 'none';
        } else {
            nav.style.display = 'none';
            if (!isCardPlaced(currentCard)) {
                actions.style.display = 'flex';
            }
        }
    }).catch(() => {
        spinner.style.display = 'none';
        showError('Ошибка загрузки изображения');
        closeCardDialog();
    });
}

function loadCardImage() {
    return new Promise((resolve, reject) => {
        const img   = document.getElementById('cardImage');
        const fLang = language === 'ru' ? 'en' : 'ru';
        const pPath = `cards/${language}/${currentCard}.jpg`;
        const fPath = `cards/${fLang}/${currentCard}.jpg`;

        const temp    = new Image();
        temp.onload  = () => { img.src = pPath; resolve(); };
        temp.onerror = () => {
            const fb    = new Image();
            fb.onload  = () => { img.src = fPath; resolve(); };
            fb.onerror = () => reject(new Error('Failed to load image in both languages'));
            fb.src = fPath;
        };
        temp.src = pPath;
    });
}

function closeCardDialog() {
    if (navigationStack && navigationStack.type === 'crate') {
        returnToCrate(); return;
    }
    document.getElementById('cardDialog').close();
    currentCard       = null;
    navigationContext = null;
    if (isDesktop()) setTimeout(() => document.getElementById('archiveNumInput').focus(), 100);
}

// ─── CRATE ↔ CARD ─────────────────────────────────────────────────────────────

function openCardFromCrate(cardNumber) {
    navigationStack = {
        type:    'crate',
        crateId: document.getElementById('crateTitle').textContent.replace('Ящик ', '')
    };
    document.getElementById('crateDialog').style.display = 'none';
    currentCard       = cardNumber;
    navigationContext = null;
    showCardDialog();
}

function returnToCrate() {
    if (!navigationStack || navigationStack.type !== 'crate') return;
    document.getElementById('cardDialog').close();
    currentCard       = null;
    navigationContext = null;
    document.getElementById('crateDialog').style.display = '';
    navigationStack   = null;
}

// ─── PLACEMENT ────────────────────────────────────────────────────────────────

function isCardPlaced(cardNumber) {
    return state.rules.some(r => r.card === cardNumber)
        || state.history.some(h => h.card === cardNumber)
        || state.minions.some(m => m.card === cardNumber);
}

function showPlacementDialog(type) {
    placementType    = type;
    const title      = document.getElementById('placementTitle');
    const input      = document.getElementById('slotInput');

    if (type === 'rules') {
        title.textContent = 'Выберите правило (1-29)';
        input.setAttribute('max', '29');
        input.value = '';
    } else if (type === 'history') {
        title.textContent = 'Выберите слот истории (1-18)';
        input.setAttribute('max', '18');
        input.value = findNearestEmptyHistorySlot() || '';
    }

    document.getElementById('placementDialog').showModal();
}

function closePlacementDialog() {
    document.getElementById('placementDialog').close();
    placementType = null;
    if (isDesktop()) setTimeout(() => document.getElementById('archiveNumInput').focus(), 100);
}

function findNearestEmptyHistorySlot() {
    for (const h of state.history) {
        if (h.card === null) return h.index;
    }
    return null;
}

function confirmPlacement() {
    const slotNumber = parseInt(document.getElementById('slotInput').value);
    if (!slotNumber || slotNumber < 1) { showError('Введите корректный номер слота'); return; }

    if (placementType === 'rules') {
        if (slotNumber > 29) { showError('Номер правила должен быть от 1 до 29'); return; }
        placeCardInRules(currentCard, slotNumber);
    } else if (placementType === 'history') {
        if (slotNumber > 18) { showError('Номер слота должен быть от 1 до 18'); return; }
        placeCardInHistory(currentCard, slotNumber);
    }

    closePlacementDialog();
    closeCardDialog();
    renderCurrentTab();
}

function placeCardInRules(cardNumber, ruleNumber) {
    removeCardFromEverywhere(cardNumber);
    const idx = state.rules.findIndex(r => r.ruleNumber === ruleNumber);
    if (idx !== -1) { state.rules[idx].card = cardNumber; state.rules[idx].new = true; saveState(); }
}

function placeCardInHistory(cardNumber, index) {
    removeCardFromEverywhere(cardNumber);
    const idx = state.history.findIndex(h => h.index === index);
    if (idx !== -1) { state.history[idx].card = cardNumber; state.history[idx].new = true; saveState(); }
}

// Add card to minions list (no slot selection — always appends)
function placeInMinions() {
    if (!currentCard) return;
    if (state.minions.some(m => m.card === currentCard)) return;
    removeCardFromEverywhere(currentCard);
    state.minions.push({ card: currentCard, new: true });
    saveState();
    closeCardDialog();
    renderCurrentTab();
}

function removeCardFromEverywhere(cardNumber) {
    state.rules.forEach(r => {
        if (r.card === cardNumber) { r.card = null; delete r.new; }
    });
    state.history.forEach(h => {
        if (h.card === cardNumber) { h.card = null; delete h.new; }
    });
    // Minions: remove entry entirely (dynamic list, no empty slots)
    state.minions = state.minions.filter(m => m.card !== cardNumber);
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function renderRules() {
    const container = document.getElementById('rulesList');
    container.innerHTML = '';
    state.rules.forEach(rule =>
        container.appendChild(createSlotElement(rule.ruleNumber, rule.card, 'rule'))
    );
}

function renderHistory() {
    const container = document.getElementById('historyList');
    container.innerHTML = '';
    state.history.forEach(item =>
        container.appendChild(createSlotElement(item.index, item.card, 'history'))
    );
}

function renderMinions() {
    const container = document.getElementById('minionsList');
    container.innerHTML = '';

    if (!state.minions || state.minions.length === 0) {
        const empty = document.createElement('p');
        empty.className   = 'minions-empty';
        empty.textContent = 'Нет открытых карточек миньонов';
        container.appendChild(empty);
        return;
    }

    state.minions.forEach((item, idx) => {
        const slot = document.createElement('div');
        slot.className = 'slot' + (item.new ? ' new' : '');

        const img   = document.createElement('img');
        img.className     = 'slot-thumbnail';
        img.src           = `cards/${language}/${item.card}.jpg`;
        img.alt           = `Card ${item.card}`;
        img.loading       = 'lazy';
        slot.appendChild(img);

        slot.addEventListener('click', () => {
            currentCard       = item.card;
            navigationContext = { type: 'minion', currentIndex: idx };
            showCardDialog();
        });

        container.appendChild(slot);
    });
}

function createSlotElement(number, cardNumber, type) {
    const slotData = type === 'rule'
        ? state.rules.find(r => r.ruleNumber === number)
        : state.history.find(h => h.index === number);

    const slot = document.createElement('div');
    slot.className = cardNumber ? 'slot' : 'slot empty';
    if (slotData && slotData.new === true) slot.classList.add('new');

    const numSpan       = document.createElement('span');
    numSpan.className   = 'slot-number';
    numSpan.textContent = `#${number}`;
    slot.appendChild(numSpan);

    if (cardNumber) {
        const thumb   = document.createElement('img');
        thumb.className = 'slot-thumbnail';
        thumb.src       = `cards/${language}/${cardNumber}.jpg`;
        thumb.alt       = `Card ${cardNumber}`;
        thumb.loading   = 'lazy';
        slot.appendChild(thumb);
        slot.addEventListener('click', () => openCardWithNavigation(cardNumber, type, number));
    } else {
        const empty       = document.createElement('span');
        empty.className   = 'slot-empty-text';
        empty.textContent = 'Пусто';
        slot.appendChild(empty);
    }

    return slot;
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────

function openCardWithNavigation(cardNumber, type, slotNumber) {
    currentCard       = cardNumber;
    const list        = type === 'rule' ? state.rules : state.history;
    const index       = list.findIndex(item =>
        (type === 'rule' ? item.ruleNumber : item.index) === slotNumber
    );
    navigationContext = { type, currentIndex: index };
    showCardDialog();
}

function getNavList() {
    if (!navigationContext) return [];
    if (navigationContext.type === 'rule')    return state.rules;
    if (navigationContext.type === 'history') return state.history;
    if (navigationContext.type === 'minion')  return state.minions;
    return [];
}

function itemHasCard(item) {
    // Minion entries always have a card; rule/history may be null
    return item && (navigationContext.type === 'minion' || item.card !== null);
}

function navigateToPrevCard() {
    if (!navigationContext) return;
    const list = getNavList();
    for (let i = navigationContext.currentIndex - 1; i >= 0; i--) {
        if (itemHasCard(list[i])) {
            navigationContext.currentIndex = i;
            currentCard = list[i].card;
            reloadCardImage();
            return;
        }
    }
}

function navigateToNextCard() {
    if (!navigationContext) return;
    const list = getNavList();
    for (let i = navigationContext.currentIndex + 1; i < list.length; i++) {
        if (itemHasCard(list[i])) {
            navigationContext.currentIndex = i;
            currentCard = list[i].card;
            reloadCardImage();
            return;
        }
    }
}

function reloadCardImage() {
    const spinner   = document.getElementById('loadingSpinner');
    const cardImage = document.getElementById('cardImage');
    spinner.style.display   = 'flex';
    cardImage.style.display = 'none';
    loadCardImage()
        .then(() => { spinner.style.display = 'none'; cardImage.style.display = 'block'; updateNavigationUI(); })
        .catch(() => { spinner.style.display = 'none'; showError('Ошибка загрузки изображения'); });
}

function updateNavigationUI() {
    if (!navigationContext) return;
    const list    = getNavList();
    const current = list[navigationContext.currentIndex];

    let label;
    if (navigationContext.type === 'rule') {
        label = `Правило #${current.ruleNumber}`;
    } else if (navigationContext.type === 'history') {
        label = `История #${current.index}`;
    } else {
        label = `Миньон ${navigationContext.currentIndex + 1} из ${list.length}`;
    }
    document.getElementById('navInfo').textContent = label;

    let hasPrev = false;
    for (let i = navigationContext.currentIndex - 1; i >= 0; i--) {
        if (itemHasCard(list[i])) { hasPrev = true; break; }
    }
    let hasNext = false;
    for (let i = navigationContext.currentIndex + 1; i < list.length; i++) {
        if (itemHasCard(list[i])) { hasNext = true; break; }
    }

    document.getElementById('prevCardBtn').disabled = !hasPrev;
    document.getElementById('nextCardBtn').disabled = !hasNext;
}

// ─── CRATE DIALOG ─────────────────────────────────────────────────────────────

function openCrate() {
    const crateId = document.getElementById('crateInput').value.trim().toUpperCase();
    if (!crateId)      { showError('Введите номер ящика');          return; }
    if (!cratesData)   { showError('Данные ящиков не загружены');   return; }
    const content = cratesData[crateId];
    if (!content)      { showError('Ящик не найден');               return; }
    showCrateDialog(crateId, content);
}

function parseCardRange(value) {
    const str = String(value).trim();
    const rm  = str.match(/^(\d+)\s*[–-]\s*(\d+)$/);
    if (rm) {
        const nums = [];
        for (let i = parseInt(rm[1]); i <= parseInt(rm[2]); i++) nums.push(i);
        return nums;
    }
    const sm = str.match(/^(\d+)$/);
    return sm ? [parseInt(sm[1])] : null;
}

function showCrateDialog(crateId, crateContent) {
    const dialog       = document.getElementById('crateDialog');
    const title        = document.getElementById('crateTitle');
    const content      = document.getElementById('crateContent');
    const notification = document.getElementById('crateNotification');

    title.textContent     = `Ящик ${crateId}`;
    content.innerHTML     = '';
    notification.style.display = 'none';
    navigationStack       = null;

    // Auto-place story cards
    if (crateContent.story && crateContent.story.length > 0) {
        const storyCards = [];
        crateContent.story.forEach(item => {
            const nums = parseCardRange(item.value);
            if (nums) nums.forEach(n => storyCards.push(n));
        });
        if (storyCards.length > 0) {
            const result = placeStoryCards(storyCards);
            if (result.message) {
                notification.textContent = result.message;
                notification.className   = 'crate-notification ' + (result.placed > 0 ? 'success' : 'info');
                notification.style.display = 'block';
            }
        }
    }

    ['story', 'rules', 'various', 'gain', 'general_supply', 'tuckbox'].forEach(key => {
        const data = crateContent[key];
        if (!data) return;

        const info   = categoryInfo[key];
        const catDiv = document.createElement('div');
        catDiv.className = 'crate-category';

        const tDiv       = document.createElement('div');
        tDiv.className   = 'crate-category-title';
        tDiv.textContent = info.title;
        catDiv.appendChild(tDiv);

        if (info.subtitle) {
            const sub       = document.createElement('div');
            sub.className   = 'crate-category-subtitle';
            sub.textContent = `(${info.subtitle})`;
            catDiv.appendChild(sub);
        }

        const ul = document.createElement('ul');
        ul.className = 'crate-items';

        if (key === 'tuckbox') {
            const li       = document.createElement('li');
            li.className   = 'crate-item';
            li.textContent = `- ${data.value}`;
            if (data.note) {
                const n       = document.createElement('span');
                n.className   = 'crate-item-note';
                n.textContent = ` (${data.note})`;
                li.appendChild(n);
            }
            ul.appendChild(li);
        } else {
            data.forEach(cardItem => {
                const li = document.createElement('li');
                li.className = 'crate-item';
                li.appendChild(document.createTextNode('- '));

                const nums = parseCardRange(cardItem.value);
                if (nums && nums.length > 0) {
                    nums.forEach((num, idx) => {
                        if (idx > 0) li.appendChild(document.createTextNode('–'));
                        const link       = document.createElement('span');
                        link.className   = 'card-link';
                        link.textContent = String(num);
                        link.addEventListener('click', () => openCardFromCrate(num));
                        li.appendChild(link);
                    });

                    const placement = findCardPlacement(nums[0]);
                    if (placement) {
                        const sp       = document.createElement('span');
                        sp.className   = 'crate-item-placed';
                        sp.textContent = ` [${placement}]`;
                        li.appendChild(sp);
                    }
                } else {
                    li.appendChild(document.createTextNode(String(cardItem.value)));
                }

                if (cardItem.note) {
                    const n       = document.createElement('span');
                    n.className   = 'crate-item-note';
                    n.textContent = ` (${cardItem.note})`;
                    li.appendChild(n);
                }
                ul.appendChild(li);
            });
        }

        catDiv.appendChild(ul);
        content.appendChild(catDiv);
    });

    dialog.showModal();
}

function closeCrateDialog() {
    navigationStack = null;
    document.getElementById('crateDialog').close();
    document.getElementById('crateDialog').style.display = '';
}

function findCardPlacement(cardNumber) {
    const rule = state.rules.find(r => r.card === cardNumber);
    if (rule) return `Правило #${rule.ruleNumber}`;
    const hist = state.history.find(h => h.card === cardNumber);
    if (hist) return `История #${hist.index}`;
    const mIdx = state.minions.findIndex(m => m.card === cardNumber);
    if (mIdx !== -1) return `Миньон #${mIdx + 1}`;
    return null;
}

// ─── STORY AUTO-PLACEMENT ─────────────────────────────────────────────────────

function placeStoryCards(cardNumbers) {
    let placed = 0, skipped = 0;

    cardNumbers.forEach(cardNumber => {
        if (state.history.some(h => h.card === cardNumber)) { skipped++; return; }
        const slot = state.history.find(h => h.card === null);
        if (slot) { slot.card = cardNumber; slot.new = true; placed++; }
    });

    if (placed > 0 || skipped > 0) {
        saveState();
        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.tab === 'history') renderHistory();

        let message = '';
        if (skipped > 0 && placed > 0) {
            const sw = skipped === 1 ? 'карта уже была размещена' : (skipped < 5 ? 'карты уже были размещены' : 'карт уже были размещены');
            const pw = placed  === 1 ? 'добавлена 1 новая'        : (placed  < 5 ? `добавлены ${placed} новые`  : `добавлено ${placed} новых`);
            message = `${skipped} ${sw}, ${pw}`;
        } else if (skipped > 0) {
            const sw = skipped === 1 ? 'карта уже была размещена' : (skipped < 5 ? 'карты уже были размещены' : 'карт уже были размещены');
            message = `${skipped} ${sw}`;
        } else {
            const cw = placed === 1 ? 'карта' : (placed < 5 ? 'карты' : 'карт');
            message = `Размещено: ${placed} ${cw} в историю`;
        }

        return { message, placed, skipped };
    }

    return { message: '', placed: 0, skipped: 0 };
}

// ─── RESET / EXPORT / IMPORT ──────────────────────────────────────────────────

async function resetToInitial() {
    if (!confirm('Сбросить все данные до начального состояния? Все изменения будут потеряны.')) return;
    try {
        await loadInitialState();
        const version = state.version || 1;
        localStorage.setItem('currentVersion', version.toString());
        document.getElementById('versionInput').value = version;
        renderCurrentTab();
        showError('Данные сброшены до начального состояния', false);
    } catch (e) {
        showError('Ошибка при сбросе данных'); console.error(e);
    }
}

function exportState() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `charterstone-state-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

async function importState(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const imported = JSON.parse(await file.text());
        if (!validateState(imported)) { showError('Неверная структура файла'); return; }
        state = imported;
        if (!state.minions) state.minions = [];
        saveState();
        renderCurrentTab();
        showError('Импорт выполнен успешно', false);
    } catch (e) {
        showError('Ошибка импорта файла'); console.error(e);
    }
    event.target.value = '';
}

function validateState(s) {
    if (!s || typeof s !== 'object')                                  return false;
    if (s.version !== undefined && typeof s.version !== 'number')     return false;
    if (!Array.isArray(s.rules)   || s.rules.length   !== 29)        return false;
    if (!Array.isArray(s.history) || s.history.length !== 18)        return false;
    if (s.minions !== undefined   && !Array.isArray(s.minions))       return false;

    for (const r of s.rules) {
        if (!r || typeof r.ruleNumber !== 'number'
            || (r.card !== null && typeof r.card !== 'number')
            || (r.new !== undefined && typeof r.new !== 'boolean')) return false;
    }
    for (const h of s.history) {
        if (!h || typeof h.index !== 'number'
            || (h.card !== null && typeof h.card !== 'number')
            || (h.new !== undefined && typeof h.new !== 'boolean')) return false;
    }
    return true;
}

// ─── TOAST ────────────────────────────────────────────────────────────────────

function showError(message, isError = true) {
    document.querySelector('.error-message')?.remove();
    const div       = document.createElement('div');
    div.className   = 'error-message';
    div.textContent = message;
    if (!isError) div.style.background = '#4CAF50';
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}