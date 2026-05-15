const GREEN_BLINK_SECONDS = 3;
const DEFAULT_YELLOW_SECONDS = 3;
const RED_YELLOW_SECONDS = 0;
const DEFAULT_GREEN_SECONDS = 10;

const processingStarted = document.body.dataset.processed === 'true' || document.querySelector('.stream-frame') !== null;

const groups = {
    horizontal: ['left', 'right'],
    vertical: ['top', 'bottom']
};

const phases = {
    NS: { group: 'vertical', label: 'верх/низ', green: 'green_ns', opposite: 'EW' },
    EW: { group: 'horizontal', label: 'лево/право', green: 'green_ew', opposite: 'NS' }
};

let trafficLoopStarted = false;
let latestData = null;
let nextPhaseForPanel = null;
let preparedNextPlan = null;

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
        red: redTimeFor(green, yellow)
    };
}

function showNextPlan(plan) {
    if (!plan) return;
    text('next-phase', phases[plan.phase].label);
    text('next-green', plan.green + ' сек');
    text('next-red', plan.red + ' сек');
}

function prepareNextPlan(data, phase) {
    if (!data || !data.processing_started || !phase) return null;
    preparedNextPlan = makePlan(data, phase);
    showNextPlan(preparedNextPlan);
    return preparedNextPlan;
}

function resetLocalState() {
    latestData = null;
    nextPhaseForPanel = null;
    preparedNextPlan = null;
    document.body.dataset.processed = 'false';
    setGroup('horizontal', 'red');
    setGroup('vertical', 'red');
    setGroupTimers('horizontal', 0, 'red');
    setGroupTimers('vertical', 0, 'red');
    waitingPanel();

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

function updateCurrentPanel(activePhase, activeState, activeLeft, waitingPhase, waitingState, waitingLeft) {
    if (waitingState === 'red-yellow') {
        text('current-green-direction', 'Подготовка: ' + phases[waitingPhase].label);
        text('current-green-time', sec(waitingLeft));
        text('current-red-direction', 'Красный: ' + phases[activePhase].label);
        text('current-red-time', sec(activeLeft));
        return;
    }
    let title = 'Зелёный: ';
    if (activeState === 'blink-green') title = 'Мигающий зелёный: ';
    if (activeState === 'yellow') title = 'Жёлтый: ';
    text('current-green-direction', title + phases[activePhase].label);
    text('current-green-time', sec(activeLeft));
    text('current-red-direction', 'Красный: ' + phases[waitingPhase].label);
    text('current-red-time', sec(waitingLeft));
}

async function segment(activePhase, activeState, waitingPhase, waitingState, duration, activeStart, waitingStart) {
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
        if (activeState === 'blink-green' && now - lastBlink >= 500) {
            visible = !visible;
            lastBlink = now;
        }
        const activeLeft = Math.max(0.1, activeStart - elapsed / 1000);
        const waitingLeft = Math.max(0.1, waitingStart - elapsed / 1000);
        applyGroup(activeGroup, activeState, visible);
        applyGroup(waitingGroup, waitingState);
        setGroupTimers(activeGroup, activeLeft, activeState);
        setGroupTimers(waitingGroup, waitingLeft, waitingState);
        updateCurrentPanel(activePhase, activeState, activeLeft, waitingPhase, waitingState, waitingLeft);
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

    const steadyGreen = Math.max(0, green - GREEN_BLINK_SECONDS);
    const redTotal = plan.red;
    if (steadyGreen > 0) await segment(phase, 'green', waitingPhase, 'red', steadyGreen, green, redTotal);
    await segment(phase, 'blink-green', waitingPhase, 'red', Math.min(GREEN_BLINK_SECONDS, green), Math.min(GREEN_BLINK_SECONDS, green), redTotal - steadyGreen);
    await segment(phase, 'yellow', waitingPhase, 'red', yellow, yellow, yellow + RED_YELLOW_SECONDS);

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
    let nextPhase = null;

    while (true) {
        let data = latestData || await loadData();
        if (!data || !data.processing_started) {
            nextPhase = null;
            nextPhaseForPanel = null;
            preparedNextPlan = null;
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

const resetButton = document.getElementById('reset-button');
if (resetButton) {
    resetButton.addEventListener('click', resetSimulation);
}

setInterval(loadData, 500);

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