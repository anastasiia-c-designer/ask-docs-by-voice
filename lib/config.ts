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
