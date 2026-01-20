const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');

let mainWindow;
let workerProcess = null;
let workerStats = {
    dockerContainers: 0,
    dockerCpuUsage: 0,
    dockerMemoryMb: 0,
    lastUpdated: 0
};

// Parse heartbeat data from worker stdout
function parseWorkerHeartbeat(data) {
    const dataStr = data.toString();

    // Look for Docker stats in the output
    // Pattern: [WORKER-STATS] dockerContainers=X dockerCpuUsage=Y dockerMemoryMb=Z
    if (dataStr.includes('[WORKER-STATS]')) {
        const match = dataStr.match(/dockerContainers=(\d+)\s+dockerCpuUsage=([\d.]+)\s+dockerMemoryMb=(\d+)/);
        if (match) {
            const newStats = {
                dockerContainers: parseInt(match[1]),
                dockerCpuUsage: parseFloat(match[2]),
                dockerMemoryMb: parseInt(match[3]),
                lastUpdated: Date.now()
            };
            workerStats = newStats;
            console.log('[STATS PARSED]', newStats);
        }
    }
}

// Get Docker container stats from worker process ONLY
// This ensures we see the raw output from worker-agent.js, not from main.js
async function getDockerContainerStats() {

    // Always return stats from worker (even if old/empty)
    // This ensures we're getting data from worker-agent.js, not querying Docker ourselves
    return {
        cpuUsage: workerStats.dockerCpuUsage || 0,
        memoryMb: workerStats.dockerMemoryMb || 0,
        containerCount: workerStats.dockerContainers || 0,
        containers: [],
        lastUpdated: workerStats.lastUpdated || 0,
        age: workerStats.lastUpdated ? Date.now() - workerStats.lastUpdated : -1
    };
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: 'CMD Executor Worker Agent',
        icon: path.join(__dirname, 'assets', 'icon.png'),
    });

    // Check if user is authenticated, show login page if not
    const hasToken = false; // Will be checked via IPC in renderer
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'login.html'));

    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (workerProcess) {
        workerProcess.kill();
    }
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Docker container stats for renderer
ipcMain.handle('get-docker-stats', async () => {
    const stats = await getDockerContainerStats();
    console.log('[IPC] get-docker-stats called, returning:', stats);
    return stats;
});

// IPC Handlers

// Start worker agent
ipcMain.handle('start-worker', async (event, config) => {
    return new Promise((resolve, reject) => {
        if (workerProcess) {
            resolve({ success: false, message: 'Worker is already running' });
            return;
        }

        const workerPath = path.join(__dirname, '..', 'worker-agent.js');
        const args = ['--server', config.serverUrl];

        // Set environment variables
        const env = {
            ...process.env,
            WORKER_ID: config.workerId || undefined,
            HOSTNAME: config.hostname || undefined,
            DOCKER_TIMEOUT: config.dockerTimeout || '300000',
            DOCKER_MEMORY_LIMIT: config.dockerMemoryLimit || '512m',
            DOCKER_CPU_LIMIT: config.dockerCpuLimit || '2.0',
            ENABLE_DOCKER: config.enableDocker ? 'true' : 'false',
            MAX_PARALLEL_JOBS: config.maxParallelJobs || '0',
        };

        try {
            workerProcess = spawn('node', [workerPath, ...args], {
                env,
                cwd: path.join(__dirname, '..'),
            });

            let startupOutput = '';

            workerProcess.stdout.on('data', (data) => {
                const text = data.toString();
                startupOutput += text;

                // Parse Docker stats from heartbeat output
                parseWorkerHeartbeat(text);

                if (mainWindow) {
                    mainWindow.webContents.send('worker-output', {
                        type: 'stdout',
                        text,
                    });
                }
            });

            workerProcess.stderr.on('data', (data) => {
                const text = data.toString();
                startupOutput += text;
                if (mainWindow) {
                    mainWindow.webContents.send('worker-output', {
                        type: 'stderr',
                        text,
                    });
                }
            });

            workerProcess.on('close', (code) => {
                if (mainWindow) {
                    mainWindow.webContents.send('worker-stopped', { exitCode: code });
                }
                workerProcess = null;
            });

            workerProcess.on('error', (error) => {
                if (mainWindow) {
                    mainWindow.webContents.send('worker-error', {
                        message: error.message,
                    });
                }
                workerProcess = null;
            });

            // Give it a moment to start
            setTimeout(() => {
                if (workerProcess) {
                    resolve({ success: true, message: 'Worker started successfully' });
                } else {
                    resolve({
                        success: false,
                        message: 'Worker failed to start',
                        output: startupOutput,
                    });
                }
            }, 1000);
        } catch (error) {
            resolve({ success: false, message: error.message });
        }
    });
});

// Stop worker agent
ipcMain.handle('stop-worker', async () => {
    return new Promise((resolve) => {
        if (!workerProcess) {
            resolve({ success: false, message: 'Worker is not running' });
            return;
        }

        workerProcess.on('close', () => {
            workerProcess = null;
            resolve({ success: true, message: 'Worker stopped successfully' });
        });

        // Send SIGTERM for graceful shutdown
        workerProcess.kill('SIGTERM');

        // Force kill after 5 seconds if still running
        setTimeout(() => {
            if (workerProcess) {
                workerProcess.kill('SIGKILL');
                workerProcess = null;
                resolve({ success: true, message: 'Worker force stopped' });
            }
        }, 5000);
    });
});

// Get worker status
ipcMain.handle('get-worker-status', async () => {
    return {
        isRunning: workerProcess !== null,
        pid: workerProcess ? workerProcess.pid : null,
    };
});

// Save configuration to file
ipcMain.handle('save-config', async (event, config) => {
    const fs = require('fs').promises;
    const configPath = path.join(__dirname, 'config.json');
    try {
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        return { success: true, message: 'Configuration saved' };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

// Load configuration from file
ipcMain.handle('load-config', async () => {
    const fs = require('fs').promises;
    const configPath = path.join(__dirname, 'config.json');
    try {
        const data = await fs.readFile(configPath, 'utf-8');
        return { success: true, config: JSON.parse(data) };
    } catch (error) {
        // Return default config if file doesn't exist
        return {
            success: true,
            config: {
                serverUrl: 'http://localhost:3000',
                workerId: '',
                hostname: '',
                dockerTimeout: '300000',
                dockerMemoryLimit: '512m',
                dockerCpuLimit: '2.0',
                enableDocker: true,
                maxParallelJobs: '0',
            },
        };
    }
});
