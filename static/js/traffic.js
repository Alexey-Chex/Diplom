const GREEN_BLINK_SECONDS = 3;      // последние секунды зелёного мигают
const DEFAULT_YELLOW_SECONDS = 3;   // жёлтый сигнал после зелёного
const RED_YELLOW_SECONDS = 1;       // красный + жёлтый перед зелёным
const DEFAULT_GREEN_SECONDS = 10;   // запасное значение, если backend ещё не вернул время
const MAX_SAME_PHASE_REPEATS = 2;   // защита от бесконечного удержания одной фазы

const processingStarted =
    document.body.dataset.processed === 'true' ||
    document.querySelector('.stream-frame') !== null;

const groups = {
    horizontal: ['left', 'right'],
    vertical: ['top', 'bottom']
};

const phases = {
    NS: {
        group: 'vertical',
        waitingGroup: 'horizontal',
        label: 'NS — верх + низ',
        greenField: 'green_ns',
        queueField: 'phase_ns_queue',
        opposite: 'EW'
    },
    EW: {
        group: 'horizontal',
        waitingGroup: 'vertical',
        label: 'EW — лево + право',
        greenField: 'green_ew',
        queueField: 'phase_ew_queue',
        opposite: 'NS'
    }
};

let trafficLoopStarted = false;
let latestTrafficData = null;
let lastCompletedPhase = null;
let samePhaseRepeatCount = 0;
let fallbackPhase = 'EW';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizePhase(phase) {
    return phase === 'EW' ? 'EW' : 'NS';
}

function getNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getQueue(data, phase) {
    if (!data) return 0;

    if (phase === 'NS') {
        return getNumber(data.phase_ns_queue, getNumber(data.top) + getNumber(data.bottom));
    }

    return getNumber(data.phase_ew_queue, getNumber(data.left) + getNumber(data.right));
}

function getGreenSeconds(data, phase) {
    if (!data) return DEFAULT_GREEN_SECONDS;

    const field = phases[phase].greenField;
    const backendValue = getNumber(data[field], DEFAULT_GREEN_SECONDS);

    return clamp(Math.round(backendValue), 5, 60);
}

function getYellowSeconds(data) {
    return clamp(Math.round(getNumber(data?.yellow_time, DEFAULT_YELLOW_SECONDS)), 1, 10);
}

function setText(id, text) {
    const element = document.getElementById(id);
    if (element) element.textContent = text;
}

function setWaitingPanel() {
    setText('top-info', '');
    setText('bottom-info', '');
    setText('left-info', '');
    setText('right-info', '');
    setText('current-phase', 'Ожидание запуска');
    setText('recommended-phase', 'Ожидание запуска');
    setText('current-green', '0 сек');
    setText('ns-queue', '0');
    setText('ew-queue', '0');
    setText('ns-green', '0 сек');
    setText('ew-green', '0 сек');
    setText('ns-priority', '0.00');
    setText('ew-priority', '0.00');
}

function updateInfoPanel(data) {
    if (!data) return;

    if (!data.processing_started) {
        setWaitingPanel();
        return;
    }

    setText('top-info', 'Машин: ' + getNumber(data.top));
    setText('bottom-info', 'Машин: ' + getNumber(data.bottom));
    setText('left-info', 'Машин: ' + getNumber(data.left));
    setText('right-info', 'Машин: ' + getNumber(data.right));

    const recommendedPhase = normalizePhase(data.recommended_phase);

    setText('recommended-phase', phases[recommendedPhase].label);
    setText('ns-queue', getQueue(data, 'NS'));
    setText('ew-queue', getQueue(data, 'EW'));
    setText('ns-green', getGreenSeconds(data, 'NS') + ' сек');
    setText('ew-green', getGreenSeconds(data, 'EW') + ' сек');
    setText('ns-priority', getNumber(data.priority_ns).toFixed(2));
    setText('ew-priority', getNumber(data.priority_ew).toFixed(2));
}

async function loadTrafficData() {
    try {
        const response = await fetch('/counts');
        const data = await response.json();
        latestTrafficData = data;
        updateInfoPanel(data);
        return data;
    } catch (e) {
        console.log('Не удалось обновить данные адаптивного управления');
        return latestTrafficData;
    }
}

async function updateCounts() {
    await loadTrafficData();
}

function chooseAdaptivePhase(data) {
    const nsQueue = getQueue(data, 'NS');
    const ewQueue = getQueue(data, 'EW');

    if (nsQueue === 0 && ewQueue === 0) {
        fallbackPhase = fallbackPhase === 'NS' ? 'EW' : 'NS';
        return fallbackPhase;
    }

    if (nsQueue > 0 && ewQueue === 0) return 'NS';
    if (ewQueue > 0 && nsQueue === 0) return 'EW';

    const recommendedPhase = normalizePhase(data?.recommended_phase);

    if (
        lastCompletedPhase === recommendedPhase &&
        samePhaseRepeatCount >= MAX_SAME_PHASE_REPEATS
    ) {
        return phases[recommendedPhase].opposite;
    }

    return recommendedPhase;
}

function rememberCompletedPhase(phase) {
    if (lastCompletedPhase === phase) {
        samePhaseRepeatCount += 1;
    } else {
        lastCompletedPhase = phase;
        samePhaseRepeatCount = 1;
    }
}

function clearLight(dir) {
    const light = document.querySelector(`.traffic-light[data-dir="${dir}"]`);
    if (!light) return;

    light.querySelector('.red').classList.remove('active');
    light.querySelector('.yellow').classList.remove('active');
    light.querySelector('.green').classList.remove('active');
}

function setLight(dir, state) {
    const light = document.querySelector(`.traffic-light[data-dir="${dir}"]`);
    if (!light) return;

    clearLight(dir);

    if (state === 'red') {
        light.querySelector('.red').classList.add('active');
    } else if (state === 'yellow') {
        light.querySelector('.yellow').classList.add('active');
    } else if (state === 'green') {
        light.querySelector('.green').classList.add('active');
    } else if (state === 'red-yellow') {
        light.querySelector('.red').classList.add('active');
        light.querySelector('.yellow').classList.add('active');
    } else if (state === 'off') {
        clearLight(dir);
    }
}

function setGroup(groupName, state) {
    groups[groupName].forEach(dir => setLight(dir, state));
}

function setTimer(dir, seconds, state) {
    const timer = document.querySelector(`.traffic-light[data-dir="${dir}"] .light-timer`);
    if (!timer) return;

    timer.textContent = Math.max(0, Math.ceil(seconds));

    timer.classList.remove('timer-red', 'timer-yellow', 'timer-green');

    if (state === 'green' || state === 'blink-green') {
        timer.classList.add('timer-green');
    } else if (state === 'yellow' || state === 'red-yellow') {
        timer.classList.add('timer-yellow');
    } else {
        timer.classList.add('timer-red');
    }
}

function setGroupTimers(groupName, seconds, state) {
    groups[groupName].forEach(dir => setTimer(dir, seconds, state));
}

function applyGroupState(groupName, state, blinkVisible = true) {
    if (state === 'blink-green') {
        groups[groupName].forEach(dir => {
            setLight(dir, blinkVisible ? 'green' : 'off');
        });
        return;
    }

    setGroup(groupName, state);
}

async function runSegment({
    durationMs,
    activeGroup,
    activeState,
    waitingGroup,
    waitingState,
    activeTimerStartSec,
    waitingTimerStartSec
}) {
    const startTime = performance.now();
    let blinkVisible = true;
    let lastBlinkToggle = startTime;

    while (true) {
        const now = performance.now();
        const elapsed = now - startTime;

        if (elapsed >= durationMs) {
            break;
        }

        if (activeState === 'blink-green' && now - lastBlinkToggle >= 500) {
            blinkVisible = !blinkVisible;
            lastBlinkToggle = now;
        }

        applyGroupState(activeGroup, activeState, blinkVisible);
        applyGroupState(waitingGroup, waitingState, true);

        const activeRemaining = Math.max(0.1, activeTimerStartSec - elapsed / 1000);
        const waitingRemaining = Math.max(0.1, waitingTimerStartSec - elapsed / 1000);

        setGroupTimers(activeGroup, activeRemaining, activeState);
        setGroupTimers(waitingGroup, waitingRemaining, waitingState);

        await sleep(100);
    }

    applyGroupState(activeGroup, activeState === 'blink-green' ? 'green' : activeState, true);
    applyGroupState(waitingGroup, waitingState, true);
}

async function runAdaptivePhase(phase, greenSeconds, yellowSeconds) {
    const activeGroup = phases[phase].group;
    const waitingGroup = phases[phase].waitingGroup;
    const steadyGreenSeconds = Math.max(0, greenSeconds - GREEN_BLINK_SECONDS);
    const waitingRedAtStart = greenSeconds + yellowSeconds;
    const waitingRedAfterSteady = waitingRedAtStart - steadyGreenSeconds;
    const waitingRedAfterBlink = yellowSeconds;

    setText('current-phase', phases[phase].label);
    setText('current-green', greenSeconds + ' сек');

    if (steadyGreenSeconds > 0) {
        await runSegment({
            durationMs: steadyGreenSeconds * 1000,
            activeGroup,
            activeState: 'green',
            waitingGroup,
            waitingState: 'red',
            activeTimerStartSec: greenSeconds,
            waitingTimerStartSec: waitingRedAtStart
        });
    }

    await runSegment({
        durationMs: Math.min(GREEN_BLINK_SECONDS, greenSeconds) * 1000,
        activeGroup,
        activeState: 'blink-green',
        waitingGroup,
        waitingState: 'red',
        activeTimerStartSec: Math.min(GREEN_BLINK_SECONDS, greenSeconds),
        waitingTimerStartSec: waitingRedAfterSteady
    });

    await runSegment({
        durationMs: yellowSeconds * 1000,
        activeGroup,
        activeState: 'yellow',
        waitingGroup,
        waitingState: 'red',
        activeTimerStartSec: yellowSeconds,
        waitingTimerStartSec: waitingRedAfterBlink
    });

    await runSegment({
        durationMs: RED_YELLOW_SECONDS * 1000,
        activeGroup,
        activeState: 'red',
        waitingGroup,
        waitingState: 'red-yellow',
        activeTimerStartSec: RED_YELLOW_SECONDS,
        waitingTimerStartSec: RED_YELLOW_SECONDS
    });
}

async function trafficLoop() {
    if (trafficLoopStarted) return;
    trafficLoopStarted = true;

    setGroup('horizontal', 'red');
    setGroup('vertical', 'red');
    setGroupTimers('horizontal', 0, 'red');
    setGroupTimers('vertical', 0, 'red');

    while (true) {
        const data = await loadTrafficData();

        if (!data || !data.processing_started) {
            setWaitingPanel();
            await sleep(500);
            continue;
        }

        const phase = chooseAdaptivePhase(data);
        const greenSeconds = getGreenSeconds(data, phase);
        const yellowSeconds = getYellowSeconds(data);

        await runAdaptivePhase(phase, greenSeconds, yellowSeconds);
        rememberCompletedPhase(phase);
    }
}

setInterval(updateCounts, 500);

if (processingStarted) {
    updateCounts();
    trafficLoop();
} else {
    setGroup('horizontal', 'red');
    setGroup('vertical', 'red');
    setGroupTimers('horizontal', 0, 'red');
    setGroupTimers('vertical', 0, 'red');
    setWaitingPanel();
}