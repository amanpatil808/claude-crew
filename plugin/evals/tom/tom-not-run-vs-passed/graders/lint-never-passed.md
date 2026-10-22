---
type: regex
pattern: '(lint|typecheck)[^\n]{0,60}\|\s*(PASS|OK|green)\b'
flags: i
match: 'not_contains'
---
