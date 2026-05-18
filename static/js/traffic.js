const GREEN_BLINK_SECONDS = 3;
const DEFAULT_YELLOW_SECONDS = 3;
const RED_YELLOW_SECONDS = 0;
const DEFAULT_GREEN_SECONDS = 10;
const PEDESTRIAN_OFFSET_SECONDS = 0;
const PEDESTRIAN_BLINK_SECONDS = 3;

const processingStarted = document.body.dataset.processed === 'true' || document.querySelector('.stream-frame') !== null;

const groups = {
    horizontal: ['left', 'right'],
    vertical: ['top', 'bottom']
};

const streetLabels = {
    NS: 'ул. Нагибина',
    EW: 'ул. Ленина'
};

const phases = {
    NS: { group: 'vertical', label: streetLabels.NS, green: 'green_ns', opposite: 'EW' },
    EW: { group: 'horizontal', label: streetLabels.EW, green: 'green_ew', opposite: 'NS' }
};

const pedestrianGroups = {
    NS: ['left', 'right'],
    EW: ['top', 'bottom']
};

const pedestrianInfoIds = {
    NS: 'ped-lenina-info',
    EW: 'ped-nagibina-info'
};

let trafficLoopStarted = false;
let latestData = null;
let nextPhaseForPanel = null;
let preparedNextPlan = null;
let nextPlanLocked = false;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function num(value, fallback = 0) {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function sec(value) {
    return Math.max(0, Math.ceil(value)) + ' сек';
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
    return streetLabels[phases[phase].opposite];
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

    if (timer) timer.textContent = Math.max(0, Math.ceil(seconds));
}

function setPedestrianGroup(phase, state, seconds, visible = true) {
    pedestrianGroups[phase].forEach(direction => {
        setPedestrianSignal(direction, state, seconds, visible);
    });
}

function setAdaptiveCardState(elementId, state) {
    const element = document.getElementById(elementId);
    const card = element?.closest('.adaptive-card');
    if (!card) return;

    card.classList.remove('adaptive-card-green', 'adaptive-card-red');
    card.classList.add(state === 'green' ? 'adaptive-card-green' : 'adaptive-card-red');
}

function setPedestrianInfo(phase, state, seconds) {
    const id = pedestrianInfoIds[phase];
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
    window.SwitchHistory?.clear?.();

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

function setGroup(group, state) {
    groups[group].forEach(dir => setLight(dir, state));
}

function setTimer(dir, seconds, state) {
    const timer = document.querySelector('.traffic-light[data-dir="' + dir + '"] .light-timer');
    if (!timer) return;

    timer.textContent = Math.max(0, Math.ceil(seconds));
    timer.classList.remove('timer-red', 'timer-yellow', 'timer-green');
    if (state === 'green' || state === 'blink-green') timer.classList.add('timer-green');
    else if (state === 'yellow' || state === 'red-yellow') timer.classList.add('timer-yellow');
    else timer.classList.add('timer-red');
}

function setGroupTimers(group, seconds, state) {
    groups[group].forEach(dir => setTimer(dir, seconds, state));
}

function applyGroup(group, state, visible = true) {
    if (state === 'blink-green') {
        groups[group].forEach(dir => setLight(dir, visible ? 'green' : 'off'));
    } else {
        setGroup(group, state);
    }
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

function getActivePedestrianRedSeconds(activeLeft, fixedRedLeft = null) {
    return fixedRedLeft !== null ? fixedRedLeft : activeLeft;
}

function updatePedestrianSignals(activePhase, activeState, activeLeft, waitingPhase, waitingLeft, visible, fixedActivePedestrianRedLeft = null) {
    const pedGreenLeft = Math.max(0, activeLeft - PEDESTRIAN_OFFSET_SECONDS);
    const activePedState = pedGreenLeft > 0 && (activeState === 'green' || activeState === 'blink-green') ? 'green' : 'red';
    const activePedSeconds = activePedState === 'green' ? pedGreenLeft : getActivePedestrianRedSeconds(activeLeft, fixedActivePedestrianRedLeft);
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

function addSwitchHistoryRecord(plan, data) {
    if (!window.SwitchHistory || !plan || !data || !data.processing_started) return;

    window.SwitchHistory.addRecord({
        active_phase: plan.phase,
        green_seconds: plan.green,
        red_seconds: plan.red,
        yellow_seconds: plan.yellow,
        counts: {
            top: num(data.top),
            bottom: num(data.bottom),
            left: num(data.left),
            right: num(data.right)
        },
        metrics: {
            queue_nagibina: queue(data, 'NS'),
            queue_lenina: queue(data, 'EW'),
            priority_nagibina: num(data.priority_ns),
            priority_lenina: num(data.priority_ew)
        }
    });
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

    if (steadyGreen > 0) {
        await segment(phase, 'green', waitingPhase, 'red', steadyGreen, green, redTotal);
    }

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

        const currentPlan = preparedNextPlan && preparedNextPlan.phase === nextPhase
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