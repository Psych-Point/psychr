/**
 * Non-Parametric Tests Dialog
 *
 * Mann-Whitney U, Wilcoxon Signed-Rank, Kruskal-Wallis, Chi-Square.
 * Uses base R: wilcox.test(), kruskal.test(), chisq.test().
 */

import { useMemo, useState } from 'react'
import { usePsychrStore } from '../../../store'
import { DialogShell, DialogFooter, LabeledSelect, NoDatasetWarning } from '../../../components/shared/DialogShell'

interface Props {
  onClose: () => void
  onRun: (script: string, label?: string) => Promise<Record<string, unknown> | null>
  initialTest?: TestType
}

type TestType = 'mann-whitney' | 'wilcoxon' | 'kruskal-wallis' | 'chi-square'

const TEST_INFO: Record<TestType, { name: string; description: string; r_func: string }> = {
  'mann-whitney':   { name: 'Mann-Whitney U',       description: 'Non-parametric alternative to independent samples t-test.', r_func: 'wilcox.test()' },
  'wilcoxon':       { name: 'Wilcoxon Signed-Rank', description: 'Non-parametric alternative to paired samples t-test.',      r_func: 'wilcox.test(paired = TRUE)' },
  'kruskal-wallis': { name: 'Kruskal-Wallis',        description: 'Non-parametric alternative to one-way ANOVA for 3+ groups.', r_func: 'kruskal.test()' },
  'chi-square':     { name: 'Chi-Square Test',       description: 'Test of independence between two categorical variables.',   r_func: 'chisq.test()' },
}

export function NonParametricDialog({ onClose, onRun, initialTest }: Props) {
  const activeDataset = usePsychrStore((s) => s.activeDataset)
  const addResult = usePsychrStore((s) => s.addResult)

  const numericCols = useMemo(
    () => (activeDataset?.columns ?? []).filter((c) => c.type === 'numeric'),
    [activeDataset?.columns]
  )
  const catCols = useMemo(
    () => (activeDataset?.columns ?? []).filter((c) => c.type === 'factor' || c.type === 'character'),
    [activeDataset?.columns]
  )
  const allCols = activeDataset?.columns ?? []

  const [testType, setTestType]       = useState<TestType>(initialTest ?? 'mann-whitney')
  const [var1, setVar1]               = useState('')
  const [var2, setVar2]               = useState('')
  const [groupVar, setGroupVar]       = useState('')
  const [alternative, setAlternative] = useState<'two.sided' | 'less' | 'greater'>('two.sided')
  const [correctYates, setCorrectYates] = useState(true)
  const [isRunning, setIsRunning]     = useState(false)

  const canRun = useMemo(() => {
    if (!activeDataset) return false
    if (testType === 'mann-whitney' || testType === 'kruskal-wallis') return Boolean(var1 && groupVar)
    if (testType === 'wilcoxon') return Boolean(var1 && var2)
    if (testType === 'chi-square') return Boolean(var1 && var2)
    return false
  }, [activeDataset, testType, var1, var2, groupVar])

  const handleRun = async () => {
    if (!canRun) return
    setIsRunning(true)

    let rScript = ''
    let label = ''

    if (testType === 'mann-whitney') {
      rScript = `
library(jsonlite)

dep <- "${var1}"
grp <- "${groupVar}"
df[[grp]] <- factor(df[[grp]])
groups <- levels(df[[grp]])
if (length(groups) != 2) stop("Mann-Whitney U requires exactly 2 groups.")

g1 <- df[[dep]][df[[grp]] == groups[1]]
g2 <- df[[dep]][df[[grp]] == groups[2]]

result  <- wilcox.test(g1, g2, alternative = "${alternative}", correct = TRUE)
n1      <- sum(!is.na(g1)); n2 <- sum(!is.na(g2))
r_effect <- abs(result$statistic - (n1 * n2 / 2)) / (n1 * n2 / 2)

r_script_text <- paste0(
  "# Mann-Whitney U\\n",
  "wilcox.test(", dep, " ~ ", grp, ", data = df, alternative = '${alternative}')\\n"
)

cat(toJSON(list(
  success  = TRUE,
  r_script = r_script_text,
  data     = list(table = list(list(
    Test       = "Mann-Whitney U",
    W          = round(result$statistic, 3),
    p_value    = ifelse(result$p.value < .001, "< .001", round(result$p.value, 3)),
    Effect_r   = round(r_effect, 3),
    Group1     = groups[1],
    Group1_Mdn = round(median(g1, na.rm = TRUE), 3),
    Group2     = groups[2],
    Group2_Mdn = round(median(g2, na.rm = TRUE), 3),
    N          = n1 + n2
  )))
), auto_unbox = TRUE))
`
      label = `Mann-Whitney U: ${var1} by ${groupVar}`

    } else if (testType === 'wilcoxon') {
      rScript = `
library(jsonlite)

v1 <- "${var1}"
v2 <- "${var2}"

complete_idx <- complete.cases(df[[v1]], df[[v2]])
x1 <- df[[v1]][complete_idx]
x2 <- df[[v2]][complete_idx]

result   <- wilcox.test(x1, x2, paired = TRUE, alternative = "${alternative}", correct = TRUE)
n_pairs  <- sum(!is.na(x1 - x2))
r_effect <- abs(result$statistic - (n_pairs * (n_pairs + 1) / 4)) / (n_pairs * (n_pairs + 1) / 4)

r_script_text <- paste0(
  "# Wilcoxon Signed-Rank\\n",
  "wilcox.test(df$", v1, ", df$", v2, ", paired = TRUE)\\n"
)

cat(toJSON(list(
  success  = TRUE,
  r_script = r_script_text,
  data     = list(table = list(list(
    Test     = "Wilcoxon Signed-Rank",
    V        = round(result$statistic, 3),
    p_value  = ifelse(result$p.value < .001, "< .001", round(result$p.value, 3)),
    Effect_r = round(r_effect, 3),
    Var1_Mdn = round(median(x1, na.rm = TRUE), 3),
    Var2_Mdn = round(median(x2, na.rm = TRUE), 3),
    N_pairs  = n_pairs
  )))
), auto_unbox = TRUE))
`
      label = `Wilcoxon Signed-Rank: ${var1} vs ${var2}`

    } else if (testType === 'kruskal-wallis') {
      rScript = `
library(jsonlite)

dep <- "${var1}"
grp <- "${groupVar}"
df[[grp]] <- factor(df[[grp]])

result <- kruskal.test(df[[dep]] ~ df[[grp]])

# Effect size eta-squared H
k      <- nlevels(df[[grp]])
n      <- sum(!is.na(df[[dep]]))
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
  success  = TRUE,
  r_script = r_script_text,
  data     = list(
    table = list(list(
      Test    = "Kruskal-Wallis",
      H       = round(result$statistic, 3),
      df      = result$parameter,
      p_value = ifelse(result$p.value < .001, "< .001", round(result$p.value, 3)),
      eta2_H  = round(max(0, eta2_H), 3),
      N       = n
    )),
    group_medians = medians_table
  )
), auto_unbox = TRUE))
`
      label = `Kruskal-Wallis: ${var1} by ${groupVar}`

    } else {
      rScript = `
library(jsonlite)

v1 <- "${var1}"
v2 <- "${var2}"

ct     <- table(df[[v1]], df[[v2]])
result <- chisq.test(ct, correct = ${correctYates ? 'TRUE' : 'FALSE'})

# Cramér's V
n_total  <- sum(ct)
min_dim  <- min(nrow(ct), ncol(ct)) - 1
cramers_v <- sqrt(result$statistic / (n_total * min_dim))

r_script_text <- paste0(
  "# Chi-Square Test of Independence\\n",
  "ct <- table(df$", v1, ", df$", v2, ")\\n",
  "chisq.test(ct)\\n",
  "# Cramér's V = ", round(cramers_v, 3), "\\n"
)

cat(toJSON(list(
  success  = TRUE,
  r_script = r_script_text,
  data     = list(table = list(list(
    Test      = "Chi-Square",
    Chi2      = round(result$statistic, 3),
    df        = result$parameter,
    p_value   = ifelse(result$p.value < .001, "< .001", round(result$p.value, 3)),
    Cramers_V = round(cramers_v, 3),
    N         = n_total,
    Rows      = nrow(ct),
    Cols      = ncol(ct)
  )))
), auto_unbox = TRUE))
`
      label = `Chi-Square: ${var1} × ${var2}`
    }

    const result = await onRun(rScript, label)
    setIsRunning(false)

    if (result) {
      addResult({
        id:        `result_${Date.now()}`,
        type:      testType,
        label,
        params:    { testType, var1, var2, groupVar, alternative },
        output:    result as Record<string, unknown>,
        rScript:   (result.r_script as string) || rScript,
        timestamp: new Date(),
      })
      onClose()
    }
  }

  const info = TEST_INFO[testType]

  const hintByType: Record<TestType, string> = {
    'mann-whitney':   'Effect size r · median comparison',
    'wilcoxon':       'Effect size r · paired medians',
    'kruskal-wallis': 'Effect size η²H · group medians',
    'chi-square':     "Cramér's V effect size · contingency table",
  }

  return (
    <DialogShell
      title="Non-Parametric Tests"
      subtitle="Distribution-free hypothesis tests"
      onClose={onClose}
      width="560px"
      footer={
        <DialogFooter
          onClose={onClose}
          onRun={handleRun}
          isRunning={isRunning}
          disabled={!canRun}
          hint={hintByType[testType]}
        />
      }
    >
      <div className="p-5 space-y-5">
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
                  onChange={() => { setTestType(t); setVar1(''); setVar2(''); setGroupVar('') }}
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
            <LabeledSelect label="Dependent Variable" value={var1} onChange={setVar1}>
              {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </LabeledSelect>
            <LabeledSelect
              label={testType === 'mann-whitney' ? 'Grouping Variable (2 groups)' : 'Grouping Variable'}
              value={groupVar}
              onChange={setGroupVar}
            >
              {allCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </LabeledSelect>
          </div>
        )}

        {testType === 'wilcoxon' && (
          <div className="grid grid-cols-2 gap-4">
            <LabeledSelect label="Variable 1 (pre / time 1)" value={var1} onChange={setVar1}>
              {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </LabeledSelect>
            <LabeledSelect label="Variable 2 (post / time 2)" value={var2} onChange={setVar2}>
              {numericCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </LabeledSelect>
          </div>
        )}

        {testType === 'chi-square' && (
          <div className="grid grid-cols-2 gap-4">
            <LabeledSelect label="Variable 1 (rows)" value={var1} onChange={setVar1}>
              {allCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </LabeledSelect>
            <LabeledSelect label="Variable 2 (columns)" value={var2} onChange={setVar2}>
              {allCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </LabeledSelect>
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

        {!activeDataset && <NoDatasetWarning />}
      </div>
    </DialogShell>
  )
}
