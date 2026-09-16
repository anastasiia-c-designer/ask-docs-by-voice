// Shared types across client and server.

export interface DocumentPage {
  pageNumber: number
  text: string
}

export interface ManualDocument {
  fileName: string
  pages: DocumentPage[]
}

export type AnswerStatus = "answered" | "not_found" | "needs_clarification"

export interface Citation {
  fileName: string
  page: number
  quote: string
}

export interface AnswerResult {
  status: AnswerStatus
  answer: string
  citations: Citation[]
}

export interface QaTurn {
  question: string
  answer: string
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

// Response shape returned by POST /api/ask on success.
export interface AskResponse extends AnswerResult {
  usage: TokenUsage | null
}

export interface AskRequestBody {
  documents: ManualDocument[]
  question: string
  history: QaTurn[]
}
