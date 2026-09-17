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
  cacheWriteInputTokens: number
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

export type InputMode = "voice" | "text"

// A single question/answer in the current session, for on-screen history.
// The transcript/question shows immediately; `pending` is true while the answer
// is still being fetched (the card shows a skeleton). Per-turn debug data lives
// on the turn so each card can show its own collapsed Details.
export interface ConversationTurn {
  id: string
  question: string
  inputMode: InputMode
  pending: boolean
  result: AnswerResult | null
  error: string | null
  model: string | null
  reasoningEffort: string | null
  verificationMs: number | null
  failedAttempt: FailedAttempt | null
  metrics: TestLogEntry | null
}

// One recorded answer, holding everything the test-log rows need. Voice fields
// are null for typed questions.
export interface TestLogEntry {
  id: string
  question: string
  inputMode: InputMode
  status: AnswerStatus
  answer: string
  citations: Citation[]
  verified: boolean
  attempts: number
  totalMs: number
  openAiMs: number
  inputTokens: number
  cachedTokens: number
  cacheWriteTokens: number
  outputTokens: number
  modelCostUsd: number | null
  // Voice-only measurements (null for typed questions).
  recordingSeconds: number | null
  transcriptionMs: number | null
  askMs: number | null
  ttsMs: number | null
  questionToFirstAudioMs: number | null
  ttsSeconds: number | null
  transcriptionUsd: number | null
  ttsUsd: number | null
  totalCostUsd: number | null
}

// Response shape returned by POST /api/transcribe.
export interface TranscribeResponse {
  transcript: string
  model: string
}

export interface AskRequestBody {
  documents: ManualDocument[]
  question: string
  history: QaTurn[]
}
