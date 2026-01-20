# 🚀 Quick Start Guide - Electron Worker GUI

Get up and running with the CMD Executor Worker GUI in 3 easy steps!

## Step 1: Install Dependencies

```bash
npm install
```

This installs Electron and all required dependencies.

## Step 2: Start the Electron App

```bash
npm run electron
```

Or for development with DevTools:

```bash
npm run electron:dev
```

## Step 3: Configure and Start Worker

1. **Enter Server URL** (e.g., `http://localhost:3000`)
2. **Configure Docker Settings** (or use defaults)
3. **Click "Start Worker"**
4. **Monitor output** in real-time!

## 📸 What You'll See

- **Status Panel**: Shows if worker is running (green) or stopped (red)
- **Configuration Panel**: All worker settings in one place
- **Control Panel**: Start/Stop buttons
- **Output Panel**: Live logs with color coding

## 🎯 Default Settings

The app comes with sensible defaults:

- Server: `http://localhost:3000`
- Docker: Enabled
- Timeout: 5 minutes
- Memory: 512MB
- CPU: 2 cores
- Parallel Jobs: Auto

## 💡 Tips

- **Save Configuration**: Click "Save Configuration" to persist settings
- **Load Configuration**: Settings auto-load on startup
- **Clear Output**: Use "Clear" button to reset the output panel
- **Copy Output**: Use "Copy" button to copy all logs

## ⚠️ Prerequisites

Before running:

1. Ensure Node.js 18+ is installed
2. Install Docker (if using Docker mode)
3. Make sure the CMD Executor server is running

## 🆘 Need Help?

Check the full [README.md](./README.md) for detailed documentation, troubleshooting, and advanced features.

---

**That's it! You're ready to manage workers with a beautiful GUI! ✨**
