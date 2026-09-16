import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import OpenAI from "openai"
import { SYSTEM_PROMPT, getModel, REASONING_EFFORT } from "@/lib/config"
import { verifyAnswer } from "@/lib/verify"
import type {
  AnswerResult,
  AskRequestBody,
  Citation,
  FailedAttempt,
  ManualDocument,
  QaTurn,
  TokenUsage,
} from "@/lib/types"

// The JSON schema the model must conform to. Kept in sync with AnswerResult in lib/types.ts.
// "unverified" is a server-only status, so it is intentionally not offered to the model.
const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: {
      type: "string",
      enum: ["answered", "not_found", "needs_clarification"],
    },
    answer: {
      type: "string",
      description: "Short plain-language answer, 1-2 sentences, suitable to be spoken aloud.",
    },
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fileName: { type: "string" },
          page: { type: "integer" },
          quote: { type: "string" },
        },
        required: ["fileName", "page", "quote"],
      },
    },
  },
  required: ["status", "answer", "citations"],
} as const

const UNVERIFIED_ANSWER =
  "I found something that might answer this, but I couldn't verify it against the document, so I won't state it."

// Stable hash of the loaded documents (file names plus page texts) so that
// every question about the same documents shares one prompt_cache_key.
// Nothing here changes between questions, so the cache key stays constant.
function documentsCacheKey(documents: ManualDocument[]): string {
  const hash = createHash("sha256")
  for (const doc of documents) {
    hash.update(`FILE:${doc.fileName}\n`)
    for (const page of doc.pages) {
      hash.update(`PAGE:${page.pageNumber}\n${page.text}\n`)
    }
  }
  return `manual-docs-${hash.digest("hex").slice(0, 32)}`
}

function buildDocumentsBlock(documents: ManualDocument[]): string {
  return documents
    .map((doc) => {
      const pages = doc.pages.map((p) => `[PAGE ${p.pageNumber}]\n${p.text}`).join("\n\n")
      return `=== FILE: ${doc.fileName} ===\n${pages}`
    })
    .join("\n\n")
}

function buildHistoryBlock(history: QaTurn[]): string {
  if (!history.length) return ""
  const turns = history
    .map((t, i) => `Turn ${i + 1}:\nUser: ${t.question}\nAssistant: ${t.answer}`)
    .join("\n\n")
  return `Recent conversation history (for resolving follow-ups):\n${turns}`
}

function parseAnswer(raw: string): AnswerResult {
  const parsed = JSON.parse(raw)
  return {
    status: parsed.status,
    answer: parsed.answer,
    citations: Array.isArray(parsed.citations) ? (parsed.citations as Citation[]) : [],
  }
}

export async function POST(request: Request) {
  const requestStart = performance.now()

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "The OPENAI_API_KEY environment variable is not set on the server." },
      { status: 500 },
    )
  }

  let body: AskRequestBody
  try {
    body = (await request.json()) as AskRequestBody
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const { documents, question, history } = body

  if (!documents?.length) {
    return NextResponse.json({ error: "No documents provided." }, { status: 400 })
  }
  if (!question?.trim()) {
    return NextResponse.json({ error: "No question provided." }, { status: 400 })
  }

  const client = new OpenAI({ apiKey })
  const model = getModel()

  // Prompt ordering for cache friendliness:
  // stable first (system instructions -> documents), changing last (history -> question).
  const documentsBlock = buildDocumentsBlock(documents)
  const historyBlock = buildHistoryBlock(history ?? [])
  const questionBlock = `Question: ${question.trim()}`
  const promptCacheKey = documentsCacheKey(documents)

  // The base conversation. Retry appends a corrective message to this.
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [`Documents:\n${documentsBlock}`, historyBlock, questionBlock]
        .filter(Boolean)
        .join("\n\n"),
    },
  ]

  const usageTotal: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    reasoningTokens: 0,
  }
  let sawUsage = false
  let openAiMs = 0
  let verificationMs = 0
  let attempts = 0

  let lastResult: AnswerResult | null = null
  let lastInvalidReasons: string[] = []

  // Up to two attempts: initial call, then one corrective retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    attempts = attempt + 1

    let completion
    const callStart = performance.now()
    try {
      completion = await client.chat.completions.create({
        model,
        messages,
        prompt_cache_key: promptCacheKey,
        ...(REASONING_EFFORT ? { reasoning_effort: REASONING_EFFORT } : {}),
        response_format: {
          type: "json_schema",
          json_schema: { name: "manual_answer", strict: true, schema: ANSWER_SCHEMA },
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error calling the model API."
      return NextResponse.json({ error: `Model API request failed: ${message}` }, { status: 502 })
    } finally {
      openAiMs += performance.now() - callStart
    }

    const u = completion.usage
    if (u) {
      sawUsage = true
      // Chat Completions reports cache counts under prompt_tokens_details.
      // cache_write_tokens is not in the SDK's type yet, so read it defensively.
      const promptDetails = u.prompt_tokens_details as
        | { cached_tokens?: number; cache_write_tokens?: number }
        | undefined
      usageTotal.inputTokens += u.prompt_tokens ?? 0
      usageTotal.outputTokens += u.completion_tokens ?? 0
      usageTotal.cachedInputTokens += promptDetails?.cached_tokens ?? 0
      usageTotal.cacheWriteInputTokens += promptDetails?.cache_write_tokens ?? 0
      usageTotal.reasoningTokens += u.completion_tokens_details?.reasoning_tokens ?? 0
    }

    const raw = completion.choices[0]?.message?.content
    if (!raw) {
      return NextResponse.json({ error: "The model returned an empty response." }, { status: 502 })
    }

    let result: AnswerResult
    try {
      result = parseAnswer(raw)
    } catch {
      return NextResponse.json(
        { error: "The model returned a response that was not valid JSON." },
        { status: 502 },
      )
    }

    const verifyStart = performance.now()
    const verification = verifyAnswer(result, documents)
    verificationMs += performance.now() - verifyStart

    lastResult = result
    lastInvalidReasons = verification.invalidReasons

    if (verification.valid) {
      return NextResponse.json({
        status: result.status,
        answer: result.answer,
        citations: result.citations,
        model,
        reasoningEffort: REASONING_EFFORT || "none",
        usage: sawUsage ? usageTotal : null,
        timing: {
          totalMs: performance.now() - requestStart,
          openAiMs,
          verificationMs,
          attempts,
        },
        failedAttempt: null,
      })
    }

    // Not valid: if we have a retry left, tell the model exactly what failed.
    if (attempt === 0) {
      messages.push(
        { role: "assistant", content: raw },
        {
          role: "user",
          content: [
            "Some of your citations could not be verified against the documents:",
            ...lastInvalidReasons.map((r) => `- ${r}`),
            "",
            "Each quote must be copied EXACTLY from the text of the page you cite, word for word. If you cannot find exact supporting text on the page, do not claim it — use status \"not_found\" instead. Answer again.",
          ].join("\n"),
        },
      )
    }
  }

  // Both attempts failed verification: return an explicit unverified result.
  const failedAttempt: FailedAttempt | null = lastResult
    ? {
        status: lastResult.status,
        answer: lastResult.answer,
        citations: lastResult.citations,
        invalidReasons: lastInvalidReasons,
      }
    : null

  return NextResponse.json({
    status: "unverified",
    answer: UNVERIFIED_ANSWER,
    citations: [],
    model,
    reasoningEffort: REASONING_EFFORT || "none",
    usage: sawUsage ? usageTotal : null,
    timing: {
      totalMs: performance.now() - requestStart,
      openAiMs,
      verificationMs,
      attempts,
    },
    failedAttempt,
  })
}
