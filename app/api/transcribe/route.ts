import { NextResponse } from "next/server"
import OpenAI, { toFile } from "openai"
import { getTranscribeModel } from "@/lib/config"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "The OPENAI_API_KEY environment variable is not set on the server." },
      { status: 500 },
    )
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 })
  }

  const audio = form.get("audio")
  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "No audio file was provided." }, { status: 400 })
  }

  const hintValue = form.get("hint")
  const hint = typeof hintValue === "string" ? hintValue.trim() : ""

  const client = new OpenAI({ apiKey })
  const model = getTranscribeModel()

  try {
    // Give the SDK an extension-bearing filename and content type so the audio
    // format can be identified (recommended by the API).
    const file = await toFile(audio, audio.name || "recording.webm", {
      type: audio.type || "audio/webm",
    })

    const result = await client.audio.transcriptions.create({
      file,
      model,
      response_format: "json",
      // A short prompt of distinctive terms nudges the model toward correct
      // spellings of things like model codes. Omitted when we have none.
      prompt: hint || undefined,
    })

    return NextResponse.json({ transcript: (result.text ?? "").trim(), model })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error calling the transcription API."
    return NextResponse.json({ error: `Transcription failed: ${message}` }, { status: 502 })
  }
}
