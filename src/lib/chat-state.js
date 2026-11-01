export function stageAnswer(messages, command) {
  const found = messages.some(
    (message) => message.client_message_id === command.key,
  );
  if (found)
    return messages.map((message) =>
      message.client_message_id === command.key
        ? { ...message, processing_status: "sending" }
        : message,
    );
  return [
    ...messages,
    {
      id: `client:${command.key}`,
      client_message_id: command.key,
      role: "user",
      text: [command.text, ...command.choices].filter(Boolean).join("; "),
      created_at: new Date().toISOString(),
      processing_status: "sending",
    },
  ];
}

export function finishAnswer(messages, key, result) {
  const updated = messages.map((message) =>
    message.client_message_id === key
      ? { ...message, id: result.message_id, processing_status: "completed" }
      : message,
  );
  const id = `${result.message_id}-assistant`;
  if (updated.some((message) => message.id === id)) return updated;
  return [
    ...updated,
    {
      id,
      role: "assistant",
      text: result.next_question,
      created_at: new Date().toISOString(),
      processing_status: "completed",
    },
  ];
}
