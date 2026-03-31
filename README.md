# PsychR

> **The first good psychological research software.**
> A cross-platform desktop application that gives psychologists the full power of R through a point-and-click interface — while automatically generating reproducible R syntax for every action taken.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Built with Electron](https://img.shields.io/badge/Electron-30-47848F?logo=electron)](https://www.electronjs.org/)
[![React 18](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![R Required](https://img.shields.io/badge/R-4.0%2B-276DC3?logo=r)](https://www.r-project.org/)

---

## What Is PsychR?

PsychR bridges the gap between **accessibility and reproducibility** in psychological research. It is designed for:

- Researchers who want a point-and-click interface but need reproducible workflows
- Students learning statistics who want to see the R code behind every analysis
- Labs that need a consistent, shareable analysis environment

Every click you make generates valid R syntax — the full session script can be copied, edited, and re-run anywhere R is installed.

---

## Features

### Data Management
- **Import** CSV, Excel (.xlsx), SPSS (.sav), and R (.rds) files
- **Data Grid** — spreadsheet-style view with column type indicators
- **Data Wrangling** — filter, mutate, rename, recode, pivot, sort, and reshape using tidyverse/dplyr operations
- **Live R Console** — bidirectional: point-and-click generates code, or write code to manipulate data

### Statistical Analyses
- **Descriptive Statistics** — M, SD, skew, kurtosis (psych::describe)
- **t-Tests** — independent samples, paired, one-sample with Cohen's d
- **One-Way ANOVA** — with Tukey/Bonferroni post-hoc tests and partial η²
- **Correlation** — Pearson, Spearman, Kendall; pairwise or full matrix
- **Linear Regression** — simple and multiple, with standardized β coefficients and R²

### IRT (Item Response Theory)
- Rasch, 2PL, 3PL, GRM, GPCM models via `mirt` and `TAM`
- Item parameter tables, model fit statistics

### Qualitative Research
- Document management and code library
- Text segment coding with color-coded codes
- Code frequency summaries

### Visualization
- ggplot2-powered chart builder (histogram, density, boxplot, violin, scatter, bar, line)
- Theme selector, regression lines, error bars

### Citations
- DOI lookup via CrossRef API with automatic APA-7 formatting
- Searchable reference library with one-click export

### Quarto Reporting
- Split markdown editor/preview
- Insert analysis results and citations directly into reports

---

## Screenshots

| Data Cleaning | Analyze | IRT |
|---|---|---|
| *(spreadsheet grid with variable panel)* | *(analysis tree + results panel)* | *(model selection + item parameters)* |

---

## Installation

### Prerequisites

1. **R 4.0+** — [Download from CRAN](https://cran.r-project.org/)
2. **Node.js 18+** — [Download from nodejs.org](https://nodejs.org/)
3. **Required R packages** — install once in R:

```r
install.packages(c(
  "jsonlite",   # required — JSON I/O
  "psych",      # descriptive statistics
  "car",        # ANOVA, Levene test
  "mirt",       # IRT models
  "TAM",        # Rasch models
  "lavaan",     # CFA/SEM
  "ggplot2",    # visualization
  "dplyr",      # data wrangling
  "tidyr",      # reshaping
  "haven",      # SPSS import
  "readxl",     # Excel import
  "readr",      # CSV import
  "base64enc"   # plot encoding
))
```

### Development Setup

```bash
# Clone the repository
git clone https://github.com/Matt19-book/psychr.git
cd psychr

# Install Node dependencies
npm install

# Start the app (Electron + Vite hot-reload)
npm run dev
```

### Build Installer

```bash
# macOS (.dmg)
npm run dist

# Windows (.exe) — run on Windows or with cross-compilation
npm run dist
```

---

## Architecture

PsychR follows a strict **R-as-engine** architecture:

```
User clicks UI
    ↓
React dialog builds R script
    ↓
Electron main process writes script to temp file, spawns Rscript
    ↓
R outputs: { success, r_script, data } as JSON
    ↓
Result rendered in UI + R code appended to session script
```

Every R script outputs **only JSON** (via `jsonlite::toJSON`), making results fully parseable and reproducible.

### Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 30 |
| UI framework | React 18 + TypeScript |
| Styling | Tailwind CSS |
| State management | Zustand 4 |
| Code editor | Monaco Editor |
| Data grid | AG Grid |
| R integration | Child process (`Rscript`) |
| CSV parsing | PapaParse |
| Excel parsing | SheetJS |

---

## Project Structure

```
psychr/
├── electron/
│   ├── main.ts          # IPC handlers
│   ├── preload.ts       # Context bridge (security boundary)
│   └── r-bridge.ts      # R subprocess manager
├── src/
│   ├── store/index.ts   # Zustand global state
│   ├── hooks/
│   │   └── useRBridge.ts  # React hook for R execution
│   ├── tabs/
│   │   ├── DataCleaning/  # Import, grid, wrangling
│   │   ├── Analyze/       # Statistical analyses + dialogs
│   │   ├── IRT/           # Item response theory
│   │   ├── Qualitative/   # Coding workspace
│   │   ├── Visualization/ # ggplot2 builder
│   │   ├── Citations/     # APA-7 reference manager
│   │   └── Markdown/      # Quarto editor
│   └── components/
│       ├── layout/        # WorkspaceLayout, TabBar, StatusBar
│       └── shared/        # RConsole, ScriptPanel
└── r-scripts/             # R script templates
```

---

## Reproducibility

PsychR's core promise: **every action generates valid R code**. The session script panel accumulates all R syntax run during a session. At any point you can:

- Copy the full session script
- Run it in any R environment to reproduce all results
- Share it as a methods supplement in a paper

---

## Roadmap

- [ ] AG Grid integration for large-dataset performance
- [ ] Quarto rendering to PDF/HTML/DOCX
- [ ] Factor analysis (EFA, CFA, SEM via lavaan)
- [ ] Reliability analysis (Cronbach's α, McDonald's ω, ICC)
- [ ] Power analysis (pwr package)
- [ ] Mixed models (lme4)
- [ ] DuckDB backend for datasets > 1GB
- [ ] Plot export (PNG, SVG, PDF)
- [ ] Multi-dataset support with merge/join operations

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Citation

If you use PsychR in your research, please cite:

```
PsychR (v0.1.0). Open-source psychological research software.
https://github.com/Matt19-book/psychr
```
