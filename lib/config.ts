// Central place to tune the model, reasoning effort, pricing, and the system prompt.
// Keep these together so behavior is easy to change without touching route logic.
// This file is safe to import from both server and client (no server-only APIs).

export const DEFAULT_MODEL = "gpt-5.6-luna"

export function getModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL
}

// Supported reasoning-effort values for the current model. Only send one of
// these — the API rejects anything else (e.g. "minimal" is not supported here).
// "none" keeps latency and cost down; bump to "low" if answer quality drops.
// Set to an empty string to omit the parameter entirely (for models that
// do not support a reasoning effort setting).
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh" | ""

const SUPPORTED_REASONING_EFFORTS: ReasoningEffort[] = ["none", "low", "medium", "high", "xhigh", ""]

function resolveReasoningEffort(): ReasoningEffort {
  const fromEnv = process.env.OPENAI_REASONING_EFFORT as ReasoningEffort | undefined
  if (fromEnv !== undefined && SUPPORTED_REASONING_EFFORTS.includes(fromEnv)) {
    return fromEnv
  }
  return "none"
}

export const REASONING_EFFORT: ReasoningEffort = resolveReasoningEffort()

// Prices in USD per 1,000,000 tokens.
// OpenAI pricing page, checked 2026-09-16, Standard tier, short context.
// For GPT-5.6 models, cache writes are billed at 1.25x the input price.
export interface ModelPricing {
  input: number
  cachedInput: number
  cacheWrite: number
  output: number
}

export const PRICING: Record<string, ModelPricing> = {
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, cacheWrite: 0.25, output: 1.2 },
  "gpt-5.6-terra": { input: 2.0, cachedInput: 0.2, cacheWrite: 2.5, output: 12.0 },
}

export interface CostUsage {
  inputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  outputTokens: number
}

// Returns cost in USD, or null when the active model has no price entry.
// input_tokens reported by the API is the full input count and already
// includes cached and cache-write tokens, so uncached input is the remainder.
export function computeCostUsd(model: string, usage: CostUsage): number | null {
  const pricing = PRICING[model]
  if (!pricing) return null
  const uncachedInput = Math.max(
    0,
    usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens,
  )
  const perMillion =
    uncachedInput * pricing.input +
    usage.cacheWriteTokens * pricing.cacheWrite +
    usage.cachedInputTokens * pricing.cachedInput +
    usage.outputTokens * pricing.output
  return perMillion / 1_000_000
}

// Prompt caching mode.
// "breakpoint" (default) places an explicit prompt-cache breakpoint at the end
// of the stable documents block so that prefix is cached once and read back on
// every later question about the same documents.
// "off" disables prompt caching entirely (no cache key, no breakpoint) so no
// cache writes are billed. Configurable via OPENAI_CACHE_MODE.
export type CacheMode = "breakpoint" | "off"
export const CACHE_MODE: CacheMode = process.env.OPENAI_CACHE_MODE === "off" ? "off" : "breakpoint"

// Speech-to-text (transcription) model.
export const DEFAULT_TRANSCRIBE_MODEL = "gpt-transcribe"
export function getTranscribeModel(): string {
  return process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL
}

// Text-to-speech model, voice, and speaking style.
export const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts"
export const DEFAULT_TTS_VOICE = "alloy"
export const TTS_INSTRUCTIONS = "Speak calmly and clearly, like a helpful support agent."
export function getTtsModel(): string {
  return process.env.OPENAI_TTS_MODEL || DEFAULT_TTS_MODEL
}
export function getTtsVoice(): string {
  return process.env.OPENAI_TTS_VOICE || DEFAULT_TTS_VOICE
}

// Audio pricing in USD per minute of audio.
// OpenAI pricing, checked 2026-09-16.
// Transcription is billed per minute of input (recorded) audio.
// TTS is estimated per minute of generated audio.
export const TRANSCRIBE_PRICING_PER_MIN: Record<string, number> = {
  "gpt-transcribe": 0.0045,
  "gpt-4o-mini-transcribe": 0.003,
}
export const TTS_PRICING_PER_MIN: Record<string, number> = {
  "gpt-4o-mini-tts": 0.015, // estimated per generated audio minute
}

export function computeTranscriptionCostUsd(model: string, seconds: number): number | null {
  const perMin = TRANSCRIBE_PRICING_PER_MIN[model]
  if (perMin === undefined) return null
  return (seconds / 60) * perMin
}

export function computeTtsCostUsd(model: string, seconds: number): number | null {
  const perMin = TTS_PRICING_PER_MIN[model]
  if (perMin === undefined) return null
  return (seconds / 60) * perMin
}

// Distinctive terms to bias transcription toward: tokens that contain BOTH a
// letter and a digit (e.g. model codes like "AP-400" or "R2D2"). Fully generic
// and extracted automatically from whatever documents were uploaded — no
// product-specific vocabulary.
export function extractHintTerms(
  documents: { pages: { text: string }[] }[],
  max = 30,
): string[] {
  const seen = new Set<string>()
  const terms: string[] = []
  const tokenRe = /[A-Za-z0-9][A-Za-z0-9/.-]*/g
  for (const doc of documents) {
    for (const page of doc.pages) {
      const matches = page.text.match(tokenRe)
      if (!matches) continue
      for (const raw of matches) {
        const token = raw.replace(/[./-]+$/, "") // drop trailing separators
        if (!/[A-Za-z]/.test(token) || !/[0-9]/.test(token)) continue
        const key = token.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        terms.push(token)
        if (terms.length >= max) return terms
      }
    }
  }
  return terms
}

export const SYSTEM_PROMPT = `You are "Ask your manual", an assistant that answers questions about equipment strictly from a set of uploaded manuals.

You are given one or more documents. Each document is introduced with a line "=== FILE: {fileName} ===". Within a file, each page's text is introduced with "[PAGE {n}]".

Follow these rules exactly:

1. Answer ONLY from the provided documents. Never use outside knowledge, assumptions, or general expertise. If it is not written in the documents, you do not know it.

2. Every factual claim in your answer must be supported by at least one citation. Each citation's "quote" must be copied VERBATIM from the page text — one or two sentences, exactly as written, with no paraphrasing, summarizing, or editing. The "page" number must be the [PAGE n] the quote came from, and "fileName" must match the file it came from.

3. If the documents do not contain the answer, set "status" to "not_found". The "answer" must explicitly say the documents do not cover this, and "citations" must be an empty array.

4. If the question is ambiguous — for example it does not specify which model, the answer differs by model, and the conversation history does not resolve it — set "status" to "needs_clarification". The "answer" must be a single short clarifying question, and "citations" must be an empty array.

5. Use the conversation history to resolve follow-up questions such as "and what about the other model?" or "how often should I do that?".

6. If the documents contain related information but do not actually support the conclusion the user is asking about, state what the documents DO say and explicitly say they do not cover the rest. Never infer beyond the text.

7. For comparisons between two or more items, cite the relevant values for each item being compared.

8. If the user corrects themselves mid-question (for example "the AP-200... sorry, I mean the AP-400"), answer the corrected version only.

Keep the "answer" short and in plain language, one or two sentences, phrased so it is suitable to be read aloud. Do not include citations, page numbers, or quotes inside the "answer" field itself — those belong only in the "citations" array.`
