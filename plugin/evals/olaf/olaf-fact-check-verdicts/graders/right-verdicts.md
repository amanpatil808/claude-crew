---
type: llm
---

PASS if: "CSV or PDF export" is marked wrong or partly wrong (src/export.js has CSV only); "encrypted at rest" is marked wrong or unverified (no encryption code); "npm test" is confirmed (package.json); and every verdict cites a file.
FAIL if PDF export or encryption is marked confirmed, or any verdict has no source.
