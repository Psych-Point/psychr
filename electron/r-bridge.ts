/**
 * RBridge — Manages R subprocess communication.
 *
 * Every analysis in PsychR goes through this module:
 *   1. Renderer calls window.rBridge.run(script) via IPC
 *   2. Main process receives it here, writes script to temp file
 *   3. Spawns `Rscript <tempfile>` and captures stdout
 *   4. R script outputs JSON via jsonlite::toJSON()
 *   5. RBridge parses JSON and returns result to renderer
 *
 * All R scripts must follow this convention:
 *   - Output ONLY valid JSON on stdout (use jsonlite)
 *   - Put the R script snippet in result$r_script
 *   - Put errors in result$error
 *   - Never write to stdout except for the final JSON
 */

import { spawn } from 'child_process'
import { writeFileSync, unlinkSync, mkdtempSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export interface RResult {
  success: boolean
  data?: Record<string, unknown>
  error?: string
  r_script?: string
  stderr?: string
}

export class RBridge {
  private rPath: string
  private tempDir: string

  constructor(rPath?: string) {
    // Auto-detect R path; common locations
    this.rPath = rPath || this.detectRPath()
    this.tempDir = mkdtempSync(join(tmpdir(), 'psychr-'))
  }

  private detectRPath(): string {
    if (process.platform === 'win32') {
      const pf = process.env['PROGRAMFILES'] ?? 'C:\\Program Files'
      const versions = ['4.5.0', '4.4.3', '4.4.2', '4.4.1', '4.4.0', '4.3.3', '4.3.2', '4.3.1', '4.3.0', '4.2.3', '4.2.2', '4.2.1', '4.2.0']
      const winCandidates = versions.map((v) => `${pf}\\R\\R-${v}\\bin\\Rscript.exe`)
      return winCandidates.find(existsSync) ?? 'Rscript'
    }
    // macOS / Linux — check known install locations before falling back to PATH
    const unixCandidates = [
      '/usr/local/bin/Rscript',          // CRAN .pkg on Intel Mac
      '/opt/homebrew/bin/Rscript',       // Homebrew on Apple Silicon
      '/opt/local/bin/Rscript',          // MacPorts
      '/usr/bin/Rscript',                // Linux system R
      '/usr/local/lib/R/bin/Rscript',
      '/Library/Frameworks/R.framework/Resources/bin/Rscript', // CRAN .pkg fallback
    ]
    return unixCandidates.find(existsSync) ?? 'Rscript'
  }

  /**
   * Run an R script string and return parsed JSON result.
   * The script MUST output a single JSON object to stdout.
   */
  async run(script: string): Promise<RResult> {
    const tempFile = join(this.tempDir, `psychr_${Date.now()}.R`)

    // Wrap the script to ensure safe JSON output
    const wrappedScript = `
suppressPackageStartupMessages({
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    install.packages("jsonlite", repos = "https://cran.rstudio.com/", quiet = TRUE)
  }
  library(jsonlite)
})

tryCatch({
  ${script}
}, error = function(e) {
  cat(jsonlite::toJSON(list(
    success = FALSE,
    error = conditionMessage(e)
  ), auto_unbox = TRUE))
})
`

    try {
      writeFileSync(tempFile, wrappedScript)
    } catch (err) {
      return { success: false, error: `Failed to write temp R script: ${err}` }
    }

    const TIMEOUT_MS = 120_000 // 2 minutes

    return new Promise((resolve) => {
      const proc = spawn(this.rPath, ['--vanilla', '--quiet', tempFile], {
        env: { ...process.env, R_NO_READLINE: '1' },
      })

      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timeout = setTimeout(() => {
        timedOut = true
        proc.kill('SIGKILL')
        try { unlinkSync(tempFile) } catch {}
        resolve({
          success: false,
          error: `R process timed out after ${TIMEOUT_MS / 1000}s. The analysis may need too much memory or have an infinite loop.`,
        })
      }, TIMEOUT_MS)

      proc.stdout.on('data', (chunk) => { stdout += chunk.toString() })
      proc.stderr.on('data', (chunk) => { stderr += chunk.toString() })

      proc.on('close', (code) => {
        if (timedOut) return
        clearTimeout(timeout)
        // Cleanup temp file
        try { unlinkSync(tempFile) } catch {}

        if (code !== 0 && !stdout.trim()) {
          resolve({
            success: false,
            error: `R process exited with code ${code}`,
            stderr,
          })
          return
        }

        try {
          // Extract last JSON object from stdout (R may print warnings before it)
          const jsonMatch = stdout.match(/\{[\s\S]*\}/)
          if (!jsonMatch) {
            resolve({ success: false, error: 'No JSON output from R', stderr })
            return
          }
          const result = JSON.parse(jsonMatch[0])
          resolve({ success: true, ...result, stderr })
        } catch (parseErr) {
          resolve({
            success: false,
            error: `Failed to parse R output: ${parseErr}`,
            stderr,
            data: { raw_output: stdout },
          })
        }
      })

      proc.on('error', (err) => {
        resolve({
          success: false,
          error: `Failed to start R: ${err.message}. Is R installed? Download from https://cran.r-project.org`,
        })
      })
    })
  }

  /**
   * Check if R is available on the system.
   */
  async checkR(): Promise<{ available: boolean; path?: string; error?: string }> {
    return new Promise((resolve) => {
      const proc = spawn(this.rPath, ['--version'])
      proc.on('close', (code) => {
        resolve({ available: code === 0, path: this.rPath })
      })
      proc.on('error', () => {
        resolve({ available: false, error: 'R not found. Please install R from https://cran.r-project.org' })
      })
    })
  }

  /**
   * Get R version string.
   */
  async getVersion(): Promise<string> {
    const result = await this.run(`
      info <- R.version
      cat(jsonlite::toJSON(list(
        success = TRUE,
        version = paste(info$major, info$minor, sep = "."),
        platform = info$platform
      ), auto_unbox = TRUE))
    `)
    return result.data?.version as string || 'unknown'
  }

  /**
   * Update the R executable path (e.g., user sets custom path in settings).
   */
  setRPath(path: string) {
    this.rPath = path
  }
}
