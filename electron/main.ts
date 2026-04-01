import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { RBridge } from './r-bridge'

let mainWindow: BrowserWindow | null = null
const rBridge = new RBridge()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    title: 'PsychR',
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC Handlers ────────────────────────────────────────────────────────────

// Run an R script and return the result
ipcMain.handle('r:run', async (_event, script: string) => {
  return rBridge.run(script)
})

// Check R availability
ipcMain.handle('r:check', async () => {
  return rBridge.checkR()
})

// Get R version
ipcMain.handle('r:version', async () => {
  return rBridge.getVersion()
})

// Open file dialog
ipcMain.handle('dialog:openFile', async (_event, options) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Data Files', extensions: ['csv', 'xlsx', 'xls', 'sav', 'rds', 'tsv', 'parquet', 'json'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    ...options,
  })
  return result
})

// Open save dialog
ipcMain.handle('dialog:saveFile', async (_event, options) => {
  const result = await dialog.showSaveDialog(mainWindow!, options)
  return result
})

// Open external URL
ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  shell.openExternal(url)
})

// Read a file from disk and return its content as a UTF-8 string
// Used by the renderer to parse CSV/TSV without going through R
ipcMain.handle('file:read', async (_event, filePath: string) => {
  try {
    const content = readFileSync(filePath, 'utf-8')
    return { success: true, content }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})
