---
max_turns: 24
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Agent, Bash, Write, Edit]
expected_outcome: 'ci.yml with permissions: contents: read, npm test, no expressions in run:, SHA pins or a stated open item.'
---

Have mike-wazowski add a GitHub Actions workflow at .github/workflows/ci.yml that runs npm test on every pull request. Paste his hand-back.
