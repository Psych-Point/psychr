/**
 * Tab 3: IRT Analysis
 *
 * Item Response Theory workspace.
 * Supports Rasch, 2PL, 3PL, GRM, GPCM via the mirt and TAM R packages.
 */

import { useState } from 'react'
import { WorkspaceLayout, PanelHeader } from '../../components/layout/WorkspaceLayout'
import { usePsychrStore } from '../../store'
import { useRBridge } from '../../hooks/useRBridge'
import { RConsole } from '../../components/shared/RConsole'

type IRTModel = 'rasch' | '2pl' | '3pl' | 'grm' | 'gpcm'

const MODEL_DESCRIPTIONS: Record<IRTModel, { name: string; params: string; package: string; description: string }> = {
  rasch: {
    name: 'Rasch Model',
    params: '1 parameter (difficulty)',
    package: 'TAM / eRm',
    description: 'Assumes equal discrimination across items. Best for achievement tests and survey scales.',
  },
  '2pl': {
    name: '2-Parameter Logistic (2PL)',
    params: '2 parameters (difficulty + discrimination)',
    package: 'mirt',
    description: 'Items vary in both difficulty and discrimination. More flexible than Rasch.',
  },
  '3pl': {
    name: '3-Parameter Logistic (3PL)',
    params: '3 parameters (difficulty, discrimination, guessing)',
    package: 'mirt',
    description: 'Adds a lower asymptote (guessing) parameter. Best for multiple-choice tests.',
  },
  grm: {
    name: 'Graded Response Model (GRM)',
    params: 'Polytomous (ordered categories)',
    package: 'mirt',
    description: 'For Likert-scale items with ordered response categories.',
  },
  gpcm: {
    name: 'Generalized Partial Credit (GPCM)',
    params: 'Polytomous (step parameters)',
    package: 'mirt',
    description: 'Generalization of the partial credit model with varying discrimination.',
  },
}

export function IRTTab() {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const appendToScript = usePsychrStore((s) => s.appendToScript)
  const { run, isRunning, error } = useRBridge()

  const [selectedModel, setSelectedModel] = useState<IRTModel>('rasch')
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [results, setResults] = useState<Record<string, unknown> | null>(null)
  const [itemError, setItemError] = useState<string | null>(null)

  const numericCols = (activeDataset?.columns ?? []).filter((c) => c.type === 'numeric')

  const toggleItem = (name: string) => {
    setSelectedItems((prev) =>
      prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]
    )
  }

  const handleRunIRT = async () => {
    const items = selectedItems.length > 0 ? selectedItems : numericCols.map((c) => c.name)
    if (items.length < 3) {
      setItemError('Select at least 3 items for IRT analysis.')
      return
    }
    setItemError(null)

    // df is injected by useRBridge from the active dataset
    const itemList = items.map((i) => `"${i}"`).join(', ')
    const script = `
library(mirt)
library(jsonlite)

model_type <- "${selectedModel === '2pl' ? '2PL' : selectedModel === '3pl' ? '3PL' : selectedModel === 'grm' ? 'graded' : selectedModel === 'gpcm' ? 'gpcm' : 'Rasch'}"
irt_df <- df[, c(${itemList}), drop = FALSE]
fit <- mirt(irt_df, 1, itemtype = model_type, verbose = FALSE)
params <- coef(fit, simplify = TRUE, IRTpars = TRUE)$items

param_list <- lapply(rownames(params), function(item) {
  row <- as.list(params[item, ])
  row$Item <- item
  row
})

# Model fit
fit_stats <- M2(fit)

cat(toJSON(list(
  success = TRUE,
  r_script = paste0(
    "library(mirt)\\nfit <- mirt(df, 1, itemtype = '", model_type, "', verbose = FALSE)\\n",
    "params <- coef(fit, simplify = TRUE, IRTpars = TRUE)\\nprint(params)"
  ),
  data = list(
    model = model_type,
    n_items = nrow(params),
    parameters = param_list,
    fit = list(
      M2 = round(fit_stats$M2, 3),
      df = fit_stats$df,
      RMSEA = round(fit_stats$RMSEA, 3),
      CFI = round(fit_stats$CFI, 3),
      TLI = round(fit_stats$TLI, 3)
    )
  )
), auto_unbox = TRUE))
`

    const result = await run(script, `IRT ${MODEL_DESCRIPTIONS[selectedModel].name}`)
    if (result?.data) {
      setResults(result.data as Record<string, unknown>)
    }
  }

  const modelInfo = MODEL_DESCRIPTIONS[selectedModel]

  return (
    <WorkspaceLayout
      leftWidth="280px"
      left={
        <div className="flex flex-col h-full">
          <PanelHeader title="IRT Configuration" />
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Model selection */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Model</p>
              <div className="space-y-1.5">
                {(Object.keys(MODEL_DESCRIPTIONS) as IRTModel[]).map((model) => (
                  <label key={model} className="flex items-start gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      name="irt-model"
                      value={model}
                      checked={selectedModel === model}
                      onChange={() => setSelectedModel(model)}
                      className="mt-0.5 accent-psychr-midblue"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-800 group-hover:text-psychr-midblue">
                        {MODEL_DESCRIPTIONS[model].name}
                      </span>
                      <p className="text-xs text-gray-500">{MODEL_DESCRIPTIONS[model].params}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Model info box */}
            <div className="bg-psychr-accent border border-psychr-lightblue rounded-lg p-3">
              <p className="text-xs font-semibold text-psychr-midblue mb-1">{modelInfo.name}</p>
              <p className="text-xs text-gray-600">{modelInfo.description}</p>
              <p className="text-xs text-gray-500 mt-1">R package: {modelInfo.package}</p>
            </div>

            {/* Item selection */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                Items <span className="text-gray-400 font-normal normal-case">(select 3+)</span>
              </p>
              {numericCols.length === 0 ? (
                <p className="text-xs text-gray-500">Load a dataset with item response columns first.</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded p-2">
                  {numericCols.map((col) => (
                    <label key={col.name} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
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
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Output</p>
              <div className="space-y-1.5">
                {['Item parameters', 'Person abilities', 'Model fit', 'ICC plots', 'TIF plot', 'Wright map'].map((opt) => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" defaultChecked className="accent-psychr-midblue" />
                    <span className="text-sm text-gray-700">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 space-y-2">
            {itemError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{itemError}</p>
            )}
            <button
              onClick={handleRunIRT}
              disabled={isRunning || numericCols.length < 3}
              className="w-full bg-psychr-midblue text-white text-sm font-medium py-2 rounded hover:bg-psychr-blue transition-colors disabled:opacity-50"
            >
              {isRunning ? 'Running IRT…' : 'Run IRT Analysis'}
            </button>
          </div>
        </div>
      }
      center={
        <div className="flex flex-col h-full bg-white">
          <PanelHeader title="IRT Results" subtitle={results ? `${MODEL_DESCRIPTIONS[selectedModel].name}` : 'Configure and run an IRT model'} />
          {error && (
            <div className="px-4 py-2 bg-red-50 border-b border-red-200">
              <p className="text-xs font-mono text-red-700">{error}</p>
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4">
            {!results ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <span className="text-5xl mb-4">📐</span>
                <p className="text-gray-600 font-medium">IRT Analysis Ready</p>
                <p className="text-gray-400 text-sm mt-1">
                  Select a model and items, then click Run IRT Analysis
                </p>
                <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                  {['Rasch', '2PL', '3PL'].map((m) => (
                    <div key={m} className="bg-psychr-accent rounded-lg p-3">
                      <p className="text-sm font-semibold text-psychr-blue">{m}</p>
                      <p className="text-xs text-gray-500 mt-0.5">supported</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <IRTResults data={results} model={selectedModel} />
            )}
          </div>
        </div>
      }
      rightWidth="320px"
      right={<RConsole />}
    />
  )
}

function IRTResults({ data, model }: { data: Record<string, unknown>; model: IRTModel }) {
  const params = data.parameters as Record<string, unknown>[]
  const fit = data.fit as Record<string, unknown>

  return (
    <div className="space-y-4">
      {/* Fit statistics */}
      {fit && (
        <div className="bg-psychr-accent rounded-lg p-3">
          <p className="text-xs font-semibold text-psychr-blue mb-2">Model Fit</p>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(fit).map(([key, val]) => (
              <div key={key} className="text-center">
                <p className="text-xs text-gray-500">{key}</p>
                <p className="text-sm font-semibold text-gray-800">{String(val)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Item parameters table */}
      {params && params.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">Item Parameters</p>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse w-full">
              <thead>
                <tr className="bg-gray-100">
                  {Object.keys(params[0]).map((h) => (
                    <th key={h} className="text-left px-3 py-1.5 border border-gray-200 font-semibold text-gray-700">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {params.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="px-3 py-1.5 border border-gray-200 font-mono">
                        {typeof val === 'number' ? val.toFixed(3) : String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
