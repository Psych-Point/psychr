/**
 * Reliability Analysis Dialog
 *
 * Cronbach's Alpha and McDonald's Omega via psych package.
 * Reports alpha, item-total correlations, and alpha-if-item-deleted.
 */

import { useMemo, useState } from 'react'
import { usePsychrStore } from '../../../store'
import { DialogShell, DialogFooter, NoDatasetWarning } from '../../../components/shared/DialogShell'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
  initialOmega?: boolean
}

export function ReliabilityDialog({ onClose, onRun, initialOmega }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const numericCols = useMemo(
    () => (activeDataset?.columns ?? []).filter((c) => c.type === 'numeric'),
    [activeDataset?.columns]
  )

  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [includeOmega, setIncludeOmega] = useState(initialOmega ?? false)
  const [showIfDeleted, setShowIfDeleted] = useState(true)
  const [isRunning, setIsRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)

  const canRun = Boolean(activeDataset)

  const toggleItem = (name: string) =>
    setSelectedItems((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    )

  const selectAll = () => setSelectedItems(numericCols.map((c) => c.name))
  const clearAll  = () => setSelectedItems([])

  const handleRun = async () => {
    const items = selectedItems.length >= 2 ? selectedItems : numericCols.map((c) => c.name)
    if (items.length < 2) {
      setRunError('Please select at least 2 items for reliability analysis.')
      return
    }

    setIsRunning(true)
    setRunError(null)

    const itemList = items.map((i) => `"${i}"`).join(', ')

    const omegaSection = includeOmega
      ? `tryCatch({
  om <- omega(scale_data, plot = FALSE)
  omega_h <- round(om$omega_h, 3)
  omega_t <- round(om$omega_tot, 3)
}, error = function(e) {
  omega_h <<- NA
  omega_t <<- NA
})`
      : `omega_h <- NA; omega_t <- NA`

    const rScript = `
library(psych)
library(jsonlite)

item_cols  <- c(${itemList})
scale_data <- df[, intersect(item_cols, names(df)), drop = FALSE]
scale_data <- scale_data[complete.cases(scale_data), ]

if (ncol(scale_data) < 2) stop("Need at least 2 items in dataset.")

alpha_result <- alpha(scale_data, check.keys = TRUE)
a            <- alpha_result$total

${omegaSection}

# Item statistics: mean, SD, item-total correlation, alpha-if-deleted
item_stats <- alpha_result$item.stats
item_rows  <- lapply(rownames(item_stats), function(item) {
  list(
    Item             = item,
    Mean             = round(item_stats[item, "mean"], 3),
    SD               = round(item_stats[item, "sd"],   3),
    r_jt             = round(item_stats[item, "r.drop"], 3),
    Alpha_if_deleted = round(alpha_result$alpha.drop[item, "raw_alpha"], 3)
  )
})

r_script_text <- paste0(
  "library(psych)\\n",
  "scale_data <- df[, c(", paste0('"', item_cols, '"', collapse = ", "), ")]\\n",
  "alpha(scale_data)\\n"
)

cat(toJSON(list(
  success  = TRUE,
  r_script = r_script_text,
  data     = list(
    table   = item_rows,
    summary = list(
      alpha     = if (!is.null(a$raw_alpha)) round(a$raw_alpha, 3) else NA,
      std_alpha = if (!is.null(a$std.alpha)) round(a$std.alpha, 3) else NA,
      mean_r    = if (!is.null(a$average_r)) round(a$average_r, 3) else NA,
      n_items   = ncol(scale_data),
      n_obs     = nrow(scale_data),
      omega_h   = omega_h,
      omega_t   = omega_t
    )
  )
), auto_unbox = TRUE))
`

    const items_label = items.length === numericCols.length ? 'all items' : `${items.length} items`
    const label = `Reliability Analysis (${items_label})`
    const result = await onRun(rScript, label)
    setIsRunning(false)

    if (result) {
      addResult({
        id:        `result_${Date.now()}`,
        type:      'cronbach',
        label,
        params:    { items, includeOmega },
        output:    result as Record<string, unknown>,
        rScript:   (result.r_script as string) || rScript,
        timestamp: new Date(),
      })
      onClose()
    }
  }

  return (
    <DialogShell
      title="Reliability Analysis"
      subtitle="Cronbach's α · McDonald's ω · psych::alpha()"
      onClose={onClose}
      width="540px"
      footer={
        <DialogFooter
          onClose={onClose}
          onRun={handleRun}
          isRunning={isRunning}
          disabled={!canRun}
          hint="APA output · item-total correlations · α-if-deleted"
        />
      }
    >
      <div className="p-5 space-y-5">
        {/* Item selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">
              Scale Items
              <span className="text-gray-400 font-normal ml-1">(select 2+; leave empty for all numeric)</span>
            </p>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-psychr-midblue hover:underline">All</button>
              <button onClick={clearAll}  className="text-xs text-gray-400 hover:underline">Clear</button>
            </div>
          </div>
          {numericCols.length === 0 ? (
            <p className="text-xs text-gray-500">No numeric variables in dataset. Import data first.</p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {numericCols.map((col) => (
                <label key={col.name} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                  <input
                    type="checkbox"
                    checked={selectedItems.includes(col.name)}
                    onChange={() => toggleItem(col.name)}
                    className="accent-psychr-midblue"
                  />
                  <span className="text-sm text-gray-800">{col.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Options */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Options</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showIfDeleted}
              onChange={(e) => setShowIfDeleted(e.target.checked)}
              className="accent-psychr-midblue"
            />
            <span className="text-sm text-gray-700">Alpha if item deleted</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeOmega}
              onChange={(e) => setIncludeOmega(e.target.checked)}
              className="accent-psychr-midblue"
            />
            <span className="text-sm text-gray-700">
              McDonald's ω (omega hierarchical + total)
              <span className="text-gray-400 text-xs ml-1">requires GPArotation</span>
            </span>
          </label>
        </div>

        {/* Interpretation guide */}
        <div className="bg-psychr-accent border border-psychr-lightblue rounded-lg p-3 text-xs text-gray-600 space-y-1">
          <p><strong>α ≥ .90</strong> — Excellent · <strong>α ≥ .80</strong> — Good · <strong>α ≥ .70</strong> — Acceptable</p>
          <p>Item-total correlation (r_jt) should be ≥ .30 for each item to contribute to the scale.</p>
        </div>

        {/* Inline error */}
        {runError && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 flex items-start justify-between gap-2">
            <span>{runError}</span>
            <button onClick={() => setRunError(null)} className="text-red-400 hover:text-red-600 shrink-0">×</button>
          </div>
        )}

        {!activeDataset && <NoDatasetWarning />}
      </div>
    </DialogShell>
  )
}
