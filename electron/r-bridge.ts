/**
 * RBridge — Manages R subprocess communication.
 *
 * Every analysis in PsychR goes through this module:
 *   1. Renderer calls window.psychr.r.run(script) via IPC
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
 *
 * JSON EXTRACTION STRATEGY:
 *   The wrapper uses capture.output() to consume all stdout from the
 *   user script, then finds the last JSON object in that captured text.
 *   This prevents R package load messages or stray cat() calls from
 *   corrupting the output and causing a parse failure.
 */

import { spawn } from 'child_process'
import { writeFileSync, unlinkSync, mkdtempSync, existsSync, rmSync } from 'fs'
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
  // Track running processes so we can kill them on app exit
  private activeProcesses = new Set<ReturnType<typeof spawn>>()

  constructor(rPath?: string) {
    this.rPath = rPath || this.detectRPath()
    this.tempDir = mkdtempSync(join(tmpdir(), 'psychr-'))

    // Clean up temp directory when the main process exits
    process.on('exit', () => this.cleanup())
    process.on('SIGTERM', () => { this.cleanup(); process.exit(0) })
    process.on('SIGINT', () => { this.cleanup(); process.exit(0) })
  }

  private cleanup() {
    // Kill any running R processes
    for (const proc of this.activeProcesses) {
      try { proc.kill('SIGKILL') } catch {}
    }
    // Remove temp directory
    try { rmSync(this.tempDir, { recursive: true, force: true }) } catch {}
  }

  private detectRPath(): string {
    if (process.platform === 'win32') {
      const pf = process.env['PROGRAMFILES'] ?? 'C:\\Program Files'
      const versions = [
        '4.5.0', '4.4.3', '4.4.2', '4.4.1', '4.4.0',
        '4.3.3', '4.3.2', '4.3.1', '4.3.0',
        '4.2.3', '4.2.2', '4.2.1', '4.2.0',
      ]
      const winCandidates = versions.map((v) => `${pf}\\R\\R-${v}\\bin\\Rscript.exe`)
      return winCandidates.find(existsSync) ?? 'Rscript'
    }
    // macOS / Linux — check known install locations before falling back to PATH
    const unixCandidates = [
      '/usr/local/bin/Rscript',           // CRAN .pkg on Intel Mac
      '/opt/homebrew/bin/Rscript',        // Homebrew on Apple Silicon
      '/opt/local/bin/Rscript',           // MacPorts
      '/usr/bin/Rscript',                 // Linux system R
      '/usr/local/lib/R/bin/Rscript',
      '/Library/Frameworks/R.framework/Resources/bin/Rscript', // CRAN .pkg fallback
    ]
    return unixCandidates.find(existsSync) ?? 'Rscript'
  }

  /**
   * Run an R script string and return parsed JSON result.
   *
   * The script MUST output a single JSON object to stdout as its final action.
   *
   * Robustness strategy:
   *   - capture.output() collects all stdout so stray cat()/print() calls from
   *     packages don't corrupt the JSON
   *   - We then find the last '{' in the captured text so the correct JSON
   *     object is returned even if something printed before it
   *   - A tryCatch at the outer level ensures R errors always produce valid JSON
   */
  async run(script: string): Promise<RResult> {
    const tempFile = join(this.tempDir, `psychr_${Date.now()}_${Math.random().toString(36).slice(2)}.R`)

    // The wrapper does two things:
    //   1. Captures all stdout from the user script via capture.output()
    //   2. Extracts the last JSON object from that captured text
    // This means stray console output from packages never corrupts the result.
    const wrappedScript = `
suppressPackageStartupMessages({
  if (!requireNamespace("jsonlite", quietly = TRUE)) {
    install.packages("jsonlite", repos = "https://cran.rstudio.com/", quiet = TRUE)
  }
  library(jsonlite)
})

.psychr_captured <- capture.output(
  tryCatch({
    ${script}
  }, error = function(e) {
    cat(jsonlite::toJSON(list(
      success = jsonlite::unbox(FALSE),
      error   = jsonlite::unbox(conditionMessage(e))
    ), auto_unbox = FALSE))
  })
)

# Find the last JSON object in the captured output.
# Using the last '{' handles the case where a package prints something
# before our cat(toJSON(...)) call.
.psychr_text <- paste(.psychr_captured, collapse = "\\n")
.psychr_positions <- gregexpr("\\\\{", .psychr_text, fixed = FALSE)[[1]]
if (length(.psychr_positions) == 0 || .psychr_positions[1] == -1L) {
  cat(jsonlite::toJSON(list(
    success = jsonlite::unbox(FALSE),
    error   = jsonlite::unbox("No JSON output from R script")
  )))
} else {
  .psychr_last <- .psychr_positions[length(.psychr_positions)]
  cat(substring(.psychr_text, .psychr_last))
}
`

    try {
      writeFileSync(tempFile, wrappedScript, 'utf-8')
    } catch (err) {
      return { success: false, error: `Failed to write temp R script: ${err}` }
    }

    const TIMEOUT_MS = 120_000 // 2 minutes

    return new Promise((resolve) => {
      const proc = spawn(this.rPath, ['--vanilla', '--quiet', tempFile], {
        env: { ...process.env, R_NO_READLINE: '1' },
      })
      this.activeProcesses.add(proc)

      let stdout = ''
      let stderr = ''
      let timedOut = false

      const timeout = setTimeout(() => {
        timedOut = true
        proc.kill('SIGKILL')
        this.safeUnlink(tempFile)
        resolve({
          success: false,
          error: `R process timed out after ${TIMEOUT_MS / 1000}s. The analysis may require too much memory or contain an infinite loop.`,
        })
      }, TIMEOUT_MS)

      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

      proc.on('close', (code) => {
        if (timedOut) return
        clearTimeout(timeout)
        this.activeProcesses.delete(proc)
        this.safeUnlink(tempFile)

        // Non-zero exit with no stdout: something went badly wrong before output
        if (code !== 0 && !stdout.trim()) {
          resolve({
            success: false,
            error: `R process exited with code ${code}. ${stderr ? `Stderr: ${stderr.slice(0, 500)}` : ''}`.trim(),
            stderr,
          })
          return
        }

        // Parse the JSON output
        try {
          const json = stdout.trim()
          if (!json || !json.startsWith('{')) {
            resolve({ success: false, error: 'R produced no JSON output', stderr, data: { raw: stdout } })
            return
          }
          const result = JSON.parse(json) as Record<string, unknown>
          resolve({ success: true, ...result, stderr } as RResult)
        } catch (parseErr) {
          resolve({
            success: false,
            error: `Failed to parse R output as JSON: ${parseErr}`,
            stderr,
            data: { raw_output: stdout.slice(0, 1000) },
          })
        }
      })

      proc.on('error', (err) => {
        clearTimeout(timeout)
        this.activeProcesses.delete(proc)
        this.safeUnlink(tempFile)
        resolve({
          success: false,
          error: `Failed to start R: ${err.message}. Is R installed? Download from https://cran.r-project.org`,
        })
      })
    })
  }

  /** Check if R is available on the system. */
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

  /** Get R version string. */
  async getVersion(): Promise<string> {
    const result = await this.run(`
      info <- R.version
      cat(jsonlite::toJSON(list(
        success = TRUE,
        version = paste(info$major, info$minor, sep = "."),
        platform = info$platform
      ), auto_unbox = TRUE))
    `)
    return (result.data?.version as string) || (result as Record<string, unknown>).version as string || 'unknown'
  }

  /** Update the R executable path (e.g., user sets custom path in settings). */
  setRPath(path: string) {
    this.rPath = path
  }

  private safeUnlink(path: string) {
    try { unlinkSync(path) } catch {}
  }
}
