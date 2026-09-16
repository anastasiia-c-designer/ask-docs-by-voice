// Finds the text immediately preceding a cited quote on its page, so the UI can
// show which section/model the quote belongs to. Matching is whitespace- and
// punctuation-insensitive to line up with how quotes are verified.

import type { ManualDocument } from "./types"

function straighten(input: string): string {
  return input
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2012\u2013\u2014\u2015]/g, "-")
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Up to `maxChars` of the page text that comes right before `quote`, trimmed.
// Returns "" when the page or quote can't be located.
export function citationContextBefore(
  documents: ManualDocument[],
  fileName: string,
  page: number,
  quote: string,
  maxChars = 120,
): string {
  const doc = documents.find((d) => d.fileName === fileName)
  const pageText = doc?.pages.find((p) => p.pageNumber === page)?.text
  if (!pageText) return ""

  const haystack = straighten(pageText)
  const normalizedQuote = straighten(quote).trim().replace(/\s+/g, " ")
  if (!normalizedQuote) return ""

  // Build a pattern that tolerates any run of whitespace between words.
  const pattern = normalizedQuote.split(" ").map(escapeRegExp).join("\\s+")

  let match: RegExpExecArray | null = null
  try {
    match = new RegExp(pattern, "i").exec(haystack)
  } catch {
    return ""
  }
  if (!match) return ""

  const before = haystack.slice(0, match.index).replace(/\s+$/, "")
  if (!before) return ""

  const truncated = before.length > maxChars
  const slice = before.slice(-maxChars).replace(/^\s+/, "")
  return (truncated ? "…" : "") + slice
}
