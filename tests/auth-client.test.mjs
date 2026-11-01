import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authFetch,
  invalidateAuth,
  registerAuthCleanup,
} from "../src/lib/auth-client.js";

test("logout aborts requests and cleans active voice resources", async () => {
  const original = globalThis.fetch;
  let stopped = 0;
  const unregister = registerAuthCleanup(() => stopped++);
  globalThis.fetch = async (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError")),
      );
    });
  try {
    const pending = authFetch("/synthetic");
    invalidateAuth(false);
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(stopped, 1);
  } finally {
    unregister();
    globalThis.fetch = original;
  }
});

test("late responses from the previous session cannot return clinical data", async () => {
  const original = globalThis.fetch;
  let resolve;
  globalThis.fetch = () =>
    new Promise((done) => {
      resolve = done;
    });
  try {
    const pending = authFetch("/synthetic");
    invalidateAuth(false);
    resolve(new Response('{"patient":"synthetic"}'));
    await assert.rejects(pending, { name: "AbortError" });
  } finally {
    globalThis.fetch = original;
  }
});

test("provider errors retain their HTTP status for actionable UI errors", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('{"error":"try again"}', { status: 503 });
  try {
    assert.equal((await authFetch("/synthetic")).status, 503);
  } finally {
    globalThis.fetch = original;
  }
});

test("a stalled request times out instead of leaving the composer busy forever", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () =>
        reject(options.signal.reason),
      );
    });
  try {
    await Promise.all([
      assert.rejects(authFetch("/synthetic", { timeoutMs: 10 }), {
        name: "TimeoutError",
      }),
      new Promise((resolve) => setTimeout(resolve, 30)),
    ]);
  } finally {
    globalThis.fetch = original;
  }
});
