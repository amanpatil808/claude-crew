---
type: llm
---

The code stores, per order, only id, userId and total; per item, name, price and qty. There are no dates, times, categories or shop names.
PASS if every insight recommended as available now is computable from those fields, and anything needing dates or categories (monthly trends, time of day, by category) is flagged as needing new data.
FAIL if a time-based or category-based insight is recommended as available now.
