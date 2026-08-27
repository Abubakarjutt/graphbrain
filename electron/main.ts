import { app, BrowserWindow, dialog } from 'electron'
import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'
import { findFreePort } from './findFreePort'

let serverProcess: ChildProcess | null = null

function killServer() {
  if (!serverProcess) return
  const proc = serverProcess
  serverProcess = null
  proc.kill('SIGTERM')
  setTimeout(() => {
    if (!proc.killed) proc.kill('SIGKILL')
  }, 3000)
}

async function waitForServer(port: number, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}`)
      if (res.status) return
    } catch {
      // server not up yet — retry until the deadline
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error(`Server did not respond within ${timeoutMs}ms`)
}

function openWindow(url: string) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadURL(url)
}

async function startServerAndWindow() {
  const devUrl = process.env.ELECTRON_DEV_SERVER_URL
  if (devUrl) {
    openWindow(devUrl)
    return
  }

  const port = await findFreePort()
  const standaloneDir = path.join(process.resourcesPath, 'standalone')

  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
    },
  })

  serverProcess.on('error', (err) => {
    dialog.showErrorBox('GraphBrain failed to start', err.message)
    app.quit()
  })

  try {
    await waitForServer(port)
  } catch (err) {
    dialog.showErrorBox('GraphBrain failed to start', (err as Error).message)
    app.quit()
    return
  }

  openWindow(`http://127.0.0.1:${port}`)
}

app.whenReady().then(startServerAndWindow)

app.on('window-all-closed', () => {
  killServer()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', killServer)
