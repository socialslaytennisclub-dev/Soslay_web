import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMatch, type Side } from "./scoring.ts";

const f6 = { sets: 1 as const, games: 6 as const, noAd: false };
const game = (s: Side): Side[] => [s, s, s, s];

test("love game dan pergantian servis", () => {
  const m = computeMatch(game("A"), f6);
  assert.deepEqual(m.sets[0], { a: 1, b: 0 });
  assert.equal(m.server, "B");
});

test("deuce, advantage, kembali deuce", () => {
  const base: Side[] = ["A", "A", "A", "B", "B", "B"];
  assert.equal(computeMatch(base, f6).situation, "Deuce");
  assert.deepEqual(computeMatch([...base, "B"], f6).point, { a: "40", b: "AD" });
  assert.deepEqual(computeMatch([...base, "B", "A"], f6).point, { a: "40", b: "40" });
});

test("break point untuk penerima servis", () => {
  assert.equal(computeMatch(["B", "B", "B"], f6).situation, "Break point");
});

test("menang 6-4 = match selesai", () => {
  const pts: Side[] = [];
  for (let i = 0; i < 4; i++) pts.push(...game("A"), ...game("B"));
  pts.push(...game("A"), ...game("A"));
  const m = computeMatch(pts, f6);
  assert.deepEqual(m.sets[0], { a: 6, b: 4 });
  assert.equal(m.winner, "A");
});

test("tiebreak di 6-6, menang 7-5", () => {
  const pts: Side[] = [];
  for (let i = 0; i < 6; i++) pts.push(...game("A"), ...game("B"));
  assert.equal(computeMatch(pts, f6).inTiebreak, true);
  for (let i = 0; i < 5; i++) pts.push("A", "B");
  pts.push("A", "A");
  const m = computeMatch(pts, f6);
  assert.equal(m.winner, "A");
  assert.deepEqual(m.sets[0].tiebreak, { a: 7, b: 5 });
});

test("no-ad: poin ke-4 langsung menang game", () => {
  const m = computeMatch(["A", "A", "A", "B", "B", "B", "B"], { sets: 1, games: 4, noAd: true });
  assert.deepEqual(m.sets[0], { a: 0, b: 1 });
});

test("best of 3 lanjut ke set kedua", () => {
  const pts: Side[] = [];
  for (let i = 0; i < 6; i++) pts.push(...game("A"));
  const m = computeMatch(pts, { sets: 3, games: 6, noAd: false });
  assert.equal(m.sets.length, 2);
  assert.equal(m.winner, null);
});
