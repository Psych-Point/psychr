/**
 * Reliability Analysis Dialog
 *
 * Cronbach's Alpha and McDonald's Omega via psych package.
 * Reports alpha, item-total correlations, alpha-if-item-deleted,
 * and omega hierarchical if requested.
 */

import { useState } from 'react'
import { usePsychrStore } from '../../../store'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
  initialOmega?: boolean
}

export function ReliabilityDialog({ onClose, onRun, initialOmega }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const numericCols = (activeDataset?.columns ?? []).filter((c) => c.type === 'numeric')

  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [includeOmega, setIncludeOmega] = useState(initialOmega ?? false)
  const [showIfDeleted, setShowIfDeleted] = useState(true)

  const toggleItem = (name: string) =>
    setSelectedItems((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    )

  const selectAll = () => setSelectedItems(numericCols.map((c) => c.name))
  const clearAll = () => setSelectedItems([])

  const handleRun = async () => {
    const items = selectedItems.length >= 2 ? selectedItems : numericCols.map((c) => c.name)
    if (items.length < 2) {
      alert('Please select at least 2 items for reliability analysis.')
      return
    }

    const itemList = items.map((i) => `"${i}"`).join(', ')

    const omegaSection = includeOmega ? `
# McDonald's omega
tryCatch({
  om <- omega(scale_data, plot = FALSE)
  omega_h <- round(om$omega_h, 3)
  omega_t <- round(om$omega_tot, 3)
}, error = function(e) {
  omega_h <<- NA
  omega_t <<- NA
})` : `omega_h <- NA; omega_t <- NA`

    const rScript = `
library(psych)
library(jsonlite)

item_cols <- c(${itemList})
scale_data <- df[, intersect(item_cols, names(df)), drop = FALSE]
scale_data <- scale_data[complete.cases(scale_data), ]

if (ncol(scale_data) < 2) stop("Need at least 2 items in dataset.")

alpha_result <- alpha(scale_data, check.keys = TRUE)
a <- alpha_result$total

${omegaSection}

# Item statistics
item_stats <- alpha_result$item.stats
item_rows <- lapply(rownames(item_stats), function(item) {
  list(
    Item = item,
    Mean = round(item_stats[item, "mean"], 3),
    SD = round(item_stats[item, "sd"], 3),
    r_jt = round(item_stats[item, "r.drop"], 3),
    Alpha_if_deleted = round(alpha_result$alpha.drop[item, "raw_alpha"], 3)
  )
})

r_script_text <- paste0(
  "library(psych)\\n",
  "scale_data <- df[, c(", paste0('"', items, '"', collapse = ", "), ")]\\n",
  "alpha(scale_data)\\n"
)

cat(toJSON(list(
  success = TRUE,
  r_script = r_script_text,
  data = list(
    table = item_rows,
    summary = list(
      alpha = round(a$raw_alpha, 3),
      std_alpha = round(a$std.alpha, 3),
      mean_r = round(a$average_r, 3),
      n_items = ncol(scale_data),
      n_obs = nrow(scale_data),
      omega_h = omega_h,
      omega_t = omega_t
    )
  )
), auto_unbox = TRUE))
`

    const items_label = items.length === numericCols.length ? 'all items' : `${items.length} items`
    const label = `Reliability Analysis (${items_label})`
    const result = await onRun(rScript, label)
    if (result) {
      addResult({
        id: `result_${Date.now()}`,
        type: 'cronbach',
        label,
        params: { items, includeOmega },
        output: result as Record<string, unknown>,
        rScript: (result.r_script as string) || rScript,
        timestamp: new Date(),
      })
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[540px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Reliability Analysis</h2>
            <p className="text-xs text-gray-500 mt-0.5">Cronbach's α · McDonald's ω · psych::alpha()</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">
                Scale Items
                <span className="text-gray-400 font-normal ml-1">(select 2+; leave empty for all numeric)</span>
              </p>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-psychr-midblue hover:underline">All</button>
                <button onClick={clearAll} className="text-xs text-gray-400 hover:underline">Clear</button>
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

          <div className="bg-psychr-accent border border-psychr-lightblue rounded-lg p-3 text-xs text-gray-600 space-y-1">
            <p><strong>α ≥ .90</strong> — Excellent · <strong>α ≥ .80</strong> — Good · <strong>α ≥ .70</strong> — Acceptable</p>
            <p>Item-total correlation (r_jt) should be ≥ .30 for each item to contribute to the scale.</p>
          </div>

          {!activeDataset && (
            <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              No dataset loaded — import a dataset on the Data tab before running this analysis.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-400">APA output · item-total correlations · α-if-deleted</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">
              Cancel
            </button>
            <button
              onClick={handleRun}
              disabled={!activeDataset}
              className="px-5 py-1.5 text-sm font-medium bg-psychr-midblue text-white rounded hover:bg-psychr-blue transition-colors disabled:opacity-50"
            >
              Run Analysis
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
