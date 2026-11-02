// Proof: personal data that survives the board's redaction (events.jsonl, /api/state, export feed).
// Synthetic values only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { redact } from "../../plugin/board/lib/redact.ts";
import { projectKey } from "../../plugin/board/lib/projects.ts";

const leaks: Record<string, [string, string]> = {
  "Indian mobile with trunk 0": ["call 09876543210 for the OTP", "9876543210"],
  "Indian mobile 3-3-4": ["owner 987 654 3210", "987 654 3210"],
  "Indian mobile with dots": ["owner 98765.43210", "98765.43210"],
  "UPI id": ["refund to someone@okicici", "someone@okicici"],
  "card number": ["card 4111 1111 1111 1111", "4111 1111 1111 1111"],
  "address in prose": ["deliver to Flat 4B, 12 MG Road, Indiranagar, Bengaluru 560038", "560038"],
  "password in prose": ["db password is hunter2-hunter2", "hunter2-hunter2"],
  "OTP after 'is'": ["your code: 482913", "482913"],
};
for (const [name, [text, secret]] of Object.entries(leaks)) {
  test(`redact masks ${name}`, () => { const out = redact(text); assert.ok(!out.includes(secret), `leaks: ${JSON.stringify(out)}`); });
}

test("two projects never share a board state folder", () => {
  // registry names are folder basenames; ~/work/api and ~/oss/api, or "My App" and "my-app", collide.
  assert.notEqual(projectKey("My App"), projectKey("my-app"), "same key -> same state.json / seen.json");
});
