/**
 * T-Test Dialog
 *
 * Supports: Independent Samples, Paired Samples, One-Sample t-tests.
 * Uses base R t.test() + effectsize package for Cohen's d.
 */

import { useState } from 'react'
import { usePsychrStore } from '../../../store'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
  testType?: TTestType
}

type TTestType = 'independent' | 'paired' | 'one-sample'

export function TTestDialog({ onClose, onRun, testType: initialTestType }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const numericCols = (activeDataset?.columns ?? []).filter((c) => c.type === 'numeric')
  const factorCols = (activeDataset?.columns ?? []).filter(
    (c) => c.type === 'factor' || c.type === 'character'
  )

  const [testType, setTestType] = useState<TTestType>(initialTestType ?? 'independent')
  const [depVar, setDepVar] = useState('')
  const [groupVar, setGroupVar] = useState('')
  const [var2, setVar2] = useState('')
  const [muValue, setMuValue] = useState('0')
  const [alternative, setAlternative] = useState<'two.sided' | 'less' | 'greater'>('two.sided')
  const [confidenceLevel, setConfidenceLevel] = useState('0.95')
  const [varEqual, setVarEqual] = useState(false)

  const handleRun = async () => {
    let rScript = ''
    let label = ''

    // Use demo data when no dataset loaded
    const dataSetup = activeDataset
      ? `# Load dataset\ndf <- readRDS("${activeDataset.path ?? ''}")`
      : `df <- data.frame(
  age = c(24, 19, 22, 25, 21, 23, 20, 26),
  gender = c("Female","Male","Female","Male","Female","Non-binary","Male","Female"),
  anxiety = c(42, 55, 38, 61, 47, 50, 58, 35),
  depression = c(31, 44, 28, 52, 36, 39, 49, 25),
  gpa = c(3.7, 2.9, 3.4, 2.6, 3.1, 3.5, 3.0, 3.8)
)`

    if (testType === 'independent') {
      if (!depVar || !groupVar) return
      rScript = `
library(jsonlite)
${dataSetup}

dep <- "${depVar}"
grp <- "${groupVar}"
conf_level <- ${confidenceLevel}
var_equal <- ${varEqual ? 'TRUE' : 'FALSE'}
alternative <- "${alternative}"

result <- t.test(
  df[[dep]] ~ df[[grp]],
  alternative = alternative,
  var.equal = var_equal,
  conf.level = conf_level
)

groups <- levels(factor(df[[grp]]))
group_means <- tapply(df[[dep]], df[[grp]], mean, na.rm = TRUE)
group_sds <- tapply(df[[dep]], df[[grp]], sd, na.rm = TRUE)
group_ns <- tapply(df[[dep]], df[[grp]], function(x) sum(!is.na(x)))

# Cohen's d (pooled SD)
n1 <- group_ns[[1]]; n2 <- group_ns[[2]]
sd1 <- group_sds[[1]]; sd2 <- group_sds[[2]]
pooled_sd <- sqrt(((n1 - 1) * sd1^2 + (n2 - 1) * sd2^2) / (n1 + n2 - 2))
cohens_d <- (group_means[[1]] - group_means[[2]]) / pooled_sd

r_script_text <- paste0(
  "# Independent Samples t-test\\n",
  "t.test(", dep, " ~ ", grp, ", data = df, var.equal = ", var_equal, ")\\n"
)

cat(toJSON(list(
  success = TRUE,
  r_script = r_script_text,
  data = list(
    table = list(list(
      Statistic = paste0("t(", round(result$parameter, 2), ")"),
      Value = round(result$statistic, 3),
      p_value = ifelse(result$p.value < .001, "< .001", round(result$p.value, 3)),
      CI_lower = round(result$conf.int[1], 3),
      CI_upper = round(result$conf.int[2], 3),
      Cohens_d = round(cohens_d, 3),
      Group1_M = round(group_means[[1]], 3),
      Group1_SD = round(group_sds[[1]], 3),
      Group2_M = round(group_means[[2]], 3),
      Group2_SD = round(group_sds[[2]], 3)
    ))
  )
), auto_unbox = TRUE))
`
      label = `Independent t-test: ${depVar} by ${groupVar}`
    } else if (testType === 'paired') {
      if (!depVar || !var2) return
      rScript = `
library(jsonlite)
${dataSetup}

v1 <- "${depVar}"
v2 <- "${var2}"
conf_level <- ${confidenceLevel}
alternative <- "${alternative}"

result <- t.test(df[[v1]], df[[v2]], paired = TRUE,
  alternative = alternative, conf.level = conf_level)

diff <- df[[v1]] - df[[v2]]
d <- mean(diff, na.rm = TRUE) / sd(diff, na.rm = TRUE)

r_script_text <- paste0(
  "# Paired Samples t-test\\n",
  "t.test(df$", v1, ", df$", v2, ", paired = TRUE)\\n"
)

cat(toJSON(list(
  success = TRUE,
  r_script = r_script_text,
  data = list(
    table = list(list(
      Statistic = paste0("t(", round(result$parameter, 2), ")"),
      Value = round(result$statistic, 3),
      p_value = ifelse(result$p.value < .001, "< .001", round(result$p.value, 3)),
      CI_lower = round(result$conf.int[1], 3),
      CI_upper = round(result$conf.int[2], 3),
      Cohens_d = round(d, 3),
      Mean_diff = round(result$estimate, 3),
      Var1_M = round(mean(df[[v1]], na.rm = TRUE), 3),
      Var2_M = round(mean(df[[v2]], na.rm = TRUE), 3)
    ))
  )
), auto_unbox = TRUE))
`
      label = `Paired t-test: ${depVar} vs ${var2}`
    } else {
      if (!depVar) return
      const mu = parseFloat(muValue) || 0
      rScript = `
library(jsonlite)
${dataSetup}

dep <- "${depVar}"
mu <- ${mu}
conf_level <- ${confidenceLevel}
alternative <- "${alternative}"

result <- t.test(df[[dep]], mu = mu, alternative = alternative, conf.level = conf_level)
d <- (mean(df[[dep]], na.rm = TRUE) - mu) / sd(df[[dep]], na.rm = TRUE)

r_script_text <- paste0(
  "# One-Sample t-test\\n",
  "t.test(df$", dep, ", mu = ", mu, ")\\n"
)

cat(toJSON(list(
  success = TRUE,
  r_script = r_script_text,
  data = list(
    table = list(list(
      Statistic = paste0("t(", round(result$parameter, 2), ")"),
      Value = round(result$statistic, 3),
      p_value = ifelse(result$p.value < .001, "< .001", round(result$p.value, 3)),
      CI_lower = round(result$conf.int[1], 3),
      CI_upper = round(result$conf.int[2], 3),
      Cohens_d = round(d, 3),
      Sample_M = round(result$estimate, 3),
      Test_value = mu
    ))
  )
), auto_unbox = TRUE))
`
      label = `One-Sample t-test: ${depVar} (mu = ${muValue})`
    }

    const result = await onRun(rScript, label)
    if (result) {
      addResult({
        id: `result_${Date.now()}`,
        type: testType === 'independent' ? 'independent-t' : testType === 'paired' ? 'paired-t' : 'one-sample-t',
        label,
        params: { testType, depVar, groupVar, var2, muValue, alternative },
        output: result as Record<string, unknown>,
        rScript: result.r_script as string || rScript,
        timestamp: new Date(),
      })
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[540px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">t-Test</h2>
            <p className="text-xs text-gray-500 mt-0.5">Base R t.test() with Cohen's d</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Test type tabs */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Test Type</p>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {([
                ['independent', 'Independent Samples'],
                ['paired', 'Paired Samples'],
                ['one-sample', 'One Sample'],
              ] as [TTestType, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTestType(val)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    testType === val
                      ? 'bg-psychr-midblue text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Variable selectors */}
          {testType === 'independent' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dependent Variable
                  </label>
                  <select
                    value={depVar}
                    onChange={(e) => setDepVar(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                  >
                    <option value="">Select variable...</option>
                    {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    {numericCols.length === 0 && (
                      <option value="anxiety" selected>anxiety (demo)</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Grouping Variable
                  </label>
                  <select
                    value={groupVar}
                    onChange={(e) => setGroupVar(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                  >
                    <option value="">Select variable...</option>
                    {factorCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    {factorCols.length === 0 && (
                      <option value="gender">gender (demo)</option>
                    )}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={varEqual}
                  onChange={(e) => setVarEqual(e.target.checked)}
                  className="accent-psychr-midblue"
                />
                <span className="text-sm text-gray-700">Assume equal variances (Student's t)</span>
              </label>
            </>
          )}

          {testType === 'paired' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Variable 1</label>
                <select
                  value={depVar}
                  onChange={(e) => setDepVar(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                >
                  <option value="">Select variable...</option>
                  {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  {numericCols.length === 0 && <option value="anxiety">anxiety (demo)</option>}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Variable 2</label>
                <select
                  value={var2}
                  onChange={(e) => setVar2(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                >
                  <option value="">Select variable...</option>
                  {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  {numericCols.length === 0 && <option value="depression">depression (demo)</option>}
                </select>
              </div>
            </div>
          )}

          {testType === 'one-sample' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Variable</label>
                <select
                  value={depVar}
                  onChange={(e) => setDepVar(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                >
                  <option value="">Select variable...</option>
                  {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  {numericCols.length === 0 && <option value="gpa">gpa (demo)</option>}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Test value (μ₀)</label>
                <input
                  type="number"
                  value={muValue}
                  onChange={(e) => setMuValue(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                />
              </div>
            </div>
          )}

          {/* Options */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alternative hypothesis</label>
              <select
                value={alternative}
                onChange={(e) => setAlternative(e.target.value as typeof alternative)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
              >
                <option value="two.sided">Two-tailed</option>
                <option value="less">Less than</option>
                <option value="greater">Greater than</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confidence level</label>
              <select
                value={confidenceLevel}
                onChange={(e) => setConfidenceLevel(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
              >
                <option value="0.95">95%</option>
                <option value="0.99">99%</option>
                <option value="0.90">90%</option>
              </select>
            </div>
          </div>

          {!activeDataset && (
            <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              No dataset loaded — using demo data (n = 8). Import a dataset on the Data tab.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-400">APA-formatted output · Cohen's d effect size</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">
              Cancel
            </button>
            <button
              onClick={handleRun}
              className="px-5 py-1.5 text-sm font-medium bg-psychr-midblue text-white rounded hover:bg-psychr-blue transition-colors"
            >
              Run Analysis
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
