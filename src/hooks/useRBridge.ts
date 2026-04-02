/**
 * useRBridge — React hook for running R analyses.
 *
 * Automatically injects the active dataset as `df` before every script,
 * so all dialogs and the interactive console get real data without
 * needing to hardcode it themselves.
 *
 * SCRIPT EXECUTION FLOW:
 *   1. buildDataInjection() serializes active dataset rows to R JSON
 *   2. User script is appended after the injection
 *   3. Combined script is sent to Electron → RBridge → Rscript
 *   4. Result is returned as a plain data object
 *   5. The R snippet is appended to the session script for reproducibility
 *
 * RETURN VALUE:
 *   run() returns result.data from the R output (the "data" key in the JSON),
 *   falling back to the top-level result object for scripts that don't use
 *   the data wrapper convention. Dialogs can read r_script via result.r_script
 *   when using the fallback path, or from the script they built locally.
 */

import { useState, useCallback } from 'react'
import { usePsychrStore } from '../store'

export interface UseRBridgeReturn {
  run: (script: string, label?: string) => Promise<Record<string, unknown> | null>
  isRunning: boolean
  error: string | null
  clearError: () => void
}

/**
 * Serialize dataset rows to R code that creates a `df` data frame.
 *
 * Uses JSON round-trip (JS → JSON string → R jsonlite::fromJSON) which
 * correctly handles all column types including NA, numeric, and character.
 * Caps at 5,000 rows to keep the inline script size manageable.
 *
 * Exported so RConsole and other components can use the same injection
 * without duplicating the logic.
 */
export function buildDataInjection(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) return ''
  const rows = data.slice(0, 5000)
  // Escape backslashes first, then single-quotes, for safe R string literal embedding
  const json = JSON.stringify(rows)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
  return (
    `df <- as.data.frame(jsonlite::fromJSON('${json}'), stringsAsFactors = FALSE)\n` +
    `df <- type.convert(df, as.is = TRUE)\n`
  )
}

export function useRBridge(): UseRBridgeReturn {
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const appendToScript = usePsychrStore((s) => s.appendToScript)
  const activeDataset = usePsychrStore((s) => s.activeDataset)

  const run = useCallback(
    async (script: string, label?: string): Promise<Record<string, unknown> | null> => {
      setIsRunning(true)
      setError(null)

      // Prepend dataset injection if a dataset is loaded
      const dataInjection = activeDataset?.data?.length
        ? buildDataInjection(activeDataset.data)
        : ''

      const fullScript = dataInjection + script

      try {
        // window.psychr is typed in src/types/electron.d.ts
        if (!window.psychr?.r?.run) {
          setError('R is not connected. Run the app via Electron (npm run dev) to execute analyses.')
          return null
        }

        const result = await window.psychr.r.run(fullScript)

        if (!result.success) {
          setError(result.error || 'Unknown R error')
          return null
        }

        // Append clean R snippet to the session script for reproducibility
        const snippet = result.r_script || `# ${label || 'Analysis'}\n${script}`
        appendToScript(snippet)

        // Return result.data if present; otherwise fall back to the full result
        // object. Dialogs read result.r_script from the fallback path.
        return result.data ?? (result as unknown as Record<string, unknown>)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to run R')
        return null
      } finally {
        setIsRunning(false)
      }
    },
    [appendToScript, activeDataset]
  )

  const clearError = useCallback(() => setError(null), [])

  return { run, isRunning, error, clearError }
}
