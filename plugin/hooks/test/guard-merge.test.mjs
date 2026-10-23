// Owner rule: only the DevOps Team (mike-wazowski, sulley) merges pull requests or pushes to main/master, and the owner
// confirms each one. Everyone else is refused on every route, Doraemon and the main thread included. Bypasses of the
// owner's look (--admin, auto-merge, protection and ruleset changes, bodies the guard cannot read) are refused for all.
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluate } from '../guard.mjs';

const project = path.join(os.homedir(), 'toon-crew-merge-nonexistent-project');
const env = { CLAUDE_PROJECT_DIR: project };
const bash = (command, who = {}) => evaluate({ tool_name: 'Bash', cwd: project, tool_input: { command }, ...who }, env);
const tool = (tool_name, tool_input, who = {}) => evaluate({ tool_name, cwd: project, tool_input, ...who }, env);
const mcp = (tool_name, who = {}, tool_input = {}) => tool(tool_name, tool_input, who);
const DENY = /^Only the DevOps Team \(Mike Wazowski, Sulley\) may merge pull requests, with the owner's approval\.$/;
const tag = (who, c) => `${JSON.stringify(who)}: ${c}`;

const ROUTES = ['gh pr merge 5', 'gh pr merge --squash 5', 'gh -R a/b pr merge 5', 'bash -c "gh pr merge 3"',
  'gh api -X PUT repos/a/b/pulls/5/merge', 'gh api repos/a/b/pulls/5/merge -X PUT', 'gh api --method=PUT /repos/a/b/pulls/5/merge',
  'gh api repos/a/b/merges -f base=main -f head=x', `gh api graphql -f query='mutation{mergePullRequest(input:{}){clientMutationId}}'`,
  'curl -X PUT -H "Authorization: token x" https://api.github.com/repos/a/b/pulls/5/merge'];
// Bypasses of the owner's per-merge look: refused for every role, DevOps included.
const ALWAYS_DENIED = ['gh pr merge --admin 5', 'gh pr merge 5 --squash --admin', 'gh pr merge --admin=true 5', 'gh pr merge --auto --squash 5', 'gh pr merge 5 --auto',
  `gh api graphql -f query='mutation{enablePullRequestAutoMerge(input:{}){clientMutationId}}'`];

// agent_id present (a subagent) and absent (`claude --agent <name>` as the main thread).
// Only the exact plugin names: a bare or re-cased name could be a project agent with other tools.
const DEVOPS = ['toon-crew:mike-wazowski', 'toon-crew:sulley'].flatMap((t) => [{ agent_type: t, agent_id: 'a1' }, { agent_type: t }]);
const LOOKALIKES = ['mike-wazowski', 'sulley', 'toon-crew:SULLEY', 'toon-crew:Mike-Wazowski', 'other-plugin:sulley', 'toon-crew:sulley ', 'toon-crew:mike-wazowski-helper', 'not-sulley']
  .flatMap((t) => [{ agent_type: t, agent_id: 'a1' }, { agent_type: t }]);
const OTHERS = [{}, { agent_type: 'toon-crew:doraemon' }, { agent_type: 'doraemon' }, { agent_type: 'toon-crew:doraemon', agent_id: 'a1' },
  { agent_type: 'toon-crew:kevin', agent_id: 'a1' }, { agent_type: 'kevin', agent_id: 'a1' }, { agent_type: 'toon-crew:bob', agent_id: 'a1' },
  { agent_type: 'toon-crew:miguel-rivera', agent_id: 'a1' }, { agent_type: 'toon-crew:joe-gardner', agent_id: 'a1' }, ...LOOKALIKES];
const MIKE = DEVOPS[0]; const SULLEY = DEVOPS[2];
const NON_KM = OTHERS.filter((w) => !/miguel/.test(w.agent_type ?? ''));
const EVERYONE = [...DEVOPS, ...OTHERS];

test('DevOps (mike-wazowski, sulley): every merge route asks the owner', () => {
  for (const who of DEVOPS) for (const c of ROUTES) assert.ok(bash(c, who)?.ask, tag(who, c));
});
test('everyone else, including Doraemon and the main thread: every merge route is denied with the DevOps message', () => {
  for (const who of OTHERS) for (const c of ROUTES) {
    const r = bash(c, who);
    assert.ok(r?.deny, tag(who, c));
    if (!/miguel/.test(who.agent_type ?? '') || !/api/.test(c)) assert.match(r.deny, DENY, tag(who, c));
  }
});
test('--admin and auto-merge (--auto, enablePullRequestAutoMerge): denied even for DevOps', () => {
  for (const who of EVERYONE) for (const c of ALWAYS_DENIED) assert.ok(bash(c, who)?.deny, tag(who, c));
});
test('MCP merge tools: DevOps asks, everyone else denied; auto-merge tools denied for all', () => {
  for (const who of DEVOPS) assert.ok(mcp('mcp__github__merge_pull_request', who)?.ask, JSON.stringify(who));
  for (const who of OTHERS) assert.match(mcp('mcp__github__merge_pull_request', who)?.deny ?? '', DENY, JSON.stringify(who));
  for (const who of EVERYONE) for (const t of ['mcp__github__enable_pull_request_auto_merge', 'mcp__x__enable_automerge', 'mcp__x__auto_merge'])
    assert.ok(mcp(t, who)?.deny, tag(who, t));
  assert.ok(mcp('mcp__github__push_files', {}, { branch: 'feat/x' })?.ask, 'non-merge remote changes still ask');
});
test('reading PRs and other gh use stay open to everyone', () => {
  for (const who of [...DEVOPS, ...NON_KM])
    for (const c of ['gh pr view 5', 'gh pr checks 5', 'gh pr list', 'gh api repos/a/b/pulls/5/merge', 'gh pr comment 5 -b "merge soon"', 'gh auth status', 'gh run list', 'gh --version', 'gh',
      `gh api graphql -f query='query($owner:String!){repository(owner:$owner,name:"r"){id}}' -F owner=o`])
      assert.equal(bash(c, who), null, tag(who, c));
});

test('B1: GraphQL bodies the guard cannot read (file, stdin, heredoc, variable) are denied for everyone', () => {
  for (const c of ['gh api graphql -F query=@/tmp/m.graphql', 'gh api graphql -Fquery=@m.graphql', 'gh api graphql --input /tmp/m.json', 'gh api graphql --input=-',
    "gh api graphql -F query=@- <<'EOF'\nmutation{mergePullRequest(input:{}){clientMutationId}}\nEOF", 'gh api graphql -f query="$Q"', 'gh api graphql -f query="$(cat m.graphql)"',
    'gh api graphql -f query="mutation{ ${OP}(input:{}){clientMutationId} }"', 'gh api graphql -f query="mutation{$OP(input:{}){clientMutationId}}"',
    'curl -X POST https://api.github.com/graphql -d @/tmp/m.json', 'curl https://api.github.com/graphql --data-binary @m.json', 'curl https://api.github.com/graphql --json @-',
    'curl -X POST https://api.github.com/graphql -d "$BODY"', 'curl https://api.github.com/graphql --data-urlencode query@m.graphql', 'wget --post-file=m.json https://api.github.com/graphql'])
    for (const who of [{}, MIKE]) assert.ok(bash(c, who)?.deny, tag(who, c));
});
test('B2: -p/--preview and unknown options cannot hide the endpoint; repeated slashes and dot segments collapse', () => {
  for (const c of ['gh api -p corsair -X PUT repos/o/r/pulls/5/merge', 'gh api --preview corsair --method PUT repos/o/r/pulls/5/merge', 'gh api --preview=corsair -XPUT repos/o/r/pulls/5/merge',
    'gh api --unknown-flag repos/o/r/pulls/5/merge -X PUT', 'gh api -X PUT repos/o/r/pulls/5//merge', 'gh api -X PUT repos//o/r/pulls/5/merge', 'gh api -X PUT repos/o/r/pulls/5/./merge',
    'gh api -X PUT https://api.github.com//repos/o/r/pulls/5/merge']) {
    assert.match(bash(c)?.deny ?? '', DENY, c);
    assert.ok(bash(c, MIKE)?.ask, c);
  }
});
test('B3: launchers, xargs, GH_CONFIG_DIR/GH_HOST, program-naming variables and unknown gh subcommands', () => {
  for (const c of ['watch -n 999 gh pr merge 5', 'watch "gh pr merge 5"', 'script -q /dev/null gh pr merge 5', 'script -c "gh pr merge 5" /dev/null', 'unbuffer gh pr merge 5',
    'flock /tmp/l gh pr merge 5', 'flock /tmp/l -c "gh pr merge 5"', 'tmux new-session -d "gh pr merge 5"', 'tmux send-keys -t x "gh pr merge 5" Enter', 'screen -dm gh pr merge 5',
    'su -c "gh pr merge 5" me', 'sudo -u me gh pr merge 5', 'ssh localhost gh pr merge 5', 'ssh localhost "gh pr merge 5"', 'parallel gh pr merge ::: 5', 'watch -n 1 git push origin main',
    'PAGER="gh pr merge 5" gh pr view 5', 'GH_PAGER="sh -c \'gh pr merge 5\'" gh pr view 5', 'GIT_EDITOR="git push origin main" git commit'])
    assert.ok(bash(c)?.deny, c);
  assert.ok(bash('watch -n 999 gh pr merge 5', MIKE)?.ask, 'a launcher does not hide the ask from DevOps');
  for (const c of ['echo pr merge 5 | xargs gh', 'echo 5 | xargs gh pr merge', 'echo 5 | xargs -I{} gh pr merge {}', 'echo 5 | xargs env gh pr view', 'echo m | xargs -I{} sh -c "gh {} 5"',
    'GH_CONFIG_DIR=/tmp/ghx gh m 5', 'GH_CONFIG_DIR=/tmp/ghx gh pr view 5', 'env GH_HOST=evil.example gh pr view 5', 'export GH_CONFIG_DIR=/tmp/ghx; gh pr view 5', 'GH_HOST=x; gh pr list',
    'gh m 5', 'gh co 5', 'gh my-extension merge', 'gh extension exec merger 5', 'gh config set pager "gh pr merge 5"', 'gh config set editor vim'])
    for (const who of [{}, MIKE]) assert.ok(bash(c, who)?.deny, tag(who, c));
  for (const c of ['watch -n 5 gh pr checks 5', 'ssh build-box "docker ps"', 'GIT_SSH_COMMAND="ssh -i key" git fetch', 'gh config set git_protocol ssh', 'PAGER=cat gh pr view 5', 'tmux ls'])
    assert.equal(bash(c), null, c);
});
test('B4: tokens and credential files are off limits for every role; write methods and hidden URLs are parsed', () => {
  const home = os.homedir();
  for (const c of ['gh auth status --show-token', 'gh auth status -t', 'gh auth status -ht', 'gh auth token', "printf 'host=github.com\\n' | git credential fill", 'git credential-osxkeychain get',
    'git-credential-osxkeychain get', 'security find-generic-password -s gh:github.com -w', 'cat ~/.config/gh/hosts.yml', `cat ${home}/.config/gh/hosts.yml`, 'cat $HOME/.config/gh/hosts.yml',
    'cd ~/.config && cat gh/hosts.yml', 'cd ~/.config/gh && cat hosts.yml', 'cat ~/.git-credentials', 'grep -r token "$XDG_CONFIG_HOME/gh"', `python3 -c "print(open('${home}/.config/gh/hosts.yml').read())"`])
    for (const who of [{}, MIKE, { agent_type: 'toon-crew:kevin', agent_id: 'a1' }]) assert.ok(bash(c, who)?.deny, tag(who, c));
  for (const [t, i] of [['Read', { file_path: path.join(home, '.config/gh/hosts.yml') }], ['Read', { file_path: path.join(home, '.git-credentials') }], ['Grep', { pattern: 'oauth_token', path: home }],
    ['Grep', { pattern: 'x', path: path.join(home, '.config') }], ['Grep', { pattern: 'x', path: '~/.config/gh' }], ['Glob', { pattern: '*', path: path.join(home, '.config/gh') }]])
    for (const who of [{}, MIKE]) assert.ok(tool(t, i, who)?.deny, tag(who, `${t} ${JSON.stringify(i)}`));
  for (const [t, i] of [['Read', { file_path: path.join(project, 'README.md') }], ['Grep', { pattern: 'x', path: project }], ['Grep', { pattern: 'hosts.yml' }], ['Read', { file_path: path.join(project, 'inventory/hosts.yml') }]])
    assert.equal(tool(t, i), null, `${t} ${JSON.stringify(i)}`);
  const PR = 'repos/o/r/pulls/5/merge';
  for (const c of [`wget --method=PUT https://api.github.com/${PR}`, `wget --method PUT https://api.github.com/${PR}`, `http PUT https://api.github.com/${PR}`, `https put api.github.com/${PR}`,
    `xh put api.github.com/${PR}`, `xhs PUT api.github.com/${PR}`, `curl -sX PUT https://api.github.com/${PR}`, `curl -sSXPUT https://api.github.com/${PR}`, `curl --request=PUT api.github.com/${PR}`,
    `curl -X PUT --url https://api.github.com/${PR}`]) {
    assert.match(bash(c)?.deny ?? '', DENY, c);
    assert.ok(bash(c, MIKE)?.ask, c);
  }
  for (const c of [`U=https://api.github.com/${PR}; curl -X PUT "$U"`, 'curl -X PUT "$BASE/merge"', 'curl -X POST "https://$HOST/repos/o/r/pulls/5/merge"', 'curl -K /tmp/merge.curlrc', 'curl --config=m.rc',
    'curl --variable U=x --expand-url "{{U}}" -X PUT', 'wget --method=PUT -i urls.txt', 'wget -e "method=PUT" https://example.com/x', 'http PUT "$U"', 'xh post "$U" a=b',
    `python3 -c "import urllib.request as u; u.urlopen(u.Request('https://api.github.com/${PR}', method='PUT'))"`, 'python3 -c "import requests,os; requests.put(os.environ[\'U\'])"',
    `node -e "fetch('https://api.github.com/${PR}', { method: 'PUT' })"`, "python3 - <<'EOF'\nimport requests\nrequests.post(URL, json={})\nEOF"])
    for (const who of [{}, MIKE]) assert.ok(bash(c, who)?.deny, tag(who, c));
  for (const c of ['curl -X POST -H "Authorization: Bearer $T" http://localhost:3000/api/x', 'curl -s "$U"', 'curl -sSL https://example.com/install.sh -o /tmp/i.sh', 'wget -q https://example.com/a.tgz',
    'http POST localhost:8080/items name=x', 'curl -X POST -d "$BODY" https://example.com/hook', `python3 -c "import requests; requests.post('http://localhost:8080/x', json={})"`, 'gh auth status'])
    assert.equal(bash(c), null, c);
});

test('S1: a push to main/master is denied for everyone but DevOps, who are asked', () => {
  for (const c of ['git push origin main', 'git push origin HEAD:main', 'git push origin feat:refs/heads/master', 'git merge feat/x && git push origin main', 'git push -u upstream main']) {
    for (const who of OTHERS) assert.ok(bash(c, who)?.deny, tag(who, c)); // read-only roles and Miguel are refused by their own rules first
    for (const who of NON_KM.filter((w) => !/joe-gardner/.test(w.agent_type ?? ''))) assert.match(bash(c, who).deny, /^Only the DevOps Team .* push to main\/master/, tag(who, c));
    for (const who of DEVOPS) assert.ok(bash(c, who)?.ask, tag(who, c));
  }
  assert.equal(bash('git push origin feat/x'), null, 'feature branches are free');
});
test('S2: rulesets, protection and direct-commit GraphQL are denied for all; contents writes to main and MCP file writes count as pushes', () => {
  for (const c of ['gh api -X DELETE repos/o/r/rulesets/1', 'gh api -X PUT repos/o/r/rulesets/1 -f enforcement=disabled', 'gh api -X POST repos/o/r/rulesets', 'gh api -X PATCH orgs/o/rulesets/2',
    `gh api graphql -f query='mutation{updateBranchProtectionRule(input:{branchProtectionRuleId:"X"}){clientMutationId}}'`,
    `gh api graphql -f query='mutation{createBranchProtectionRule(input:{}){clientMutationId}}'`, `gh api graphql -f query='mutation{deleteBranchProtectionRule(input:{}){clientMutationId}}'`,
    `gh api graphql -f query='mutation{updateRepositoryRuleset(input:{}){clientMutationId}}'`,
    `gh api graphql -f query='mutation{createCommitOnBranch(input:{branch:{branchName:"main"}}){commit{oid}}}'`])
    for (const who of [{}, MIKE, SULLEY]) assert.ok(bash(c, who)?.deny, tag(who, c));
  assert.equal(bash('gh api repos/o/r/rulesets'), null, 'reading rulesets is fine');
  for (const c of ['gh api -X PUT repos/o/r/contents/README.md -f branch=main -f message=x -f content=eA==', 'gh api -X PUT repos/o/r/contents/README.md -f message=x -f content=eA==',
    'gh api -X DELETE repos/o/r/contents/a.txt -f branch=master -f sha=0', 'gh api -X PUT repos/o/r/contents/a --input body.json']) {
    assert.ok(bash(c)?.deny, c); assert.ok(bash(c, MIKE)?.ask, c);
  }
  assert.equal(bash('gh api -X PUT repos/o/r/contents/a.md -f branch=feat/x -f message=x -f content=eA=='), null, 'a contents write to a feature branch is not a push to main');
  for (const t of ['mcp__github__create_or_update_file', 'mcp__github__push_files', 'mcp__github__delete_file']) {
    for (const input of [{ branch: 'main' }, { branch: 'refs/heads/master' }, {}]) { assert.ok(mcp(t, {}, input)?.deny, `${t} ${JSON.stringify(input)}`); assert.ok(mcp(t, MIKE, input)?.ask, t); }
  }
  assert.equal(mcp('mcp__github__create_or_update_file', {}, { branch: 'feat/x' }), null);
});
test('S4: gh workflow run, gh repo edit and workflow dispatches are DevOps only (asked)', () => {
  for (const c of ['gh workflow run merge.yml -f pr=5', 'gh repo edit --enable-auto-merge', 'gh -R o/r repo edit --default-branch dev', 'gh api -X POST repos/o/r/actions/workflows/x.yml/dispatches -f ref=main',
    'gh api -X POST repos/o/r/dispatches -f event_type=deploy']) {
    for (const who of NON_KM) assert.match(bash(c, who)?.deny ?? '', /^Only the DevOps Team/, tag(who, c));
    for (const who of DEVOPS) assert.ok(bash(c, who)?.ask, tag(who, c));
  }
  assert.equal(bash('gh workflow list'), null); assert.equal(bash('gh repo view'), null);
});
test('the merge ask names the PR and repo when they are plain ids, and nothing else', () => {
  assert.equal(bash('gh pr merge 5 -R o/r', MIKE).ask, 'Merging PR #5 in o/r deploys to production: confirm.');
  assert.equal(bash('gh pr merge https://github.com/o/r/pull/12', MIKE).ask, 'Merging PR #12 in o/r deploys to production: confirm.');
  assert.equal(bash('GH_REPO=o/r gh pr merge 7', MIKE).ask, 'Merging PR #7 in o/r deploys to production: confirm.');
  assert.equal(bash('gh api -X PUT repos/o/r/pulls/9/merge', MIKE).ask, 'Merging PR #9 in o/r deploys to production: confirm.');
  assert.equal(mcp('mcp__github__merge_pull_request', MIKE, { owner: 'o', repo: 'r', pull_number: 3 }).ask, 'Merging PR #3 in o/r deploys to production: confirm.');
  assert.equal(bash('gh pr merge feat/x', MIKE).ask, 'Merging deploys to production: confirm.');
  assert.equal(bash('gh pr merge 5 -R "o/r (owner approved)"', MIKE).ask, 'Merging PR #5 deploys to production: confirm.', 'a crafted repo is left out');
});
test('approving a PR (gh, REST, GraphQL, MCP) is DevOps only (asked); other reviews stay open', () => {
  const APPROVALS = ['gh pr review 5 --approve', 'gh pr review --approve=true 5', 'gh pr review 5 -a', 'gh pr review 5 -ab "lgtm"', 'gh -R o/r pr review 5 --approve',
    'gh api -X POST repos/o/r/pulls/5/reviews -f event=APPROVE', 'gh api repos/o/r/pulls/5/reviews -f event=approve -f body=x', 'gh api -X POST repos/o/r/pulls/5/reviews --input r.json',
    'gh api -X POST repos/o/r/pulls/5/reviews/77/events -f event=APPROVE', 'curl -X POST -d \'{"event":"APPROVE"}\' https://api.github.com/repos/o/r/pulls/5/reviews',
    `gh api graphql -f query='mutation{addPullRequestReview(input:{pullRequestId:"X",event:APPROVE}){clientMutationId}}'`,
    `gh api graphql -f query='mutation{submitPullRequestReview(input:{pullRequestReviewId:"X",event:APPROVE}){clientMutationId}}'`];
  for (const c of APPROVALS) {
    for (const who of NON_KM) assert.match(bash(c, who)?.deny ?? '', /^Only the DevOps Team .* PR approvals/, tag(who, c));
    for (const who of DEVOPS) assert.ok(bash(c, who)?.ask, tag(who, c));
  }
  for (const [t, i] of [['mcp__github__create_pull_request_review', { event: 'APPROVE' }], ['mcp__github__submit_pending_pull_request_review', { event: 'APPROVE' }], ['mcp__github__pull_request_review_write', { method: 'create', event: 'APPROVE' }]]) {
    assert.ok(mcp(t, {}, i)?.deny, t); assert.ok(mcp(t, MIKE, i)?.ask, t);
  }
  for (const c of ['gh pr review 5 --comment -b "nit"', 'gh pr review 5 -r -b "fix x"', 'gh api -X POST repos/o/r/pulls/5/reviews -f event=COMMENT -f body=x', 'gh api repos/o/r/pulls/5/reviews'])
    assert.equal(bash(c), null, c);
  assert.equal(mcp('mcp__github__create_pull_request_review', {}, { event: 'COMMENT', body: 'x' }), null);
});
test('look-alike agent types never get DevOps rights: bare, re-cased, other plugins, suffixed', () => {
  for (const who of LOOKALIKES) for (const c of ['gh pr merge 5', 'git push origin main', 'gh workflow run x.yml', 'gh pr review 5 --approve']) assert.ok(bash(c, who)?.deny, tag(who, c));
  for (const who of LOOKALIKES) assert.ok(mcp('mcp__github__merge_pull_request', who)?.deny, JSON.stringify(who));
});
