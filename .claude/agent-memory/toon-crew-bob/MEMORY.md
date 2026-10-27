# Bob memory

- When a test mixes fixed-date fixtures with code that stamps `new Date()`, put the whole file on one mocked clock (`mock.timers.enable({apis:["Date"]})`) rather than fixing the dates. Mixed clocks go stale as real time passes, as plugin/board/test/tasks.test.ts did on 2026-10-27. (seen 1) [crew]
- A regression test for a clock bug should run the same scenario at a past and a future date. Here only the past one failed on the old code. (seen 1) [crew]
- The toon-crew guard blocks inline file deletion and write-then-run in one Bash call. Use Edit/Write, then run in a separate call. (seen 1) [crew]
