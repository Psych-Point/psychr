/**
 * Tab 5: Data Visualization
 *
 * ggplot2 builder. Configure chart visually; R generates the plot;
 * image is streamed back and displayed alongside the generated ggplot code.
 */

import { useState } from 'react'
import { WorkspaceLayout, PanelHeader } from '../../components/layout/WorkspaceLayout'
import { usePsychrStore } from '../../store'
import { useRBridge } from '../../hooks/useRBridge'
import { RConsole } from '../../components/shared/RConsole'

type ChartType = 'histogram' | 'scatter' | 'boxplot' | 'bar' | 'violin' | 'density' | 'line'

interface ChartConfig {
  type: ChartType
  x: string
  y: string
  color: string
  fill: string
  facet: string
  theme: string
  title: string
  xLabel: string
  yLabel: string
  addRegression: boolean
  addErrorBars: boolean
}

const CHART_TYPES: { id: ChartType; label: string; icon: string; description: string }[] = [
  { id: 'histogram', label: 'Histogram', icon: '📊', description: 'Distribution of one variable' },
  { id: 'density', label: 'Density', icon: '〰️', description: 'Smoothed distribution' },
  { id: 'boxplot', label: 'Box Plot', icon: '📦', description: 'Distribution across groups' },
  { id: 'violin', label: 'Violin', icon: '🎻', description: 'Density + distribution' },
  { id: 'scatter', label: 'Scatter', icon: '⋯', description: 'Relationship between two vars' },
  { id: 'bar', label: 'Bar Chart', icon: '▬', description: 'Compare group means' },
  { id: 'line', label: 'Line Chart', icon: '📈', description: 'Trends over time' },
]

const GGPLOT_THEMES = ['theme_bw', 'theme_classic', 'theme_minimal', 'theme_light', 'theme_gray', 'theme_void']

export function VisualizationTab() {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const { run, isRunning, error } = useRBridge()

  const allCols = activeDataset?.columns ?? []
  const numCols = allCols.filter((c) => c.type === 'numeric')
  const catCols = allCols.filter((c) => c.type === 'factor' || c.type === 'character')

  const [config, setConfig] = useState<ChartConfig>({
    type: 'histogram',
    x: numCols[0]?.name ?? '',
    y: numCols[1]?.name ?? '',
    color: '',
    fill: '',
    facet: '',
    theme: 'theme_bw',
    title: '',
    xLabel: '',
    yLabel: '',
    addRegression: false,
    addErrorBars: false,
  })
  const [plotImage, setPlotImage] = useState<string | null>(null)
  const [ggplotCode, setGgplotCode] = useState<string>('')

  const set = (key: keyof ChartConfig, val: string | boolean) =>
    setConfig((c) => ({ ...c, [key]: val }))

  const buildGgplotScript = () => {
    const aes = [
      config.x && `x = ${config.x}`,
      config.y && ['scatter', 'bar', 'line', 'boxplot', 'violin'].includes(config.type) && `y = ${config.y}`,
      config.color && `color = ${config.color}`,
      config.fill && `fill = ${config.fill}`,
    ].filter(Boolean).join(', ')

    const geom = {
      histogram: 'geom_histogram(bins = 30)',
      density: 'geom_density(alpha = 0.4)',
      boxplot: 'geom_boxplot()',
      violin: 'geom_violin(trim = FALSE) + geom_boxplot(width = 0.1)',
      scatter: 'geom_point(alpha = 0.7)',
      bar: 'stat_summary(fun = mean, geom = "bar") + stat_summary(fun.data = mean_se, geom = "errorbar", width = 0.2)',
      line: 'geom_line() + geom_point()',
    }[config.type]

    const regression = config.addRegression && config.type === 'scatter'
      ? '\n  geom_smooth(method = "lm", se = TRUE, color = "red")'
      : ''

    const facet = config.facet ? `\n  facet_wrap(~ ${config.facet})` : ''
    const labs_parts = [
      config.title && `title = "${config.title}"`,
      config.xLabel && `x = "${config.xLabel}"`,
      config.yLabel && `y = "${config.yLabel}"`,
    ].filter(Boolean).join(', ')
    const labs = labs_parts ? `\n  labs(${labs_parts})` : ''

    return `ggplot(df, aes(${aes})) +\n  ${geom}${regression}${facet}${labs}\n  ${config.theme}(base_size = 14)`
  }

  const handleGeneratePlot = async () => {
    if (!activeDataset) { alert('Please load a dataset on the Data tab first.'); return }
    if (!config.x) { alert('Please select an X variable.'); return }

    const ggcode = buildGgplotScript()
    setGgplotCode(ggcode)

    // df is injected by useRBridge from the active dataset
    const script = `
library(ggplot2)
library(jsonlite)

p <- ${ggcode}

# Save to temp file and encode as base64
tmp <- tempfile(fileext = ".png")
ggsave(tmp, plot = p, width = 8, height = 5, dpi = 150)
img_raw <- readBin(tmp, "raw", file.info(tmp)$size)
img_b64 <- base64enc::base64encode(img_raw)
file.remove(tmp)

cat(toJSON(list(
  success = TRUE,
  r_script = "${ggcode.replace(/"/g, '\\"').replace(/\n/g, '\\n')}",
  data = list(
    image_b64 = img_b64,
    plot_type = "${config.type}"
  )
), auto_unbox = TRUE))
`

    const result = await run(script, `ggplot: ${config.type}`)
    if (result?.data) {
      const data = result.data as Record<string, unknown>
      if (data.image_b64) {
        setPlotImage(`data:image/png;base64,${data.image_b64}`)
      }
    }
  }

  return (
    <WorkspaceLayout
      leftWidth="260px"
      left={
        <div className="flex flex-col h-full">
          <PanelHeader title="Chart Builder" />
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Chart type */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Chart Type</p>
              <div className="grid grid-cols-2 gap-1.5">
                {CHART_TYPES.map((ct) => (
                  <button
                    key={ct.id}
                    onClick={() => set('type', ct.id)}
                    title={ct.description}
                    className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-colors ${
                      config.type === ct.id
                        ? 'border-psychr-midblue bg-psychr-accent text-psychr-midblue font-semibold'
                        : 'border-gray-200 text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <span className="block text-base mb-0.5">{ct.icon}</span>
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Variable mapping */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Variables</p>
              <div className="space-y-2">
                {[
                  { key: 'x' as const, label: 'X axis', cols: allCols },
                  { key: 'y' as const, label: 'Y axis', cols: numCols },
                  { key: 'color' as const, label: 'Color by', cols: catCols },
                  { key: 'facet' as const, label: 'Facet by', cols: catCols },
                ].map(({ key, label, cols }) => (
                  <div key={key}>
                    <label className="text-xs text-gray-600">{label}</label>
                    <select
                      value={(config as any)[key]}
                      onChange={(e) => set(key, e.target.value)}
                      className="w-full mt-0.5 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                    >
                      <option value="">— none —</option>
                      {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Options */}
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Options</p>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-600">Theme</label>
                  <select
                    value={config.theme}
                    onChange={(e) => set('theme', e.target.value)}
                    className="w-full mt-0.5 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                  >
                    {GGPLOT_THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <input
                  value={config.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="Plot title..."
                  className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                />
                {config.type === 'scatter' && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.addRegression}
                      onChange={(e) => set('addRegression', e.target.checked)}
                      className="accent-psychr-midblue"
                    />
                    <span className="text-xs text-gray-700">Add regression line</span>
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-gray-200">
            <button
              onClick={handleGeneratePlot}
              disabled={isRunning || !config.x}
              className="w-full bg-psychr-midblue text-white text-sm font-medium py-2 rounded hover:bg-psychr-blue transition-colors disabled:opacity-50"
            >
              {isRunning ? 'Generating…' : '▶ Generate Plot'}
            </button>
          </div>
        </div>
      }
      center={
        <div className="flex flex-col h-full bg-white">
          <PanelHeader
            title="Plot Preview"
            subtitle="Generated by ggplot2"
            actions={
              plotImage ? (
                <a
                  href={plotImage}
                  download="psychr_plot.png"
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded"
                >
                  Export PNG
                </a>
              ) : undefined
            }
          />
          {error && (
            <div className="px-4 py-2 bg-red-50 border-b border-red-200">
              <p className="text-xs font-mono text-red-700">{error}</p>
            </div>
          )}
          <div className="flex-1 overflow-y-auto flex items-center justify-center p-6 bg-gray-50">
            {isRunning ? (
              <div className="text-center">
                <div className="w-8 h-8 border-3 border-psychr-midblue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">Generating ggplot2 chart…</p>
              </div>
            ) : plotImage ? (
              <img
                src={plotImage}
                alt="Generated chart"
                className="max-w-full max-h-full shadow-md rounded"
              />
            ) : (
              <div className="text-center">
                <span className="text-6xl mb-4 block">🎨</span>
                <p className="text-gray-600 font-medium">No plot yet</p>
                <p className="text-gray-400 text-sm mt-1">
                  Configure your chart and click Generate Plot
                </p>
                <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200 text-left text-xs font-mono text-gray-600">
                  <p className="text-gray-400 mb-1"># Preview of ggplot2 code:</p>
                  <p>{buildGgplotScript().split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</p>
                </div>
              </div>
            )}
          </div>
          {ggplotCode && (
            <div className="border-t border-gray-200 bg-gray-950 p-3">
              <p className="text-xs text-gray-400 mb-1">Generated ggplot2 code:</p>
              <pre className="text-xs font-mono text-green-400">{ggplotCode}</pre>
            </div>
          )}
        </div>
      }
      rightWidth="320px"
      right={<RConsole />}
    />
  )
}
