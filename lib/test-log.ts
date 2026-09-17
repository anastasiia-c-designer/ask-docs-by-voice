// Markdown test-log formatting. The column set and row format are deliberately
// unchanged from the original debug panel so previously copied logs stay
// comparable — do not reorder or rename columns here.

import type { Citation, TestLogEntry } from "./types"

const HEADER_CELLS = [
  "Question",
  "Input",
  "Status",
  "Answer",
  "Citations",
  "Verified",
  "Attempts",
  "Total ms",
  "OpenAI ms",
  "Input tokens",
  "Cached tokens",
  "Cache write tokens",
  "Output tokens",
  "Model cost USD",
  "Recording s",
  "Transcription ms",
  "Ask ms",
  "TTS ms",
  "Q-to-audio ms",
  "Transcription USD",
  "TTS USD (est)",
  "Total cost USD",
]

// Escape a value for use inside a Markdown table cell.
function cell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim()
}

function formatCitations(citations: Citation[]): string {
  if (!citations.length) return "—"
  return citations.map((c) => `${c.fileName} p.${c.page}: ${c.quote}`).join(" ; ")
}

function formatCost(cost: number | null | undefined): string {
  return cost === null || cost === undefined ? "" : cost.toFixed(5)
}

// Number for a cell, or empty string when not applicable (e.g. voice columns
// for a typed question).
function num(value: number | null | undefined, digits = 0): string {
  return value === null || value === undefined ? "" : value.toFixed(digits)
}

export function rowFor(entry: TestLogEntry): string {
  return `| ${[
    cell(entry.question),
    entry.inputMode,
    entry.status,
    cell(entry.answer),
    cell(formatCitations(entry.citations)),
    entry.verified ? "yes" : "no",
    String(entry.attempts),
    entry.totalMs.toFixed(0),
    entry.openAiMs.toFixed(0),
    String(entry.inputTokens),
    String(entry.cachedTokens),
    String(entry.cacheWriteTokens),
    String(entry.outputTokens),
    formatCost(entry.modelCostUsd),
    num(entry.recordingSeconds, 2),
    num(entry.transcriptionMs),
    num(entry.askMs),
    num(entry.ttsMs),
    num(entry.questionToFirstAudioMs),
    formatCost(entry.transcriptionUsd),
    formatCost(entry.ttsUsd),
    formatCost(entry.totalCostUsd),
  ].join(" | ")} |`
}

export function fullLogMarkdown(log: TestLogEntry[]): string {
  const header = `| ${HEADER_CELLS.join(" | ")} |`
  const sep = `| ${HEADER_CELLS.map(() => "---").join(" | ")} |`
  return [header, sep, ...log.map(rowFor)].join("\n")
}
