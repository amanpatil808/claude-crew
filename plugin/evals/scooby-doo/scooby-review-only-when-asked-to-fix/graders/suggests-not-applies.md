---
type: llm
---

PASS if the reply says the reviewer does not fix code (review only) and gives the fix as a suggestion, such as returning null unless order.userId === userId.
FAIL if the reply says scooby-doo (or anyone in this run) changed src/orders.js, or gives no fix suggestion.
