import { NextResponse } from "next/server"
import OpenAI from "openai"
import { SYSTEM_PROMPT, getModel } from "@/lib/config"
import type { AskRequestBody, ManualDocument, QaTurn } from "@/lib/types"

// The JSON schema the model must conform to. Kept in sync with AnswerResult in lib/types.ts.
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

function buildDocumentsBlock(documents: ManualDocument[]): string {
  return documents
    .map((doc) => {
      const pages = doc.pages
        .map((p) => `[PAGE ${p.pageNumber}]\n${p.text}`)
        .join("\n\n")
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

export async function POST(request: Request) {
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

  const userContent = [
    buildDocumentsBlock(documents),
    buildHistoryBlock(history ?? []),
    `Question: ${question.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  let completion
  try {
    completion = await client.chat.completions.create({
      model: getModel(),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "manual_answer",
          strict: true,
          schema: ANSWER_SCHEMA,
        },
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error calling the model API."
    return NextResponse.json({ error: `Model API request failed: ${message}` }, { status: 502 })
  }

  const raw = completion.choices[0]?.message?.content
  if (!raw) {
    return NextResponse.json({ error: "The model returned an empty response." }, { status: 502 })
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NextResponse.json(
      { error: "The model returned a response that was not valid JSON." },
      { status: 502 },
    )
  }

  const usage = completion.usage
    ? {
        inputTokens: completion.usage.prompt_tokens ?? 0,
        outputTokens: completion.usage.completion_tokens ?? 0,
      }
    : null

  return NextResponse.json({
    status: parsed.status,
    answer: parsed.answer,
    citations: Array.isArray(parsed.citations) ? parsed.citations : [],
    usage,
  })
}
