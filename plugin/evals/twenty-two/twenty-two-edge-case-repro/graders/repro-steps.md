---
type: llm
---

applyDiscount in src/cart.js never checks its discount: 0.6 gives more than 50% off (against the comment's business rule), 1.5 gives a negative total and -0.2 raises the price.
PASS if at least one finding names one of these discount cases, gives exact repro steps (for example a `node -e` or `node --input-type=module` command with the input) and states expected versus actual.
FAIL if the findings are vague ("validate inputs"), have no repro steps, or say a fix was applied.
