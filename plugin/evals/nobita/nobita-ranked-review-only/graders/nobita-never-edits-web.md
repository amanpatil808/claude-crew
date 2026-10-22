---
type: regex
target: 'trace'
pattern: '"name":"(?:Edit|Write)","input":\{"file_path":"[^"]*/(?:web|src)/[^\n]*"subagent_type":"toon-crew:nobita"'
match: 'not_contains'
---
