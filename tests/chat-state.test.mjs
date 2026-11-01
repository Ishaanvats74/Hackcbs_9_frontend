import { test } from "node:test";
import assert from "node:assert/strict";
import { stageAnswer, finishAnswer } from "../src/lib/chat-state.js";

const command = { key: "same-answer", text: "Synthetic headache", choices: [] };
test("a submitted answer is immediately visible before the server responds", () => {
  const messages = stageAnswer([], command);
  assert.equal(messages[0].text, command.text);
  assert.equal(messages[0].processing_status, "sending");
  assert.equal(messages[0].client_message_id, command.key);
});
test("retrying a failed or server-saved answer never duplicates its bubble", () => {
  const pending = [
    {
      id: "server-id",
      role: "user",
      text: command.text,
      client_message_id: command.key,
      processing_status: "failed",
    },
  ];
  const messages = stageAnswer(pending, command);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, "server-id");
  assert.equal(messages[0].processing_status, "sending");
});
test("the returned question appears without waiting for another transcript request", () => {
  const result = {
    message_id: "server-id",
    next_question: "When did it start?",
  };
  const completed = finishAnswer(stageAnswer([], command), command.key, result);
  assert.equal(completed[0].processing_status, "completed");
  assert.equal(completed[0].id, result.message_id);
  assert.equal(completed[1].text, result.next_question);
  assert.equal(finishAnswer(completed, command.key, result).length, 2);
});
