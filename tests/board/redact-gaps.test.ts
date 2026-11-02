// Redaction gaps from the release review (L1): each line holds a made-up secret or personal value that must not
// survive redact(), and the values the board needs (SHAs, dates, uid:gid, prompts) stay readable.
// Token-shaped fixtures are built from pieces: gitleaks scans every commit.
import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { redact } from "../../plugin/board/lib/redact.ts";

const PW = ["Zq8v", "Lm2R", "t9"].join("");
const HEX32 = ["9f2c71aa", "0b3e4d5f", "8a6b7c8d", "9e0f1a2b"].join("");
const HEX40 = HEX32 + ["3c4d", "5e6f"].join("");
const NPM_BODY = ["abcdefghij", "klmnopqrst", "uvwxyz0123", "456789"].join("");

const gaps: [string, string, string][] = [
  ["mysql -p glued password", `mysql -u root -p${PW} app`, PW],
  ["mysqldump -p glued password", `mysqldump -h db -p${PW} shop > dump.sql`, PW],
  ["redis-cli -a password", `redis-cli -h cache -a ${PW} ping`, PW],
  ["curl -u user:pass", `curl -u deploy:${PW} https://x.test`, PW],
  ["curl --user=user:pass", `curl --user=deploy:${PW} https://x.test`, PW],
  ["x-api-key header", `x-api-key: ${HEX32}`, HEX32],
  ["api-key in JSON", `{"X-Goog-Api-Key": "${PW}"}`, PW],
  ["bare 40-hex token after 'key'", `using key ${HEX40} now`, HEX40],
  ["hex after 'token:'", `token: ${HEX32}`, HEX32],
  ["hex after 'secret='", `secret=${HEX32}`, HEX32],
  ["Aadhaar number", "customer aadhaar 2345 6789 0123 failed KYC", "2345 6789 0123"],
  ["Aadhaar shape without the word", "id 2345-6789-0123 on file", "2345-6789-0123"],
  ["Aadhaar digits after the word", "aadhaar no. 234567890123", "234567890123"],
  ["bank account number", "refund to account 123456789012 IFSC HDFC0001234", "123456789012"],
  ["a/c number", "a/c no: 001234567890", "001234567890"],
  ["US phone with brackets", "call (415) 555-0132 for the courier", "555-0132"],
  ["US phone with dashes", "call 415-555-0132 for the courier", "555-0132"],
  ["lower-case npm token", `npm token npm_${NPM_BODY}`, NPM_BODY],
  ["PyPI token", `pypi-${NPM_BODY}AgEIcHlwaS5vcmc`, NPM_BODY],
  ["Hugging Face token", `hf_${NPM_BODY}`, NPM_BODY],
];
for (const [name, input, secret] of gaps) {
  test(`redact hides: ${name}`, () => {
    const out = redact(input);
    assert.ok(!out.includes(secret), `leaked: ${JSON.stringify(out)}`);
  });
}

test("a card number is not split by the Aadhaar rule: all 16 digits are masked", () => {
  const out = redact("card 4111 1111 1111 1111 declined");
  assert.ok(!/\d{4}/.test(out), out);
});

test("what the board needs stays readable", () => {
  const keep = [
    `commit ${HEX40} merged`, // an unlabelled SHA
    "docker run -u 1000:1000 app", // uid:gid
    "mysql -u root -p app", // -p alone prompts for the password
    "psql -h db -p 5432 app", // psql -p with a space is the port
    "env -u HOME node x.js",
    "released 2026-10-28 at 18:43",
    "tests 316 pass 316 fail 0",
    "PR #23 feat/readme-live",
    "account settings updated",
    "cache key abc123",
  ];
  for (const text of keep) assert.equal(redact(text), text);
});
