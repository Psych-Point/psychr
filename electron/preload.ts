/**
 * Preload script — Context Bridge
 *
 * Exposes a safe, typed API surface to the renderer process.
 * This is the ONLY way the renderer can call Electron/Node APIs.
 * nodeIntegration is OFF; this bridge is the security boundary.
 */

import { contextBridge, ipcRenderer } from 'electron'

// ─── Type Declarations (also in src/types/electron.d.ts) ──────────────────────

export type RResult = {
  success: boolean
  data?: Record<string, unknown>
  error?: string
  r_script?: string
  stderr?: string
}

export type OpenFileResult = {
  canceled: boolean
  filePaths: string[]
}

// ─── Bridge API ───────────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('psychr', {
  // R execution
  r: {
    run: (script: string): Promise<RResult> => ipcRenderer.invoke('r:run', script),
    check: (): Promise<{ available: boolean; path?: string; error?: string }> => ipcRenderer.invoke('r:check'),
    version: (): Promise<string> => ipcRenderer.invoke('r:version'),
  },

  // File system dialogs
  dialog: {
    openFile: (options?: object): Promise<OpenFileResult> => ipcRenderer.invoke('dialog:openFile', options),
    saveFile: (options?: object): Promise<{ canceled: boolean; filePath?: string }> => ipcRenderer.invoke('dialog:saveFile', options),
  },

  // File system (direct read — bypasses R for CSV/TSV)
  fs: {
    read: (filePath: string): Promise<{ success: boolean; content?: string; error?: string }> =>
      ipcRenderer.invoke('file:read', filePath),
  },

  // Shell utilities
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  },

  // Platform info
  platform: process.platform,
})
