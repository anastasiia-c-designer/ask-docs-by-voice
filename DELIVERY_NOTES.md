# Delivery notes

**Pagewise — ask your manual out loud**
Live demo: https://ask-your-manual-app.vercel.app
Repository: [repo URL]
Video (under 3 min): [link]

Time spent: **6 h 10 min**, tracked in Clockify (5 h 48 min tracked, plus about 20 min of reading the brief and planning before tracking started, recorded as an estimate).

---

## 1. What was built

A voice-first assistant for equipment manuals. Upload up to two text-based PDFs (10 pages total), ask out loud, get a short spoken answer and a visible verbatim quote with file and page. The app says explicitly when the documents do not contain the answer, asks for one detail when a question is ambiguous, and handles follow-up questions such as "and what about the other model?".

The core decision: the model's citation is checked in code before the answer is shown. If the quote is not found on the page it cites, the model gets one retry; if that fails too, the app refuses to state the answer. A plausible answer without support is a failure.

---

## 2. Sample inputs, expected and actual results

The full test set with expected answers is in `TEST_SET.md`, committed **before** any testing. Per-question logs with timings, tokens and cost are in `results/`.

### Sample manuals (fictional, created for this task)

Two models with different setup steps, different limits and one explicit exception, plus a warranty addendum as a second document, plus a revised manual with one changed value (AP-400 filter interval 8 → 6 months).

| # | Type | Question | Expected | Actual |
|---|---|---|---|---|
| 1 | Direct fact | What room size is the AP-200 for? | Up to 20 sq m, p. 4 | ✓ |
| 2 | Follow-up | And what about the other model? | AP-400: up to 45 sq m, p. 4 | ✓ |
| 3 | Comparison | Which model needs a new HEPA filter less often? | AP-400, 8 vs 6 months, p. 6 | ✓ both values cited |
| 4 | Exception | Can I run the AP-400 on Turbo all night? | No: stops after 2 h, 30 min pause, p. 5 | ✓ |
| 5 | Absent fact | How much does the AP-400 weigh? | Not in the documents | ✓ no number invented |
| 6 | Self-correction mid-sentence | Noise of the AP-200… sorry, the AP-400, at max speed? | 52 dB, p. 4 | ✓ answered the corrected question |
| 7 | Second document | How long is the warranty? | 2 years, warranty p. 1 | ✓ |
| 8 | Decline to conclude | Will the AP-400 get rid of cigarette smoke smell? | No claim; documents do not cover odours | ✓ |
| 9 | Ambiguity (fresh chat) | How long does setup take? | Asks which model | ✓ |
| 10 | After replacing the manual | How often should I replace the AP-400 HEPA filter? | 6 months (v2) | ✓ |
| 11 | Same comparison after replacement | Which model needs a new HEPA filter less often? | Neither, both 6 months | ✓ answer changed with the document |

**11/11 factual, 11/11 citations verified, no retries.** Questions 3 and 11 are the same question against two versions of the manual and return different answers, which shows the answers come from the uploaded document rather than from prepared text.

### Upload limits (difficult inputs)

| Input | Result |
|---|---|
| Image-only "scanned" PDF | Rejected: names the file, suggests exporting a text-based PDF |
| 11-page PDF | Rejected: "Too many pages: 11. The maximum is 10 across all files." |
| Three files at once | Rejected: "Choose up to 2 PDFs." |

### Real manufacturer manual

10 pages extracted from a public TP-Link router user guide ([link to the manufacturer page]). Not included in the repository, since it is the manufacturer's copyrighted document; the questions and expected answers are in `TEST_SET.md`.

**9/10 fully correct, 1 partial, 10/10 citations verified.** Highlights:

- A value inside a table (LED status "Orange On") was quoted correctly, together with its follow-up ("and what if it's off?").
- The manual names the same button inconsistently ("WPS/Wi-Fi On/Off" on one page, "Reset/WPS" on another). The answer used one name with a correct citation rather than inventing a third.
- "What's the default Wi-Fi password?" did not produce a password: the answer pointed to the label on the bottom of the router, which is what the manual says.
- **The partial:** "How do I connect the router to my modem?" returned steps 1–3 from one page and omitted steps 4–5 from the next. The quote was correct; the answer was incomplete. See §7.

---

## 3. Measurements

Ingestion time and question-to-first-audible-answer are measured separately, in the app itself, and visible under **Details** on every answer.

### Ingestion (document processing)

| | Time | API cost |
|---|---|---|
| First upload in a session | 2.1 s | $0 |
| Later uploads (library already loaded) | 0.09 s | $0 |

Text extraction runs in the browser, so ingestion costs nothing in API terms. The only ingestion-related cost appears on the first question, when the document is written into the provider's prompt cache (see §4).

### Question to first audible answer

Final version, measured in `results/spot-check-final-version.md`:

| Stage | Median |
|---|---|
| Transcription | 1.0 s |
| Model answer (server round trip) | 1.2 s |
| Speech to first audio | 1.3 s |
| **Total, end of speech to first sound** | **3.8 s** |

Earlier runs on the same app measured 4.6 s (16 Sep) and 7.3–7.9 s (17 Sep evening). Two things contributed, and this report does not separate them: provider latency varies with load (all three OpenAI stages slowed down together while document, browser and network were unchanged), and a UI bug fixed late in the day was re-rendering the interface about 60 times a second during recording.

Outliers: two speech generations took 11.4 s and 14.9 s while every other stage was normal. Cause not confirmed; a cold start of the speech endpoint is a candidate. Reported here rather than dropped.

---

## 4. Cost per operation

Measured per question in the app, including retries. Median **$0.0017–0.0020** per voice question, range $0.0014–0.0049.

| Part | Typical share |
|---|---|
| Speech output (TTS) | 55–85% |
| Transcription | 15–25% |
| Model answer | 6–25% |

Speech is the most expensive part and scales with answer length, which is one more reason to keep spoken answers short and leave the detail in the on-screen quote.

### Pricing assumptions

Taken from the OpenAI pricing page on **16 Sep 2026**, Standard tier, short context, per 1M tokens unless stated:

| Item | Price |
|---|---|
| gpt-5.6-luna input | $0.20 |
| gpt-5.6-luna cached input | $0.02 |
| gpt-5.6-luna cache write | $0.25 (1.25× input) |
| gpt-5.6-luna output | $1.20 |
| gpt-transcribe | $0.0045 per audio minute |
| gpt-4o-mini-tts | [verify] ≈ $0.015 per generated audio minute |

Transcription cost is computed from the recorded duration. Speech cost is **estimated** from the duration of the generated audio, because the API does not return usage data for it; it is labelled "est" in the logs. The model cost is exact, from the usage data, summed across attempts.

### Caching

Prompt caching was measured, not assumed. Initially the cache was written on every request and never read, which made each question about 20% **more** expensive. Adding an explicit cache breakpoint after the documents and a stable `prompt_cache_key` fixed it: from the second question about the same documents, the model part of a question dropped from $0.00053 to about $0.00013, and the model call got roughly 0.8 s faster. Cache writes are billed at 1.25× and are included in the cost formula.

### Hosting and other costs, separately

- **Hosting:** Vercel Hobby (free) for this prototype. Free is not the same as zero operating cost: a real deployment would run on a paid plan, and serverless invocations, bandwidth and cold starts are real costs at volume.
- **Development spend (not part of per-operation cost):** about [$X] in v0 credits and [$Y] of OpenAI usage across two days of building and testing.
- No paid intermediaries beyond OpenAI and Vercel.

---

## 5. Tools and models

| Tool | Used for |
|---|---|
| v0 by Vercel | All application code generation, from the prompts I wrote |
| Claude (Opus 5, claude.ai) | Planning, architecture decisions, writing the prompts for v0, generating the sample manual PDFs and the test files, reviewing logs and results, drafting this document |
| Midjourney | Logo concept exploration (the shipped SVG was redrawn by hand from the chosen concept) |
| OpenAI `gpt-5.6-luna` | Answers, structured JSON output, reasoning effort "none" |
| OpenAI `gpt-transcribe` | Speech to text |
| OpenAI `gpt-4o-mini-tts` | Text to speech |

### Reused components vs. my own work

**Reused off the shelf:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/base-ui primitives and lucide-react icons (the v0 default stack), `pdfjs-dist` for PDF text extraction, the official `openai` SDK, Plus Jakarta Sans via `next/font`, Vercel for hosting.

**Mine:** the problem framing and the pipeline design (browser extraction → structured answer → code verification → speech); the system prompt and its rules; the citation verification and normalisation logic; the retry and `unverified` behaviour; the cost and timing instrumentation; the caching fix; the test set, the expected answers and the evaluation method; the entire interface design, brand, logo and copy; and the diagnosis of every bug listed below. All code was written by v0 from my prompts; I did not write the code by hand.

---

## 6. How I checked what the AI produced

Three examples, from smallest to most consequential.

**Citation verification is itself the main check.** Rather than trusting that the model quoted the document, the server searches for the quote on the page it cites, after normalising whitespace, quote marks and dashes. This was worth doing: the sample manual's specifications are laid out so that a heading and a value sit on separate lines, and the model legitimately joined them, so a naive exact match would have rejected correct answers.

**Cross-checking a confident explanation against logs.** When prompt caching reported zero cached tokens, v0 explained that this was expected because the first request only writes the cache. The logs contradicted it: the second and third questions were also zero. Reading the provider documentation showed the minimum cacheable length is 1,024 tokens and, more importantly, that cache **writes** are billed at 1.25× on this model family. Our cost formula had been ignoring writes, so the app had been under-reporting cost. Both the bug and the formula were fixed, and the fix was confirmed by the numbers in the next run.

**Refusing "verified" claims from the tool.** v0 reported that a Safari fix was "verified in the browser". Its sandbox browser is Chromium-based and cannot reproduce a Safari bug at all. Testing on an actual Safari 17.5 and an iPhone showed the bug was still there, and a second, different fix was needed.

---

## 7. What failed

1. **Invalid model parameter.** v0 guessed `reasoning_effort: "minimal"`, which this model does not support. Surfaced immediately because the app shows API errors instead of failing silently. Fixed by using a value from the list the API returned.
2. **Caching made questions more expensive.** Cache written every time, never read: about +20% per question, and the cost panel did not show cache writes at all. Fixed with an explicit cache breakpoint and a stable cache key; verified by measurement.
3. **A correct quote without enough context.** For a noise-level question the quote was "Noise level: 22 dB in Sleep mode, 52 dB at maximum speed", which does not name the model, although the same page lists both. Mitigated by showing the preceding text above each quote and adding "Show full page". The underlying limit remains (see §8).
4. **Safari crashed on load.** The app used the JavaScript `Iterator` global, unsupported in Safari 17.5, so the page failed before anything could be uploaded. Found only by testing on a real Mac, since development happened in Chrome.
5. **PDF reading failed in Safari (macOS and iOS).** `pdf.js` reads text content through a stream with `for await…of`, which Safari does not support. The legacy build alone did not help; replaced with an explicit reader loop.
6. **The stop button did not stop recording.** Clicks were lost, keyboard focus never reached the button, and it worked only with devtools open. My first two hypotheses (an overlay intercepting clicks, a disabled button) were both wrong. The real cause: the button was declared as a component nested inside the render, so React remounted it on every frame of the ~60 fps waveform animation and a physical click almost never landed on a live DOM node. Fixed and verified in both composer layouts.
7. **Replacing documents removed the chat from the sidebar.** A side effect of a rule I had asked for ("hide the chat list while no chat has documents"). Fixed, and the replace flow now also explains in the conversation why earlier messages were cleared.
8. **One transcription failure, not reproduced.** The third chat in one tab returned "Transcription failed"; no request reached the server, so the failure was client-side. A fresh tab worked, and a deliberate attempt to reproduce it (four chats, switching between them) did not trigger it. Cause unknown. The app showed a clear error with "Try again" and a text fallback.
9. **One cost row incomplete.** In one session the speech cost column was empty while speech had clearly played, so that row understates cost. Not seen in other runs; flagged in `results/final-run.md` rather than silently excluded.
10. **Multi-step answers get truncated.** "How do I connect the router to my modem?" returned three of five steps. This follows from the rule that answers stay short enough to be spoken. See §9.

---

## 8. Limits I know about

- **Verification checks existence, not aboutness.** A quote is confirmed to appear on the cited page; nothing confirms it describes the model or section the user asked about. On a page listing two products, a wrong-but-real quote would pass. The context line and full-page view exist so a reader can catch this.
- **Page numbers are file pages.** When a manual is an extract, the printed number on the page differs from the cited one.
- **The `unverified` path has never fired on a real failure.** In every run the model produced a valid quote on the first attempt, so that branch is untested outside development.
- **History is cleared when documents are replaced.** Deliberate: earlier answers rest on a document that is no longer loaded, and their citations can no longer be verified. The user is told why.
- **Nothing is stored.** No accounts, no database, no browser storage: chats live in the open tab. Good for privacy, and it means a reload loses the conversation.
- **Public demo.** Anyone with the link spends against my OpenAI key; a monthly spend limit is set. A real product needs auth and rate limiting.
- **Documents are sent to OpenAI** for answering. Extraction is local, but the text is not.
- **English only**, per the scope in the brief.
- **Not tested:** Firefox, Android, screen readers, documents at the exact limits in other shapes (very dense tables, multi-column layouts).

---

## 9. Product judgment

**What I deliberately did not build.**

*A side-by-side PDF viewer with the quote highlighted.* Humata and ChatPDF both do this, and it is convincing. But they are desktop reading tools working with one file at a time, and this product is voice-first, which means mobile, which means a split screen does not fit. It also depends on the same PDF rendering layer that broke twice in Safari. Instead the quote expands to show the full page text with the quote highlighted, which covers the same need (see the quote in its surroundings) at a fraction of the risk. A rendered page view is the natural next step.

*Suggested follow-up questions generated by the model.* An extra model call on every answer, paid for and added to latency, for a convenience. The three suggestions shown with the sample manuals are fixed text for those bundled files and go through the normal pipeline; no answers are pre-written anywhere in the app.

**What I would do next, in order.**

1. **Procedures, not just facts.** Speak "this takes five steps, starting with…" and show all steps on screen with a citation for each page. This fixes the truncation in §7.10 without making every spoken answer long.
2. **Stronger citation checking.** Verify that the quote falls under the section or model named in the question, not only that it exists on the page. This is the most important remaining correctness gap.
3. **Merge upload into the composer.** One input with an attach icon removes a step and matches what people know from chat apps. Kept separate in v1 because the three upload validations fail before the user has spoken, which is kinder than failing after.
4. **Auto-stop on silence.** Recordings are longer than the questions because people pause before tapping stop, and transcription cost and latency both scale with duration.
5. **Printed page numbers** alongside file page numbers, so a citation matches the paper manual in the reader's hands.
6. **Streaming the answer into speech** sentence by sentence, and a fallback speech provider, to cut the time to first sound further.

**What I would measure before building more.** Whether people trust the spoken answer enough to act on it without reading the quote. That determines whether the product needs a better viewer or a better voice.
