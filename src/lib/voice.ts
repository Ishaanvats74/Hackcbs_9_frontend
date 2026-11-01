import { authFetch, registerAuthCleanup } from "./auth-client";
type Callbacks = {
  onState: (state: string) => void;
  onPartial: (text: string) => void;
  onTurn: () => Promise<void>;
  onError: (message: string) => void;
  onAlert: () => Promise<void>;
  onWarning?: (message: string) => void;
  onProvider?: (provider: string) => void;
};

export class VoiceConversation {
  private socket?: WebSocket;
  private stream?: MediaStream;
  private context?: AudioContext;
  private processor?: ScriptProcessorNode;
  private source?: MediaStreamAudioSourceNode;
  private outputs: AudioBufferSourceNode[] = [];
  private nextAudio = 0;
  private stopped = false;
  private ending = false;
  private processing = false;
  private awaitingReply = false;
  private waitingForQuestion = true;
  private heardSpeech = false;
  private lastSpeech = 0;
  private deadline?: ReturnType<typeof setTimeout>;
  private unregister?: () => void;
  constructor(
    private sessionId: string,
    private callbacks: Callbacks,
  ) {}
  async start() {
    this.unregister = registerAuthCleanup(() => this.stop());
    this.deadline = setTimeout(
      () =>
        this.fail("Voice connection timed out. Reconnect or continue by text."),
      20000,
    );
    try {
      // Resume from the button gesture, before waiting for token/provider requests.
      this.context = new AudioContext();
      await this.context.resume();
      const result = await authFetch("/api/auth/voice-token", {
        method: "POST",
        timeoutMs: 15000,
      });
      if (!result.ok)
        throw new Error(
          result.status === 401
            ? "Sign in again to start voice."
            : "The voice service is unavailable. Please retry.",
        );
      const { token, websocket_url } = await result.json();
      if (this.stopped) return;
      const base = (
        process.env.NEXT_PUBLIC_WS_URL?.trim() ||
        websocket_url ||
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.hostname}:8000`
      ).replace(/\/$/, "");
      this.socket = new WebSocket(
        `${base}/ws/sessions/${this.sessionId}/audio`,
      );
      this.socket.onopen = () =>
        this.socket?.send(JSON.stringify({ type: "auth", token }));
      this.socket.onmessage = async (event) => {
        if (this.stopped) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === "ready") {
            this.callbacks.onProvider?.(message.speech_provider ?? "cloud");
            clearTimeout(this.deadline);
            if (message.mock_audio)
              throw new Error(
                "Voice isn’t available in local mock mode. You can continue this conversation by typing.",
              );
            this.callbacks.onState("speaking");
            this.deadline = setTimeout(
              () =>
                this.fail(
                  "The opening voice question timed out. Reconnect or continue by text.",
                ),
              30000,
            );
          } else if (message.type === "partial_transcript")
            this.callbacks.onPartial(message.text);
          else if (message.type === "final_transcript") {
            this.callbacks.onPartial(message.text);
            this.processing = true;
            this.callbacks.onState("processing");
            clearTimeout(this.deadline);
            this.deadline = setTimeout(
              () =>
                this.fail(
                  "Your spoken answer is taking too long. Reopen the interview and retry the saved answer.",
                ),
              55000,
            );
          } else if (message.type === "turn") {
            this.awaitingReply = true;
            clearTimeout(this.deadline);
            this.deadline = setTimeout(
              () =>
                this.fail(
                  "The spoken reply timed out. You can read the next question in the interview.",
                ),
              20000,
            );
            await this.callbacks.onTurn();
            if (this.stopped) return;
            this.processing = false;
            if (this.ending) this.callbacks.onState("speaking");
            else {
              clearTimeout(this.deadline);
              this.callbacks.onState("listening");
            }
          } else if (message.type === "speech_complete") {
            if (this.waitingForQuestion) {
              this.waitingForQuestion = false;
              clearTimeout(this.deadline);
              const remaining = Math.max(
                0,
                this.nextAudio - (this.context?.currentTime ?? 0),
              );
              if (remaining)
                await new Promise((resolve) =>
                  setTimeout(resolve, Math.min(remaining * 1000 + 100, 60000)),
                );
              if (this.stopped) return;
              this.deadline = setTimeout(
                () =>
                  this.fail(
                    "Microphone permission is still pending. Allow microphone access in your browser, then retry.",
                  ),
                30000,
              );
              await this.microphone();
              clearTimeout(this.deadline);
            } else if (this.awaitingReply) {
              this.awaitingReply = false;
              if (this.ending) {
                clearTimeout(this.deadline);
                const remaining = Math.max(
                  0,
                  this.nextAudio - (this.context?.currentTime ?? 0),
                );
                this.deadline = setTimeout(
                  () => this.stop(),
                  Math.min(remaining * 1000 + 100, 60000),
                );
              }
            }
          } else if (message.type === "utterance_complete") {
            if (this.ending && !this.processing && !this.awaitingReply) {
              clearTimeout(this.deadline);
              const remaining = Math.max(
                0,
                this.nextAudio - (this.context?.currentTime ?? 0),
              );
              this.deadline = setTimeout(
                () => this.stop(),
                Math.min(remaining * 1000 + 100, 60000),
              );
            }
          } else if (message.type === "speech_warning") {
            this.callbacks.onWarning?.(message.message);
          } else if (message.type === "alerts") await this.callbacks.onAlert();
          else if (message.type === "interrupted") this.interruptPlayback();
          else if (message.type === "audio")
            this.play(message.data, message.sample_rate ?? 24000);
          else if (message.type === "error") {
            if (message.client_message_id) await this.callbacks.onTurn();
            throw new Error(
              message.message ??
                "Voice connection interrupted. Please continue by text.",
            );
          }
        } catch (error) {
          this.fail(error as Error);
        }
      };
      this.socket.onerror = () => {
        this.fail(
          "Unable to connect to voice. Check the voice server address or continue by text.",
        );
      };
      this.socket.onclose = (event) => {
        const intentional = this.stopped;
        this.stop();
        if (event.code !== 1000 && !intentional)
          this.callbacks.onError(
            event.code === 4401
              ? "Your voice session expired. Sign in again."
              : event.reason ||
                  "Voice disconnected. Reconnect to resume, or continue by text.",
          );
      };
    } catch (error) {
      if (this.stopped) return;
      this.fail(error as Error);
    }
  }
  private async microphone() {
    if (!navigator.mediaDevices?.getUserMedia)
      throw new Error(
        "This browser needs a secure connection to use the microphone.",
      );
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    if (this.stopped) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    this.context ??= new AudioContext();
    await this.context.resume();
    if (this.stopped) return;
    this.source = this.context.createMediaStreamSource(stream);
    // ScriptProcessor is used for broad browser support; resampling and PCM16 encoding are explicit.
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      if (
        this.socket?.readyState !== WebSocket.OPEN ||
        !this.context ||
        this.processing ||
        this.ending
      )
        return;
      const input = event.inputBuffer.getChannelData(0);
      const rms = Math.sqrt(
        input.reduce((sum, value) => sum + value * value, 0) / input.length,
      );
      if (rms > 0.012) {
        this.heardSpeech = true;
        this.lastSpeech = performance.now();
      }
      const ratio = this.context.sampleRate / 16000;
      const length = Math.floor(input.length / ratio);
      const buffer = new ArrayBuffer(length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < length; i++) {
        const from = Math.floor(i * ratio);
        const to = Math.min(input.length, Math.floor((i + 1) * ratio));
        let sum = 0;
        for (let j = from; j < to; j++) sum += input[j];
        const sample = Math.max(-1, Math.min(1, sum / Math.max(1, to - from)));
        view.setInt16(
          i * 2,
          sample < 0 ? sample * 32768 : sample * 32767,
          true,
        );
      }
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i]);
      if (this.socket.bufferedAmount < 256000)
        this.socket.send(JSON.stringify({ type: "audio", data: btoa(binary) }));
      if (this.heardSpeech && performance.now() - this.lastSpeech > 1000) {
        this.heardSpeech = false;
        this.socket.send(JSON.stringify({ type: "audio_end" }));
      }
    };
    const mute = this.context.createGain();
    mute.gain.value = 0;
    this.source.connect(this.processor);
    this.processor.connect(mute);
    mute.connect(this.context.destination);
    this.callbacks.onState("listening");
  }
  private play(encoded: string, rate: number) {
    if (!this.context) this.context = new AudioContext();
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const data = new DataView(bytes.buffer);
    const buffer = this.context.createBuffer(
      1,
      Math.floor(bytes.byteLength / 2),
      rate,
    );
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++)
      samples[i] = data.getInt16(i * 2, true) / 32768;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.nextAudio = Math.max(this.context.currentTime, this.nextAudio);
    source.start(this.nextAudio);
    this.nextAudio += buffer.duration;
    this.outputs.push(source);
    source.onended = () => {
      this.outputs = this.outputs.filter((item) => item !== source);
    };
  }
  interruptPlayback() {
    for (const source of this.outputs) {
      try {
        source.stop();
      } catch {}
    }
    this.outputs = [];
    this.nextAudio = 0;
  }
  private fail(error: string | Error) {
    if (this.stopped) return;
    this.stop();
    const message =
      typeof error === "string"
        ? error
        : error.name === "NotAllowedError"
          ? "Microphone access was denied. Allow it in your browser's site settings, then retry."
          : error.name === "NotFoundError"
            ? "No microphone was found. Connect a microphone and retry."
            : error.name === "NotReadableError"
              ? "The microphone is unavailable or being used by another application. Close it there and retry."
              : error.message;
    this.callbacks.onError(message);
  }
  finish() {
    if (this.stopped || this.ending) return;
    if (!this.stream && !this.processing) {
      this.stop();
      return;
    }
    this.ending = true;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.socket?.readyState !== WebSocket.OPEN) {
      this.stop();
      return;
    }
    this.socket.send(JSON.stringify({ type: "audio_end" }));
    this.callbacks.onState("processing");
    clearTimeout(this.deadline);
    this.deadline = setTimeout(
      () =>
        this.fail(
          "The voice service did not finish your answer. Reopen the interview to recover any saved answer, or continue by text.",
        ),
      55000,
    );
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.deadline);
    this.unregister?.();
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.interruptPlayback();
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify({ type: "close" }));
    this.socket?.close();
    this.context?.close().catch(() => {});
    this.callbacks.onState("off");
    this.callbacks.onPartial("");
  }
}
