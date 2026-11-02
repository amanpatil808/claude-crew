// [L2] A "needs you" PR item links only to https://github.com/<owner>/<repo>/pull/<that PR's number>: a tampered or
// odd gh reply never puts another host, a port, credentials, a query, markup or another PR into needsYou[].ref.
import "./env.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { prNeeds } from "../../plugin/board/lib/needs.ts";

const pr = (number: number, url: unknown) => ({ number, url, title: "t", state: "OPEN", draft: false, checks: "pass" as const, review: "" as const, updatedAt: "2026-10-27T10:00:00Z" });
const itemOf = (url: unknown, number = 7) => prNeeds([{ name: "p", board: true }], { p: { prs: [pr(number, url) as never] } })[0];
const refOf = (url: unknown, number = 7) => itemOf(url, number)?.ref;

test("a real GitHub PR URL links", () => {
  assert.equal(refOf("https://github.com/acme/shop/pull/7"), "https://github.com/acme/shop/pull/7");
  assert.equal(refOf("https://github.com/my-org/shop.api_v2/pull/12345", 12345), "https://github.com/my-org/shop.api_v2/pull/12345");
});

test("another host, scheme, port or credentials get no ref", () => {
  for (const url of ["https://evil.example/acme/shop/pull/7", "https://github.com.evil.example/acme/shop/pull/7", "https://www.github.com/acme/shop/pull/7",
    "http://github.com/acme/shop/pull/7", "javascript://github.com/acme/shop/pull/7", "https://github.com:8443/acme/shop/pull/7",
    "https://user:pw@github.com/acme/shop/pull/7", "https://evil.example@github.com/acme/shop/pull/7", "//github.com/acme/shop/pull/7"]) assert.equal(refOf(url), undefined, url);
});

test("a query, hash, extra path, markup or a non-canonical spelling gets no ref", () => {
  for (const url of ["https://github.com/acme/shop/pull/7?x=1", "https://github.com/acme/shop/pull/7#x", "https://github.com/acme/shop/pull/7/",
    "https://github.com/a/b/c/d/pull/7", 'https://github.com/a/"><svg/onload=alert(1)>/pull/7', "https://github.com/acme/../shop/pull/7",
    "https://GITHUB.com/acme/shop/pull/7", "https://github.com/acme/shop/pull/07", "https://github.com/acme/shop/pull/7 ", "https://github.com/acme/sh%6fp/pull/7",
    "https://github.com//shop/pull/7"]) assert.equal(refOf(url), undefined, url);
});

test("the URL must point at the PR's own number; the item itself still shows", () => {
  assert.equal(refOf("https://github.com/acme/shop/pull/999", 7), undefined);
  assert.equal(itemOf("https://github.com/acme/shop/pull/999", 7)?.number, 7);
  for (const url of [undefined, 7, { href: "https://github.com/acme/shop/pull/7" }]) assert.equal(refOf(url), undefined);
});
