let currentTimes = [];
let urls = [];
let logs = [];
let isRunning = false;
let executionQueue = [];
let headers = [];
let autoExecutors = {};

// ─── Auth toggle ──────────────────────────────────────────

function toggleAuth() {
    document.getElementById('authFields').style.display =
        document.getElementById('useAuth').checked ? 'block' : 'none';
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

// ─── Add URL ──────────────────────────────────────────────

function addUrl() {
    const url = document.getElementById('urlInput').value.trim();
    const method = document.getElementById('methodSelect').value;
    const useAuth = document.getElementById('useAuth').checked;
    const authUser = document.getElementById('authUser').value;
    const authPass = document.getElementById('authPass').value;

    let customHeaders = {};
    headers.forEach(h => { if (h.key && h.value) customHeaders[h.key] = h.value; });

    if (!url) { alert('Ingresa una URL'); return; }
    if (currentTimes.length === 0) { alert('Agrega al menos un tiempo de ejecución'); return; }

    urls.push({ id: Date.now(), url, method, times: [...currentTimes], useAuth, authUser, authPass, customHeaders });

    document.getElementById('urlInput').value = '';
    currentTimes = [];
    renderTimes();
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
        const timeBadges = item.times.map(t =>
            `<span class="badge badge-secondary">${t}s</span>`
        ).join('');
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
        for (const targetSecond of urlItem.times) {
            await waitUntilSecond(targetSecond);
            const logIdx = addLog(targetSecond, urlItem.url, urlItem.method, 'pending');
            const result = await executeRequest(urlItem.url, urlItem.method, urlItem.useAuth, urlItem.authUser, urlItem.authPass, urlItem.customHeaders);
            updateLog(logIdx, result.status, result.code);
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
        autoExecuteRepeat(id);
    }
    renderUrls();
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
                updateLog(logIdx, result.status, result.code);
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
        timestamp: new Date().toLocaleTimeString(),
        time, url, method, status, code: ''
    };
    logs.push(entry);
    renderLogs();
    updateStats();
    return logs.length - 1;
}

function updateLog(idx, status, code) {
    if (logs[idx]) {
        logs[idx].status = status;
        logs[idx].code = code;
        renderLogs();
        updateStats();
    }
}

function renderLogs() {
    const box = document.getElementById('logBox');
    if (logs.length === 0) {
        box.innerHTML = '<div class="log-empty">Los logs aparecerán aquí cuando se ejecuten las URLs...</div>';
        return;
    }

    box.innerHTML = logs.map(log => {
        let icon, urlClass;
        if (log.status === 'success')      { icon = '✅'; urlClass = ''; }
        else if (log.status === 'error')   { icon = '❌'; urlClass = ''; }
        else                               { icon = '⏳'; urlClass = ''; }

        const codeSpan = log.code
            ? `<span style="color:hsl(215.4 16.3% 46.9%); font-size:11px;">${log.code}</span>`
            : '';

        return `<div class="log-entry">
            <span class="log-ts">${log.timestamp}</span>
            <span class="log-icon">${icon}</span>
            <div class="log-content">
                <span class="log-method">${log.method}</span>
                <span class="log-url">${log.url}</span>
                ${codeSpan}
            </div>
        </div>`;
    }).join('');

    box.scrollTop = box.scrollHeight;
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

        if (!useCors) return { status: 'success', code: 'Enviada (no-cors)' };
        return { status: response.ok ? 'success' : 'error', code: `HTTP ${response.status}` };
    } catch (e) {
        return { status: 'error', code: e.message };
    }
}

// ─── Scheduler (run all) ──────────────────────────────────

function buildExecutionQueue() {
    executionQueue = [];
    urls.forEach(u => {
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
            updateLog(logIdx, result.status, result.code);
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
            urls = state.urls || [];
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

    document.getElementById('timeInput').addEventListener('keypress', e => { if (e.key === 'Enter') addTime(); });
    document.getElementById('urlInput').addEventListener('keypress', e => { if (e.key === 'Enter') addUrl(); });

    if (window.electronAPI) {
        window.electronAPI.onAppClose(() => abortAll(true));
    }
});
