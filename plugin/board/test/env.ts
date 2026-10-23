// Imported first by every test file: points the log, state and registry at a throwaway folder,
// so no test can read or write the real board data.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.BOARD_LOG_DIR = mkdtempSync(join(tmpdir(), "crew-board-test-"));
