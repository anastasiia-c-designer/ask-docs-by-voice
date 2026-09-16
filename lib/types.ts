// Shared types across client and server.

export interface DocumentPage {
  pageNumber: number
  text: string
}

export interface ManualDocument {
  fileName: string
  pages: DocumentPage[]
}

export type AnswerStatus = "answered" | "not_found" | "needs_clarification" | "unverified"

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

// Token counts summed across all model attempts for a single question.
export interface TokenUsage {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningTokens: number
}

// Server-measured timing for a single question.
export interface Timing {
  totalMs: number
  openAiMs: number
  verificationMs: number
  attempts: number
}

// A model attempt that failed verification. Shown only inside the debug panel.
export interface FailedAttempt {
  status: AnswerStatus
  answer: string
  citations: Citation[]
  invalidReasons: string[]
}

// Response shape returned by POST /api/ask on success.
export interface AskResponse extends AnswerResult {
  model: string
  reasoningEffort: string
  usage: TokenUsage | null
  timing: Timing
  failedAttempt: FailedAttempt | null
}

export interface QaTurn {
  question: string
  answer: string
}

export interface AskRequestBody {
  documents: ManualDocument[]
  question: string
  history: QaTurn[]
}
