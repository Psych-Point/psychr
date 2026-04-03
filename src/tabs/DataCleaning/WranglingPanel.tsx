/**
 * WranglingPanel — dplyr / tidyverse / SAS-style data operations.
 *
 * Each operation:
 *   1. Opens an inline dialog for parameters
 *   2. Generates an R script with the operation
 *   3. Executes via R bridge, returns modified df
 *   4. Updates active dataset in Zustand
 */

import { useState } from 'react'
import { usePsychrStore, DataColumn } from '../../store'
import { useRBridge } from '../../hooks/useRBridge'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface WranglingPanelProps {}

type DialogType =
  | 'filter' | 'select' | 'drop' | 'rename' | 'mutate'
  | 'recode' | 'type' | 'sort' | 'remove-na' | 'remove-dups'
  | 'pivot-longer' | 'pivot-wider' | 'summarize' | null

interface Operation {
  id: DialogType
  label: string
  description: string
  icon: string
  category: string
}

const OPERATIONS: Operation[] = [
  // Rows
  { id: 'filter', label: 'Filter Rows', description: 'Keep rows matching a condition', icon: '▼', category: 'Rows' },
  { id: 'sort', label: 'Sort', description: 'Order rows by one or more variables', icon: '↕', category: 'Rows' },
  { id: 'remove-na', label: 'Remove Missing', description: 'Drop rows with NA values', icon: '✕', category: 'Rows' },
  { id: 'remove-dups', label: 'Remove Duplicates', description: 'Drop duplicate rows', icon: '⊟', category: 'Rows' },
  // Columns
  { id: 'select', label: 'Select Variables', description: 'Keep only chosen columns', icon: '☑', category: 'Columns' },
  { id: 'drop', label: 'Drop Variables', description: 'Remove columns from dataset', icon: '−', category: 'Columns' },
  { id: 'rename', label: 'Rename Variable', description: 'Give a column a new name', icon: '✎', category: 'Columns' },
  { id: 'type', label: 'Convert Type', description: 'Change numeric ↔ factor ↔ character', icon: '⇄', category: 'Columns' },
  // Values
  { id: 'mutate', label: 'Compute Variable', description: 'Create or modify a column with an expression', icon: 'ƒ', category: 'Values' },
  { id: 'recode', label: 'Recode Values', description: 'Map old values to new ones', icon: '↻', category: 'Values' },
  // Reshape
  { id: 'pivot-longer', label: 'Pivot Longer', description: 'Wide → long format (melt)', icon: '↧', category: 'Reshape' },
  { id: 'pivot-wider', label: 'Pivot Wider', description: 'Long → wide format (cast)', icon: '↦', category: 'Reshape' },
  { id: 'summarize', label: 'Group & Summarize', description: 'Aggregate statistics by group', icon: 'Σ', category: 'Summarize' },
]

const CATEGORIES = ['Rows', 'Columns', 'Values', 'Reshape', 'Summarize']

export function WranglingPanel(_props: WranglingPanelProps) {
  const [activeDialog, setActiveDialog] = useState<DialogType>(null)
  const [expandedCats, setExpandedCats] = useState(new Set(CATEGORIES))
  const { run: onRun, isRunning: isWrangling, error: wrangleError, clearError } = useRBridge()
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const updateDataset = usePsychrStore((s) => s.updateDataset)

  const toggleCat = (cat: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const runWrangling = async (rExpr: string, label: string, needsTidyr = false) => {
    if (!activeDataset) return

    const script = `
library(jsonlite)
library(dplyr)
${needsTidyr ? 'library(tidyr)' : ''}

# Apply operation
${rExpr}

# Export updated df
n_rows <- nrow(df)
n_cols <- ncol(df)

col_info <- lapply(names(df), function(col_name) {
  col <- df[[col_name]]
  col_type <- if (is.numeric(col)) "numeric"
              else if (is.factor(col)) "factor"
              else if (is.logical(col)) "logical"
              else "character"
  result <- list(name = col_name, type = col_type,
                 missingCount = sum(is.na(col)),
                 uniqueCount = length(unique(col[!is.na(col)])))
  if (col_type == "numeric") {
    result$min  <- round(min(col, na.rm = TRUE), 4)
    result$max  <- round(max(col, na.rm = TRUE), 4)
    result$mean <- round(mean(col, na.rm = TRUE), 4)
    result$sd   <- round(sd(col, na.rm = TRUE), 4)
  }
  result
})

preview <- lapply(seq_len(min(nrow(df), 200)), function(i) {
  row <- as.list(df[i, , drop = FALSE])
  lapply(row, function(v) if (length(v) == 0 || (length(v) == 1 && is.na(v))) NULL else v)
})

cat(toJSON(list(
  success  = TRUE,
  r_script = paste0("# ${label}\\n${rExpr.replace(/\n/g, '\\n')}\\n"),
  data = list(rows = n_rows, columns = col_info, preview = preview)
), auto_unbox = TRUE, null = "null"))
`

    const result = await onRun(script, label)

    if (!result) {
      // wrangleError is set automatically by useRBridge
      return
    }

    if (activeDataset) {
      updateDataset(activeDataset.id, {
        rows: result.rows as number,
        columns: result.columns as DataColumn[],
        data: result.preview as Record<string, unknown>[],
      })
    }
    setActiveDialog(null)
  }

  const cols = activeDataset?.columns ?? []
  const numericCols = cols.filter((c) => c.type === 'numeric')

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
        <p className="text-xs font-semibold text-gray-700">Data Wrangling</p>
        <p className="text-xs text-gray-400">tidyverse · dplyr · SAS operations</p>
      </div>
      {isWrangling && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-200">
          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-blue-700">Running…</span>
        </div>
      )}
      {wrangleError && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border-b border-red-200">
          <span className="text-xs text-red-700 flex-1">{wrangleError}</span>
          <button onClick={clearError} className="text-red-400 hover:text-red-600 text-sm leading-none">×</button>
        </div>
      )}

      {!activeDataset && (
        <div className="p-3 text-xs text-gray-400 italic">
          Import a dataset to unlock wrangling operations.
        </div>
      )}

      {CATEGORIES.map((cat) => {
        const ops = OPERATIONS.filter((o) => o.category === cat)
        return (
          <div key={cat}>
            <button
              onClick={() => toggleCat(cat)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 border-b border-gray-100"
            >
              <span className="ml-auto text-gray-400">{expandedCats.has(cat) ? '▾' : '▸'}</span>
              <span className="mr-auto">{cat}</span>
            </button>
            {expandedCats.has(cat) && (
              <div className="ml-2 border-l border-gray-200">
                {ops.map((op) => (
                  <button
                    key={op.id}
                    disabled={!activeDataset}
                    onClick={() => setActiveDialog(op.id)}
                    className="w-full text-left px-3 py-2 border-b border-gray-100 hover:bg-psychr-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-psychr-midblue font-mono text-xs w-4">{op.icon}</span>
                      <span className="text-xs font-medium text-gray-800">{op.label}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 pl-6">{op.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}

      {activeDialog === 'filter' && (
        <FilterDialog cols={cols} onApply={runWrangling} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'sort' && (
        <SortDialog cols={cols} onApply={runWrangling} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'remove-na' && (
        <RemoveNADialog cols={cols} onApply={runWrangling} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'remove-dups' && (
        <QuickConfirmDialog
          title="Remove Duplicate Rows"
          description="Remove rows that are identical across all columns."
          rExpr="df <- distinct(df)"
          label="Remove Duplicates"
          onApply={runWrangling}
          onClose={() => setActiveDialog(null)}
        />
      )}
      {activeDialog === 'select' && (
        <SelectDialog cols={cols} onApply={runWrangling} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'drop' && (
        <DropDialog cols={cols} onApply={runWrangling} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'rename' && (
        <RenameDialog cols={cols} onApply={runWrangling} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'type' && (
        <TypeDialog cols={cols} onApply={runWrangling} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'mutate' && (
        <MutateDialog cols={cols} onApply={runWrangling} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'recode' && (
        <RecodeDialog cols={cols} onApply={runWrangling} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'pivot-longer' && (
        <PivotLongerDialog cols={cols} onApply={runWrangling} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'pivot-wider' && (
        <PivotWiderDialog cols={cols} onApply={runWrangling} onClose={() => setActiveDialog(null)} />
      )}
      {activeDialog === 'summarize' && (
        <SummarizeDialog cols={cols} numericCols={numericCols} onApply={runWrangling} onClose={() => setActiveDialog(null)} />
      )}
    </div>
  )
}

// ── Shared dialog shell ────────────────────────────────────────────────────────

function DialogShell({
  title, subtitle, children, onClose, onApply, applyLabel = 'Apply',
}: {
  title: string; subtitle?: string; children: React.ReactNode
  onClose: () => void; onApply: () => void; applyLabel?: string
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[460px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">{children}</div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
          <button onClick={onApply} className="px-5 py-1.5 text-sm font-medium bg-psychr-midblue text-white rounded hover:bg-psychr-blue">
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function ColSelect({ label, cols, value, onChange }: {
  label: string; cols: DataColumn[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue">
        <option value="">Select column…</option>
        {cols.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.type})</option>)}
      </select>
    </div>
  )
}

// ── Filter ─────────────────────────────────────────────────────────────────────

function FilterDialog({ cols, onApply, onClose }: {
  cols: DataColumn[]; onApply: (r: string, l: string) => void; onClose: () => void
}) {
  const [col, setCol] = useState('')
  const [op, setOp] = useState('==')
  const [val, setVal] = useState('')

  const numOps = ['==', '!=', '>', '<', '>=', '<=']
  const strOps = ['==', '!=', 'contains', 'starts_with', 'ends_with']
  const selCol = cols.find((c) => c.name === col)
  const isNum = selCol?.type === 'numeric'
  const ops = isNum ? numOps : strOps

  const build = () => {
    if (!col || val === '') return
    let condition: string
    if (op === 'contains') condition = `grepl(${JSON.stringify(val)}, ${col}, ignore.case = TRUE)`
    else if (op === 'starts_with') condition = `startsWith(as.character(${col}), ${JSON.stringify(val)})`
    else if (op === 'ends_with') condition = `endsWith(as.character(${col}), ${JSON.stringify(val)})`
    else {
      const rVal = isNum ? val : JSON.stringify(val)
      condition = `${col} ${op} ${rVal}`
    }
    onApply(`df <- df %>% filter(${condition})`, `Filter: ${col} ${op} ${val}`)
  }

  return (
    <DialogShell title="Filter Rows" subtitle="dplyr::filter()" onClose={onClose} onApply={build}>
      <ColSelect label="Column" cols={cols} value={col} onChange={setCol} />
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Operator</label>
        <select value={op} onChange={(e) => setOp(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5">
          {ops.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Value</label>
        <input value={val} onChange={(e) => setVal(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
          placeholder={isNum ? 'e.g. 20' : 'e.g. Female'} />
      </div>
      {col && val && (
        <code className="block text-xs bg-gray-900 text-green-400 p-2 rounded font-mono">
          df %&gt;% filter({col} {op} {val})
        </code>
      )}
    </DialogShell>
  )
}

// ── Sort ───────────────────────────────────────────────────────────────────────

function SortDialog({ cols, onApply, onClose }: {
  cols: DataColumn[]; onApply: (r: string, l: string) => void; onClose: () => void
}) {
  const [col, setCol] = useState('')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')

  const build = () => {
    if (!col) return
    const expr = dir === 'desc' ? `desc(${col})` : col
    onApply(`df <- df %>% arrange(${expr})`, `Sort by ${col} (${dir})`)
  }

  return (
    <DialogShell title="Sort Rows" subtitle="dplyr::arrange()" onClose={onClose} onApply={build}>
      <ColSelect label="Sort by" cols={cols} value={col} onChange={setCol} />
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Direction</label>
        <div className="flex gap-4">
          {(['asc', 'desc'] as const).map((d) => (
            <label key={d} className="flex items-center gap-1.5 cursor-pointer">
              <input type="radio" checked={dir === d} onChange={() => setDir(d)} className="accent-psychr-midblue" />
              <span className="text-sm text-gray-700">{d === 'asc' ? 'Ascending ↑' : 'Descending ↓'}</span>
            </label>
          ))}
        </div>
      </div>
    </DialogShell>
  )
}

// ── Remove NA ─────────────────────────────────────────────────────────────────

function RemoveNADialog({ cols, onApply, onClose }: {
  cols: DataColumn[]; onApply: (r: string, l: string) => void; onClose: () => void
}) {
  const [mode, setMode] = useState<'any' | 'all' | 'col'>('any')
  const [col, setCol] = useState('')

  const build = () => {
    if (mode === 'any') onApply(`df <- df %>% filter(if_any(everything(), ~ !is.na(.)))`, 'Remove rows with any NA')
    else if (mode === 'all') onApply(`df <- df %>% filter(if_all(everything(), ~ !is.na(.)))`, 'Remove rows where all are NA')
    else if (col) onApply(`df <- df %>% filter(!is.na(${col}))`, `Remove rows where ${col} is NA`)
  }

  return (
    <DialogShell title="Remove Missing Values" subtitle="dplyr::filter(!is.na(...))" onClose={onClose} onApply={build}>
      <div className="space-y-2">
        {([['any', 'Remove rows with ANY missing value'], ['all', 'Remove rows where ALL values are missing'], ['col', 'Remove rows where a specific column is NA']] as const).map(([v, lbl]) => (
          <label key={v} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="namode" checked={mode === v} onChange={() => setMode(v)} className="accent-psychr-midblue" />
            <span className="text-sm text-gray-700">{lbl}</span>
          </label>
        ))}
      </div>
      {mode === 'col' && <ColSelect label="Column" cols={cols} value={col} onChange={setCol} />}
    </DialogShell>
  )
}

// ── Quick Confirm ─────────────────────────────────────────────────────────────

function QuickConfirmDialog({ title, description, rExpr, label, onApply, onClose }: {
  title: string; description: string; rExpr: string; label: string
  onApply: (r: string, l: string) => void; onClose: () => void
}) {
  return (
    <DialogShell title={title} onClose={onClose} onApply={() => onApply(rExpr, label)}>
      <p className="text-sm text-gray-600">{description}</p>
      <code className="block text-xs bg-gray-900 text-green-400 p-2 rounded font-mono">{rExpr}</code>
    </DialogShell>
  )
}

// ── Select ────────────────────────────────────────────────────────────────────

function SelectDialog({ cols, onApply, onClose }: {
  cols: DataColumn[]; onApply: (r: string, l: string) => void; onClose: () => void
}) {
  const [selected, setSelected] = useState<string[]>(cols.map((c) => c.name))
  const toggle = (n: string) => setSelected((p) => p.includes(n) ? p.filter((v) => v !== n) : [...p, n])

  const build = () => {
    if (selected.length === 0) return
    onApply(`df <- df %>% select(${selected.join(', ')})`, `Select ${selected.length} variables`)
  }

  return (
    <DialogShell title="Select Variables" subtitle="dplyr::select()" onClose={onClose} onApply={build}>
      <div className="grid grid-cols-2 gap-1 max-h-52 overflow-y-auto border border-gray-200 rounded p-2">
        {cols.map((c) => (
          <label key={c.name} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
            <input type="checkbox" checked={selected.includes(c.name)} onChange={() => toggle(c.name)} className="accent-psychr-midblue" />
            <span className="text-xs text-gray-800">{c.name}</span>
          </label>
        ))}
      </div>
    </DialogShell>
  )
}

// ── Drop ──────────────────────────────────────────────────────────────────────

function DropDialog({ cols, onApply, onClose }: {
  cols: DataColumn[]; onApply: (r: string, l: string) => void; onClose: () => void
}) {
  const [toDrop, setToDrop] = useState<string[]>([])
  const toggle = (n: string) => setToDrop((p) => p.includes(n) ? p.filter((v) => v !== n) : [...p, n])

  const build = () => {
    if (toDrop.length === 0) return
    onApply(`df <- df %>% select(-c(${toDrop.join(', ')}))`, `Drop: ${toDrop.join(', ')}`)
  }

  return (
    <DialogShell title="Drop Variables" subtitle="dplyr::select(-col)" onClose={onClose} onApply={build}>
      <div className="grid grid-cols-2 gap-1 max-h-52 overflow-y-auto border border-gray-200 rounded p-2">
        {cols.map((c) => (
          <label key={c.name} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
            <input type="checkbox" checked={toDrop.includes(c.name)} onChange={() => toggle(c.name)} className="accent-psychr-midblue" />
            <span className="text-xs text-gray-800">{c.name}</span>
          </label>
        ))}
      </div>
    </DialogShell>
  )
}

// ── Rename ────────────────────────────────────────────────────────────────────

function RenameDialog({ cols, onApply, onClose }: {
  cols: DataColumn[]; onApply: (r: string, l: string) => void; onClose: () => void
}) {
  const [oldName, setOldName] = useState('')
  const [newName, setNewName] = useState('')

  const build = () => {
    if (!oldName || !newName) return
    onApply(`df <- df %>% rename(${newName} = ${oldName})`, `Rename ${oldName} → ${newName}`)
  }

  return (
    <DialogShell title="Rename Variable" subtitle="dplyr::rename()" onClose={onClose} onApply={build}>
      <ColSelect label="Current name" cols={cols} value={oldName} onChange={setOldName} />
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">New name</label>
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
          placeholder="new_variable_name" />
      </div>
    </DialogShell>
  )
}

// ── Type Convert ──────────────────────────────────────────────────────────────

function TypeDialog({ cols, onApply, onClose }: {
  cols: DataColumn[]; onApply: (r: string, l: string) => void; onClose: () => void
}) {
  const [col, setCol] = useState('')
  const [targetType, setTargetType] = useState('numeric')

  const convFn: Record<string, string> = {
    numeric: 'as.numeric', factor: 'as.factor', character: 'as.character', logical: 'as.logical',
  }

  const build = () => {
    if (!col) return
    const fn = convFn[targetType]
    onApply(`df <- df %>% mutate(${col} = ${fn}(${col}))`, `Convert ${col} to ${targetType}`)
  }

  return (
    <DialogShell title="Convert Column Type" subtitle="dplyr::mutate(as.*())" onClose={onClose} onApply={build}>
      <ColSelect label="Column" cols={cols} value={col} onChange={setCol} />
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Target type</label>
        <select value={targetType} onChange={(e) => setTargetType(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5">
          <option value="numeric">Numeric</option>
          <option value="factor">Factor (categorical)</option>
          <option value="character">Character (string)</option>
          <option value="logical">Logical (TRUE/FALSE)</option>
        </select>
      </div>
    </DialogShell>
  )
}

// ── Mutate ────────────────────────────────────────────────────────────────────

function MutateDialog({ cols, onApply, onClose }: {
  cols: DataColumn[]; onApply: (r: string, l: string) => void; onClose: () => void
}) {
  const [newCol, setNewCol] = useState('')
  const [expr, setExpr] = useState('')

  const build = () => {
    if (!newCol || !expr) return
    onApply(`df <- df %>% mutate(${newCol} = ${expr})`, `Mutate: ${newCol} = ${expr}`)
  }

  return (
    <DialogShell title="Compute Variable" subtitle="dplyr::mutate()" onClose={onClose} onApply={build}>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">New column name</label>
        <input value={newCol} onChange={(e) => setNewCol(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
          placeholder="e.g. total_score" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">R expression</label>
        <input value={expr} onChange={(e) => setExpr(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
          placeholder="e.g. anxiety + depression" />
        <p className="text-xs text-gray-400 mt-1">
          Use column names, math, or R functions: <code className="font-mono">scale(anxiety)[,1]</code>, <code className="font-mono">ifelse(gpa &gt; 3, "high", "low")</code>
        </p>
      </div>
      {newCol && expr && (
        <code className="block text-xs bg-gray-900 text-green-400 p-2 rounded font-mono">
          df %&gt;% mutate({newCol} = {expr})
        </code>
      )}
      <div className="text-xs text-gray-500">
        <p className="font-medium mb-1">Available columns:</p>
        <p className="font-mono">{cols.map((c) => c.name).join(', ')}</p>
      </div>
    </DialogShell>
  )
}

// ── Recode ────────────────────────────────────────────────────────────────────

function RecodeDialog({ cols, onApply, onClose }: {
  cols: DataColumn[]; onApply: (r: string, l: string) => void; onClose: () => void
}) {
  const [col, setCol] = useState('')
  const [pairs, setPairs] = useState([{ from: '', to: '' }])

  const addPair = () => setPairs((p) => [...p, { from: '', to: '' }])
  const updatePair = (i: number, field: 'from' | 'to', val: string) =>
    setPairs((p) => p.map((pair, idx) => idx === i ? { ...pair, [field]: val } : pair))

  const build = () => {
    if (!col) return
    const valid = pairs.filter((p) => p.from && p.to)
    if (valid.length === 0) return
    const mappings = valid.map((p) => `"${p.from}" = "${p.to}"`).join(', ')
    onApply(`df <- df %>% mutate(${col} = recode(as.character(${col}), ${mappings}))`, `Recode ${col}`)
  }

  return (
    <DialogShell title="Recode Values" subtitle="dplyr::recode()" onClose={onClose} onApply={build}>
      <ColSelect label="Column to recode" cols={cols} value={col} onChange={setCol} />
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1 text-xs font-medium text-gray-500">
          <span>Old value</span><span>New value</span>
        </div>
        {pairs.map((pair, i) => (
          <div key={i} className="grid grid-cols-2 gap-1">
            <input value={pair.from} onChange={(e) => updatePair(i, 'from', e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-psychr-midblue" placeholder="e.g. Male" />
            <input value={pair.to} onChange={(e) => updatePair(i, 'to', e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-psychr-midblue" placeholder="e.g. M" />
          </div>
        ))}
        <button onClick={addPair} className="text-xs text-psychr-midblue hover:underline">+ Add mapping</button>
      </div>
    </DialogShell>
  )
}

// ── Pivot Longer ──────────────────────────────────────────────────────────────

function PivotLongerDialog({ cols, onApply, onClose }: {
  cols: DataColumn[]; onApply: (r: string, l: string, needsTidyr?: boolean) => void; onClose: () => void
}) {
  const [pivotCols, setPivotCols] = useState<string[]>([])
  const [namesTo, setNamesTo] = useState('variable')
  const [valuesTo, setValuesTo] = useState('value')

  const toggle = (n: string) => setPivotCols((p) => p.includes(n) ? p.filter((v) => v !== n) : [...p, n])

  const build = () => {
    if (pivotCols.length < 2) return
    const colStr = pivotCols.map((c) => `"${c}"`).join(', ')
    onApply(
      `df <- df %>% pivot_longer(cols = c(${colStr}), names_to = "${namesTo}", values_to = "${valuesTo}")`,
      `Pivot Longer (${pivotCols.length} cols)`,
      true
    )
  }

  return (
    <DialogShell title="Pivot Longer" subtitle="tidyr::pivot_longer()" onClose={onClose} onApply={build}>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Columns to pivot (select 2+)</label>
        <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto border border-gray-200 rounded p-2">
          {cols.map((c) => (
            <label key={c.name} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
              <input type="checkbox" checked={pivotCols.includes(c.name)} onChange={() => toggle(c.name)} className="accent-psychr-midblue" />
              <span className="text-xs">{c.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">names_to</label>
          <input value={namesTo} onChange={(e) => setNamesTo(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">values_to</label>
          <input value={valuesTo} onChange={(e) => setValuesTo(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue" />
        </div>
      </div>
    </DialogShell>
  )
}

// ── Pivot Wider ───────────────────────────────────────────────────────────────

function PivotWiderDialog({ cols, onApply, onClose }: {
  cols: DataColumn[]; onApply: (r: string, l: string, needsTidyr?: boolean) => void; onClose: () => void
}) {
  const [namesFrom, setNamesFrom] = useState('')
  const [valuesFrom, setValuesFrom] = useState('')

  const build = () => {
    if (!namesFrom || !valuesFrom) return
    onApply(
      `df <- df %>% pivot_wider(names_from = "${namesFrom}", values_from = "${valuesFrom}")`,
      `Pivot Wider (${namesFrom} → columns)`,
      true
    )
  }

  return (
    <DialogShell title="Pivot Wider" subtitle="tidyr::pivot_wider()" onClose={onClose} onApply={build}>
      <ColSelect label="names_from (column whose values become new columns)" cols={cols} value={namesFrom} onChange={setNamesFrom} />
      <ColSelect label="values_from (column whose values fill the new columns)" cols={cols} value={valuesFrom} onChange={setValuesFrom} />
    </DialogShell>
  )
}

// ── Summarize ─────────────────────────────────────────────────────────────────

function SummarizeDialog({ cols, numericCols, onApply, onClose }: {
  cols: DataColumn[]; numericCols: DataColumn[]
  onApply: (r: string, l: string) => void; onClose: () => void
}) {
  const [groupBy, setGroupBy] = useState('')
  const [summaryCol, setSummaryCol] = useState('')
  const [fns, setFns] = useState(['mean', 'sd', 'n'])

  const allFns = ['mean', 'sd', 'median', 'min', 'max', 'n', 'sum']
  const toggleFn = (f: string) => setFns((p) => p.includes(f) ? p.filter((v) => v !== f) : [...p, f])

  const build = () => {
    if (!summaryCol) return
    const summaries = fns.map((f) =>
      f === 'n' ? `n = n()` : `${summaryCol}_${f} = ${f}(${summaryCol}, na.rm = TRUE)`
    ).join(', ')

    const groupPart = groupBy ? `group_by(${groupBy}) %>% ` : ''
    onApply(
      `df <- df %>% ${groupPart}summarize(${summaries}, .groups = "drop")`,
      `Summarize ${summaryCol}${groupBy ? ' by ' + groupBy : ''}`
    )
  }

  return (
    <DialogShell title="Group & Summarize" subtitle="dplyr::group_by() %>% summarize()" onClose={onClose} onApply={build}>
      <ColSelect label="Group by (optional)" cols={cols} value={groupBy} onChange={setGroupBy} />
      <ColSelect label="Summarize column" cols={numericCols} value={summaryCol} onChange={setSummaryCol} />
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Summary functions</label>
        <div className="flex flex-wrap gap-2">
          {allFns.map((f) => (
            <label key={f} className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={fns.includes(f)} onChange={() => toggleFn(f)} className="accent-psychr-midblue" />
              <span className="text-xs font-mono text-gray-700">{f}()</span>
            </label>
          ))}
        </div>
      </div>
    </DialogShell>
  )
}
