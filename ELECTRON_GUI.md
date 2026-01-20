# 🖥️ Electron GUI for CMD Executor Worker

## Overview

This directory contains a complete **Electron.js desktop application** that provides a graphical user interface for managing and controlling the CMD Executor Worker Agent ([worker-agent.js](../worker-agent.js)).

## 🎯 Purpose

The Electron GUI makes it easy to:

- Configure worker settings without editing code or environment variables
- Start and stop workers with a single click
- Monitor worker output in real-time
- Save and load configurations
- Manage multiple workers across different machines

## ⚡ Quick Start

```bash
# Install dependencies (from project root)
npm install

# Run the Electron GUI
npm run electron

# Or run in development mode with DevTools
npm run electron:dev
```

For detailed instructions, see [QUICKSTART.md](./QUICKSTART.md).

## 📚 Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Get started in 3 steps
- **[README.md](./README.md)** - Complete documentation and usage guide
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - Technical implementation details

## 🏗️ Architecture

### Main Process (`main.js`)

- Manages Electron windows
- Spawns and controls worker-agent.js process
- Handles IPC communication with renderer
- Saves/loads configuration files

### Preload Script (`preload.js`)

- Secure bridge between main and renderer processes
- Exposes safe IPC APIs to frontend
- Implements context isolation

### Renderer Process (`renderer/`)

- **index.html** - Main UI structure
- **styles.css** - Modern dark theme styling
- **renderer.js** - Frontend logic and event handling

## 🎨 Features

### Configuration Management

All worker-agent.js input variables are configurable:

- Server URL
- Worker ID
- Hostname
- Docker timeout, memory, and CPU limits
- Docker enable/disable
- Maximum parallel jobs

### Real-time Monitoring

- Live worker status (Running/Stopped)
- Process ID display
- Real-time output streaming
- Color-coded log levels

### User Experience

- Save/load configurations
- Copy output to clipboard
- Clear output
- Visual notifications
- Tooltips for help

## 🔐 Security

The application follows Electron security best practices:

- Context isolation enabled
- Node integration disabled in renderer
- Content Security Policy implemented
- Secure IPC communication via preload script

## 📦 Building Standalone Apps

Build platform-specific installers:

```bash
# Build for your current platform
npm run electron:build

# Or build for specific platforms
npm run electron:build -- --win
npm run electron:build -- --mac
npm run electron:build -- --linux
```

Outputs are created in `dist-electron/` directory.

## 🔧 Configuration File

Settings are automatically saved to `electron/config.json`. This file is created on first use and updated when you click "Save Configuration".

Example config:

```json
{
  "serverUrl": "http://localhost:3000",
  "workerId": "my-worker",
  "hostname": "dev-machine",
  "dockerTimeout": "300000",
  "dockerMemoryLimit": "512m",
  "dockerCpuLimit": "2.0",
  "enableDocker": true,
  "maxParallelJobs": "0"
}
```

## 🚀 How It Works

1. User configures settings in the GUI
2. Clicking "Start Worker" spawns `worker-agent.js` as a child process
3. Environment variables are set based on GUI configuration
4. Output from worker is captured and displayed in real-time
5. User can stop worker gracefully with "Stop Worker" button

**Important**: The GUI does NOT modify [worker-agent.js](../worker-agent.js). It only provides an interface to control it.

## 🎯 Use Cases

### Development

- Test worker configurations quickly
- Debug worker issues with live output
- Iterate on settings without command-line hassles

### Production

- Deploy workers on machines without CLI access
- Provide user-friendly worker management for non-technical users
- Monitor worker health from a desktop application

### Multi-Worker Management

- Run multiple Electron instances for multiple workers
- Each instance can have different configurations
- Easy visual management of distributed workers

## 📊 Screenshots

### Status Panel

Shows if worker is running or stopped with visual indicators.

### Configuration Panel

All worker settings in organized sections with tooltips.

### Output Panel

Live streaming output with color-coded log levels.

### Control Panel

Simple start/stop controls with clear visual feedback.

## 🐛 Troubleshooting

### Worker won't start

- Check that server URL is correct and accessible
- Verify Docker is running (if Docker mode enabled)
- Check output panel for error messages

### No output displayed

- Ensure worker started successfully
- Check that server is running
- Look for errors in DevTools console (dev mode)

### Configuration not saving

- Check file permissions in electron/ directory
- Verify config.json can be created
- Run with elevated permissions if needed

## 🤝 Integration

The Electron GUI integrates seamlessly with your existing system:

- **Next.js Server**: Continues to run independently at port 3000
- **Worker Agent**: Controlled through GUI but runs as separate process
- **Job System**: No changes to job submission or monitoring
- **Multiple Workers**: Can run multiple GUI instances for multiple workers

## 📝 Development Notes

### Adding New Features

To add new configuration options:

1. Add input field to `renderer/index.html`
2. Update form handling in `renderer/renderer.js`
3. Pass new config to main process in `main.js`
4. Set environment variable when spawning worker

### Styling

The app uses CSS custom properties for theming. Colors and styles can be customized in `renderer/styles.css`:

```css
:root {
  --primary-color: #2563eb;
  --success-color: #10b981;
  /* ... more variables */
}
```

## 📄 License

Part of the CMD Executor project.

## 🙏 Credits

Built with:

- [Electron](https://www.electronjs.org/) - Desktop application framework
- Modern CSS with CSS Grid and Flexbox
- Vanilla JavaScript (no frameworks for simplicity)

---

**Ready to manage your workers with style! 🚀**

Need help? Check out [QUICKSTART.md](./QUICKSTART.md) or [README.md](./README.md).
