"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  HeartHandshake,
  Languages,
  LockKeyhole,
  ShieldCheck,
  Stethoscope,
  UserRound,
  UsersRound,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Role } from "@/lib/types";
import { Brand, Notice } from "./ui";

export function Login({
  onLogin,
  notice,
  onLogout,
}: {
  onLogin: (role: Role) => void;
  notice?: string;
  onLogout?: () => void;
}) {
  const [role, setRole] = useState<Role>("doctor");
  const [username, setUsername] = useState("demo.doctor");
  const [password, setPassword] = useState("Demo-only-26047!");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const roles = [
    { value: "patient" as Role, title: "Patient", icon: UserRound },
    { value: "doctor" as Role, title: "Doctor", icon: Stethoscope },
    { value: "triage" as Role, title: "Triage", icon: UsersRound },
  ];
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api.login(username, password);
      onLogin(result.role);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand light />
        <div className="login-story-copy">
          <span className="eyebrow light">
            <span className="tiny-line" /> MORE HUMAN. MORE CONNECTED.
          </span>
          <h1>
            Better care begins <br />
            with a better <br />
            <em>conversation.</em>
          </h1>
          <p>
            A little more listening. A clearer patient story.
            <br />
            More time for the care that matters.
          </p>
          <div className="story-pills">
            <span>
              <Languages size={16} />
              Multilingual by design
            </span>
            <span>
              <ShieldCheck size={16} />
              Evidence at every step
            </span>
          </div>
        </div>
        <div className="story-illustration">
          <div className="illustration-orbit orbit-one" />
          <div className="illustration-orbit orbit-two" />
          <div className="illustration-center">
            <HeartHandshake size={62} strokeWidth={1.2} />
          </div>
          <div className="illustration-note note-top">
            <span className="mini-icon mint">
              <Check size={16} />
            </span>
            <div>
              <strong>Every detail, connected</strong>
              <small>From patient voice to physician review</small>
            </div>
          </div>
          <div className="illustration-note note-bottom">
            <span className="wave-bars">
              {[12, 22, 34, 18, 38, 26, 14, 30, 20].map((h, i) => (
                <i key={i} style={{ height: h }} />
              ))}
            </span>
            <div>
              <strong>आपकी कहानी, आपकी भाषा</strong>
              <small>Your story. Your language.</small>
            </div>
          </div>
        </div>
        <div className="login-story-footer">
          <span>Designed around people.</span>
          <span>
            Built for connected care <ArrowRight size={14} />
          </span>
        </div>
      </section>
      <section className="login-form-panel">
        <span className="login-top-label">
          <span className="live-dot" /> MEDIKIOSK CLINICAL WORKSPACE
        </span>
        <div className="login-form-inner">
          <span className="welcome-icon">
            <Stethoscope size={28} />
          </span>
          <h2>Welcome to better care.</h2>
          <p className="muted">
            Your patients’ stories, all in one thoughtful workspace.
          </p>
          <div className="role-picker" aria-label="Choose a workspace">
            {roles.map((r) => (
              <button
                key={r.value}
                disabled={busy}
                className={role === r.value ? "selected" : ""}
                onClick={() => {
                  setRole(r.value);
                  setUsername(`demo.${r.value}`);
                }}
              >
                <r.icon size={19} />
                {r.title}
              </button>
            ))}
          </div>
          <form onSubmit={signIn}>
            <label className="field-label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="Your username"
            />
            <label className="field-label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {notice && (
              <Notice>
                {notice}{" "}
                <button type="button" onClick={onLogout}>
                  Retry Logout
                </button>
              </Notice>
            )}
            {error && <Notice tone="red">{error}</Notice>}
            <button className="button primary login-submit" disabled={busy}>
              {busy ? "Connecting to your workspace…" : "Enter workspace"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="demo-note">
            <span>EXPLORING MEDIKIOSK?</span>Demo accounts are prefilled with
            synthetic patient data.
            <br />
            Choose a role above to try the complete experience.
          </p>
          <div className="login-privacy">
            <LockKeyhole size={15} />
            <span>
              Your connection to the clinical backend is authenticated.
            </span>
          </div>
        </div>
        <div className="login-bottom">
          Clinical history assistance. Always reviewed by a physician.
        </div>
      </section>
    </main>
  );
}
