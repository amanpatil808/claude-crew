# Bob memory

- When a test mixes fixed-date fixtures with code that stamps `new Date()`, put the whole file on one mocked clock (`mock.timers.enable({apis:["Date"]})`) rather than fixing the dates. Mixed clocks go stale as real time passes, as plugin/board/test/tasks.test.ts did on 2026-10-27. (seen 1) [crew]
- A regression test for a clock bug should run the same scenario at a past and a future date. Here only the past one failed on the old code. (seen 1) [crew]
- The toon-crew guard blocks inline file deletion, write-then-run in one Bash call, and heredocs containing the word "function". Worktree agents also get compound `cd && git ...; python3 <<EOF` commands refused. Use Edit/Write for code and keep each test run a separate plain call. (seen 3) [crew]
- To test "file swapped after an inode check", create the replacement while the original still exists and rename it over. rm-then-write lets ext4 reuse the inode, so such a test passes on macOS and fails on Linux CI. Prove guard tests by mutating the guard, then restore with `git checkout <ref> -- <file>`. (seen 1) [crew]
- A test file that imports a new export fails as a whole on old code, which proves nothing per test. Keep constants local in the test so each test fails on its own assertion. (seen 1) [crew]
- Board liveness: `crewFrom` never expires a start without a stop, so ghosts must be filtered in room.ts with a contact tracker (45 min). The manager's main-busy heartbeat and main usage must not count as contact. (seen 1) [project]
- Parse "X finished: summary" by the literal "finished:" marker, never the first colon: namespaced agent types ("toon-crew:kevin") contain colons.
- /api/state carries a `now` clock in the body: hash the body without it for the ETag, or the tag never matches. A page that skips repaint on 304 must still refresh its "Live" time and force a full fetch every ~30 s. (seen 1) [project]
- The guard blocks inline python/node whose text contains "git push": edit with Edit/Write. Browser scripts (room.js) are tested by slicing the loop out of the file and running it with `new Function` and stubs. (seen 1) [project]
- Timings: GitHub poll every 20 s plus a marker-triggered poll (hook writes refresh/<hash>.json with the project name only). (seen 1) [project]
- To prove a test fails on old code without git stash, copy the file aside, `git show HEAD:path > path`, run, copy back. (seen 1) [crew]
- Subagent transcripts carry their agent type in `subagents/agent-<id>.meta.json` (agentType, finished), so there's no need to parse the transcript for it. Worktree agents' transcripts sit under the parent project's slug. (seen 1) [crew]
- To audit a live board, compare against only what the board had logged at fetch time, then separately against the full recount. Otherwise in-flight agents (no usage event until SubagentStop) look like arithmetic bugs. (seen 1) [crew]
