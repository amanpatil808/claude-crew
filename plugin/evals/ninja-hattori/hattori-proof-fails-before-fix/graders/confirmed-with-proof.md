---
type: llm
---

PASS if the report has a confirmed finding that getOrder (src/orders.js, around lines 7-10) returns another user's order because it never checks order.userId against userId, and names a proof test or script that was run and fails (or shows the leak) on the current code.
FAIL if there is no proof, the proof was not run, the finding is only "suspected", or the report says the code was fixed.
