import { NextResponse } from "next/server"
import OpenAI from "openai"
import { getTtsModel, getTtsVoice, TTS_INSTRUCTIONS } from "@/lib/config"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "The OPENAI_API_KEY environment variable is not set on the server." },
      { status: 500 },
    )
  }

  let body: { text?: string; voice?: string }
  try {
    body = (await request.json()) as { text?: string; voice?: string }
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 })
  }

  const text = body.text?.trim()
  if (!text) {
    return NextResponse.json({ error: "No text to speak." }, { status: 400 })
  }

  const client = new OpenAI({ apiKey })

  try {
    // stream_format: "audio" streams raw audio bytes so playback can begin
    // before the whole file is generated.
    const speech = await client.audio.speech.create({
      model: getTtsModel(),
      voice: body.voice || getTtsVoice(),
      input: text.slice(0, 4096),
      instructions: TTS_INSTRUCTIONS,
      response_format: "mp3",
      stream_format: "audio",
    })

    // Forward the streaming body straight through to the browser.
    return new Response(speech.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error calling the speech API."
    return NextResponse.json({ error: `Speech synthesis failed: ${message}` }, { status: 502 })
  }
}
