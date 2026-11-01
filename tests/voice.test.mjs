import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = (
  await readFile(new URL("../src/lib/voice.ts", import.meta.url), "utf8")
).replace(
  '"./auth-client"',
  JSON.stringify(new URL("../src/lib/auth-client.js", import.meta.url).href),
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const { VoiceConversation } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled).toString("base64")
);

function setup(deny = false) {
  const originals = {
    fetch,
    AudioContext: globalThis.AudioContext,
    WebSocket: globalThis.WebSocket,
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
  };
  const states = [],
    errors = [],
    sockets = [];
  let stopped = 0,
    turns = 0;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        token: "synthetic",
        websocket_url: "ws://127.0.0.1:9876",
      }),
    );
  class Socket {
    static OPEN = 1;
    readyState = 1;
    bufferedAmount = 0;
    sent = [];
    constructor(url) {
      this.url = url;
      sockets.push(this);
    }
    send(data) {
      this.sent.push(JSON.parse(data));
    }
    close() {
      this.readyState = 3;
    }
  }
  class Context {
    currentTime = 0;
    sampleRate = 48000;
    destination = {};
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createScriptProcessor() {
      return { connect() {}, disconnect() {} };
    }
    createGain() {
      return { gain: { value: 0 }, connect() {} };
    }
  }
  globalThis.WebSocket = Socket;
  globalThis.AudioContext = Context;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => {
          if (deny) throw new DOMException("Denied", "NotAllowedError");
          return {
            getTracks: () => [
              {
                stop() {
                  stopped++;
                },
              },
            ],
          };
        },
      },
    },
  });
  const voice = new VoiceConversation("synthetic-session", {
    onState: (state) => states.push(state),
    onPartial() {},
    onTurn: async () => {
      turns++;
    },
    onAlert: async () => {},
    onError: (error) => errors.push(error),
  });
  return {
    voice,
    sockets,
    states,
    errors,
    stopped: () => stopped,
    turns: () => turns,
    restore() {
      voice.stop();
      globalThis.fetch = originals.fetch;
      globalThis.AudioContext = originals.AudioContext;
      globalThis.WebSocket = originals.WebSocket;
      Object.defineProperty(globalThis, "navigator", originals.navigator);
    },
  };
}

test("stop-and-send flushes speech and waits for the saved turn before closing", async () => {
  const fixture = setup();
  try {
    await fixture.voice.start();
    const socket = fixture.sockets[0];
    assert.equal(
      socket.url,
      "ws://127.0.0.1:9876/ws/sessions/synthetic-session/audio",
    );
    await socket.onmessage({
      data: JSON.stringify({ type: "ready", mock_audio: false }),
    });
    assert.equal(fixture.states.at(-1), "speaking");
    await socket.onmessage({
      data: JSON.stringify({ type: "speech_complete" }),
    });
    assert.equal(fixture.states.at(-1), "listening");
    fixture.voice.finish();
    assert.equal(socket.sent.at(-1).type, "audio_end");
    assert.equal(socket.readyState, 1);
    assert.ok(fixture.stopped() > 0);
    await socket.onmessage({ data: JSON.stringify({ type: "turn" }) });
    assert.equal(fixture.turns(), 1);
    assert.equal(socket.readyState, 1);
    await socket.onmessage({
      data: JSON.stringify({ type: "speech_complete" }),
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(socket.readyState, 3);
    assert.equal(fixture.states.at(-1), "off");
  } finally {
    fixture.restore();
  }
});

test("microphone denial returns an actionable error and releases voice state", async () => {
  const fixture = setup(true);
  try {
    await fixture.voice.start();
    await fixture.sockets[0].onmessage({
      data: JSON.stringify({ type: "ready", mock_audio: false }),
    });
    await fixture.sockets[0].onmessage({
      data: JSON.stringify({ type: "speech_complete" }),
    });
    assert.match(fixture.errors[0], /Microphone access was denied/);
    assert.equal(fixture.states.at(-1), "off");
    assert.equal(fixture.sockets[0].readyState, 3);
  } finally {
    fixture.restore();
  }
});
