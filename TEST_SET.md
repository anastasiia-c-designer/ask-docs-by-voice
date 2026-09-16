# Test set: Ask your documents by voice

Expected outcomes were written **before** any testing of the prototype.
All documents are fictional and created for this test (`/test-docs`).

## Documents

| File | Pages | Purpose |
|---|---|---|
| `brisa-manual-v1.pdf` | 6 | Main manual, two models (AP-200, AP-400), rev. 1.0 |
| `brisa-manual-v2.pdf` | 6 | Revised manual, rev. 1.1. **One changed value:** AP-400 HEPA filter replacement 8 → 6 months (page 6) |
| `brisa-warranty.pdf` | 2 | Second document, to test answers across two uploaded files |

Upload limits respected: v1 + warranty = 8 pages; v2 + warranty = 8 pages.

## How to score

Each question is scored on two separate criteria:

- **Factual accuracy** — the spoken answer matches the expected answer.
- **Citation accuracy** — the shown quote appears verbatim on the cited page of the cited file, and it actually supports the answer.

A correct-sounding answer without a valid supporting quote counts as a **fail**.
For "not in document" and clarification cases, a pass means **no** invented answer and **no** invented quote.

## Questions

Session A: upload `brisa-manual-v1.pdf` + `brisa-warranty.pdf`. Ask questions in this order.

| # | Type | Spoken question | Expected answer | Expected source |
|---|---|---|---|---|
| 1 | Direct fact | "What room size is the AP-200 for?" | Up to 20 sq m | manual-v1, p. 4 |
| 2 | Follow-up (needs #1) | "And what about the other model?" | AP-400: up to 45 sq m | manual-v1, p. 4 |
| 3 | Comparison | "Which model needs a new HEPA filter less often?" | AP-400: every 8 months vs AP-200 every 6 months | manual-v1, p. 6 |
| 4 | Exception | "Can I run the AP-400 on Turbo all night?" | No. Turbo stops automatically after 2 hours and can't be turned on again for 30 minutes; the unit runs in Auto during the pause | manual-v1, p. 5 |
| 5 | Absent fact | "How much does the AP-400 weigh?" | Says the documents don't contain the weight. No number given | none |
| 6 | Correction in speech | "What's the noise level of the AP-200… sorry, I mean the AP-400, at max speed?" | AP-400: 52 dB at maximum speed | manual-v1, p. 4 |
| 7 | Second document | "How long is the warranty?" | 2 years from the date of purchase, both models | warranty, p. 1 |
| 8 | Decline to conclude | "Will the AP-400 get rid of cigarette smoke smell?" | Doesn't claim it will. May say the H13 filter captures 99.95% of 0.3-micron particles, but the documents say nothing about odours | manual-v1, p. 4 (if quoted) |

Session B: **new session** with `brisa-manual-v1.pdf` + `brisa-warranty.pdf`, no prior questions.

| # | Type | Spoken question | Expected answer | Expected source |
|---|---|---|---|---|
| 9 | Ambiguity | "How long does setup take?" | Asks which model. (If it answers both instead: AP-200 about 5 min, p. 2; AP-400 about 15 min, p. 3 — counts as partial pass, noted) | — |

Session C: replace `brisa-manual-v1.pdf` with `brisa-manual-v2.pdf` (keep warranty).

| # | Type | Spoken question | Expected answer | Expected source |
|---|---|---|---|---|
| 10 | After replacement | "How often should I replace the AP-400 HEPA filter?" | Every 6 months (was 8 in v1) | manual-v2, p. 6 |
| 11 | Changed comparison | "Which model needs a new HEPA filter less often?" | Neither: both every 6 months | manual-v2, p. 6 |

Question 11 repeats question 3 on purpose: the answer must change after the document is replaced.

## Results

Fill in after testing. Run each question 3 times.

| # | Run | Actual spoken answer | Quote + page shown | Factual ✓/✗ | Citation ✓/✗ | Time to first audio (s) | Notes |
|---|---|---|---|---|---|---|---|
| 1 | 1 | | | | | | |

## Known properties of the test documents

- PDF text extraction breaks long sentences across lines. Quote verification must normalise whitespace before matching.
- Each PDF page starts with a running footer text (document title, "Page X of Y") in the extracted text.
- Specifications are written as sentences, not as a table, so text extraction keeps the reading order.

## Upload limit tests

Expected outcomes were defined in planning before these tests were run. Run on the deployed app, each from a clean state.

| # | Upload | Expected | Actual | Pass |
|---|---|---|---|---|
| E1 | `test-docs-edge/scanned-manual.pdf` (image-only pages, no text layer) | Rejected as scanned, nothing loaded | "scanned-manual.pdf" looks like a scanned PDF. Only text-based PDFs are supported. | ✓ |
| E2 | `test-docs-edge/long-manual-11-pages.pdf` | Rejected, over 10-page limit | Too many pages: 11. The maximum is 10 pages across all files. | ✓ |
| E3 | manual-v1 + warranty + scanned-manual (3 files at once) | Rejected, over 2-file limit | You can upload at most 2 PDF files. | ✓ |
