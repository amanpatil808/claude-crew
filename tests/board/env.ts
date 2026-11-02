// Imported first by every test file: points the log, state and registry at a throwaway folder,
// so no test can read or write the real board data.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.BOARD_LOG_DIR = mkdtempSync(join(tmpdir(), "crew-board-test-"));
// The transcript root too (liveness stats, usage reads): no test ever looks at the real ~/.claude/projects.
process.env.CLAUDE_CONFIG_DIR = mkdtempSync(join(tmpdir(), "crew-board-config-"));

// Fixture agent files, so model tests never depend on the plugin's real frontmatter.
import { writeFileSync } from "node:fs";
const agents = mkdtempSync(join(tmpdir(), "crew-board-agents-"));
writeFileSync(join(agents, "bob.md"), "---\nname: bob\nmodel: sonnet\n---\n");
writeFileSync(join(agents, "nobita.md"), "---\nname: nobita\nmodel: inherit\n---\n");
process.env.BOARD_AGENTS_DIR = agents;
