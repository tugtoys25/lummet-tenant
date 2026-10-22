import { test } from "node:test";
import assert from "node:assert/strict";
import { understand, _clearPlanMemo } from "../worker/ai/understand.js";

function envWith(reply) {
  const e = { calls: 0, AI: { run: async () => { e.calls++; return { response: reply }; } } };
  return e;
}
const PLAN = '{"intent":"bonuses","search_terms":["bonus"],"casino_names":[],"country_code":null,"is_listing":false,"is_comparison":false,"tables":[]}';

test("greetings and thanks skip the model", async () => {
  _clearPlanMemo();
  const env = envWith(PLAN);
  for (const m of ["hi", "Hello!", "thanks", "Thank you.", "good morning"]) {
    const plan = await understand(env, m, []);
    assert.ok(plan.intent);
  }
  assert.equal(env.calls, 0);
});

test("a repeated first question reuses its plan; follow-ups and real questions still call the model", async () => {
  _clearPlanMemo();
  const env = envWith(PLAN);
  const a = await understand(env, "What is the best bonus?", []);
  const b = await understand(env, "  what is the BEST bonus? ", []);
  assert.equal(env.calls, 1);
  assert.deepEqual(a, b);
  assert.equal("__fromModel" in a, false);
  a.intent = "changed";
  assert.equal((await understand(env, "what is the best bonus?", [])).intent, "bonuses");

  await understand(env, "what is the best bonus?", [{ role: "user", content: "hi" }]);
  assert.equal(env.calls, 2, "with history the model is used");
  await understand(env, "which casinos accept crypto?", []);
  assert.equal(env.calls, 3);
});

test("a model failure falls back and is not remembered", async () => {
  _clearPlanMemo();
  const bad = { calls: 0, AI: { run: async () => { bad.calls++; return { response: "no json" }; } } };
  await understand(bad, "tell me about foo casino", []);
  await understand(bad, "tell me about foo casino", []);
  assert.equal(bad.calls, 2);
});
