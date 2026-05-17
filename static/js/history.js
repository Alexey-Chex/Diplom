window.SwitchHistory = (() => {
    const STORAGE_KEY = 'adaptiveSwitchHistory';
    const MAX_ITEMS = 100;

    let records = [];
    let selectedDate = getTodayKey();

    function pad(value) {
        return String(value).padStart(2, '0');
    }

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

    function loadRecords() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            records = raw ? JSON.parse(raw) : [];
        } catch (error) {
            records = [];
        }
    }

    function saveRecords() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    }

    function openPanel() {
        document.getElementById('switch-history-panel')?.classList.add('open');
        document.getElementById('switch-history-toggle')?.classList.add('hidden');
    }

    function closePanel() {
        document.getElementById('switch-history-panel')?.classList.remove('open');
        document.getElementById('switch-history-toggle')?.classList.remove('hidden');
    }

    function buildRecordHtml(item) {
        return `
            <article class="switch-history-item">
                <div class="switch-history-time">
                    <span>${escapeHtml(item.time)}</span>
                    <span class="switch-history-date">${escapeHtml(formatDateLabel(item.dateKey))}</span>
                </div>
                <div class="switch-history-row"><strong>Едут машины:</strong> ${escapeHtml(item.activeTransport)}</div>
                <div class="switch-history-row"><strong>Стоят машины:</strong> ${escapeHtml(item.waitingTransport)}</div>
                <div class="switch-history-row"><strong>Время:</strong> зелёный ${escapeHtml(item.green)} сек, красный ${escapeHtml(item.red)} сек</div>
                <div class="switch-history-row"><strong>Пешеходы переходят:</strong> ${escapeHtml(item.activePedestrians)}</div>
                <div class="switch-history-row"><strong>Пешеходы ждут:</strong> ${escapeHtml(item.waitingPedestrians)}</div>
                <div class="switch-history-counts">
                    <span>Верх: ${escapeHtml(item.counts.top)}</span>
                    <span>Низ: ${escapeHtml(item.counts.bottom)}</span>
                    <span>Лево: ${escapeHtml(item.counts.left)}</span>
                    <span>Право: ${escapeHtml(item.counts.right)}</span>
                </div>
            </article>
        `;
    }

    function renderPanel() {
        const list = document.getElementById('switch-history-list');
        if (!list) return;

        const filteredRecords = records.filter(item => item.dateKey === selectedDate);

        if (filteredRecords.length === 0) {
            const isToday = selectedDate === getTodayKey();
            list.innerHTML = `
                <div class="switch-history-empty">
                    ${isToday
                        ? 'За выбранный день пока нет переключений. Запусти обработку, и новая фаза будет записываться сюда один раз при переключении.'
                        : 'Для выбранной даты локальных записей нет. После подключения базы данных здесь можно будет смотреть историю за любой день.'}
                </div>
            `;
            return;
        }

        list.innerHTML = filteredRecords.map(buildRecordHtml).join('');
    }

    function createPanel() {
        if (document.getElementById('switch-history-panel')) return;

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
                <input type="date" id="switch-history-date" value="${selectedDate}">
                <button type="button" id="switch-history-full" class="switch-history-full-button">Вся история переключений</button>
            </div>
            <p class="switch-history-note">
                Пока база данных не подключена, история хранится локально. При запуске новой обработки и при сбросе симуляции локальная история очищается.
            </p>
            <div id="switch-history-list" class="switch-history-list"></div>
        `;

        document.body.appendChild(panel);
        document.body.appendChild(toggle);

        toggle.addEventListener('click', openPanel);
        document.getElementById('switch-history-close')?.addEventListener('click', closePanel);

        document.getElementById('switch-history-today')?.addEventListener('click', () => {
            selectedDate = getTodayKey();
            const input = document.getElementById('switch-history-date');
            if (input) input.value = selectedDate;
            renderPanel();
        });

        document.getElementById('switch-history-date')?.addEventListener('change', event => {
            selectedDate = event.target.value || getTodayKey();
            renderPanel();
        });

        document.getElementById('switch-history-full')?.addEventListener('click', () => {
            window.open('/history', '_blank');
        });

        renderPanel();
    }

    function getRecordsForDate(dateKey) {
        return records.filter(item => item.dateKey === dateKey);
    }

    function getSortedRecords() {
        return [...records].sort((a, b) => {
            if (a.dateKey === b.dateKey) return b.time.localeCompare(a.time);
            return b.dateKey.localeCompare(a.dateKey);
        });
    }

    function renderFullPage(recordsToRender) {
        const list = document.getElementById('history-list');
        if (!list) return;

        if (recordsToRender.length === 0) {
            list.innerHTML = '<div class="history-empty">Для выбранной даты локальных записей нет. После подключения базы данных здесь будут отображаться сохранённые переключения за выбранный день.</div>';
            return;
        }

        list.innerHTML = recordsToRender.map(buildRecordHtml).join('');
    }

    function initFullPage() {
        const dateInput = document.getElementById('history-date');
        selectedDate = getTodayKey();
        if (dateInput) dateInput.value = selectedDate;

        document.getElementById('history-today')?.addEventListener('click', () => {
            selectedDate = getTodayKey();
            if (dateInput) dateInput.value = selectedDate;
            renderFullPage(getRecordsForDate(selectedDate));
        });

        dateInput?.addEventListener('change', event => {
            selectedDate = event.target.value || getTodayKey();
            renderFullPage(getRecordsForDate(selectedDate));
        });

        document.getElementById('history-all')?.addEventListener('click', () => {
            renderFullPage(getSortedRecords());
        });

        renderFullPage(getRecordsForDate(selectedDate));
    }

    function clear() {
        records = [];
        selectedDate = getTodayKey();
        saveRecords();

        const panelDateInput = document.getElementById('switch-history-date');
        if (panelDateInput) panelDateInput.value = selectedDate;

        renderPanel();
        renderFullPage(getRecordsForDate(selectedDate));
    }

    function addRecord(record) {
        const now = new Date();
        const normalizedRecord = {
            id: `${now.getTime()}-${records.length}`,
            dateKey: getTodayKey(),
            time: getClockTime(now),
            ...record
        };

        records.unshift(normalizedRecord);
        records = records.slice(0, MAX_ITEMS);
        saveRecords();
        renderPanel();
    }

    function initMainPage() {
        if (document.body.dataset.clearHistory === 'true') {
            clear();
        }

        createPanel();
    }

    function init() {
        loadRecords();

        if (document.body.dataset.historyPage === 'true') {
            initFullPage();
        } else {
            initMainPage();
        }
    }

    return {
        init,
        clear,
        addRecord,
        getTodayKey
    };
})();

document.addEventListener('DOMContentLoaded', window.SwitchHistory.init);