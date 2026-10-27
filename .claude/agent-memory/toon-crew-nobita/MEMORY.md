# Nobita memory

- For read-only roles the toon-crew guard blocks `sed -i`, `perl -e`, `node -e` that writes, and "write a script and run it" in one command. Write the script with the Write tool, then run it with `node <file>` in a separate call. (seen 1) [crew]
- Seed board demo data into a new folder of your own (for example `scratchpad/nobita-demo`). `scratchpad/demo` may belong to another agent, and `board-demo.mjs` refuses a non-empty folder that lacks its marker. (seen 1) [project]
- The board's CSP is `default-src 'none'` with no `font-src`, so "Press Start 2P" never loads and the pixel headings render in system mono. Any web font must be a `data:` URI plus a CSP change, reviewed by security. (seen 1) [project]
- Agent types are namespaced (`toon-crew:kevin`), so any parser that splits on the first colon garbles hand-back text. Check desks, bubbles and log rows for "x finished:" or "toon-crew:" leaking into the UI. (seen 1) [project]
- To film walkers: load the room with `localStorage.crewMotion = "on"`, then append fresh `assign`, `agent-start` and `agent-stop` events (ts = now) to the demo `events.jsonl`. Walks only play for events under 2 minutes old. (seen 1) [project]
- Automated contrast scans misread layered or gradient backgrounds (pixel plates, walls). Check those pairs by hand; don't report them as failures. (seen 1) [crew]
- A list with a max-height and overflow scroll on phone cuts rows mid-line with no sign of more. Check every list panel at 390 px for nested scrollers. (seen 1) [crew]
- An empty "needs attention" area must say what it tracks, or an absent data source looks like "nothing needs you". (seen 1) [crew]
