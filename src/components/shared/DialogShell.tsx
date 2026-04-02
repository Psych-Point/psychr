/**
 * DialogShell — Shared wrapper for all analysis dialogs.
 *
 * Provides:
 *   - Consistent modal overlay + container sizing
 *   - Standardized header (title + subtitle + close button)
 *   - Scrollable body
 *   - Optional footer slot
 *   - Escape key to close
 *   - Backdrop click to close
 *
 * Usage:
 *   <DialogShell title="My Dialog" subtitle="hint" onClose={onClose} footer={<FooterButtons />}>
 *     <div className="p-5 space-y-4">...</div>
 *   </DialogShell>
 */

import { useEffect, ReactNode } from 'react'

interface DialogShellProps {
  title: string
  subtitle?: string
  /** Footer content (rendered inside the border-top footer strip). */
  footer?: ReactNode
  onClose: () => void
  children: ReactNode
  width?: string
}

export function DialogShell({
  title,
  subtitle,
  footer,
  onClose,
  children,
  width = '520px',
}: DialogShellProps) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      // Close when clicking the backdrop (not the dialog itself)
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl flex flex-col max-h-[85vh]"
        style={{ width }}
        // Stop propagation so clicks inside the dialog don't bubble to the backdrop
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 w-7 h-7 flex items-center justify-center rounded text-xl leading-none transition-colors"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="border-t border-gray-200 bg-gray-50 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared Footer Buttons ────────────────────────────────────────────────────

interface DialogFooterProps {
  onClose: () => void
  onRun: () => void
  isRunning: boolean
  hint?: string
  runLabel?: string
  /** Disable the run button (e.g. required fields not filled) */
  disabled?: boolean
}

/**
 * Standard footer used by all analysis dialogs.
 * Shows a hint on the left and Cancel / Run buttons on the right.
 */
export function DialogFooter({
  onClose,
  onRun,
  isRunning,
  hint = 'APA-formatted output · R script auto-generated',
  runLabel = 'Run Analysis',
  disabled = false,
}: DialogFooterProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <p className="text-xs text-gray-400">{hint}</p>
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-200 rounded transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onRun}
          disabled={isRunning || disabled}
          className="px-5 py-1.5 text-sm font-medium bg-psychr-midblue text-white rounded hover:bg-psychr-blue transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isRunning && (
            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
          {isRunning ? 'Running…' : runLabel}
        </button>
      </div>
    </div>
  )
}

// ─── No-Dataset Warning ───────────────────────────────────────────────────────

/** Inline warning shown when no dataset is loaded. */
export function NoDatasetWarning() {
  return (
    <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
      No dataset loaded — import a dataset on the Data tab before running this analysis.
    </div>
  )
}

// ─── Select field helper ──────────────────────────────────────────────────────

interface LabeledSelectProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  children: ReactNode
}

/** Consistent labeled <select> used across all dialogs. */
export function LabeledSelect({ label, value, onChange, placeholder = 'Select variable…', children }: LabeledSelectProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
    </div>
  )
}
