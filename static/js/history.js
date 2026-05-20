window.SwitchHistory = (() => {
    let records = [];
    let selectedDate = getTodayKey();
    let fullPageMode = 'date';
    const monthNames = [
        'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function getTodayKey() {
        const now = new Date();
        return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }

    function formatDateLabel(dateKey) {
        if (!dateKey || !dateKey.includes('-')) return dateKey || '';
        const [year, month, day] = dateKey.split('-');
        return `${day}.${month}.${year}`;
    }

    function formatDateLong(dateKey) {
        if (!dateKey || !dateKey.includes('-')) return dateKey || '';
        const [year, month, day] = dateKey.split('-').map(Number);
        return `${day} ${monthNames[month - 1]} ${year}`;
    }

    function formatTime(createdAt) {
        if (!createdAt || !createdAt.includes(' ')) return createdAt || '';
        return createdAt.split(' ')[1] || createdAt;
    }

    function formatTimeRange(item) {
        const first = formatTime(item.first_created_at);
        const last = formatTime(item.last_created_at);

        if (!first && !last) return '';
        if (first === last) return first;
        return `${first} — ${last}`;
    }

    function pluralRecords(count) {
        const value = Number(count) || 0;
        const lastTwo = value % 100;
        const last = value % 10;

        if (lastTwo >= 11 && lastTwo <= 14) return `${value} записей`;
        if (last === 1) return `${value} запись`;
        if (last >= 2 && last <= 4) return `${value} записи`;
        return `${value} записей`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function timeToMinutes(value) {
        if (!value || !value.includes(':')) return null;
        const [hours, minutes] = value.split(':').map(Number);

        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
            return null;
        }

        return hours * 60 + minutes;
    }

    function recordTimeToMinutes(record) {
        const time = formatTime(record.created_at);
        return timeToMinutes(time.slice(0, 5));
    }

    function getTimeFilter() {
        const from = document.getElementById('history-time-from')?.value || '';
        const to = document.getElementById('history-time-to')?.value || '';

        return {
            from,
            to,
            fromMinutes: timeToMinutes(from),
            toMinutes: timeToMinutes(to)
        };
    }

    function getTimeFilterText() {
        const filter = getTimeFilter();

        if (filter.from && filter.to) return `, ${filter.from}–${filter.to}`;
        if (filter.from) return `, с ${filter.from}`;
        if (filter.to) return `, до ${filter.to}`;
        return '';
    }

    function applyTimeFilter(recordsToFilter) {
        const filter = getTimeFilter();

        if (filter.fromMinutes === null && filter.toMinutes === null) {
            return recordsToFilter;
        }

        return recordsToFilter.filter(record => {
            const recordMinutes = recordTimeToMinutes(record);

            if (recordMinutes === null) return false;
            if (filter.fromMinutes !== null && recordMinutes < filter.fromMinutes) return false;
            if (filter.toMinutes !== null && recordMinutes > filter.toMinutes) return false;

            return true;
        });
    }

    function setTimeFilterVisible(isVisible) {
        const filter = document.getElementById('history-time-filter');
        if (!filter) return;
        filter.classList.toggle('hidden', !isVisible);
    }

    function resetTimeFilter() {
        const from = document.getElementById('history-time-from');
        const to = document.getElementById('history-time-to');

        if (from) from.value = '';
        if (to) to.value = '';

        if (fullPageMode === 'date') {
            renderFullPage(records);
        }
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
                    <span>${escapeHtml(formatTime(item.created_at))}</span>
                    <span class="switch-history-date">${escapeHtml(formatDateLabel(item.created_date))}</span>
                </div>
                <div class="switch-history-row"><strong>Едут машины:</strong> ${escapeHtml(item.active_street)}</div>
                <div class="switch-history-row"><strong>Стоят машины:</strong> ${escapeHtml(item.waiting_street)}</div>
                <div class="switch-history-row"><strong>Время:</strong> зелёный ${escapeHtml(item.green_seconds)} сек, красный ${escapeHtml(item.red_seconds)} сек</div>
                <div class="switch-history-row"><strong>Пешеходы переходят:</strong> ${escapeHtml(item.pedestrian_active_street)}</div>
                <div class="switch-history-row"><strong>Пешеходы ждут:</strong> ${escapeHtml(item.pedestrian_waiting_street)}</div>
                <div class="switch-history-row"><strong>Очереди:</strong> Нагибина ${escapeHtml(item.queue_nagibina)}, Ленина ${escapeHtml(item.queue_lenina)}</div>
                <div class="switch-history-row"><strong>Приоритеты:</strong> Нагибина ${escapeHtml(Number(item.priority_nagibina || 0).toFixed(2))}, Ленина ${escapeHtml(Number(item.priority_lenina || 0).toFixed(2))}</div>
                <div class="switch-history-counts">
                    <span>Верх: ${escapeHtml(item.cars_top)}</span>
                    <span>Низ: ${escapeHtml(item.cars_bottom)}</span>
                    <span>Лево: ${escapeHtml(item.cars_left)}</span>
                    <span>Право: ${escapeHtml(item.cars_right)}</span>
                </div>
            </article>
        `;
    }

    function buildDateRowHtml(item) {
        const dateKey = item.created_date;
        return `
            <button type="button" class="history-date-row" data-date="${escapeHtml(dateKey)}">
                <span class="history-date-row-main">${escapeHtml(formatDateLong(dateKey))}</span>
                <span class="history-date-row-meta">
                    ${escapeHtml(pluralRecords(item.records_count))}${formatTimeRange(item) ? ` · ${escapeHtml(formatTimeRange(item))}` : ''}
                </span>
            </button>
        `;
    }

    function renderRecords(listElement, recordsToRender, emptyText) {
        if (!listElement) return;

        listElement.classList.remove('history-date-list');
        listElement.classList.add('history-record-grid');

        if (recordsToRender.length === 0) {
            listElement.innerHTML = `<div class="history-empty switch-history-empty">${emptyText}</div>`;
            return;
        }

        listElement.innerHTML = recordsToRender.map(buildRecordHtml).join('');
    }

    function renderDateRows(listElement, dateRows) {
        if (!listElement) return;

        listElement.classList.remove('history-record-grid');
        listElement.classList.add('history-date-list');

        if (dateRows.length === 0) {
            listElement.innerHTML = '<div class="history-empty switch-history-empty">В истории пока нет сохранённых переключений.</div>';
            return;
        }

        listElement.innerHTML = dateRows.map(buildDateRowHtml).join('');

        listElement.querySelectorAll('.history-date-row').forEach(button => {
            button.addEventListener('click', () => {
                const dateKey = button.dataset.date;
                const dateInput = document.getElementById('history-date');
                selectedDate = dateKey || getTodayKey();
                if (dateInput) dateInput.value = selectedDate;
                loadByDate(selectedDate);
            });
        });
    }

    function setFullPageTitle(value) {
        const title = document.getElementById('history-view-title');
        if (title) title.textContent = value;
    }

    function renderPanel() {
        const list = document.getElementById('switch-history-list');
        const isToday = selectedDate === getTodayKey();
        const emptyText = isToday
            ? 'За выбранный день пока нет переключений. Запусти обработку, и новые фазы появятся здесь.'
            : 'Для выбранной даты записей в истории нет.';

        renderRecords(list, records, emptyText);
    }

    async function loadByDate(dateKey = selectedDate) {
        selectedDate = dateKey || getTodayKey();
        fullPageMode = 'date';

        try {
            const response = await fetch(`/api/history?date=${encodeURIComponent(selectedDate)}`);
            const data = await response.json();
            records = data.records || [];
        } catch (error) {
            records = [];
            console.log('Не удалось загрузить историю переключений');
        }

        renderPanel();
        renderFullPage(records);
    }

    async function loadAll() {
        fullPageMode = 'dates';
        setTimeFilterVisible(false);

        try {
            const response = await fetch('/api/history/dates');
            const data = await response.json();
            records = data.dates || [];
        } catch (error) {
            records = [];
            console.log('Не удалось загрузить список дней истории переключений');
        }

        setFullPageTitle('Дни с сохранёнными переключениями');
        renderDateRows(document.getElementById('history-list'), records);
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
            <div class="switch-history-header">
                <h2>История переключений</h2>
                <button type="button" id="switch-history-close" class="switch-history-close" aria-label="Закрыть историю">›</button>
            </div>
            <div class="switch-history-controls">
                <button type="button" id="switch-history-today">Сегодня</button>
                <input type="date" id="switch-history-date" value="${selectedDate}">
                <button type="button" id="switch-history-full" class="switch-history-full-button">Вся история переключений</button>
            </div>
            <p class="switch-history-note">
                Записи сохраняются в базе данных. Сброс симуляции очищает только текущий экран и не удаляет историю переключений.
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
            loadByDate(selectedDate);
        });

        document.getElementById('switch-history-date')?.addEventListener('change', event => {
            selectedDate = event.target.value || getTodayKey();
            loadByDate(selectedDate);
        });

        document.getElementById('switch-history-full')?.addEventListener('click', () => {
            window.open('/history', '_blank');
        });

        loadByDate(selectedDate);
    }

    function renderFullPage(recordsToRender) {
        const list = document.getElementById('history-list');
        if (!list) return;

        setTimeFilterVisible(true);
        const filteredRecords = applyTimeFilter(recordsToRender);
        const timeFilterText = getTimeFilterText();
        const emptyText = timeFilterText
            ? 'За выбранную дату и указанный период времени записей нет.'
            : 'Для выбранной даты записей нет. После запуска обработки здесь появятся сохранённые переключения.';

        setFullPageTitle(`Записи за ${formatDateLong(selectedDate)}${timeFilterText}`);
        renderRecords(list, filteredRecords, emptyText);
    }

    function initFullPage() {
        const dateInput = document.getElementById('history-date');
        const timeFrom = document.getElementById('history-time-from');
        const timeTo = document.getElementById('history-time-to');
        selectedDate = getTodayKey();
        if (dateInput) dateInput.value = selectedDate;

        document.getElementById('history-today')?.addEventListener('click', () => {
            selectedDate = getTodayKey();
            if (dateInput) dateInput.value = selectedDate;
            loadByDate(selectedDate);
        });

        dateInput?.addEventListener('change', event => {
            selectedDate = event.target.value || getTodayKey();
            loadByDate(selectedDate);
        });

        document.getElementById('history-all')?.addEventListener('click', loadAll);
        document.getElementById('history-time-apply')?.addEventListener('click', () => renderFullPage(records));
        document.getElementById('history-time-reset')?.addEventListener('click', resetTimeFilter);

        timeFrom?.addEventListener('change', () => renderFullPage(records));
        timeTo?.addEventListener('change', () => renderFullPage(records));

        loadAll();
    }

    function clear() {
        selectedDate = getTodayKey();
        const panelDateInput = document.getElementById('switch-history-date');
        if (panelDateInput) panelDateInput.value = selectedDate;
        loadByDate(selectedDate);
    }

    async function addRecord(record) {
        try {
            await fetch('/api/history/switch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(record)
            });
            await loadByDate(selectedDate);
        } catch (error) {
            console.log('Не удалось сохранить переключение в историю');
        }
    }

    function initMainPage() {
        createPanel();
    }

    function init() {
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
