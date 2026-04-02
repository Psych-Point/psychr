/**
 * Type declarations for the window.psychr context bridge.
 *
 * Gives TypeScript full type safety when calling Electron APIs from the React
 * renderer. Mirrors the API exposed in electron/preload.ts exactly.
 *
 * Do NOT import this file — it is a global ambient declaration.
 */

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

export type SaveFileResult = {
  canceled: boolean
  filePath?: string
}

declare global {
  interface Window {
    psychr: {
      r: {
        /** Execute an R script string. Returns parsed JSON from the script's cat(toJSON(...)) call. */
        run: (script: string) => Promise<RResult>
        /** Check whether R is installed and reachable. */
        check: () => Promise<{ available: boolean; path?: string; error?: string }>
        /** Get the running R version string. */
        version: () => Promise<string>
      }
      dialog: {
        /** Show the native open-file dialog. */
        openFile: (options?: object) => Promise<OpenFileResult>
        /** Show the native save-file dialog. */
        saveFile: (options?: object) => Promise<SaveFileResult>
      }
      fs: {
        /** Read a file from disk and return its text content (UTF-8). */
        read: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
      }
      shell: {
        /** Open a URL in the system default browser. */
        openExternal: (url: string) => Promise<void>
      }
      /** The host OS platform. */
      platform: 'darwin' | 'win32' | 'linux'
    }
  }
}
