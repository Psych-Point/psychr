/**
 * useRBridge — React hook for running R analyses.
 *
 * Automatically injects the active dataset as `df` before every script,
 * so all dialogs and the interactive console get real data without
 * needing to hardcode it themselves.
 */

import { useState, useCallback } from 'react'
import { usePsychrStore } from '../store'

interface UseRBridgeReturn {
  run: (script: string, label?: string) => Promise<Record<string, unknown> | null>
  isRunning: boolean
  error: string | null
  clearError: () => void
}

/**
 * Serialize the active dataset rows to R code that creates `df`.
 * Caps at 5000 rows to keep script size manageable.
 */
function buildDataInjection(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) return ''
  const rows = data.slice(0, 5000)
  // Serialize as JSON and parse in R — handles all column types cleanly
  const json = JSON.stringify(rows)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
  return `df <- as.data.frame(jsonlite::fromJSON('${json}'), stringsAsFactors = FALSE)\n`
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

      // Inject active dataset as `df` if available
      const dataInjection = activeDataset?.data?.length
        ? buildDataInjection(activeDataset.data)
        : ''

      const fullScript = dataInjection + script

      try {
        // @ts-expect-error — window.psychr is injected by preload
        const psychr = window.psychr
        if (!psychr?.r?.run) {
          setError('R is not connected. Run the app with Electron (npm run dev) to execute analyses.')
          return null
        }

        const result = await psychr.r.run(fullScript)

        if (!result.success) {
          setError(result.error || 'Unknown R error')
          return null
        }

        // Append the clean R snippet to the session script
        const snippet = result.r_script || `# ${label || 'Analysis'}\n${script}`
        appendToScript(snippet)

        return result.data ?? result
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
