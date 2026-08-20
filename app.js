let currentTimes = [];
let urls = [];
let logs = [];
let isRunning = false;
let executionQueue = [];
let headers = [];
let autoExecutors = {};
let logIdCounter = 0;

// Límites para que el log no crezca sin techo en ejecuciones largas (auto/cron corriendo días)
const MAX_LOG_ENTRIES = 300;   // entradas visibles conservadas; las más viejas se descartan
const MAX_BODY_CHARS = 20000;  // tope de tamaño guardado por respuesta (~20 KB)

// ─── Auth toggle ──────────────────────────────────────────

function toggleAuth() {
    document.getElementById('authFields').style.display =
        document.getElementById('useAuth').checked ? 'block' : 'none';
}

// ─── Configuración colapsable (estado guardado en memoria) ─

const CONFIG_COLLAPSED_KEY = 'urlSchedulerConfigCollapsed';

function setConfigCollapsed(collapsed) {
    document.getElementById('configContent').style.display = collapsed ? 'none' : '';
    document.getElementById('configChevron').classList.toggle('collapsed', collapsed);
    document.querySelector('#configCard .collapsible-header').classList.toggle('collapsed', collapsed);
    localStorage.setItem(CONFIG_COLLAPSED_KEY, collapsed ? '1' : '0');
}

function toggleConfigCollapse() {
    const isCollapsed = document.getElementById('configContent').style.display === 'none';
    setConfigCollapsed(!isCollapsed);
}

// ─── Times ───────────────────────────────────────────────

function addTime() {
    const input = document.getElementById('timeInput');
    const time = parseInt(input.value);
    if (isNaN(time) || time < 1) { alert('Ingresa un número válido (mayor a 0)'); return; }
    if (currentTimes.includes(time)) { alert('Este tiempo ya está agregado'); return; }
    currentTimes.push(time);
    currentTimes.sort((a, b) => a - b);
    input.value = '';
    renderTimes();
}

function removeTime(time) {
    currentTimes = currentTimes.filter(t => t !== time);
    renderTimes();
}

function renderTimes() {
    const container = document.getElementById('timesList');
    if (currentTimes.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = currentTimes.map(t =>
        `<span class="badge badge-secondary">
            ${t}s
            <button class="badge-close" onclick="removeTime(${t})" title="Quitar">✕</button>
        </span>`
    ).join('');
}

// ─── Headers ─────────────────────────────────────────────

function addHeaderField() {
    headers.push({ id: Date.now(), key: '', value: '' });
    renderHeaders();
}

function renderHeaders() {
    const container = document.getElementById('headersList');
    container.innerHTML = headers.map(h =>
        `<div class="header-row">
            <input type="text" placeholder="Nombre (ej: X-Custom)" value="${h.key}"
                onchange="updateHeader(${h.id},'key',this.value)" />
            <input type="text" placeholder="Valor" value="${h.value}"
                onchange="updateHeader(${h.id},'value',this.value)" />
            <button class="btn-destructive btn btn-icon btn-sm" onclick="removeHeader(${h.id})" title="Eliminar">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
        </div>`
    ).join('');
}

function updateHeader(id, field, value) {
    const h = headers.find(h => h.id === id);
    if (h) { h[field] = value; saveToLocalStorage(); }
}

function removeHeader(id) {
    headers = headers.filter(h => h.id !== id);
    renderHeaders();
    saveToLocalStorage();
}

// ─── Schedule type toggle ──────────────────────────────────

function toggleScheduleType() {
    const type = document.getElementById('scheduleTypeSelect').value;
    document.getElementById('secondsSchedule').style.display = type === 'cron' ? 'none' : 'block';
    document.getElementById('cronSchedule').style.display = type === 'cron' ? 'block' : 'none';
}

function applyCronPreset(value) {
    if (value) document.getElementById('cronInput').value = value;
}

// ─── Add URL ──────────────────────────────────────────────

function addUrl() {
    const url = document.getElementById('urlInput').value.trim();
    const method = document.getElementById('methodSelect').value;
    const useAuth = document.getElementById('useAuth').checked;
    const authUser = document.getElementById('authUser').value;
    const authPass = document.getElementById('authPass').value;
    const scheduleType = document.getElementById('scheduleTypeSelect').value;

    let customHeaders = {};
    headers.forEach(h => { if (h.key && h.value) customHeaders[h.key] = h.value; });

    if (!url) { alert('Ingresa una URL'); return; }

    const urlItem = { id: Date.now(), url, method, useAuth, authUser, authPass, customHeaders, scheduleType };

    if (scheduleType === 'cron') {
        const cronExpression = document.getElementById('cronInput').value.trim();
        if (!cronExpression) { alert('Ingresa una expresión cron'); return; }
        if (!validateCron(cronExpression)) {
            alert('Expresión cron inválida. Formato: minuto hora día-mes mes día-semana (ej: 0 9 * * 1-5)');
            return;
        }
        urlItem.cronExpression = cronExpression;
        urlItem.times = [];
    } else {
        if (currentTimes.length === 0) { alert('Agrega al menos un tiempo de ejecución'); return; }
        urlItem.times = [...currentTimes];
    }

    urls.push(urlItem);

    document.getElementById('urlInput').value = '';
    if (scheduleType === 'cron') {
        document.getElementById('cronInput').value = '';
    } else {
        currentTimes = [];
        renderTimes();
    }
    renderUrls();
    saveToLocalStorage();
}

// ─── Render URLs ──────────────────────────────────────────

function renderUrls() {
    const container = document.getElementById('urlList');
    if (urls.length === 0) {
        container.innerHTML = '<div class="empty-state">Ninguna URL configurada aún</div>';
        return;
    }

    container.innerHTML = urls.map(item => {
        const isAutoActive = !!autoExecutors[item.id];
        const isCron = item.scheduleType === 'cron';
        const timeBadges = isCron
            ? `<span class="badge badge-secondary" style="font-family:'JetBrains Mono',monospace;">⏱ ${item.cronExpression}</span>`
            : item.times.map(t => `<span class="badge badge-secondary">${t}s</span>`).join('');
        const authBadge = item.useAuth
            ? `<div class="url-card-auth">
                   <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                   ${item.authUser}
               </div>` : '';

        return `<div class="url-card">
            <div>
                <div class="url-card-url">
                    <span class="url-card-method method-${item.method}">${item.method}</span>${item.url}
                </div>
                <div class="url-card-meta">${timeBadges}</div>
                ${authBadge}
            </div>
            <div class="url-card-actions">
                <button class="btn btn-sm" id="exe-${item.id}" onclick="executeUrl(${item.id})" title="Ejecutar una vez">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    Ejecutar
                </button>
                <button class="${isAutoActive ? 'btn-warning' : 'btn-success'} btn btn-sm" id="auto-${item.id}" onclick="toggleAutoExecute(${item.id})">
                    ${isAutoActive
                        ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Detener`
                        : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg> Auto`
                    }
                </button>
                <button class="btn-outline btn btn-sm" onclick="removeUrl(${item.id})">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    Eliminar
                </button>
            </div>
        </div>`;
    }).join('');
}

function removeUrl(id) {
    urls = urls.filter(u => u.id !== id);
    if (autoExecutors[id]) delete autoExecutors[id];
    renderUrls();
    saveToLocalStorage();
}

// ─── Execute one URL (manual) ─────────────────────────────

async function executeUrl(id) {
    const urlItem = urls.find(u => u.id === id);
    if (!urlItem) return;

    const btn = document.getElementById(`exe-${id}`);
    btn.disabled = true;
    btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Ejecutando`;

    try {
        if (urlItem.scheduleType === 'cron') {
            // Ejecución manual inmediata (no espera al próximo match del cron)
            const logIdx = addLog(new Date().getSeconds(), urlItem.url, urlItem.method, 'pending');
            const result = await executeRequest(urlItem.url, urlItem.method, urlItem.useAuth, urlItem.authUser, urlItem.authPass, urlItem.customHeaders);
            updateLog(logIdx, result.status, result.code, result);
        } else {
            for (const targetSecond of urlItem.times) {
                await waitUntilSecond(targetSecond);
                const logIdx = addLog(targetSecond, urlItem.url, urlItem.method, 'pending');
                const result = await executeRequest(urlItem.url, urlItem.method, urlItem.useAuth, urlItem.authUser, urlItem.authPass, urlItem.customHeaders);
                updateLog(logIdx, result.status, result.code, result);
            }
        }
    } catch (e) {
        console.error('Error ejecutando:', e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Ejecutar`;
    }
}

// ─── Wait until exact second of minute ───────────────────

function waitUntilSecond(targetSecond) {
    return new Promise(resolve => {
        const check = () => {
            if (new Date().getSeconds() === targetSecond) resolve();
            else setTimeout(check, 100);
        };
        check();
    });
}

// ─── Auto-execute (loop every minute) ────────────────────

function toggleAutoExecute(id) {
    if (autoExecutors[id]) {
        delete autoExecutors[id];
    } else {
        const urlItem = urls.find(u => u.id === id);
        if (urlItem && urlItem.scheduleType === 'cron') {
            autoExecuteRepeatCron(id);
        } else {
            autoExecuteRepeat(id);
        }
    }
    renderUrls();
}

// ─── Auto-execute (cron: solo corre cuando la expresión matchea) ──

async function autoExecuteRepeatCron(id) {
    const urlItem = urls.find(u => u.id === id);
    if (!urlItem) return;

    autoExecutors[id] = true;
    let lastExecutedKey = null;

    while (autoExecutors[id]) {
        const now = new Date();
        const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

        let matches = false;
        try {
            matches = key !== lastExecutedKey && cronMatchesDate(urlItem.cronExpression, now);
        } catch (e) {
            // Expresión cron corrupta/inválida (p.ej. editada a mano en el storage): se detiene
            // este auto-ejecutor en vez de morir en silencio dejando el botón en "Detener".
            const logIdx = addLog(now.getSeconds(), urlItem.url, urlItem.method, 'error');
            updateLog(logIdx, 'error', 'Cron inválido', { bodyNote: `Expresión cron inválida: ${e.message}` });
            delete autoExecutors[id];
            renderUrls();
            break;
        }

        if (matches) {
            lastExecutedKey = key;
            const logIdx = addLog(now.getSeconds(), urlItem.url, urlItem.method, 'pending');
            const result = await executeRequest(urlItem.url, urlItem.method, urlItem.useAuth, urlItem.authUser, urlItem.authPass, urlItem.customHeaders);
            updateLog(logIdx, result.status, result.code, result);
        }

        await new Promise(r => setTimeout(r, 1000));
    }
}

async function autoExecuteRepeat(id) {
    const urlItem = urls.find(u => u.id === id);
    if (!urlItem) return;

    autoExecutors[id] = true;
    let lastExecutedSecond = -1;

    while (autoExecutors[id]) {
        const currentSecond = new Date().getSeconds();

        for (const targetSecond of urlItem.times) {
            if (!autoExecutors[id]) break;

            if (currentSecond === targetSecond && lastExecutedSecond !== targetSecond) {
                lastExecutedSecond = targetSecond;
                const logIdx = addLog(targetSecond, urlItem.url, urlItem.method, 'pending');
                const result = await executeRequest(urlItem.url, urlItem.method, urlItem.useAuth, urlItem.authUser, urlItem.authPass, urlItem.customHeaders);
                updateLog(logIdx, result.status, result.code, result);
            }

            if (currentSecond !== targetSecond && lastExecutedSecond === targetSecond) {
                lastExecutedSecond = -1;
            }
        }

        await new Promise(r => setTimeout(r, 500));
    }
}

// ─── Logs ─────────────────────────────────────────────────

function addLog(time, url, method, status) {
    const entry = {
        id: ++logIdCounter,
        timestamp: new Date().toLocaleTimeString(),
        time, url, method, status, code: '',
        body: null, bodyNote: '', responseHeaders: {}
    };
    logs.push(entry);
    appendLogEntryDom(entry);
    trimLogs();
    updateStats();
    return entry.id;
}

function updateLog(id, status, code, extra = {}) {
    const entry = logs.find(l => l.id === id);
    if (entry) {
        entry.status = status;
        entry.code = code;
        entry.body = extra.body ?? null;
        entry.bodyNote = extra.bodyNote ?? '';
        entry.responseHeaders = extra.responseHeaders ?? {};
        patchLogEntryDom(entry);
        updateStats();
    }
}

// Evita que `logs` (y el DOM del log-box) crezca sin límite en ejecuciones largas.
// Las entradas más viejas se descartan tanto del array como del DOM (FIFO).
function trimLogs() {
    while (logs.length > MAX_LOG_ENTRIES) {
        const removed = logs.shift();
        const node = document.getElementById(`log-entry-${removed.id}`);
        if (node) node.remove();
    }
}

// Markup interno de una entrada (compartido por el render incremental y el completo)
function logEntryMarkup(log) {
    let icon;
    if (log.status === 'success')      icon = '✅';
    else if (log.status === 'error')   icon = '❌';
    else                                icon = '⏳';

    const codeSpan = log.code
        ? `<span style="color:hsl(215.4 16.3% 46.9%); font-size:11px;">${log.code}</span>`
        : '';

    const viewBtn = log.status !== 'pending'
        ? `<button class="log-view-btn" onclick="openLogModal(${log.id})" title="Ver respuesta">Ver</button>`
        : '';

    return `<span class="log-ts">${log.timestamp}</span>
        <span class="log-icon">${icon}</span>
        <div class="log-content">
            <span class="log-method">${log.method}</span>
            <span class="log-url">${log.url}</span>
            ${codeSpan}
            ${viewBtn}
        </div>`;
}

// Agrega SOLO la entrada nueva al DOM (no reconstruye las anteriores)
function appendLogEntryDom(entry) {
    const box = document.getElementById('logBox');
    const empty = box.querySelector('.log-empty');
    if (empty) empty.remove();

    const div = document.createElement('div');
    div.className = 'log-entry';
    div.id = `log-entry-${entry.id}`;
    div.innerHTML = logEntryMarkup(entry);
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

// Actualiza SOLO el nodo de esa entrada (p.ej. de "pendiente" a "éxito")
function patchLogEntryDom(entry) {
    const div = document.getElementById(`log-entry-${entry.id}`);
    if (div) div.innerHTML = logEntryMarkup(entry);
}

// Reconstrucción completa del log-box: solo se usa al limpiar o reiniciar (logs = [])
function renderLogs() {
    const box = document.getElementById('logBox');
    if (logs.length === 0) {
        box.innerHTML = '<div class="log-empty">Los logs aparecerán aquí cuando se ejecuten las URLs...</div>';
        return;
    }

    box.innerHTML = logs.map(log =>
        `<div class="log-entry" id="log-entry-${log.id}">${logEntryMarkup(log)}</div>`
    ).join('');

    box.scrollTop = box.scrollHeight;
}

// ─── Response detail modal ─────────────────────────────────

function openLogModal(id) {
    const entry = logs.find(l => l.id === id);
    if (!entry) return;

    const methodEl = document.getElementById('modalMethod');
    methodEl.textContent = entry.method;
    methodEl.className = 'url-card-method method-' + entry.method;

    document.getElementById('modalUrl').textContent = entry.url;
    document.getElementById('modalTimestamp').textContent = entry.timestamp;
    document.getElementById('modalStatusCode').textContent = entry.code || '—';

    const statusEl = document.getElementById('modalStatus');
    statusEl.textContent = entry.status === 'success' ? 'Éxito' : entry.status === 'error' ? 'Error' : 'Pendiente';
    statusEl.className = 'badge ' + (entry.status === 'success' ? 'badge-success' : entry.status === 'error' ? 'badge-destructive' : 'badge-warning');

    const headersEntries = Object.entries(entry.responseHeaders || {});
    document.getElementById('modalHeaders').textContent = headersEntries.length
        ? headersEntries.map(([k, v]) => `${k}: ${v}`).join('\n')
        : 'Sin headers disponibles';

    const bodyEl = document.getElementById('modalBody');
    if (entry.body === null || entry.body === undefined || entry.body === '') {
        bodyEl.textContent = entry.bodyNote || '(Respuesta vacía)';
    } else {
        const pretty = tryPrettyJson(entry.body);
        bodyEl.textContent = entry.bodyNote ? `${pretty}\n\n⚠ ${entry.bodyNote}` : pretty;
    }

    document.getElementById('logModalOverlay').style.display = 'flex';
}

function closeLogModal() {
    document.getElementById('logModalOverlay').style.display = 'none';
}

function tryPrettyJson(text) {
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch (e) {
        return text;
    }
}

function updateStats() {
    const total   = logs.length;
    const success = logs.filter(l => l.status === 'success').length;
    const error   = logs.filter(l => l.status === 'error').length;
    const pending = logs.filter(l => l.status === 'pending').length;

    document.getElementById('totalCount').textContent   = total;
    document.getElementById('successCount').textContent = success;
    document.getElementById('errorCount').textContent   = error;
    document.getElementById('pendingCount').textContent = pending;
}

// ─── HTTP request ─────────────────────────────────────────

async function executeRequest(url, method, useAuth, authUser, authPass, customHeaders) {
    try {
        const reqHeaders = { 'Content-Type': 'application/json', ...customHeaders };
        if (useAuth && authUser && authPass) {
            reqHeaders['Authorization'] = `Basic ${btoa(`${authUser}:${authPass}`)}`;
        }

        const options = { method, headers: reqHeaders };
        const useCors = document.getElementById('useCorsMode').checked;
        if (!useCors) options.mode = 'no-cors';

        const response = await fetch(url, options);

        if (!useCors) {
            // En modo no-cors la respuesta es "opaca": el navegador no permite leer su contenido.
            return {
                status: 'success',
                code: 'Enviada (no-cors)',
                body: null,
                bodyNote: 'No se puede leer el contenido de la respuesta: el modo "no-cors" bloquea el acceso al cuerpo (restricción del navegador). Activa la casilla "Modo CORS" para poder ver el contenido de las próximas ejecuciones.',
                responseHeaders: {}
            };
        }

        let rawBody = await response.text();
        const responseHeaders = {};
        response.headers.forEach((value, key) => { responseHeaders[key] = value; });

        // Evita que una respuesta enorme quede guardada completa en memoria por cada ejecución.
        let bodyNote = '';
        if (rawBody.length > MAX_BODY_CHARS) {
            bodyNote = `Respuesta truncada: se guardaron los primeros ${MAX_BODY_CHARS.toLocaleString()} caracteres de ${rawBody.length.toLocaleString()} totales.`;
            rawBody = rawBody.slice(0, MAX_BODY_CHARS);
        }

        return {
            status: response.ok ? 'success' : 'error',
            code: `HTTP ${response.status}`,
            body: rawBody,
            bodyNote,
            responseHeaders
        };
    } catch (e) {
        return { status: 'error', code: e.message, body: null, bodyNote: '', responseHeaders: {} };
    }
}

// ─── Cron parsing ───────────────────────────────────────────

// Convierte un campo cron ("*", "5", "1-5", "*/15", "1,3,5", "1-5/2") en un Set de valores válidos.
function parseCronField(field, min, max) {
    const values = new Set();
    field.split(',').forEach(part => {
        let range = part;
        let step = 1;
        if (part.includes('/')) {
            const [r, s] = part.split('/');
            range = r;
            step = parseInt(s, 10);
            if (isNaN(step) || step <= 0) throw new Error('Paso inválido');
        }
        let start, end;
        if (range === '*') {
            start = min; end = max;
        } else if (range.includes('-')) {
            const [a, b] = range.split('-').map(Number);
            if (isNaN(a) || isNaN(b)) throw new Error('Rango inválido');
            start = a; end = b;
        } else {
            const n = Number(range);
            if (isNaN(n)) throw new Error('Valor inválido');
            start = end = n;
        }
        if (start < min || end > max || start > end) throw new Error('Fuera de rango');
        for (let i = start; i <= end; i += step) values.add(i);
    });
    return values;
}

function validateCron(expr) {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    try {
        const [min, hour, dom, mon, dow] = parts;
        parseCronField(min, 0, 59);
        parseCronField(hour, 0, 23);
        parseCronField(dom, 1, 31);
        parseCronField(mon, 1, 12);
        parseCronField(dow, 0, 7); // 0 y 7 son domingo
        return true;
    } catch (e) {
        return false;
    }
}

function cronMatchesDate(expr, date) {
    const [minF, hourF, domF, monF, dowF] = expr.trim().split(/\s+/);
    const minSet = parseCronField(minF, 0, 59);
    const hourSet = parseCronField(hourF, 0, 23);
    const domSet = parseCronField(domF, 1, 31);
    const monSet = parseCronField(monF, 1, 12);
    const dowSet = parseCronField(dowF, 0, 7);

    const dow = date.getDay(); // 0 = domingo
    const dowMatches = dowSet.has(dow) || (dow === 0 && dowSet.has(7));

    return minSet.has(date.getMinutes())
        && hourSet.has(date.getHours())
        && domSet.has(date.getDate())
        && monSet.has(date.getMonth() + 1)
        && dowMatches;
}

// ─── Scheduler (run all) ──────────────────────────────────

function buildExecutionQueue() {
    executionQueue = [];
    urls.forEach(u => {
        if (u.scheduleType === 'cron') return; // los cron se manejan con el botón "Auto" de cada URL
        u.times.forEach(t => executionQueue.push({ delayMs: t * 1000, ...u, time: t }));
    });
    executionQueue.sort((a, b) => a.delayMs - b.delayMs);
}

async function executeQueue() {
    buildExecutionQueue();

    for (let i = 0; i < executionQueue.length && isRunning; i++) {
        const item = executionQueue[i];
        const prevDelay = i > 0 ? executionQueue[i - 1].delayMs : 0;
        const wait = item.delayMs - prevDelay;
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        if (!isRunning) break;

        const logIdx = addLog(item.time, item.url, item.method, 'pending');
        try {
            const result = await executeRequest(item.url, item.method, item.useAuth, item.authUser, item.authPass, item.customHeaders);
            updateLog(logIdx, result.status, result.code, result);
        } catch (e) {
            updateLog(logIdx, 'error', e.message);
        }
    }

    if (isRunning) {
        isRunning = false;
        setStatus('idle', 'Completado ✓');
    }
}

function startScheduler() {
    if (urls.length === 0) { alert('Agrega al menos una URL'); return; }

    const hasSecondsUrls = urls.some(u => u.scheduleType !== 'cron');
    if (!hasSecondsUrls) {
        alert('"Iniciar todo" solo aplica a URLs con tiempos en segundos. Para URLs con cron, usa el botón "Auto" de cada una.');
        return;
    }

    isRunning = true;
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    setStatus('running', 'Ejecutando');

    logs = [];
    renderLogs();
    updateStats();
    executeQueue();
}

// silent = true cuando Electron cierra la ventana
function abortAll(silent = false) {
    if (!silent && !confirm('¿Abortar todo? Se detendrán todas las ejecuciones.')) return;

    isRunning = false;
    Object.keys(autoExecutors).forEach(id => delete autoExecutors[id]);

    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    setStatus('idle', 'Detenido');
    renderUrls();
}

// ─── Status helpers ───────────────────────────────────────

function setStatus(state, text) {
    const pill = document.getElementById('statusPill');
    const label = document.getElementById('statusText');
    const dot = document.getElementById('headerDot');

    label.textContent = text;
    pill.className = 'status-pill' + (state === 'running' ? ' running' : state === 'error' ? ' error' : '');
    dot.className = 'dot' + (state === 'running' ? ' running' : '');
}

// ─── Clear / Download logs ────────────────────────────────

function clearLogs() {
    if (confirm('¿Limpiar todos los logs?')) {
        logs = [];
        renderLogs();
        updateStats();
    }
}

function downloadLogs() {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {
        href: url, download: `logs-${new Date().toISOString().split('T')[0]}.json`
    });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─── Persistence ──────────────────────────────────────────

function saveToLocalStorage() {
    localStorage.setItem('urlSchedulerConfig', JSON.stringify({ urls, headers }));
}

function loadFromLocalStorage() {
    try {
        const saved = localStorage.getItem('urlSchedulerConfig');
        if (saved) {
            const state = JSON.parse(saved);
            // Normaliza URLs guardadas antes de que existiera scheduleType (siempre eran "segundos")
            urls = (state.urls || []).map(u => ({ scheduleType: 'seconds', ...u }));
            headers = state.headers || [];
            renderUrls();
            renderHeaders();
        }
    } catch (e) {
        console.error('Error cargando config:', e);
    }
}

// ─── Live clock ───────────────────────────────────────────

function startLiveTimer() {
    const el = document.getElementById('liveTimer');
    setInterval(() => {
        const now = new Date();
        el.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
            .map(n => String(n).padStart(2, '0')).join(':');
    }, 200);
}

// ─── Spin keyframe (for loading button) ───────────────────

const spinStyle = document.createElement('style');
spinStyle.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.appendChild(spinStyle);

// ─── Init ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    loadFromLocalStorage();
    startLiveTimer();
    setConfigCollapsed(localStorage.getItem(CONFIG_COLLAPSED_KEY) === '1');

    document.getElementById('timeInput').addEventListener('keypress', e => { if (e.key === 'Enter') addTime(); });
    document.getElementById('urlInput').addEventListener('keypress', e => { if (e.key === 'Enter') addUrl(); });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeLogModal();
    });

    if (window.electronAPI) {
        window.electronAPI.onAppClose(() => abortAll(true));
    }
});
