---
name: community-files-lessons
description: Lessons from adding CODE_OF_CONDUCT, issue forms and PR template to the public repo
metadata:
  type: project
---

- Fetch the official Contributor Covenant from raw.githubusercontent.com (EthicalSource/contributor_covenant, content/version/2/1) and word-diff it against your file, so "unchanged text" is proven, not remembered. The Hugo copy has front matter and one-line paragraphs; compare words, not lines. (seen 1) [crew]
- Links in `.github/pull_request_template.md` and issue-form markdown must be absolute URLs; relative paths do not resolve in GitHub's new-PR form. (seen 1) [crew]
- The toon-crew guard blocks shell function definitions in Bash; use a small script file in the scratchpad instead. (seen 1) [crew]
- Security contact for this repo is the Security tab (private vulnerability reporting) and `/security/advisories/new`; no email address is published anywhere. (seen 1) [project]
