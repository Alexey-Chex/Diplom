const GREEN_BLINK_SECONDS = 3;
const DEFAULT_YELLOW_SECONDS = 3;
const RED_YELLOW_SECONDS = 0;
const DEFAULT_GREEN_SECONDS = 10;
const PEDESTRIAN_OFFSET_SECONDS = 0;
const PEDESTRIAN_BLINK_SECONDS = 3;
const MAX_SWITCH_HISTORY_ITEMS = 100;

const processingStarted = document.body.dataset.processed === 'true' || document.querySelector('.stream-frame') !== null;

const groups = {
    horizontal: ['left', 'right'],
    vertical: ['top', 'bottom']
};

const phases = {
    NS: { group: 'vertical', label: 'верх/низ', green: 'green_ns', opposite: 'EW' },
    EW: { group: 'horizontal', label: 'лево/право', green: 'green_ew', opposite: 'NS' }
};

const pedestrianGroups = {
    NS: ['left', 'right'],
    EW: ['top', 'bottom']
};

let trafficLoopStarted = false;
let latestData = null;
let nextPhaseForPanel = null;
let preparedNextPlan = null;
let nextPlanLocked = false;
let switchHistory = [];
let selectedHistoryDate = getTodayKey();

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function num(value, fallback = 0) {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}
function sec(value) { return Math.max(0, Math.ceil(value)) + ' сек'; }
function pad(value) { return String(value).padStart(2, '0'); }
function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
function getClockTime(date) {
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
function formatDateLabel(dateKey) {
    if (!dateKey || !dateKey.includes('-')) return dateKey || '';
    const [year, month, day] = dateKey.split('-');
    return `${day}.${month}.${year}`;
}
function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function queue(data, phase) {
    if (!data) return 0;
    if (phase === 'NS') return num(data.phase_ns_queue, num(data.top) + num(data.bottom));
    return num(data.phase_ew_queue, num(data.left) + num(data.right));
}

function greenTime(data, phase) {
    if (!data) return DEFAULT_GREEN_SECONDS;
    return clamp(Math.round(num(data[phases[phase].green], DEFAULT_GREEN_SECONDS)), 5, 60);
}

function yellowTime(data) {
    return clamp(Math.round(num(data?.yellow_time, DEFAULT_YELLOW_SECONDS)), 1, 10);
}

function redTimeFor(green, yellow) {
    return green + yellow + RED_YELLOW_SECONDS;
}

function pedestrianGreenFor(carGreen) {
    return Math.max(0, carGreen - PEDESTRIAN_OFFSET_SECONDS);
}

function pedestrianLabelForPhase(phase) {
    return phase === 'NS' ? 'лево/право' : 'верх/низ';
}

function firstPhase(data) {
    return queue(data, 'EW') > queue(data, 'NS') ? 'EW' : 'NS';
}

function makePlan(data, phase) {
    const green = greenTime(data, phase);
    const yellow = yellowTime(data);
    return {
        phase,
        green,
        yellow,
        red: redTimeFor(green, yellow),
        pedestrianGreen: pedestrianGreenFor(green)
    };
}

function showNextPlan(plan) {
    if (!plan) return;
    text('next-phase', phases[plan.phase].label);
    text('next-green', plan.green + ' сек');
    text('next-red', plan.red + ' сек');
}

function prepareNextPlan(data, phase, force = false) {
    if (!data || !data.processing_started || !phase) return null;

    if (nextPlanLocked && !force && preparedNextPlan) {
        showNextPlan(preparedNextPlan);
        return preparedNextPlan;
    }

    preparedNextPlan = makePlan(data, phase);
    showNextPlan(preparedNextPlan);
    return preparedNextPlan;
}

function injectSwitchHistoryStyles() {
    if (document.getElementById('switch-history-styles')) return;

    const style = document.createElement('style');
    style.id = 'switch-history-styles';
    style.textContent = `
        .switch-history-toggle {
            position: fixed;
            top: 50%;
            right: 0;
            transform: translateY(-50%);
            z-index: 120;
            width: 42px;
            min-height: 132px;
            padding: 10px 6px;
            border: none;
            border-radius: 12px 0 0 12px;
            background: #2f6fed;
            color: #fff;
            font-weight: 700;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.3);
            cursor: pointer;
            writing-mode: vertical-rl;
            text-orientation: mixed;
            transition: transform 0.25s ease, opacity 0.2s ease;
        }

        .switch-history-toggle.hidden {
            opacity: 0;
            pointer-events: none;
            transform: translate(100%, -50%);
        }

        .switch-history-toggle span {
            display: block;
            transform: rotate(180deg);
        }

        .switch-history-panel {
            position: fixed;
            top: 0;
            right: 0;
            z-index: 119;
            width: 420px;
            max-width: calc(100vw - 28px);
            height: 100vh;
            padding: 18px;
            box-sizing: border-box;
            background: rgba(255, 255, 255, 0.98);
            border-left: 3px solid #2f6fed;
            box-shadow: -8px 0 24px rgba(0, 0, 0, 0.28);
            transform: translateX(100%);
            transition: transform 0.25s ease;
            overflow-y: auto;
        }

        .switch-history-panel.open {
            transform: translateX(0);
        }

        .switch-history-close {
            position: fixed;
            top: 50%;
            right: 398px;
            transform: translateY(-50%);
            z-index: 121;
            width: 46px;
            height: 46px;
            padding: 0;
            border: none;
            border-radius: 50%;
            background: #2f6fed;
            color: #fff;
            font-size: 30px;
            font-weight: 800;
            line-height: 46px;
            text-align: center;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.32);
            cursor: pointer;
        }

        .switch-history-panel h2 {
            margin: 0 0 12px;
            color: #173b8f;
            font-size: 22px;
            text-align: left;
        }

        .switch-history-controls {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-bottom: 12px;
        }

        .switch-history-controls button,
        .switch-history-controls input {
            width: 100%;
            height: 38px;
            box-sizing: border-box;
            border-radius: 8px;
            font-size: 14px;
        }

        .switch-history-controls button {
            padding: 8px;
            background: #2f6fed;
            color: white;
            border: none;
            font-weight: 700;
        }

        .switch-history-controls input {
            padding: 7px 9px;
            border: 1px solid #b8c8f5;
            background: #fff;
            color: #173b8f;
        }

        .switch-history-full-button {
            grid-column: 1 / -1;
            background: #173b8f !important;
        }

        .switch-history-note {
            margin: 0 0 12px;
            padding: 9px 10px;
            border-radius: 9px;
            background: #f3f7ff;
            color: #4d5f88;
            font-size: 13px;
            text-align: left;
            line-height: 1.35;
        }

        .switch-history-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .switch-history-empty {
            padding: 14px;
            border-radius: 10px;
            background: #f8faff;
            border: 1px dashed #9ab5ef;
            color: #52617d;
            font-size: 14px;
            text-align: left;
            line-height: 1.4;
        }

        .switch-history-item {
            padding: 12px;
            border-radius: 12px;
            background: #ffffff;
            border: 1px solid #c8d8ff;
            box-shadow: 0 3px 10px rgba(23, 59, 143, 0.12);
            text-align: left;
        }

        .switch-history-time {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            color: #173b8f;
            font-weight: 800;
            font-size: 16px;
        }

        .switch-history-date {
            color: #6b7898;
            font-size: 12px;
            font-weight: 600;
        }

        .switch-history-row {
            margin: 4px 0;
            color: #26324f;
            font-size: 13px;
            line-height: 1.35;
        }

        .switch-history-row strong {
            color: #173b8f;
        }

        .switch-history-counts {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 5px;
            margin-top: 8px;
        }

        .switch-history-counts span {
            padding: 5px 7px;
            border-radius: 7px;
            background: #f3f7ff;
            color: #26324f;
            font-size: 12px;
        }
    `;

    document.head.appendChild(style);
}

function openSwitchHistoryPanel() {
    const panel = document.getElementById('switch-history-panel');
    const toggle = document.getElementById('switch-history-toggle');

    if (panel) panel.classList.add('open');
    if (toggle) toggle.classList.add('hidden');
}

function closeSwitchHistoryPanel() {
    const panel = document.getElementById('switch-history-panel');
    const toggle = document.getElementById('switch-history-toggle');

    if (panel) panel.classList.remove('open');
    if (toggle) toggle.classList.remove('hidden');
}

function createSwitchHistoryPanel() {
    if (document.getElementById('switch-history-panel')) return;

    injectSwitchHistoryStyles();

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'switch-history-toggle';
    toggle.className = 'switch-history-toggle';
    toggle.innerHTML = '<span>‹ История</span>';

    const panel = document.createElement('aside');
    panel.id = 'switch-history-panel';
    panel.className = 'switch-history-panel';
    panel.innerHTML = `
        <button type="button" id="switch-history-close" class="switch-history-close" aria-label="Закрыть историю">›</button>
        <h2>История переключений</h2>
        <div class="switch-history-controls">
            <button type="button" id="switch-history-today">Сегодня</button>
            <input type="date" id="switch-history-date" value="${selectedHistoryDate}">
            <button type="button" id="switch-history-full" class="switch-history-full-button">Вся история переключений</button>
        </div>
        <p class="switch-history-note">
            Пока база данных не подключена, история хранится только в рамках текущей симуляции и очищается при сбросе или новом запуске обработки.
        </p>
        <div id="switch-history-list" class="switch-history-list"></div>
    `;

    document.body.appendChild(panel);
    document.body.appendChild(toggle);

    toggle.addEventListener('click', openSwitchHistoryPanel);

    const closeButton = document.getElementById('switch-history-close');
    const todayButton = document.getElementById('switch-history-today');
    const dateInput = document.getElementById('switch-history-date');
    const fullHistoryButton = document.getElementById('switch-history-full');

    if (closeButton) closeButton.addEventListener('click', closeSwitchHistoryPanel);

    if (todayButton) {
        todayButton.addEventListener('click', () => {
            selectedHistoryDate = getTodayKey();
            if (dateInput) dateInput.value = selectedHistoryDate;
            renderSwitchHistory();
        });
    }

    if (dateInput) {
        dateInput.addEventListener('change', () => {
            selectedHistoryDate = dateInput.value || getTodayKey();
            renderSwitchHistory();
        });
    }

    if (fullHistoryButton) {
        fullHistoryButton.addEventListener('click', openFullSwitchHistoryWindow);
    }

    renderSwitchHistory();
}

function buildSwitchHistoryItemHtml(item) {
    return `
        <article class="switch-history-item">
            <div class="switch-history-time">
                <span>${escapeHtml(item.time)}</span>
                <span class="switch-history-date">${escapeHtml(formatDateLabel(item.dateKey))}</span>
            </div>
            <div class="switch-history-row"><strong>Едут машины:</strong> ${escapeHtml(item.activeTransport)}</div>
            <div class="switch-history-row"><strong>Стоят машины:</strong> ${escapeHtml(item.waitingTransport)}</div>
            <div class="switch-history-row"><strong>Время:</strong> зелёный ${escapeHtml(item.green)} сек, красный ${escapeHtml(item.red)} сек</div>
            <div class="switch-history-row"><strong>Идут пешеходы:</strong> ${escapeHtml(item.activePedestrians)}</div>
            <div class="switch-history-row"><strong>Стоят пешеходы:</strong> ${escapeHtml(item.waitingPedestrians)}</div>
            <div class="switch-history-counts">
                <span>Верх: ${escapeHtml(item.counts.top)}</span>
                <span>Низ: ${escapeHtml(item.counts.bottom)}</span>
                <span>Лево: ${escapeHtml(item.counts.left)}</span>
                <span>Право: ${escapeHtml(item.counts.right)}</span>
            </div>
        </article>
    `;
}

function renderSwitchHistory() {
    const list = document.getElementById('switch-history-list');
    if (!list) return;

    const records = switchHistory.filter(item => item.dateKey === selectedHistoryDate);

    if (records.length === 0) {
        const isToday = selectedHistoryDate === getTodayKey();
        list.innerHTML = `
            <div class="switch-history-empty">
                ${isToday
                    ? 'За выбранный день пока нет переключений. Запусти обработку, и новая фаза будет записываться сюда один раз при переключении.'
                    : 'Для выбранной даты локальных записей нет. После подключения базы данных здесь можно будет смотреть историю за любой день.'}
            </div>
        `;
        return;
    }

    list.innerHTML = records.map(buildSwitchHistoryItemHtml).join('');
}

function openFullSwitchHistoryWindow() {
    const records = [...switchHistory].sort((a, b) => {
        if (a.dateKey === b.dateKey) return b.time.localeCompare(a.time);
        return b.dateKey.localeCompare(a.dateKey);
    });

    const html = `
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <title>Вся история переключений</title>
            <style>
                body {
                    margin: 0;
                    padding: 28px;
                    box-sizing: border-box;
                    font-family: Arial, sans-serif;
                    background: #eef3ff;
                    color: #26324f;
                }
                .history-page {
                    width: min(1180px, 100%);
                    margin: 0 auto;
                    padding: 24px;
                    box-sizing: border-box;
                    background: rgba(255, 255, 255, 0.97);
                    border: 2px solid #2f6fed;
                    border-radius: 18px;
                    box-shadow: 0 8px 26px rgba(0, 0, 0, 0.18);
                }
                h1 {
                    margin: 0 0 8px;
                    color: #173b8f;
                    font-size: 28px;
                }
                .subtitle {
                    margin: 0 0 18px;
                    color: #5b6784;
                    font-size: 14px;
                }
                .history-list {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
                    gap: 12px;
                }
                .switch-history-item {
                    padding: 14px;
                    border-radius: 14px;
                    background: #ffffff;
                    border: 1px solid #c8d8ff;
                    box-shadow: 0 3px 10px rgba(23, 59, 143, 0.12);
                    text-align: left;
                }
                .switch-history-time {
                    display: flex;
                    justify-content: space-between;
                    gap: 8px;
                    margin-bottom: 8px;
                    color: #173b8f;
                    font-weight: 800;
                    font-size: 17px;
                }
                .switch-history-date {
                    color: #6b7898;
                    font-size: 12px;
                    font-weight: 600;
                }
                .switch-history-row {
                    margin: 5px 0;
                    color: #26324f;
                    font-size: 14px;
                    line-height: 1.35;
                }
                .switch-history-row strong {
                    color: #173b8f;
                }
                .switch-history-counts {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                    margin-top: 9px;
                }
                .switch-history-counts span {
                    padding: 6px 8px;
                    border-radius: 8px;
                    background: #f3f7ff;
                    color: #26324f;
                    font-size: 13px;
                }
                .empty {
                    padding: 18px;
                    border-radius: 12px;
                    background: #f8faff;
                    border: 1px dashed #9ab5ef;
                    color: #52617d;
                    line-height: 1.45;
                }
            </style>
        </head>
        <body>
            <main class="history-page">
                <h1>Вся история переключений</h1>
                <p class="subtitle">Пока база данных не подключена, здесь отображается локальная история текущей симуляции.</p>
                ${records.length > 0
                    ? `<section class="history-list">${records.map(buildSwitchHistoryItemHtml).join('')}</section>`
                    : '<div class="empty">История пока пустая. Запусти обработку, и переключения фаз появятся здесь.</div>'}
            </main>
        </body>
        </html>
    `;

    const historyWindow = window.open('', '_blank');
    if (!historyWindow) return;

    historyWindow.document.open();
    historyWindow.document.write(html);
    historyWindow.document.close();
}

function clearSwitchHistory() {
    switchHistory = [];
    selectedHistoryDate = getTodayKey();

    const dateInput = document.getElementById('switch-history-date');
    if (dateInput) dateInput.value = selectedHistoryDate;

    renderSwitchHistory();
}

function addSwitchHistoryRecord(plan, data) {
    if (!plan || !data || !data.processing_started) return;

    const now = new Date();
    const phase = plan.phase;
    const waitingPhase = phases[phase].opposite;

    const record = {
        id: `${now.getTime()}-${switchHistory.length}`,
        dateKey: getTodayKey(),
        time: getClockTime(now),
        activeTransport: phases[phase].label,
        waitingTransport: phases[waitingPhase].label,
        green: plan.green,
        red: plan.red,
        activePedestrians: pedestrianLabelForPhase(phase),
        waitingPedestrians: pedestrianLabelForPhase(waitingPhase),
        counts: {
            top: num(data.top),
            bottom: num(data.bottom),
            left: num(data.left),
            right: num(data.right)
        }
    };

    switchHistory.unshift(record);
    if (switchHistory.length > MAX_SWITCH_HISTORY_ITEMS) {
        switchHistory = switchHistory.slice(0, MAX_SWITCH_HISTORY_ITEMS);
    }

    renderSwitchHistory();
}

function clearPedestrian(signal) {
    signal.classList.remove('ped-green', 'ped-red', 'ped-off');
}

function setPedestrianSignal(direction, state, seconds, visible = true) {
    const signal = document.querySelector('.pedestrian-signal[data-ped="' + direction + '"]');
    if (!signal) return;

    const timer = signal.querySelector('.ped-timer');
    clearPedestrian(signal);

    if (state === 'green' && !visible) {
        signal.classList.add('ped-off');
    } else {
        signal.classList.add(state === 'green' ? 'ped-green' : 'ped-red');
    }

    if (timer) {
        timer.textContent = Math.max(0, Math.ceil(seconds));
    }
}

function setPedestrianGroup(phase, state, seconds, visible = true) {
    pedestrianGroups[phase].forEach(direction => {
        setPedestrianSignal(direction, state, seconds, visible);
    });
}

function setAdaptiveCardState(elementId, state) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const card = element.closest('.adaptive-card');
    if (!card) return;

    card.classList.remove('adaptive-card-green', 'adaptive-card-red');
    card.classList.add(state === 'green' ? 'adaptive-card-green' : 'adaptive-card-red');
}

function setPedestrianInfo(phase, state, seconds) {
    const id = phase === 'NS' ? 'ped-left-right-info' : 'ped-up-down-info';
    const label = state === 'green' ? 'Зелёный: ' : 'Красный: ';

    text(id, label + sec(seconds));
    setAdaptiveCardState(id, state);
}

function setAllPedestriansToRed() {
    setPedestrianGroup('NS', 'red', 0);
    setPedestrianGroup('EW', 'red', 0);
    setPedestrianInfo('NS', 'red', 0);
    setPedestrianInfo('EW', 'red', 0);
}

function resetLocalState() {
    latestData = null;
    nextPhaseForPanel = null;
    preparedNextPlan = null;
    nextPlanLocked = false;
    document.body.dataset.processed = 'false';
    setGroup('horizontal', 'red');
    setGroup('vertical', 'red');
    setGroupTimers('horizontal', 0, 'red');
    setGroupTimers('vertical', 0, 'red');
    waitingPanel();
    clearSwitchHistory();

    document.querySelectorAll('input[type="file"]').forEach(input => {
        input.value = '';
    });

    document.querySelectorAll('.stream-frame').forEach(frame => {
        const placeholder = document.createElement('div');
        placeholder.id = frame.id;
        placeholder.className = 'empty-preview';
        placeholder.textContent = 'Видео не выбрано';
        frame.replaceWith(placeholder);
    });
}

function waitingPanel() {
    ['top-info', 'bottom-info', 'left-info', 'right-info'].forEach(id => text(id, ''));
    text('current-green-direction', 'Ожидание запуска');
    text('current-green-time', '0 сек');
    text('current-red-direction', 'Ожидание запуска');
    text('current-red-time', '0 сек');
    text('next-phase', 'Ожидание запуска');
    text('next-green', '0 сек');
    text('next-red', '0 сек');
    text('up-down-queue', '0');
    text('left-right-queue', '0');
    text('up-down-priority', '0.00');
    text('left-right-priority', '0.00');
    setAllPedestriansToRed();
}

function updateNextPanel(data) {
    if (!data || !data.processing_started) return;
    prepareNextPlan(data, nextPhaseForPanel || firstPhase(data));
}

function updatePanel(data) {
    if (!data) return;
    if (!data.processing_started) {
        waitingPanel();
        return;
    }

    text('top-info', 'Машин: ' + num(data.top));
    text('bottom-info', 'Машин: ' + num(data.bottom));
    text('left-info', 'Машин: ' + num(data.left));
    text('right-info', 'Машин: ' + num(data.right));
    text('up-down-queue', queue(data, 'NS'));
    text('left-right-queue', queue(data, 'EW'));
    text('up-down-priority', num(data.priority_ns).toFixed(2));
    text('left-right-priority', num(data.priority_ew).toFixed(2));
    updateNextPanel(data);
}

async function loadData() {
    try {
        const response = await fetch('/counts');
        latestData = await response.json();
        updatePanel(latestData);
        return latestData;
    } catch (e) {
        console.log('Не удалось обновить данные адаптивного управления');
        return latestData;
    }
}

async function resetSimulation() {
    try {
        const response = await fetch('/reset', { method: 'POST' });
        if (!response.ok) throw new Error('Ошибка сброса');
        resetLocalState();
        await loadData();
    } catch (e) {
        console.log('Не удалось сбросить симуляцию');
    }
}

function clearLight(dir) {
    const light = document.querySelector('.traffic-light[data-dir="' + dir + '"]');
    if (!light) return;
    light.querySelector('.red').classList.remove('active');
    light.querySelector('.yellow').classList.remove('active');
    light.querySelector('.green').classList.remove('active');
}

function setLight(dir, state) {
    const light = document.querySelector('.traffic-light[data-dir="' + dir + '"]');
    if (!light) return;
    clearLight(dir);
    if (state === 'red') light.querySelector('.red').classList.add('active');
    if (state === 'yellow') light.querySelector('.yellow').classList.add('active');
    if (state === 'green') light.querySelector('.green').classList.add('active');
    if (state === 'red-yellow') {
        light.querySelector('.red').classList.add('active');
        light.querySelector('.yellow').classList.add('active');
    }
}

function setGroup(group, state) { groups[group].forEach(dir => setLight(dir, state)); }
function setTimer(dir, seconds, state) {
    const timer = document.querySelector('.traffic-light[data-dir="' + dir + '"] .light-timer');
    if (!timer) return;
    timer.textContent = Math.max(0, Math.ceil(seconds));
    timer.classList.remove('timer-red', 'timer-yellow', 'timer-green');
    if (state === 'green' || state === 'blink-green') timer.classList.add('timer-green');
    else if (state === 'yellow' || state === 'red-yellow') timer.classList.add('timer-yellow');
    else timer.classList.add('timer-red');
}
function setGroupTimers(group, seconds, state) { groups[group].forEach(dir => setTimer(dir, seconds, state)); }
function applyGroup(group, state, visible = true) {
    if (state === 'blink-green') groups[group].forEach(dir => setLight(dir, visible ? 'green' : 'off'));
    else setGroup(group, state);
}

function getWaitingDisplayState(waitingState, waitingLeft) {
    if (waitingState === 'red' && Math.ceil(waitingLeft) === 1) {
        return 'red-yellow';
    }

    return waitingState;
}

function getSignalTitle(state, phase) {
    if (state === 'blink-green') return 'Мигающий зелёный: ' + phases[phase].label;
    if (state === 'yellow') return 'Жёлтый: ' + phases[phase].label;
    if (state === 'red-yellow') return 'Красный + жёлтый: ' + phases[phase].label;
    if (state === 'red') return 'Красный: ' + phases[phase].label;
    return 'Зелёный: ' + phases[phase].label;
}

function updateCurrentPanel(activePhase, activeState, activeLeft, waitingPhase, waitingState, waitingLeft) {
    text('current-green-direction', getSignalTitle(activeState, activePhase));
    text('current-green-time', sec(activeLeft));
    text('current-red-direction', getSignalTitle(waitingState, waitingPhase));
    text('current-red-time', sec(waitingLeft));
}

function getActivePedestrianRedSeconds(activeState, activeLeft, fixedRedLeft = null) {
    if (fixedRedLeft !== null) {
        return fixedRedLeft;
    }

    return activeLeft;
}

function updatePedestrianSignals(activePhase, activeState, activeLeft, waitingPhase, waitingLeft, visible, fixedActivePedestrianRedLeft = null) {
    const pedGreenLeft = Math.max(0, activeLeft - PEDESTRIAN_OFFSET_SECONDS);
    const activePedState = pedGreenLeft > 0 && (activeState === 'green' || activeState === 'blink-green') ? 'green' : 'red';
    const activePedSeconds = activePedState === 'green' ? pedGreenLeft : getActivePedestrianRedSeconds(activeState, activeLeft, fixedActivePedestrianRedLeft);
    const activePedVisible = activePedState === 'green' && Math.ceil(pedGreenLeft) <= PEDESTRIAN_BLINK_SECONDS ? visible : true;

    setPedestrianGroup(activePhase, activePedState, activePedSeconds, activePedVisible);
    setPedestrianGroup(waitingPhase, 'red', waitingLeft);
    setPedestrianInfo(activePhase, activePedState, activePedSeconds);
    setPedestrianInfo(waitingPhase, 'red', waitingLeft);
}

function getCarSignalState(direction) {
    const light = document.querySelector('.traffic-light[data-dir="' + direction + '"]');
    if (!light) return 'unknown';

    const red = light.querySelector('.red')?.classList.contains('active');
    const yellow = light.querySelector('.yellow')?.classList.contains('active');
    const green = light.querySelector('.green')?.classList.contains('active');

    if (red && yellow) return 'red+orange';
    if (red) return 'red';
    if (yellow) return 'orange';
    if (green) return 'green';
    return 'off';
}

function getCarTimer(direction) {
    const timer = document.querySelector('.traffic-light[data-dir="' + direction + '"] .light-timer');
    return timer ? timer.textContent.trim() : '0';
}

function getPedestrianSignalState(direction) {
    const signal = document.querySelector('.pedestrian-signal[data-ped="' + direction + '"]');
    if (!signal) return 'unknown';

    if (signal.classList.contains('ped-green')) return 'green';
    if (signal.classList.contains('ped-red')) return 'red';
    if (signal.classList.contains('ped-off')) return 'green blink off';
    return 'off';
}

function getPedestrianTimer(direction) {
    const timer = document.querySelector('.pedestrian-signal[data-ped="' + direction + '"] .ped-timer');
    return timer ? timer.textContent.trim() : '0';
}

function collectTimerLogData() {
    const cars = {};
    const pedestrians = {};

    ['top', 'bottom', 'left', 'right'].forEach(direction => {
        cars[direction] = {
            seconds: getCarTimer(direction),
            signal: getCarSignalState(direction)
        };

        pedestrians[direction] = {
            seconds: getPedestrianTimer(direction),
            signal: getPedestrianSignalState(direction)
        };
    });

    return { cars, pedestrians };
}

async function sendTimerLog() {
    if (!latestData || !latestData.processing_started) return;

    try {
        await fetch('/timer_log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(collectTimerLogData())
        });
    } catch (e) {
        console.log('Не удалось записать лог таймеров');
    }
}

async function segment(activePhase, activeState, waitingPhase, waitingState, duration, activeStart, waitingStart, options = {}) {
    const activeGroup = phases[activePhase].group;
    const waitingGroup = phases[waitingPhase].group;
    const start = performance.now();
    let visible = true;
    let lastBlink = start;

    while (true) {
        if (!latestData || !latestData.processing_started) break;

        const now = performance.now();
        const elapsed = now - start;
        if (elapsed >= duration * 1000) break;
        if ((activeState === 'blink-green' || activeState === 'green') && now - lastBlink >= 500) {
            visible = !visible;
            lastBlink = now;
        }
        const elapsedSeconds = elapsed / 1000;
        const activeLeft = Math.max(0.1, activeStart - elapsedSeconds);
        const waitingLeft = Math.max(0.1, waitingStart - elapsedSeconds);
        const waitingDisplayState = getWaitingDisplayState(waitingState, waitingLeft);
        const fixedActivePedestrianRedLeft = options.activePedestrianRedStart
            ? Math.max(0.1, options.activePedestrianRedStart - elapsedSeconds)
            : null;

        applyGroup(activeGroup, activeState, visible);
        applyGroup(waitingGroup, waitingDisplayState);
        setGroupTimers(activeGroup, activeLeft, activeState);
        setGroupTimers(waitingGroup, waitingLeft, waitingDisplayState);
        updatePedestrianSignals(activePhase, activeState, activeLeft, waitingPhase, waitingLeft, visible, fixedActivePedestrianRedLeft);
        updateCurrentPanel(activePhase, activeState, activeLeft, waitingPhase, waitingDisplayState, waitingLeft);
        await sleep(100);
    }
}

async function runPhase(plan) {
    const phase = plan.phase;
    const green = plan.green;
    const yellow = plan.yellow;
    const waitingPhase = phases[phase].opposite;
    nextPhaseForPanel = waitingPhase;
    prepareNextPlan(latestData, waitingPhase);
    addSwitchHistoryRecord(plan, latestData);

    const steadyGreen = Math.max(0, green - GREEN_BLINK_SECONDS);
    const redTotal = plan.red;
    if (steadyGreen > 0) await segment(phase, 'green', waitingPhase, 'red', steadyGreen, green, redTotal);
    await segment(phase, 'blink-green', waitingPhase, 'red', Math.min(GREEN_BLINK_SECONDS, green), Math.min(GREEN_BLINK_SECONDS, green), redTotal - steadyGreen);

    const frozenNextPlan = prepareNextPlan(latestData, waitingPhase, true) || preparedNextPlan || makePlan(latestData, waitingPhase);
    nextPlanLocked = true;
    const activePedestrianRedStart = yellow + frozenNextPlan.red;

    await segment(
        phase,
        'yellow',
        waitingPhase,
        'red',
        yellow,
        yellow,
        yellow + RED_YELLOW_SECONDS,
        { activePedestrianRedStart }
    );

    nextPlanLocked = false;

    if (RED_YELLOW_SECONDS > 0) {
        await segment(phase, 'red', waitingPhase, 'red-yellow', RED_YELLOW_SECONDS, RED_YELLOW_SECONDS, RED_YELLOW_SECONDS);
    }
}

async function trafficLoop() {
    if (trafficLoopStarted) return;
    trafficLoopStarted = true;
    setGroup('horizontal', 'red');
    setGroup('vertical', 'red');
    setGroupTimers('horizontal', 0, 'red');
    setGroupTimers('vertical', 0, 'red');
    setAllPedestriansToRed();
    let nextPhase = null;

    while (true) {
        let data = latestData || await loadData();
        if (!data || !data.processing_started) {
            nextPhase = null;
            nextPhaseForPanel = null;
            preparedNextPlan = null;
            nextPlanLocked = false;
            waitingPanel();
            await sleep(500);
            continue;
        }

        if (!nextPhase) nextPhase = firstPhase(data);

        let currentPlan = preparedNextPlan && preparedNextPlan.phase === nextPhase
            ? preparedNextPlan
            : makePlan(data, nextPhase);

        await runPhase(currentPlan);
        nextPhase = phases[currentPlan.phase].opposite;
    }
}

createSwitchHistoryPanel();

const resetButton = document.getElementById('reset-button');
if (resetButton) {
    resetButton.addEventListener('click', resetSimulation);
}

setInterval(loadData, 500);
setInterval(sendTimerLog, 1000);

if (processingStarted) {
    loadData();
    trafficLoop();
} else {
    setGroup('horizontal', 'red');
    setGroup('vertical', 'red');
    setGroupTimers('horizontal', 0, 'red');
    setGroupTimers('vertical', 0, 'red');
    waitingPanel();
}