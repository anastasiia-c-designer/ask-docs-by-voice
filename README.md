# Pagewise - ask your manual out loud

A voice-first way to ask questions about equipment manuals. You upload up to two text-based PDFs, ask a question out loud, and get a short spoken answer plus a visible quote with the file name and page it came from. If the documents do not contain the answer, the app says so instead of guessing.

**Live demo:** https://ask-your-manual-app.vercel.app
**Video walkthrough:** https://drive.google.com/file/d/1Us5LojwRJymrsO0ZUSInZ4OoQSSv9GY6/view?usp=sharing

Open the demo and press **Try sample manuals** to start in about ten seconds with two bundled fictional manuals.

## Why it is built this way

Every answer must be checkable. The model is asked to return the answer together with a verbatim quote, and the server then checks in code that the quote really exists on the page it cites. If the check fails twice, the app refuses to state the answer rather than showing an unsupported one. A plausible answer without support is treated as a failure, not a success.

## How it works

1. **Ingestion (browser).** Text is extracted from each PDF page by page with `pdfjs-dist`. Nothing is uploaded to a server for this, and it costs nothing in API terms.
2. **Question (voice or text).** Audio is recorded in the browser, sent to `/api/transcribe`, and transcribed. Distinctive terms from the loaded documents (model codes such as "AP-400") are passed as a transcription hint.
3. **Answer.** `/api/ask` sends the system rules, the documents (marked per file and per page), the recent conversation turns and the question to the model, which returns structured JSON: status, answer, citations.
4. **Verification.** `lib/verify.ts` normalises whitespace, quotes and dashes, then checks that each quote appears on the cited page of the cited file. On failure the model gets one retry with the failed quotes named; if it fails again, the status becomes `unverified`.
5. **Speech.** `/api/speak` streams the spoken answer, so playback starts before the whole file is generated. Only the short answer is spoken; the quote stays on screen.

Answer statuses: **From the manual** (verified), **Not in the manual**, **Need one detail** (ambiguous question), **Couldn't verify**.

## Scope

- Up to 2 text-based PDFs, 10 pages in total, English
- No OCR: scanned PDFs are detected and rejected with an explanation
- No accounts, no payments, no database. Chats and documents live in the open tab only and are never stored
- Documents can be replaced inside a chat; the conversation is then cleared, and the app explains why

## Running it locally

Requirements: Node.js 20+, pnpm, and an OpenAI API key with billing enabled (the transcription model is not available on the free tier).

```bash
git clone https://github.com/anastasiia-c-designer/ask-docs-by-voice.git
cd ask-docs-by-voice
pnpm install

# create .env.local with:
# OPENAI_API_KEY=sk-...

pnpm dev
```

Then open http://localhost:3000. Microphone access needs `localhost` or HTTPS.

Optional environment variables: `OPENAI_MODEL` (defaults to `gpt-5.6-luna`).

## Where things live

| Path | What it holds |
|---|---|
| `lib/config.ts` | System prompt, model names, reasoning effort, cache mode, prices |
| `lib/verify.ts` | Citation verification and normalisation |
| `lib/pdf.ts` | Page-by-page text extraction |
| `app/api/ask` | Model call, structured output, retry, cost and timing |
| `app/api/transcribe`, `app/api/speak` | Speech in and speech out |
| `test-docs/`, `test-docs-edge/` | Sample manuals and upload-limit test files |
| `TEST_SET.md` | Test questions with expected answers, recorded before testing |
| `results/` | Measured runs: full run, real manufacturer manual, spot check |

## Measured results

From `results/`, on the deployed app:

| | Result |
|---|---|
| Factual accuracy, sample manuals | 11/11 |
| Citation accuracy, sample manuals | 11/11 verified, no retries |
| Real manufacturer manual (TP-Link, 10 pages) | 9/10 fully correct, 1 partial; 10/10 citations verified |
| Upload limit tests | 3/3 rejected correctly |
| Question to first audible answer | median 3.8 s on the final version |
| Cost per voice question | about $0.0017–0.0020 |
| Document ingestion | 2.1 s first load, 0.1 s afterwards, $0 in API cost |

Details, per-question logs and pricing assumptions are in `DELIVERY_NOTES.md`.

## Known limits

- Verification confirms that a quote exists on the cited page, not that it describes the thing asked about. A quote can be genuine and still belong to the other model on the same page; the context line above each quote and "Show full page" exist so the reader can check.
- Page numbers refer to pages of the uploaded file, which differ from printed page numbers when a manual is an extract.
- Answers are kept to one or two sentences so they work when spoken. This suits facts, and truncates multi-step procedures.
- Browser support verified in Chrome, Opera, Safari 17.5 on macOS and Safari on iOS 26.6.1. Firefox and Android were not tested.
