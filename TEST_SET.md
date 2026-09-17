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

## New testings for TP-Link
## Real manufacturer manual test

Expected outcomes recorded before testing. The PDF is not included in the repository (manufacturer copyright): 10 pages extracted from the official TP-Link router user guide (printed pages 3, 4, 5, 7, 8, 9, 11, 13, 14, 15). The app cites page numbers within the uploaded file, which differ from the printed page numbers.

| # | Type | Question | Expected answer | File page (printed) |
|---|---|---|---|---|
| R1 | Direct fact | How long do I hold the reset button to reset the router? | More than 2 seconds; resets to factory defaults | 3 (5) |
| R2 | Table lookup | What does it mean if the Internet light is orange? | Internet port connected, but internet service not available | 2 (4) |
| R3 | Follow-up | And what if it's off? | Internet port is unplugged | 2 (4) |
| R4 | Multi-page process | How do I connect the router to my modem? | Modem off + remove backup battery; modem to Internet port via Ethernet; modem on, wait ~2 min; power on router; check Power, 2.4G, 5G, Internet LEDs solid | 4 (7), 5 (8) |
| R5 | Exception | Can I use the WPS button with my iPhone? | No, WPS is not supported by iOS | 5 (8) |
| R6 | Absent fact | What is the maximum Wi-Fi speed of this router? | Not in the manual | — |
| R7 | Decline to conclude | What's the default Wi-Fi password? | Not given; SSID and password are on the label at the bottom of the router | 5 (8) |
| R8 | Inconsistent source | Which button on the router do I press for WPS? | Ideal: mentions both "WPS/Wi-Fi On/Off" and "Reset/WPS". Acceptable: one with a correct citation | 3 (5), 6 (9) |
| R9 | Comparison | What's the difference between setting up PPPoE and PPTP? | PPPoE: ISP username and password. PPTP: username, password and Secondary Connection | 9 (14), 10 (15) |
| R10 | Ambiguity (new chat) | What do I need to enter in the internet settings? | Asks which connection type, or answers per type with citations | 8–10 |
