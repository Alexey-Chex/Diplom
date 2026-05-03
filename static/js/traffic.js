const MAIN_PHASE_SECONDS = 13;   // чистый зеленый / чистый красный
const GREEN_BLINK_SECONDS = 3;   // последние 3 секунды зеленого мигают
const YELLOW_SECONDS = 3;        // желтый после зеленого
const RED_YELLOW_SECONDS = 1;    // красный + оранжевый перед зеленым

const processingStarted =
    document.body.dataset.processed === 'true' ||
    document.querySelector('.stream-frame') !== null;

const groups = {
    horizontal: ['left', 'right'],
    vertical: ['top', 'bottom']
};

let trafficLoopStarted = false;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateCounts() {
    try {
        const response = await fetch('/counts');
        const data = await response.json();

        const topInfo = document.getElementById('top-info');
        const bottomInfo = document.getElementById('bottom-info');
        const leftInfo = document.getElementById('left-info');
        const rightInfo = document.getElementById('right-info');

        if (topInfo) topInfo.textContent = 'Машин: ' + (data.top ?? 0);
        if (bottomInfo) bottomInfo.textContent = 'Машин: ' + (data.bottom ?? 0);
        if (leftInfo) leftInfo.textContent = 'Машин: ' + (data.left ?? 0);
        if (rightInfo) rightInfo.textContent = 'Машин: ' + (data.right ?? 0);
    } catch (e) {
        console.log('Не удалось обновить счётчики');
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

async function runPhase(activeGroup, waitingGroup) {
    const steadyGreenSeconds = MAIN_PHASE_SECONDS - GREEN_BLINK_SECONDS; // 7

    // Для ожидающей группы:
    // 13 секунд чистого красного = 10 зеленого другой группы + 3 желтого другой группы
    const waitingPureRedAtStart = MAIN_PHASE_SECONDS + YELLOW_SECONDS; // 13
    const waitingPureRedAfterSteady = waitingPureRedAtStart - steadyGreenSeconds; // 6
    const waitingPureRedAfterBlink = YELLOW_SECONDS; // 3

    // Для группы, которая только что закончила ехать:
    // когда она станет красной, до своего red-yellow у нее:
    // 10 сек зеленого другой группы + 3 сек желтого другой группы + 1 сек red-yellow другой группы
    const newRedStart = MAIN_PHASE_SECONDS + YELLOW_SECONDS + RED_YELLOW_SECONDS; // 14

    // 1. Основной зеленый: 7 секунд
    await runSegment({
        durationMs: steadyGreenSeconds * 1000,
        activeGroup,
        activeState: 'green',
        waitingGroup,
        waitingState: 'red',
        activeTimerStartSec: MAIN_PHASE_SECONDS,
        waitingTimerStartSec: waitingPureRedAtStart
    });

    // 2. Последние 3 секунды: зеленый мигает, другая группа красный
    await runSegment({
        durationMs: GREEN_BLINK_SECONDS * 1000,
        activeGroup,
        activeState: 'blink-green',
        waitingGroup,
        waitingState: 'red',
        activeTimerStartSec: GREEN_BLINK_SECONDS,
        waitingTimerStartSec: waitingPureRedAfterSteady
    });

    // 3. Желтый 3 секунды, другая группа красный
    await runSegment({
        durationMs: YELLOW_SECONDS * 1000,
        activeGroup,
        activeState: 'yellow',
        waitingGroup,
        waitingState: 'red',
        activeTimerStartSec: YELLOW_SECONDS,
        waitingTimerStartSec: waitingPureRedAfterBlink
    });

    // 4. Последняя 1 секунда:
    // у прежней активной группы уже красный (и он начинается с 14),
    // у ожидающей группы красный + оранжевый (1 секунда)
    await runSegment({
        durationMs: RED_YELLOW_SECONDS * 1000,
        activeGroup,
        activeState: 'red',
        waitingGroup,
        waitingState: 'red-yellow',
        activeTimerStartSec: newRedStart,
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
        await runPhase('horizontal', 'vertical');
        await runPhase('vertical', 'horizontal');
    }
}

setInterval(updateCounts, 500);
updateCounts();

if (processingStarted) {
    trafficLoop();
} else {
    setGroup('horizontal', 'red');
    setGroup('vertical', 'red');
    setGroupTimers('horizontal', 0, 'red');
    setGroupTimers('vertical', 0, 'red');
}