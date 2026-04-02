/**
 * Non-Parametric Tests Dialog
 *
 * Mann-Whitney U, Wilcoxon Signed-Rank, Kruskal-Wallis, Chi-Square.
 * Uses base R: wilcox.test(), kruskal.test(), chisq.test().
 */

import { useState } from 'react'
import { usePsychrStore } from '../../../store'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
  initialTest?: TestType
}

type TestType = 'mann-whitney' | 'wilcoxon' | 'kruskal-wallis' | 'chi-square'

const TEST_INFO: Record<TestType, { name: string; description: string; r_func: string }> = {
  'mann-whitney': {
    name: 'Mann-Whitney U',
    description: 'Non-parametric alternative to independent samples t-test.',
    r_func: 'wilcox.test()',
  },
  'wilcoxon': {
    name: 'Wilcoxon Signed-Rank',
    description: 'Non-parametric alternative to paired samples t-test.',
    r_func: 'wilcox.test(paired = TRUE)',
  },
  'kruskal-wallis': {
    name: 'Kruskal-Wallis',
    description: 'Non-parametric alternative to one-way ANOVA for 3+ groups.',
    r_func: 'kruskal.test()',
  },
  'chi-square': {
    name: 'Chi-Square Test',
    description: 'Test of independence between two categorical variables.',
    r_func: 'chisq.test()',
  },
}

export function NonParametricDialog({ onClose, onRun, initialTest }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const numericCols = (activeDataset?.columns ?? []).filter((c) => c.type === 'numeric')
  const catCols = (activeDataset?.columns ?? []).filter(
    (c) => c.type === 'factor' || c.type === 'character'
  )
  const allCols = activeDataset?.columns ?? []

  const [testType, setTestType] = useState<TestType>(initialTest ?? 'mann-whitney')
  const [var1, setVar1] = useState('')
  const [var2, setVar2] = useState('')
  const [groupVar, setGroupVar] = useState('')
  const [alternative, setAlternative] = useState<'two.sided' | 'less' | 'greater'>('two.sided')
  const [correctYates, setCorrectYates] = useState(true)

  const handleRun = async () => {
    let rScript = ''
    let label = ''

    if (testType === 'mann-whitney') {
      if (!var1 || !groupVar) return
      rScript = `
library(jsonlite)

dep <- "${var1}"
grp <- "${groupVar}"
df[[grp]] <- factor(df[[grp]])
groups <- levels(df[[grp]])
if (length(groups) != 2) stop("Mann-Whitney U requires exactly 2 groups.")

g1 <- df[[dep]][df[[grp]] == groups[1]]
g2 <- df[[dep]][df[[grp]] == groups[2]]

result <- wilcox.test(g1, g2, alternative = "${alternative}", correct = TRUE)

# Effect size r = Z / sqrt(N)
Z <- qnorm(result$p.value / 2)
n_total <- sum(!is.na(c(g1, g2)))
r_effect <- abs(Z) / sqrt(n_total)

r_script_text <- paste0(
  "# Mann-Whitney U\\n",
  "wilcox.test(", dep, " ~ ", grp, ", data = df, alternative = '${alternative}')\\n"
)

cat(toJSON(list(
  success = TRUE,
  r_script = r_script_text,
  data = list(
    table = list(list(
      Test = "Mann-Whitney U",
      W = round(result$statistic, 3),
      p_value = ifelse(result$p.value < .001, "< .001", round(result$p.value, 3)),
      Effect_r = round(r_effect, 3),
      Group1 = groups[1],
      Group1_Mdn = round(median(g1, na.rm = TRUE), 3),
      Group2 = groups[2],
      Group2_Mdn = round(median(g2, na.rm = TRUE), 3),
      N = n_total
    ))
  )
), auto_unbox = TRUE))
`
      label = `Mann-Whitney U: ${var1} by ${groupVar}`

    } else if (testType === 'wilcoxon') {
      if (!var1 || !var2) return
      rScript = `
library(jsonlite)

v1 <- "${var1}"
v2 <- "${var2}"

complete_idx <- complete.cases(df[[v1]], df[[v2]])
x1 <- df[[v1]][complete_idx]
x2 <- df[[v2]][complete_idx]

result <- wilcox.test(x1, x2, paired = TRUE, alternative = "${alternative}", correct = TRUE)

diff <- x1 - x2
Z <- qnorm(result$p.value / 2)
r_effect <- abs(Z) / sqrt(length(diff))

r_script_text <- paste0(
  "# Wilcoxon Signed-Rank\\n",
  "wilcox.test(df$", v1, ", df$", v2, ", paired = TRUE)\\n"
)

cat(toJSON(list(
  success = TRUE,
  r_script = r_script_text,
  data = list(
    table = list(list(
      Test = "Wilcoxon Signed-Rank",
      V = round(result$statistic, 3),
      p_value = ifelse(result$p.value < .001, "< .001", round(result$p.value, 3)),
      Effect_r = round(r_effect, 3),
      Var1_Mdn = round(median(x1, na.rm = TRUE), 3),
      Var2_Mdn = round(median(x2, na.rm = TRUE), 3),
      N_pairs = length(diff)
    ))
  )
), auto_unbox = TRUE))
`
      label = `Wilcoxon Signed-Rank: ${var1} vs ${var2}`

    } else if (testType === 'kruskal-wallis') {
      if (!var1 || !groupVar) return
      rScript = `
library(jsonlite)

dep <- "${var1}"
grp <- "${groupVar}"
df[[grp]] <- factor(df[[grp]])

result <- kruskal.test(df[[dep]] ~ df[[grp]])

# Effect size eta-squared H
k <- nlevels(df[[grp]])
n <- sum(!is.na(df[[dep]]))
eta2_H <- (result$statistic - k + 1) / (n - k)

group_medians <- tapply(df[[dep]], df[[grp]], median, na.rm = TRUE)
medians_table <- lapply(names(group_medians), function(g) {
  list(Group = g, N = sum(df[[grp]] == g, na.rm = TRUE), Median = round(group_medians[[g]], 3))
})

r_script_text <- paste0(
  "# Kruskal-Wallis\\n",
  "kruskal.test(", dep, " ~ ", grp, ", data = df)\\n"
)

cat(toJSON(list(
  success = TRUE,
  r_script = r_script_text,
  data = list(
    table = list(list(
      Test = "Kruskal-Wallis",
      H = round(result$statistic, 3),
      df = result$parameter,
      p_value = ifelse(result$p.value < .001, "< .001", round(result$p.value, 3)),
      eta2_H = round(max(0, eta2_H), 3),
      N = n
    )),
    group_medians = medians_table
  )
), auto_unbox = TRUE))
`
      label = `Kruskal-Wallis: ${var1} by ${groupVar}`

    } else {
      if (!var1 || !var2) return
      rScript = `
library(jsonlite)

v1 <- "${var1}"
v2 <- "${var2}"

ct <- table(df[[v1]], df[[v2]])
result <- chisq.test(ct, correct = ${correctYates ? 'TRUE' : 'FALSE'})

# Cramér's V
n_total <- sum(ct)
min_dim <- min(nrow(ct), ncol(ct)) - 1
cramers_v <- sqrt(result$statistic / (n_total * min_dim))

r_script_text <- paste0(
  "# Chi-Square Test of Independence\\n",
  "ct <- table(df$", v1, ", df$", v2, ")\\n",
  "chisq.test(ct)\\n",
  "# Cramér's V = ", round(cramers_v, 3), "\\n"
)

cat(toJSON(list(
  success = TRUE,
  r_script = r_script_text,
  data = list(
    table = list(list(
      Test = "Chi-Square",
      Chi2 = round(result$statistic, 3),
      df = result$parameter,
      p_value = ifelse(result$p.value < .001, "< .001", round(result$p.value, 3)),
      Cramers_V = round(cramers_v, 3),
      N = n_total,
      Rows = nrow(ct),
      Cols = ncol(ct)
    ))
  )
), auto_unbox = TRUE))
`
      label = `Chi-Square: ${var1} × ${var2}`
    }

    const result = await onRun(rScript, label)
    if (result) {
      addResult({
        id: `result_${Date.now()}`,
        type: testType,
        label,
        params: { testType, var1, var2, groupVar, alternative },
        output: result as Record<string, unknown>,
        rScript: (result.r_script as string) || rScript,
        timestamp: new Date(),
      })
      onClose()
    }
  }

  const info = TEST_INFO[testType]

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Non-Parametric Tests</h2>
            <p className="text-xs text-gray-500 mt-0.5">Distribution-free hypothesis tests</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Test type selector */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Test Type</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TEST_INFO) as TestType[]).map((t) => (
                <label
                  key={t}
                  className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                    testType === t
                      ? 'border-psychr-midblue bg-psychr-accent'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="test-type"
                    value={t}
                    checked={testType === t}
                    onChange={() => setTestType(t)}
                    className="mt-0.5 accent-psychr-midblue"
                  />
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{TEST_INFO[t].name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{TEST_INFO[t].r_func}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-psychr-accent border border-psychr-lightblue rounded-lg px-3 py-2 text-xs text-gray-600">
            {info.description}
          </div>

          {/* Variable inputs */}
          {(testType === 'mann-whitney' || testType === 'kruskal-wallis') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dependent Variable</label>
                <select
                  value={var1}
                  onChange={(e) => setVar1(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                >
                  <option value="">Select numeric variable...</option>
                  {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Grouping Variable
                  {testType === 'mann-whitney' && <span className="text-gray-400 font-normal ml-1">(2 groups)</span>}
                </label>
                <select
                  value={groupVar}
                  onChange={(e) => setGroupVar(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                >
                  <option value="">Select grouping variable...</option>
                  {allCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {(testType === 'wilcoxon') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Variable 1 (pre / time 1)</label>
                <select
                  value={var1}
                  onChange={(e) => setVar1(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                >
                  <option value="">Select variable...</option>
                  {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Variable 2 (post / time 2)</label>
                <select
                  value={var2}
                  onChange={(e) => setVar2(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                >
                  <option value="">Select variable...</option>
                  {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {(testType === 'chi-square') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Variable 1 (rows)</label>
                <select
                  value={var1}
                  onChange={(e) => setVar1(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                >
                  <option value="">Select categorical variable...</option>
                  {allCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Variable 2 (columns)</label>
                <select
                  value={var2}
                  onChange={(e) => setVar2(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-psychr-midblue"
                >
                  <option value="">Select categorical variable...</option>
                  {allCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Options */}
          {testType !== 'chi-square' && testType !== 'kruskal-wallis' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alternative hypothesis</label>
              <div className="flex gap-4">
                {(['two.sided', 'less', 'greater'] as const).map((alt) => (
                  <label key={alt} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="alternative"
                      value={alt}
                      checked={alternative === alt}
                      onChange={() => setAlternative(alt)}
                      className="accent-psychr-midblue"
                    />
                    <span className="text-sm text-gray-700 capitalize">{alt.replace('.', '-')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {testType === 'chi-square' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={correctYates}
                onChange={(e) => setCorrectYates(e.target.checked)}
                className="accent-psychr-midblue"
              />
              <span className="text-sm text-gray-700">Yates' continuity correction (for 2×2 tables)</span>
            </label>
          )}

          {!activeDataset && (
            <div className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              No dataset loaded — import a dataset on the Data tab before running this analysis.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-400">
            {testType === 'mann-whitney' && 'Effect size r · median comparison'}
            {testType === 'wilcoxon' && 'Effect size r · paired medians'}
            {testType === 'kruskal-wallis' && 'Effect size η²H · group medians'}
            {testType === 'chi-square' && "Cramér's V effect size · contingency table"}
          </p>
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
