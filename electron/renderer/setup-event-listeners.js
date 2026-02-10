/*
 * Lightweight UI wiring for the renderer index page.
 * Keeps the existing HTML structure and connects buttons to Electron IPC.
 */

const MAX_OUTPUT_LINES = 1000;
let outputLineCount = 0;

const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const workerIdDisplay = document.getElementById('workerIdDisplay');
const activeJobsDisplay = document.getElementById('activeJobsDisplay');
const workerStatusText = document.getElementById('workerStatusText');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const copyOutputBtn = document.getElementById('copyOutputBtn');
const clearOutputBtn = document.getElementById('clearOutputBtn');
const outputContainer = document.getElementById('terminal');
const lineCount = document.getElementById('lineCount');

const serverUrlInput = document.getElementById('serverUrl');
const workerIdInput = document.getElementById('workerId');
const maxJobsInput = document.getElementById('maxJobs');

function getConfigFromForm() {
    return {
        serverUrl: serverUrlInput?.value.trim() || '',
        workerId: workerIdInput?.value.trim() || '',
        maxParallelJobs: maxJobsInput?.value || '0',
    };
}

function setStatusUi(isRunning, pid) {
    if (!statusDot || !statusText || !workerStatusText) return;

    if (isRunning) {
        statusDot.classList.remove('inactive');
        statusDot.classList.add('active');
        statusText.textContent = 'Active';
        workerStatusText.textContent = pid ? `Running (PID ${pid})` : 'Running';
        workerStatusText.classList.remove('status-idle');
        startBtn.disabled = true;
        stopBtn.disabled = false;
    } else {
        statusDot.classList.remove('active');
        statusDot.classList.add('inactive');
        statusText.textContent = 'Inactive';
        workerStatusText.textContent = 'Idle';
        workerStatusText.classList.add('status-idle');
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }
}

function updateWorkerInfo() {
    if (workerIdDisplay) {
        workerIdDisplay.textContent = workerIdInput?.value.trim() || 'worker-001';
    }
    if (activeJobsDisplay) {
        const maxJobs = maxJobsInput?.value || '0';
        activeJobsDisplay.textContent = `0/${maxJobs}`;
    }
}

function appendOutput(text, type = 'stdout') {
    if (!outputContainer) return;
    const lines = String(text).split('\n').filter(line => line.trim());

    lines.forEach(line => {
        const lineDiv = document.createElement('div');
        lineDiv.className = `terminal-line ${type}`.trim();
        lineDiv.textContent = line;
        outputContainer.appendChild(lineDiv);
        outputLineCount += 1;

        if (outputLineCount > MAX_OUTPUT_LINES) {
            outputContainer.firstChild?.remove();
            outputLineCount -= 1;
        }
    });

    if (lineCount) {
        lineCount.textContent = `${outputLineCount} line${outputLineCount !== 1 ? 's' : ''}`;
    }

    outputContainer.scrollTop = outputContainer.scrollHeight;
}

async function startWorker() {
    const config = getConfigFromForm();

    if (!config.serverUrl) {
        appendOutput('[ERROR] Server URL is required', 'error');
        serverUrlInput?.focus();
        return;
    }

    startBtn.disabled = true;
    appendOutput('[INFO] Starting worker...', 'info');

    if (!window.electronAPI?.startWorker) {
        appendOutput('[ERROR] Electron API not available', 'error');
        startBtn.disabled = false;
        return;
    }

    const result = await window.electronAPI.startWorker(config);
    if (result?.success) {
        appendOutput('[SUCCESS] Worker started', 'success');
    } else {
        appendOutput(`[ERROR] ${result?.message || 'Failed to start worker'}`, 'error');
        startBtn.disabled = false;
    }

    updateWorkerInfo();
    await refreshWorkerStatus();
}

async function stopWorker() {
    stopBtn.disabled = true;
    appendOutput('[INFO] Stopping worker...', 'info');

    if (!window.electronAPI?.stopWorker) {
        appendOutput('[ERROR] Electron API not available', 'error');
        stopBtn.disabled = false;
        return;
    }

    const result = await window.electronAPI.stopWorker();
    if (result?.success) {
        appendOutput('[SUCCESS] Worker stopped', 'success');
    } else {
        appendOutput(`[ERROR] ${result?.message || 'Failed to stop worker'}`, 'error');
    }

    await refreshWorkerStatus();
}

async function refreshWorkerStatus() {
    if (!window.electronAPI?.getWorkerStatus) {
        setStatusUi(false, null);
        return;
    }

    const status = await window.electronAPI.getWorkerStatus();
    setStatusUi(!!status?.isRunning, status?.pid);
}

function clearOutput() {
    if (!outputContainer) return;
    outputContainer.innerHTML = '<div class="terminal-line">$ waiting for commands...</div>';
    outputLineCount = 0;
    if (lineCount) {
        lineCount.textContent = '0 lines';
    }
}

function copyOutput() {
    if (!outputContainer) return;
    const text = outputContainer.innerText.trim();
    if (!text) {
        appendOutput('[WARN] No output to copy', 'warn');
        return;
    }

    navigator.clipboard.writeText(text)
        .then(() => appendOutput('[INFO] Output copied to clipboard', 'info'))
        .catch(() => appendOutput('[ERROR] Failed to copy output', 'error'));
}

function attachEventListeners() {
    startBtn?.addEventListener('click', startWorker);
    stopBtn?.addEventListener('click', stopWorker);
    clearOutputBtn?.addEventListener('click', clearOutput);
    copyOutputBtn?.addEventListener('click', copyOutput);

    workerIdInput?.addEventListener('input', updateWorkerInfo);
    maxJobsInput?.addEventListener('input', updateWorkerInfo);

    if (window.electronAPI) {
        window.electronAPI.onWorkerOutput?.((data) => appendOutput(data.text, data.type || 'stdout'));
        window.electronAPI.onWorkerStopped?.((data) => {
            appendOutput(`[INFO] Worker stopped with exit code: ${data.exitCode}`, 'info');
            refreshWorkerStatus();
        });
        window.electronAPI.onWorkerError?.((data) => {
            appendOutput(`[ERROR] Worker error: ${data.message}`, 'error');
            refreshWorkerStatus();
        });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    attachEventListeners();
    updateWorkerInfo();
    await refreshWorkerStatus();
});
