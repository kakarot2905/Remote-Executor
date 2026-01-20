# CMD Executor Worker Agent - Electron GUI

A beautiful desktop application for managing and controlling the CMD Executor Worker Agent with an intuitive graphical interface.

## 📋 Features

- **Easy Configuration**: Configure all worker settings through a user-friendly interface
- **Real-time Monitoring**: Watch worker output and status updates in real-time
- **Configuration Management**: Save and load worker configurations
- **Docker Integration**: Full support for Docker isolation settings
- **Status Indicators**: Visual feedback for worker state (Running/Stopped)
- **Output Logging**: Live output stream with syntax highlighting

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- Docker installed (for Docker execution mode)
- CMD Executor server running (default: http://localhost:3000)

### Installation

1. Install dependencies:

```bash
npm install
```

2. Run the Electron application:

```bash
npm run electron
```

Or for development mode with DevTools:

```bash
npm run electron:dev
```

## 🎮 Usage

### Starting the Worker

1. **Configure Settings**:
   - **Server URL**: The central server URL (e.g., `http://localhost:3000`)
   - **Worker ID**: Optional custom worker identifier (auto-generated if empty)
   - **Hostname**: Optional custom hostname (auto-detected if empty)

2. **Docker Configuration**:
   - **Enable Docker**: Toggle Docker isolation (recommended for security)
   - **Timeout**: Maximum execution time in milliseconds (default: 300000ms = 5 minutes)
   - **Memory Limit**: Memory limit for containers (e.g., `512m`, `1g`)
   - **CPU Limit**: CPU cores limit (e.g., `2.0`)

3. **Performance Settings**:
   - **Max Parallel Jobs**: Maximum concurrent jobs (0 = auto based on CPU count)

4. **Click "Start Worker"** to launch the worker agent

### Monitoring

- Watch the **Status Panel** for current worker state
- View real-time output in the **Output Panel**
- Color-coded logs for easy reading:
  - 🔵 Blue: Info messages
  - 🟢 Green: Success messages
  - 🟡 Yellow: Warnings
  - 🔴 Red: Errors

### Stopping the Worker

Click **"Stop Worker"** to gracefully shutdown the worker agent.

## 📁 File Structure

```
electron/
├── main.js              # Electron main process (window management, IPC)
├── preload.js           # Secure IPC bridge
├── config.json          # Saved configuration (auto-generated)
├── renderer/
│   ├── index.html       # Main UI interface
│   ├── styles.css       # Modern dark theme styles
│   └── renderer.js      # Frontend logic
└── assets/              # Application icons (optional)
    ├── icon.png
    ├── icon.ico
    └── icon.icns
```

## ⚙️ Configuration Variables

All configuration options correspond to worker-agent.js environment variables:

| UI Field          | Environment Variable  | Default                 | Description              |
| ----------------- | --------------------- | ----------------------- | ------------------------ |
| Server URL        | `--server` arg        | `http://localhost:3000` | Central server URL       |
| Worker ID         | `WORKER_ID`           | Auto-generated          | Unique worker identifier |
| Hostname          | `HOSTNAME`            | Auto-detected           | Worker hostname          |
| Docker Timeout    | `DOCKER_TIMEOUT`      | `300000`                | Container timeout (ms)   |
| Memory Limit      | `DOCKER_MEMORY_LIMIT` | `512m`                  | Container memory limit   |
| CPU Limit         | `DOCKER_CPU_LIMIT`    | `2.0`                   | Container CPU cores      |
| Enable Docker     | `ENABLE_DOCKER`       | `true`                  | Use Docker isolation     |
| Max Parallel Jobs | `MAX_PARALLEL_JOBS`   | `0`                     | Concurrent job limit     |

## 🔒 Security Features

The Electron app implements security best practices:

- **Context Isolation**: Enabled for renderer process
- **Node Integration**: Disabled in renderer
- **Preload Script**: Secure IPC communication bridge
- **Content Security Policy**: Strict CSP headers

## 🛠️ Development

### Run in Development Mode

```bash
npm run electron:dev
```

This enables:

- Developer Tools (DevTools)
- Hot reload capabilities
- Detailed error logging

### Build for Production

Build standalone executables:

```bash
npm run electron:build
```

This creates platform-specific installers in `dist-electron/`:

- **Windows**: `.exe` installer
- **macOS**: `.dmg` image
- **Linux**: `.AppImage`

## 📦 Building Standalone Application

### Windows

```bash
npm run electron:build
```

Output: `dist-electron/CMD Executor Worker Setup.exe`

### macOS

```bash
npm run electron:build
```

Output: `dist-electron/CMD Executor Worker.dmg`

### Linux

```bash
npm run electron:build
```

Output: `dist-electron/CMD Executor Worker.AppImage`

## 🎨 User Interface

The application features a modern dark theme with:

- Responsive design for all screen sizes
- Smooth animations and transitions
- Color-coded status indicators
- Real-time output streaming
- Notification system for important events

## 🐛 Troubleshooting

### Worker Won't Start

1. Check that the server URL is correct and accessible
2. Verify Docker is installed and running (if Docker mode enabled)
3. Check the output panel for error messages
4. Ensure worker-agent.js is in the parent directory

### No Output Displayed

1. Check that the worker started successfully (status indicator)
2. Verify the server is running and accepting connections
3. Check DevTools console for JavaScript errors (development mode)

### Configuration Not Saving

1. Check file permissions in the electron/ directory
2. Verify config.json can be created/written
3. Check DevTools console for errors

## 📝 Notes

- The Electron app does **not** modify the backend worker-agent.js code
- All worker logic remains in the original worker-agent.js file
- The GUI simply provides a convenient interface for configuration and control
- Configuration is stored locally in `electron/config.json`

## 🤝 Integration

The Electron app works alongside your existing setup:

- Web server (Next.js) continues to run independently
- Worker agent is controlled through the GUI
- Multiple workers can be managed by running multiple Electron instances
- No changes to existing job submission or monitoring systems

## 📄 License

Part of the CMD Executor Distributed System project.

---

**Enjoy managing your workers with style! 🚀**
