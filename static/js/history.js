window.SwitchHistory = (() => {
    let records = [];
    let selectedDate = getTodayKey();

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

    function formatTime(createdAt) {
        if (!createdAt || !createdAt.includes(' ')) return createdAt || '';
        return createdAt.split(' ')[1] || createdAt;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
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

    function renderRecords(listElement, recordsToRender, emptyText) {
        if (!listElement) return;

        if (recordsToRender.length === 0) {
            listElement.innerHTML = `<div class="history-empty switch-history-empty">${emptyText}</div>`;
            return;
        }

        listElement.innerHTML = recordsToRender.map(buildRecordHtml).join('');
    }

    function renderPanel() {
        const list = document.getElementById('switch-history-list');
        const isToday = selectedDate === getTodayKey();
        const emptyText = isToday
            ? 'За выбранный день пока нет переключений. Запусти обработку, и новые фазы будут сохраняться в базу данных.'
            : 'Для выбранной даты записей в базе данных нет.';

        renderRecords(list, records, emptyText);
    }

    async function loadByDate(dateKey = selectedDate) {
        selectedDate = dateKey || getTodayKey();

        try {
            const response = await fetch(`/api/history?date=${encodeURIComponent(selectedDate)}`);
            const data = await response.json();
            records = data.records || [];
        } catch (error) {
            records = [];
            console.log('Не удалось загрузить историю переключений из базы данных');
        }

        renderPanel();
        renderFullPage(records);
    }

    async function loadAll() {
        try {
            const response = await fetch('/api/history/all?limit=1000');
            const data = await response.json();
            records = data.records || [];
        } catch (error) {
            records = [];
            console.log('Не удалось загрузить всю историю переключений из базы данных');
        }

        renderFullPage(records);
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
                История переключений сохраняется в локальную SQLite-базу данных. Сброс симуляции не удаляет записи из базы.
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
        renderRecords(
            list,
            recordsToRender,
            'Для выбранной даты записей в базе данных нет. После запуска обработки здесь появятся сохранённые переключения.'
        );
    }

    function initFullPage() {
        const dateInput = document.getElementById('history-date');
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

        loadByDate(selectedDate);
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
            console.log('Не удалось сохранить переключение в базу данных');
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