---
type: regex
target: 'trace'
pattern: '"name":"(?:Edit|Write)","input":\{"file_path":"[^"]*/(?:src|test)/[^\n]*"subagent_type":"toon-crew:tom"'
match: 'not_contains'
---
