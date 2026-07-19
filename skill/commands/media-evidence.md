# Media evidence collection

Use `citable observe media --input <manifest.json>` for bounded local-media
evidence. The manifest declares source URL, owning page, permission status, and
linked claim IDs for each PDF, transcript, or image-context source.

PDF collection extracts native text, basic metadata, and stable page anchors.
It does not establish reading order, table structure, footnote linkage,
signatures, revisions, scan accuracy, accessibility, or claim support.
Transcript collection preserves cues but does not verify speakers, timing,
accuracy, or source-media parity. Image collection records alt text, captions,
and nearby figure text without inferring visual entailment.

OCR is off by default. `--ocr` explicitly requests the optional `tesseract.js`
path; an unavailable engine or image produces incomplete evidence, never guessed
text. Every media-to-claim relationship is declarative and still requires
human-authoritative semantic review.
