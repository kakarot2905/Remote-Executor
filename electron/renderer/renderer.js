// ============================================================================
// CMD EXECUTOR WORKER AGENT - Renderer Process
// Enhanced JavaScript with improved UI interactions and state management
// ============================================================================

let isWorkerRunning = false;
let outputLineCount = 0;
const MAX_OUTPUT_LINES = 1000; // Limit output to prevent memory issues

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const pidInfo = document.getElementById('pidInfo');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const outputContainer = document.getElementById('outputContainer');
const clearOutputBtn = document.getElementById('clearOutputBtn');
const copyOutputBtn = document.getElementById('copyOutputBtn');
const saveConfigBtn = document.getElementById('saveConfigBtn');
const loadConfigBtn = document.getElementById('loadConfigBtn');
const lineCountDisplay = document.getElementById('lineCount');
const footerStatus = document.getElementById('footerStatus');
const footerStatusText = document.getElementById('footerStatusText');
const notificationContainer = document.getElementById('notificationContainer');
const cpuMetric = document.getElementById('cpuMetric');
const memMetric = document.getElementById('memMetric');
const jobsMetric = document.getElementById('jobsMetric');

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[v0] Initializing CMD Executor Worker Agent');

    await loadConfiguration();
    await updateWorkerStatus();
    await refreshDockerStats();
    setupEventListeners();

    // Listen for worker events from Electron
    if (window.electronAPI) {
        window.electronAPI.onWorkerOutput(handleWorkerOutput);
        window.electronAPI.onWorkerStopped(handleWorkerStopped);
        window.electronAPI.onWorkerError(handleWorkerError);
    }
});

function setupEventListeners() {
    startBtn.addEventListener('click', startWorker);
    stopBtn.addEventListener('click', stopWorker);
    clearOutputBtn.addEventListener('click', clearOutput);
    copyOutputBtn.addEventListener('click', copyOutput);
    saveConfigBtn.addEventListener('click', saveConfiguration);
    loadConfigBtn.addEventListener('click', loadConfiguration);

    // Periodic Docker stats refresh
    setInterval(refreshDockerStats, 2000);

    // Add form input validation
    const serverUrlInput = document.getElementById('serverUrl');
    serverUrlInput?.addEventListener('input', validateServerUrl);
}

// ============================================================================
// CONFIGURATION MANAGEMENT
// ============================================================================

async function getFormConfig() {
    return {
        serverUrl: document.getElementById('serverUrl').value.trim(),
        workerId: document.getElementById('workerId').value.trim(),
        hostname: document.getElementById('hostname').value.trim(),
        dockerTimeout: document.getElementById('dockerTimeout').value,
        dockerMemoryLimit: document.getElementById('dockerMemoryLimit').value.trim(),
        dockerCpuLimit: document.getElementById('dockerCpuLimit').value.trim(),
        enableDocker: document.getElementById('enableDocker').checked,
        maxParallelJobs: document.getElementById('maxParallelJobs').value,
    };
}

function setFormConfig(config) {
    document.getElementById('serverUrl').value = config.serverUrl || 'http://localhost:3000';
    document.getElementById('workerId').value = config.workerId || '';
    document.getElementById('hostname').value = config.hostname || '';
    document.getElementById('dockerTimeout').value = config.dockerTimeout || '300000';
    document.getElementById('dockerMemoryLimit').value = config.dockerMemoryLimit || '512m';
    document.getElementById('dockerCpuLimit').value = config.dockerCpuLimit || '2.0';
    document.getElementById('enableDocker').checked = config.enableDocker !== false;
    document.getElementById('maxParallelJobs').value = config.maxParallelJobs || '0';
}

async function saveConfiguration() {
    console.log('[v0] Saving configuration');
    const config = await getFormConfig();

    if (!config.serverUrl) {
        showNotification('Server URL is required', 'error');
        return;
    }

    startBtn.disabled = true;
    const originalText = saveConfigBtn.innerHTML;
    saveConfigBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Saving...</span>';

    const result = await window.electronAPI?.saveConfig(config) || { success: true };

    if (result.success) {
        showNotification('Configuration saved successfully ✓', 'success');
    } else {
        showNotification(`Failed to save configuration: ${result.message}`, 'error');
    }

    saveConfigBtn.innerHTML = originalText;
}

async function loadConfiguration() {
    console.log('[v0] Loading configuration');
    const result = await window.electronAPI?.loadConfig() || { success: true };

    if (result.success && result.config) {
        setFormConfig(result.config);
        showNotification('Configuration loaded ✓', 'info');
    } else if (result.success) {
        // Use defaults if no config file exists
        setFormConfig({});
    }
}

function validateServerUrl(event) {
    const value = event.target.value.trim();
    const isValid = /^https?:\/\//.test(value) || value === '';
    event.target.style.borderColor = isValid ? '' : 'var(--color-danger)';
}

// ============================================================================
// WORKER CONTROL
// ============================================================================

async function startWorker() {
    console.log('[v0] Starting worker');
    const config = await getFormConfig();

    // Validate required fields
    if (!config.serverUrl) {
        showNotification('❌ Server URL is required', 'error');
        return;
    }

    startBtn.disabled = true;
    const originalContent = startBtn.innerHTML;
    startBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Starting...</span>';

    appendOutput('[INFO] Initializing worker agent...', 'info');
    appendOutput(`[INFO] Server: ${config.serverUrl}`, 'info');
    appendOutput(`[INFO] Docker Enabled: ${config.enableDocker ? 'Yes' : 'No'}`, 'info');

    const result = await window.electronAPI?.startWorker(config) || { success: true };

    if (result.success) {
        showNotification('✓ Worker started successfully', 'success');
        appendOutput('[SUCCESS] Worker agent is now running', 'success');
        await updateWorkerStatus();
    } else {
        showNotification(`❌ Failed to start worker: ${result.message}`, 'error');
        appendOutput(`[ERROR] ${result.message}`, 'error');
        if (result.output) {
            appendOutput(result.output, 'stderr');
        }
        startBtn.disabled = false;
        startBtn.innerHTML = originalContent;
    }
}

async function stopWorker() {
    console.log('[v0] Stopping worker');
    stopBtn.disabled = true;
    const originalContent = stopBtn.innerHTML;
    stopBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Stopping...</span>';

    appendOutput('[INFO] Shutting down worker agent...', 'info');

    const result = await window.electronAPI?.stopWorker() || { success: true };

    if (result.success) {
        showNotification('✓ Worker stopped', 'info');
        appendOutput('[SUCCESS] Worker agent has been stopped', 'success');
    } else {
        showNotification(`❌ Failed to stop worker: ${result.message}`, 'error');
        appendOutput(`[ERROR] Failed to stop: ${result.message}`, 'error');
    }

    await updateWorkerStatus();
    stopBtn.innerHTML = originalContent;
}

async function updateWorkerStatus() {
    console.log('[v0] Updating worker status');
    const status = await window.electronAPI?.getWorkerStatus() || { isRunning: false };

    isWorkerRunning = status.isRunning;

    if (status.isRunning) {
        // Running state
        statusDot.className = 'status-dot running';
        statusText.textContent = 'RUNNING';
        statusText.style.color = 'var(--color-success)';
        pidInfo.textContent = `PID: ${status.pid}`;

        footerStatus.classList.add('connected');
        footerStatusText.textContent = 'CONNECTED';

        startBtn.disabled = true;
        startBtn.innerHTML = '<span class="btn-icon">✓</span><span class="btn-text">Running</span>';
        stopBtn.disabled = false;
        stopBtn.innerHTML = '<span class="btn-icon">⏹️</span><span class="btn-text">Stop Worker</span>';
    } else {
        // Stopped state
        statusDot.className = 'status-dot stopped';
        statusText.textContent = 'IDLE';
        statusText.style.color = 'var(--color-danger)';
        pidInfo.textContent = 'Not running';

        footerStatus.classList.remove('connected');
        footerStatusText.textContent = 'DISCONNECTED';

        startBtn.disabled = false;
        startBtn.innerHTML = '<span class="btn-icon">▶️</span><span class="btn-text">Start Worker</span>';
        stopBtn.disabled = true;
        stopBtn.innerHTML = '<span class="btn-icon">⏹️</span><span class="btn-text">Stop Worker</span>';
    }
}

// ============================================================================
// DOCKER CONTAINER STATS (CPU / MEMORY)
// ============================================================================

async function refreshDockerStats() {
    if (!window.electronAPI?.getDockerStats) {
        console.warn('[RENDERER] getDockerStats not available');
        return;
    }

    try {
        const stats = await window.electronAPI.getDockerStats();
        console.log('[RENDERER] Docker stats received:', stats);

        if (!stats) return;

        if (cpuMetric) {
            cpuMetric.textContent = `${stats.cpuUsage ?? 0}%`;
            console.log('[RENDERER] Updated CPU metric:', cpuMetric.textContent);
        }
        if (memMetric) {
            memMetric.textContent = `${stats.memoryMb ?? 0} MB`;
            console.log('[RENDERER] Updated MEM metric:', memMetric.textContent);
        }
        if (jobsMetric) {
            jobsMetric.textContent = `${stats.containerCount ?? 0}`;
            console.log('[RENDERER] Updated JOBS metric:', jobsMetric.textContent);
        }
        console.log('[RENDERER] Raw Docker stats output:', stats.raw);
    } catch (err) {
        console.error('[RENDERER] Failed to refresh Docker stats:', err);
    }
}

// ============================================================================
// OUTPUT MANAGEMENT
// ============================================================================

function appendOutput(text, type = 'stdout') {
    console.log(`[v0] Appending output: [${type}] ${text.substring(0, 50)}...`);

    const lines = text.split('\n').filter(line => line.trim());

    // Remove placeholder if first append
    if (outputLineCount === 0 && outputContainer.querySelector('.output-empty')) {
        outputContainer.innerHTML = '';
    }

    lines.forEach(line => {
        const lineDiv = document.createElement('div');
        lineDiv.className = 'output-line';

        // Determine line type based on content
        if (line.includes('[INFO]')) {
            lineDiv.className = 'output-line info';
        } else if (line.includes('[SUCCESS]')) {
            lineDiv.className = 'output-line success';
        } else if (line.includes('[WARN]')) {
            lineDiv.className = 'output-line warn';
        } else if (line.includes('[ERROR]')) {
            lineDiv.className = 'output-line error';
        } else if (type === 'stderr') {
            lineDiv.className = 'output-line error';
        } else if (type) {
            lineDiv.className = `output-line ${type}`;
        }

        lineDiv.textContent = line;
        outputContainer.appendChild(lineDiv);
        outputLineCount++;

        // Trim old lines if limit exceeded
        if (outputLineCount > MAX_OUTPUT_LINES) {
            const firstChild = outputContainer.firstChild;
            if (firstChild) {
                firstChild.remove();
                outputLineCount--;
            }
        }
    });

    // Update line count display
    if (lineCountDisplay) {
        lineCountDisplay.textContent = `${outputLineCount} line${outputLineCount !== 1 ? 's' : ''}`;
    }

    // Auto-scroll to bottom
    outputContainer.scrollTop = outputContainer.scrollHeight;
}

function clearOutput() {
    console.log('[v0] Clearing output');
    outputContainer.innerHTML = '<div class="output-empty"><span class="empty-icon">🔌</span><p>Waiting for output...</p></div>';
    outputLineCount = 0;
    lineCountDisplay.textContent = '0 lines';
    showNotification('✓ Output cleared', 'info');
}

function copyOutput() {
    console.log('[v0] Copying output to clipboard');
    const text = outputContainer.innerText;

    if (!text || text.includes('Waiting for output')) {
        showNotification('❌ No output to copy', 'error');
        return;
    }

    navigator.clipboard.writeText(text)
        .then(() => {
            showNotification(`✓ Copied ${outputLineCount} lines to clipboard`, 'success');
        })
        .catch(err => {
            console.error('[v0] Copy failed:', err);
            showNotification('❌ Failed to copy output', 'error');
        });
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleWorkerOutput(data) {
    console.log('[v0] Worker output received');
    appendOutput(data.text, data.type || 'stdout');
}

function handleWorkerStopped(data) {
    console.log('[v0] Worker stopped');
    appendOutput(`[INFO] Worker stopped with exit code: ${data.exitCode}`, 'info');
    updateWorkerStatus();
}

function handleWorkerError(data) {
    console.log('[v0] Worker error:', data.message);
    appendOutput(`[ERROR] Worker error: ${data.message}`, 'error');
    showNotification(`❌ Worker error: ${data.message}`, 'error');
    updateWorkerStatus();
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

function showNotification(message, type = 'info') {
    console.log(`[v0] Notification [${type}]: ${message}`);

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    notificationContainer.appendChild(notification);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        notification.remove();
    }, 4000);
}

// ============================================================================
// AUTO-REFRESH & MAINTENANCE
// ============================================================================

// Auto-refresh status every 5 seconds
setInterval(() => {
    if (isWorkerRunning) {
        updateWorkerStatus();
    }
}, 5000);

// Add keyboard shortcuts
document.addEventListener('keydown', (event) => {
    // Ctrl/Cmd + S to save config
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        saveConfiguration();
    }

    // Ctrl/Cmd + L to load config
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'L') {
        event.preventDefault();
        loadConfiguration();
    }
});

// Log initialization complete
console.log('[v0] CMD Executor Worker Agent initialized');
