// Citation verification: a claimed quote is only trusted when it appears
// verbatim (after light normalization) on the exact page and file it cites.

import type { AnswerResult, Citation, ManualDocument } from "@/lib/types"

// Collapse whitespace, straighten quotes, unify dashes, lowercase — so that
// cosmetic differences do not cause a real quote to be rejected.
export function normalizeText(input: string): string {
  return input
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // curly single quotes -> '
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // curly double quotes -> "
    .replace(/[\u2012\u2013\u2014\u2015]/g, "-") // en/em/figure dashes -> -
    .replace(/\s+/g, " ") // collapse all whitespace/newlines
    .trim()
    .toLowerCase()
}

function findPageText(
  documents: ManualDocument[],
  fileName: string,
  page: number,
): string | null {
  const doc = documents.find((d) => d.fileName === fileName)
  if (!doc) return null
  const p = doc.pages.find((pg) => pg.pageNumber === page)
  return p ? p.text : null
}

// Reason strings for a single invalid citation, phrased for the retry message.
function citationProblem(
  documents: ManualDocument[],
  citation: Citation,
): string | null {
  const pageText = findPageText(documents, citation.fileName, citation.page)
  if (pageText === null) {
    return `The cited location "${citation.fileName}" page ${citation.page} does not exist in the provided documents.`
  }
  const haystack = normalizeText(pageText)
  const needle = normalizeText(citation.quote)
  if (!needle) {
    return `A citation for "${citation.fileName}" page ${citation.page} had an empty quote.`
  }
  if (!haystack.includes(needle)) {
    return `The quote "${citation.quote}" was not found on page ${citation.page} of "${citation.fileName}". Copy the quote exactly from that page's text.`
  }
  return null
}

export interface VerificationResult {
  valid: boolean
  invalidReasons: string[]
}

export function verifyAnswer(
  result: AnswerResult,
  documents: ManualDocument[],
): VerificationResult {
  // Statuses that legitimately carry no supporting evidence.
  if (result.status === "not_found" || result.status === "needs_clarification") {
    return { valid: true, invalidReasons: [] }
  }

  // An "answered" result with no citations is invalid.
  if (!result.citations.length) {
    return {
      valid: false,
      invalidReasons: ["The answer was stated with no supporting citation from the documents."],
    }
  }

  const invalidReasons: string[] = []
  for (const citation of result.citations) {
    const problem = citationProblem(documents, citation)
    if (problem) invalidReasons.push(problem)
  }

  return { valid: invalidReasons.length === 0, invalidReasons }
}
