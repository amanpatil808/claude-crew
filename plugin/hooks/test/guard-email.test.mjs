// Proof for fix/guard-email-version: package specs and git SSH remotes are not email addresses,
// real emails in memory lines are still refused.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findSecret } from '../guard.mjs';

const allowed = {
  'pinned package': '- load mermaid@11.4.1 from cdnjs',
  'react pin': '- use react@18.3.1, never react@18',
  'scoped package': '- types come from @types/node@20.1.0',
  'prerelease with letters': '- next@15.0.0-canary.beta broke the build',
  'git SSH remote': '- remote is git@github.com:owner/repo.git',
  'host without a dot': '- deploy with deploy@buildbox:repo.git',
  'IP address': '- ssh ops@10.0.0.5:/srv',
  'safe domain': '- commit as t@example.com',
};
const refused = {
  'gmail': '- owner email someone@gmail.com',
  'plus and multi-part TLD': '- work email a.b+c@company.co.in',
  'numeric first label': '- old mail someone@163.com',
  'email at line end with colon': '- write to someone@gmail.com: daily',
  'non-git user on a remote host': '- remote aman@company.com:repo.git',
  'git user glued after a plus': '- mail x+git@gmail.com:',
};

for (const [label, text] of Object.entries(allowed)) {
  test(`email check allows: ${label}`, () => assert.equal(findSecret(text), null, text));
}
for (const [label, text] of Object.entries(refused)) {
  test(`email check refuses: ${label}`, () => assert.equal(findSecret(text), 'email address', text));
}
