// Proves the redaction rules on fake secrets of every kind the board could see, and that the
// things the board needs (git SHAs, versions, times, request ids) survive untouched.
import "./env.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { redact, redactDeep } from "../lib/redact.ts";

const leaks = (out: string, ...secrets: string[]) => secrets.forEach((s) => assert.ok(!out.includes(s), `leaked ${s} in: ${out}`));

test("tokens and auth headers", () => {
  const out = redact("token ghp_abcdefghijklmnopqrstuvwx1234 and github_pat_11ABCDEFG0123456789_abcdefghij sk-ant-api03-XyZ_secret-123 Authorization: Bearer abc.def.ghi-12345 dckr_pat_AbCdEf123456 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlX2hlcmU");
  leaks(out, "ghp_abcdef", "github_pat_11", "sk-ant-api03", "abc.def.ghi-12345", "dckr_pat_", "eyJhbGci");
});

test("cookies", () => {
  leaks(redact("Cookie: sid=s%3Aabc123; csrftoken=xyz"), "s%3Aabc123", "xyz");
  leaks(redact("Set-Cookie: zomato_session=QWERTY; Path=/"), "QWERTY");
  leaks(redact('{"cookie":"__cf_bm=abc","sessionToken":"deadbeefcafe"}'), "__cf_bm=abc", "deadbeefcafe");
});

test("Redis and Postgres passwords", () => {
  const out = redact("connect redis://:R3d1sPa55@redis:6379 postgres://app:PgS3cret!@postgres:5432/app REDIS_PASSWORD=R3d1sPa55 POSTGRES_PASSWORD: PgS3cret!");
  leaks(out, "R3d1sPa55", "PgS3cret!");
  assert.match(out, /postgres:\/\/app:\[redacted\]@postgres/);
});

test("phone numbers", () => {
  leaks(redact("call +91 98765 43210 or 9876543210 or +91-9123456789"), "98765 43210", "9876543210", "9123456789");
  leaks(redact('{"phone":"+919812345678","mobile":"9812345678"}'), "9812345678");
});

test("agent ids that contain ten digits are not phone numbers", () => {
  // the bug: the digits inside "aac46ee8410611592" looked like a mobile number and were masked
  for (const id of ["aac46ee8410611592", "a9876543210bcdef0", "9876543210abcdef", "agent-id-a8410611592f"]) {
    assert.equal(redact(id), id);
    assert.equal(redact(`SubagentStop agent_id=${id} finished`), `SubagentStop agent_id=${id} finished`);
  }
});

test("real phone numbers are still masked next to punctuation and words", () => {
  for (const [text, digits] of [["(9876543210)", "9876543210"], ["tel: 9876543210.", "9876543210"], ["phone=+91 98765 43210;", "98765 43210"], ["mobile 98765-43210 ok", "98765-43210"], ["call\n9123456789", "9123456789"]] as const) {
    const out = redact(text);
    assert.ok(!out.includes(digits), `leaked ${digits} in: ${out}`);
    assert.match(out, /\[phone\]/);
  }
});

test("OTPs", () => {
  leaks(redact("Your OTP is 482913"), "482913");
  leaks(redact("482913 is your Zomato login code"), "482913");
  leaks(redact('{"otp":"7731","verification_code":123456}'), "7731", "123456");
});

test("emails and addresses", () => {
  const out = redact('user jo.doe@example.com {"address":"Flat 4B, MG Road, Pune","pincode":"411001","lat":18.52,"landmark":"near temple"} address=12 Park Street');
  leaks(out, "jo.doe@example.com", "MG Road", "411001", "18.52", "near temple", "Park Street");
});

test("redactDeep drops sensitive keys whole and redacts nested strings", () => {
  const out = redactDeep({ email: "a@b.co", meta: { addressLine1: "x", note: "otp 123456", list: ["ghp_abcdefghijklmnopqrstuvwx1234"] } });
  assert.equal(out.email, "[redacted]");
  assert.equal(out.meta.addressLine1, "[redacted]");
  leaks(JSON.stringify(out), "123456", "ghp_abcdef");
});

test("keeps what the board needs", () => {
  const line = "Committed 3f9c2ab on feat/ui-wow: fix tabs; deploy ok v0.19.0 2026-10-22T13:17:50+0530 req=39742932174-1 sha 4b825dc642cb6eb9a060e54bf8d69288fbee4904 at 1729584000123 job 5";
  assert.equal(redact(line), line);
  assert.equal(redact("exit code 1, status 200"), "exit code 1, status 200");
  const url = "https://github.com/acme/widgets/actions/runs/39742932174";
  assert.equal(redact(url), url);
  leaks(redact("key AbCdEfGhIjKlMnOpQrStUvWxYz0123456789xyz"), "AbCdEfGhIjKlMnOp");
});
