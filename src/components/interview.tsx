"use client";

import { useEffectEvent, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Languages,
  LoaderCircle,
  MessageCircle,
  Mic,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
} from "lucide-react";
import { api, dateLabel, label } from "@/lib/api";
import type {
  Contradiction,
  Message,
  Patient,
  Role,
  Session,
} from "@/lib/types";
import { Badge, CardTitle, Loading, Notice, Status } from "./ui";
import { VoiceConversation } from "@/lib/voice";
import { stageAnswer, finishAnswer } from "@/lib/chat-state";

export function Interview({
  session,
  patient,
  role,
  onSession,
  onComplete,
  onError,
}: {
  session: Session;
  patient: Patient | null;
  role: Role;
  onSession: (s: Session) => void;
  onComplete: () => void;
  onError: (e: unknown) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [choices, setChoices] = useState<string[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [discrepancies, setDiscrepancies] = useState<Contradiction[]>([]);
  const [voiceState, setVoiceState] = useState("off");
  const [speechProvider, setSpeechProvider] = useState<string | null>(null);
  const [partial, setPartial] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [sendError, setSendError] = useState("");
  const [slow, setSlow] = useState(false);
  const [retry, setRetry] = useState<{
    text: string;
    key: string;
    choices: string[];
  } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const chat = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  const voice = useRef<VoiceConversation | null>(null);
  const editable = role === "patient" && session.status === "active";
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [busy]);
  async function load() {
    try {
      const [transcript, contradictions] = await Promise.all([
        (async () => {
          const all: Message[] = [];
          for (;;) {
            const page = await api.messages(session.id, all.length);
            all.push(...page);
            if (page.length < 500) return all;
          }
        })(),
        api.contradictions(session.id),
      ]);
      setMessages(transcript);
      const pending = transcript.find(
        (message) => message.processing_status === "pending",
      );
      setRetry(
        pending?.client_message_id
          ? {
              text: pending.text,
              key: pending.client_message_id,
              choices: [],
            }
          : null,
      );
      setDiscrepancies(contradictions);
    } catch (e) {
      onError(e);
    } finally {
      setLoading(false);
    }
  }
  const loadLatest = useEffectEvent(load);
  useEffect(() => {
    loadLatest();
    return () => {
      voice.current?.stop();
    };
  }, [session.id]);
  useEffect(() => {
    const container = chat.current;
    if (
      container &&
      (!scrolled.current ||
        container.scrollHeight - container.scrollTop - container.clientHeight <
          240)
    )
      container.scrollTo({
        top: container.scrollHeight,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    if (container) scrolled.current = true;
  }, [messages, busy, partial]);
  const failLatest = useEffectEvent(onError);
  useEffect(() => {
    api
      .contradictions(session.id)
      .then(setDiscrepancies)
      .catch((e) => failLatest(e));
  }, [session.pending_clarifications.length, session.id]);
  async function send(e?: React.FormEvent, previous = false) {
    e?.preventDefault();
    const command =
      previous && retry
        ? retry
        : {
            text: text.trim(),
            key: crypto.randomUUID(),
            choices: selectedAnswers,
          };
    if (
      (!command.text && !command.choices.length) ||
      busy ||
      (retry && !previous)
    )
      return;
    setBusy(true);
    setSendError("");
    setRetry(command);
    setText("");
    setSelectedAnswers([]);
    scrolled.current = false;
    setMessages((old) =>
      stageAnswer(
        old.length
          ? old
          : [
              {
                id: `initial:${session.id}`,
                role: "assistant",
                text: session.current_question,
                created_at: session.created_at,
              },
            ],
        command,
      ),
    );
    try {
      const result = await api.message(
        session.id,
        command.text,
        command.key,
        command.choices,
      );
      onSession({
        ...session,
        current_question: result.next_question,
        completeness: result.completeness,
        alerts: result.alerts,
        pending_clarifications: result.pending_clarifications,
        status: result.status,
      });
      setChoices(result.choices);
      setSelectedAnswers([]);
      setText("");
      setRetry(null);
      setMessages((old) => finishAnswer(old, command.key, result));
    } catch (e) {
      if ((e as Error).name !== "AbortError")
        setSendError((e as Error).message);
      setMessages((old) =>
        old.map((message) =>
          message.client_message_id === command.key
            ? { ...message, processing_status: "failed" }
            : message,
        ),
      );
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function complete() {
    setCompleting(true);
    try {
      voice.current?.stop();
      onSession(await api.complete(session.id));
      onComplete();
    } catch (e) {
      onError(e);
    } finally {
      setCompleting(false);
    }
  }
  async function toggleVoice() {
    if (voiceState !== "off") {
      voice.current?.finish();
      return;
    }
    setVoiceError("");
    setVoiceState("connecting");
    voice.current = new VoiceConversation(session.id, {
      onState: setVoiceState,
      onProvider: setSpeechProvider,
      onWarning: setVoiceError,
      onPartial: setPartial,
      onTurn: async () => {
        setPartial("");
        onSession(await api.session(session.id));
        await load();
      },
      onError: (message) => {
        setVoiceError(message);
        setVoiceState("off");
      },
      onAlert: async () => onSession(await api.session(session.id)),
    });
    await voice.current.start();
  }
  const fields = [
    ...session.completeness.answered,
    ...session.completeness.missing,
  ];
  if (loading)
    return (
      <div className="card">
        <Loading text="Loading your conversation…" />
      </div>
    );
  return (
    <div className="interview-layout">
      <aside className="interview-context">
        <section className="card patient-context">
          <span className="avatar context-avatar">
            {patient?.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("") ?? "PT"}
          </span>
          <h3>{patient?.name ?? "Patient history"}</h3>
          <p>
            {patient
              ? `Born ${dateLabel(patient.birth_date)}`
              : "Patient-reported history"}
          </p>
          <div className="context-tags">
            <Badge tone="green">
              <Languages size={12} />
              {session.language === "hi" ? "हिंदी" : "English"}
            </Badge>
            <Badge>{session.mode === "ayush" ? "AYUSH" : "General care"}</Badge>
          </div>
          <div className="context-divider" />
          <div className="progress-label">
            <strong>History coverage</strong>
            <span>{Math.round(session.completeness.score)}%</span>
          </div>
          <div className="progress-track">
            <i style={{ width: `${session.completeness.score}%` }} />
          </div>
          <small className="progress-caption">
            Based on completed history areas, not clinical assessment.
          </small>
          <div className="history-checklist">
            {fields.map((field) => (
              <div
                key={field}
                className={
                  session.completeness.answered.includes(field) ? "done" : ""
                }
              >
                <span>
                  {session.completeness.answered.includes(field) ? (
                    <Check size={11} />
                  ) : (
                    <i />
                  )}
                </span>
                {label(field)}
              </div>
            ))}
          </div>
        </section>
        <section className="privacy-card">
          <ShieldCheck size={21} />
          <h4>Your story stays connected.</h4>
          <p>
            Answers are saved to this patient session. Clinical decisions remain
            with the care team.
          </p>
        </section>
      </aside>
      <section className="card conversation-card">
        <div className="conversation-heading">
          <span className="interviewer-avatar">
            <Sparkles size={21} />
          </span>
          <div>
            <h3>
              {role === "patient"
                ? "Your health companion"
                : "Patient interview"}
              <Badge tone="green">AI ASSISTED</Badge>
            </h3>
            <p>
              {editable
                ? "Take your time. We’re here to listen."
                : "A transparent record of the patient’s conversation."}
            </p>
          </div>
          <span className="conversation-language">
            <Languages size={15} />
            {session.language === "hi" ? "हिंदी" : "English"}
          </span>
        </div>
        {session.alerts
          .filter((a) => a.status === "open")
          .map((a) => (
            <div className="conversation-alert" key={a.id}>
              <Notice tone="red">{a.message}</Notice>
            </div>
          ))}
        {session.ai_mode === "mock" && (
          <div className="conversation-alert">
            <Notice>
              Mock AI · Synthetic demo output. Not a verified clinical finding.
            </Notice>
          </div>
        )}
        <div className="chat-messages" ref={chat}>
          <div className="chat-date">
            <span />
            {dateLabel(session.created_at)}
            <span />
          </div>
          <div className="chat-intro">
            <span>
              <HeartIcon />
            </span>
            <h3>A little context makes a difference.</h3>
            <p>
              {session.language === "hi"
                ? "अपनी भाषा में, अपने समय पर अपनी बात बताइए।"
                : "Share what feels important, in your own words."}
            </p>
            <Badge>
              <ShieldCheck size={12} />A clinician reviews your history
            </Badge>
          </div>
          {!messages.length && (
            <div className="chat-row assistant">
              <span className="chat-avatar">
                <Sparkles size={16} />
              </span>
              <div>
                <div className="chat-bubble">{session.current_question}</div>
                <small>MediKiosk · History assistant</small>
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`chat-row ${m.role === "user" ? "user" : "assistant"}`}
            >
              {m.role !== "user" && (
                <span className="chat-avatar">
                  <Sparkles size={16} />
                </span>
              )}
              <div>
                <div className="chat-bubble">{m.text}</div>
                <small>
                  {m.role === "user" ? "Patient" : "MediKiosk"} ·{" "}
                  {new Date(m.created_at).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {m.role === "user" &&
                    (m.processing_status === "sending" ? (
                      " · Awaiting response…"
                    ) : m.processing_status === "failed" ? (
                      " · Not confirmed · Retry available"
                    ) : m.processing_status === "pending" ? (
                      " · Saved · Response pending"
                    ) : (
                      <CheckCircle2 size={11} />
                    ))}
                </small>
              </div>
            </div>
          ))}
          {messages.length > 0 &&
            messages.at(-1)?.text !== session.current_question &&
            session.pending_clarifications.length > 0 && (
              <div className="chat-row assistant">
                <span className="chat-avatar">
                  <Sparkles size={16} />
                </span>
                <div>
                  <Badge tone="amber">A detail to clarify</Badge>
                  <div className="chat-bubble">{session.current_question}</div>
                </div>
              </div>
            )}
          {busy && (
            <div className="chat-row assistant">
              <span className="chat-avatar">
                <Sparkles size={16} />
              </span>
              <div
                className="chat-bubble typing"
                role="status"
                aria-live="polite"
              >
                <i />
                <i />
                <i />
                <span>
                  {slow
                    ? "AI is taking longer than usual. Your answer is still being processed…"
                    : "Preparing your next question…"}
                </span>
              </div>
            </div>
          )}
          {partial && (
            <div className="partial-transcript">
              <Mic size={15} />
              {partial}
              <span>Listening…</span>
            </div>
          )}
          <div ref={bottom} />
        </div>
        {voiceError && (
          <div className="conversation-alert">
            <Notice>{voiceError}</Notice>
          </div>
        )}
        {editable ? (
          <div className="composer-area">
            {choices.length > 0 && (
              <div className="answer-choices">
                {choices.map((choice) => (
                  <button
                    key={choice}
                    disabled={busy || !!retry || voiceState !== "off"}
                    className={
                      selectedAnswers.includes(choice) ? "selected" : ""
                    }
                    onClick={() =>
                      setSelectedAnswers((old) =>
                        old.includes(choice)
                          ? old.filter((x) => x !== choice)
                          : [...old, choice],
                      )
                    }
                  >
                    {choice}
                  </button>
                ))}
              </div>
            )}
            {sendError && <Notice tone="red">{sendError}</Notice>}
            {retry && !busy && (
              <button
                className="retry-button"
                onClick={() => send(undefined, true)}
              >
                Retry saved answer with the same message ID
                <ArrowRight size={14} />
              </button>
            )}
            <form className="chat-composer" onSubmit={send}>
              <textarea
                aria-label="Your answer"
                placeholder={
                  session.language === "hi"
                    ? "अपना जवाब यहाँ लिखिए…"
                    : "Tell us in your own words…"
                }
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={5000}
                rows={2}
                disabled={busy || !!retry || voiceState !== "off"}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <div className="composer-controls">
                <button
                  type="button"
                  className={`voice-button ${voiceState !== "off" ? "listening" : ""}`}
                  onClick={toggleVoice}
                  disabled={busy || !!retry}
                  aria-label={
                    voiceState === "off"
                      ? "Start voice conversation"
                      : "Stop voice conversation"
                  }
                >
                  {voiceState === "connecting" ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : voiceState === "off" ? (
                    <Mic size={17} />
                  ) : (
                    <Square size={14} />
                  )}
                  <span>
                    {voiceState === "off"
                      ? "Use your voice"
                      : voiceState === "connecting"
                        ? "Connecting…"
                        : voiceState === "processing"
                          ? "Processing voice…"
                          : voiceState === "speaking"
                            ? "Reading next question…"
                            : "Stop & send"}
                  </span>
                </button>
                <span className="keyboard-hint">
                  {speechProvider === "local"
                    ? "Local STT / TTS · "
                    : speechProvider === "cloud"
                      ? "Cloud speech · "
                      : ""}
                  Enter to send · Shift + Enter for a new line
                </span>
                <button
                  className="send-button"
                  disabled={
                    busy ||
                    !!retry ||
                    voiceState !== "off" ||
                    (!text.trim() && !selectedAnswers.length)
                  }
                  aria-label="Send answer"
                >
                  {busy ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>
            </form>
            <div className="composer-footer">
              <span>
                <ShieldCheck size={12} />
                Your answers are saved as you go.
              </span>
              <button
                onClick={complete}
                disabled={
                  busy ||
                  !!retry ||
                  completing ||
                  !session.completeness.answered.length
                }
              >
                {completing
                  ? "Preparing your handoff…"
                  : "Finish & prepare report"}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="conversation-completed">
            <ClipboardCheck size={21} />
            <div>
              <strong>
                {session.status === "active"
                  ? "Clinician view"
                  : "This interview is saved."}
              </strong>
              <p>
                {session.status === "active"
                  ? "Patient answers are recorded through the patient account."
                  : "Review the connected evidence and clinical report."}
              </p>
            </div>
            <button className="button secondary" onClick={onComplete}>
              View report
              <ArrowRight size={15} />
            </button>
          </div>
        )}
      </section>
      {discrepancies.length > 0 && (
        <section className="card clarification-card">
          <CardTitle
            title="Details worth clarifying"
            subtitle="Both original sources are preserved."
          />
          {discrepancies.map((c) => (
            <article key={c.id}>
              <Status value={c.status} />
              <p>{c.question}</p>
              <small>
                {c.fact_ids.length} connected source references
                {c.resolution_history.length
                  ? " · Patient clarification recorded"
                  : ""}
              </small>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
function HeartIcon() {
  return <MessageCircle size={23} strokeWidth={1.5} />;
}
