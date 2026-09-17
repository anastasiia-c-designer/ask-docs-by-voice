// Finds the text immediately preceding a cited quote on its page, so the UI can
// show which section/model the quote belongs to. Matching is whitespace- and
// punctuation-insensitive to line up with how quotes are verified.
//
// The displayed context also strips running headers/footers: within each file,
// word sequences that repeat at the start or end of most pages (for example a
// document title, or "Page X of Y") are treated as boilerplate and removed.
// This is display-only and generic — it never touches the raw page text used
// for citation verification.

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

interface Boilerplate {
  regexes: RegExp[]
}

// Cache boilerplate detection per documents array (identity is stable for a
// loaded session) and per file name.
const cache = new WeakMap<ManualDocument[], Map<string, Boilerplate>>()

// Lowercase and collapse digit runs to "#" so page numbers compare as equal
// ("Page 3 of 12" and "Page 4 of 12" share the same template).
function normalizeToken(token: string): string {
  return token.toLowerCase().replace(/\d+/g, "#")
}

// Build a regex from a normalized template token, allowing any digits where the
// original had numbers.
function tokenToPattern(normalized: string): string {
  return escapeRegExp(normalized).replace(/#/g, "\\d+")
}

// Detect a repeated edge (header when fromStart, footer otherwise): the longest
// run of up to 8 words whose normalized form is shared by most pages.
function detectEdge(pageWordLists: string[][], fromStart: boolean): RegExp | null {
  const pageCount = pageWordLists.length
  if (pageCount < 3) return null
  const threshold = Math.ceil(pageCount * 0.6)

  for (let k = 8; k >= 2; k--) {
    const counts = new Map<string, number>()
    for (const words of pageWordLists) {
      if (words.length < k) continue
      const slice = fromStart ? words.slice(0, k) : words.slice(words.length - k)
      const key = slice.map(normalizeToken).join(" ")
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    let bestKey = ""
    let bestCount = 0
    for (const [key, count] of counts) {
      if (count > bestCount) {
        bestCount = count
        bestKey = key
      }
    }

    if (bestCount >= threshold && bestKey.replace(/[#\s]/g, "").length >= 3) {
      const pattern = bestKey.split(" ").map(tokenToPattern).join("\\s+")
      const anchored = fromStart ? `^\\s*${pattern}` : `${pattern}\\s*$`
      try {
        return new RegExp(anchored, "i")
      } catch {
        return null
      }
    }
  }
  return null
}

function boilerplateFor(documents: ManualDocument[], fileName: string): Boilerplate {
  let byFile = cache.get(documents)
  if (!byFile) {
    byFile = new Map()
    cache.set(documents, byFile)
  }
  const existing = byFile.get(fileName)
  if (existing) return existing

  const doc = documents.find((d) => d.fileName === fileName)
  const regexes: RegExp[] = []

  if (doc && doc.pages.length >= 3) {
    const wordLists = doc.pages.map((p) => straighten(p.text).trim().split(/\s+/).filter(Boolean))
    const header = detectEdge(wordLists, true)
    const footer = detectEdge(wordLists, false)
    if (header) regexes.push(header)
    if (footer) regexes.push(footer)
  }

  // Generic page-number footer/header, always stripped.
  regexes.push(/\bpage\s+\d+(?:\s+of\s+\d+)?\b/gi)

  const result: Boilerplate = { regexes }
  byFile.set(fileName, result)
  return result
}

function stripBoilerplate(text: string, boilerplate: Boilerplate): string {
  let out = text
  for (const re of boilerplate.regexes) {
    out = out.replace(re, " ")
  }
  return out.replace(/\s+/g, " ").trim()
}

// Up to `maxChars` of the page text that comes right before `quote`, trimmed and
// with running headers/footers removed. Returns "" when the page or quote can't
// be located.
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

  const rawBefore = haystack.slice(0, match.index)
  const before = stripBoilerplate(rawBefore, boilerplateFor(documents, fileName)).replace(/\s+$/, "")
  if (!before) return ""

  const truncated = before.length > maxChars
  const slice = before.slice(-maxChars).replace(/^\s+/, "")
  return (truncated ? "…" : "") + slice
}

// The full text of a cited page with running headers/footers stripped (same
// display logic as the context above), plus the character range of the cited
// quote within that text so the UI can highlight and scroll to it. `matchStart`
// is -1 when the quote can't be located. Returns null when the page is missing.
export interface PageHighlight {
  text: string
  matchStart: number
  matchEnd: number
}

export function citationPageHighlight(
  documents: ManualDocument[],
  fileName: string,
  page: number,
  quote: string,
): PageHighlight | null {
  const doc = documents.find((d) => d.fileName === fileName)
  const pageText = doc?.pages.find((p) => p.pageNumber === page)?.text
  if (!pageText) return null

  const straightened = straighten(pageText)
  const text = stripBoilerplate(straightened, boilerplateFor(documents, fileName))

  const normalizedQuote = straighten(quote).trim().replace(/\s+/g, " ")
  if (!normalizedQuote) return { text, matchStart: -1, matchEnd: -1 }

  const pattern = normalizedQuote.split(" ").map(escapeRegExp).join("\\s+")
  let match: RegExpExecArray | null = null
  try {
    match = new RegExp(pattern, "i").exec(text)
  } catch {
    match = null
  }
  if (!match) return { text, matchStart: -1, matchEnd: -1 }

  return { text, matchStart: match.index, matchEnd: match.index + match[0].length }
}
