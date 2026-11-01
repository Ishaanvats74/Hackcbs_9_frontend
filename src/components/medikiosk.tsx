"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  FolderHeart,
  Heart,
  HeartPulse,
  History as HistoryIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UsersRound,
  X,
} from "lucide-react";
import { authFetch, invalidateAuth } from "@/lib/auth-client";
import { api, ApiError, dateLabel, dateTimeLabel, label } from "@/lib/api";
import type {
  Alert,
  Consent,
  History,
  Patient,
  QueueEntry,
  Role,
  Session,
  Trace,
} from "@/lib/types";
import {
  Badge,
  Brand,
  CardTitle,
  Empty,
  Loading,
  Modal,
  Notice,
  Status,
  Step,
  TextLink,
} from "./ui";
import { Login } from "./login";
import { Interview } from "./interview";
import { Documents } from "./documents";
import { ClinicalReport } from "./report";

type View =
  "overview" | "interview" | "documents" | "history" | "report" | "agents";
const navigation = [
  { id: "overview" as View, title: "Overview", icon: LayoutDashboard },
  { id: "interview" as View, title: "Consultations", icon: MessageCircle },
  { id: "documents" as View, title: "Documents", icon: FolderHeart },
  { id: "history" as View, title: "Medical history", icon: HistoryIcon },
  { id: "report" as View, title: "Clinical report", icon: ClipboardCheck },
  { id: "agents" as View, title: "Agent activity", icon: Activity },
];
const agents = [
  {
    name: "Adaptive interview",
    id: "interview",
    text: "A conversation that listens",
    icon: MessageCircle,
  },
  {
    name: "Document intelligence",
    id: "document",
    text: "Turning records into context",
    icon: FileText,
  },
  {
    name: "Patient memory",
    id: "memory",
    text: "Connecting the patient story",
    icon: HistoryIcon,
  },
  {
    name: "History reconciliation",
    id: "contradiction",
    text: "Clarifying the missing pieces",
    icon: CheckCheck,
  },
  {
    name: "Safety & triage",
    id: "safety",
    text: "Keeping clinicians informed",
    icon: ShieldCheck,
  },
  {
    name: "Doctor handoff",
    id: "handoff",
    text: "Bringing the evidence together",
    icon: Stethoscope,
  },
];

export function MediKiosk() {
  const [authReady, setAuthReady] = useState(false);
  const [role, setRole] = useState<Role | null>(null);
  const currentRole = useRef(role);
  currentRole.current = role;
  const [view, setView] = useState<View>("overview");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [history, setHistory] = useState<History | null>(null);
  const [selected, setSelected] = useState<Session | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historySearching, setHistorySearching] = useState(false);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const historySearchVersion = useRef(0);
  const [searchResults, setSearchResults] = useState<History | null>(null);

  const reset = useCallback(() => {
    currentRole.current = null;
    setRole(null);
    setPatient(null);
    setQueue([]);
    setHistory(null);
    setSelected(null);
    setTraces([]);
    setView("overview");
    setError("");
    setToast("");
    setBusy(false);
    setConnected(false);
    setShowNew(false);
    setShowProfile(false);
    setShowHelp(false);
    setMobile(false);
    setAlertsOpen(false);
    setSearch("");
    setFilter("all");
    setHistoryQuery("");
    historySearchVersion.current++;
    setHistorySearching(false);
    setSubmittedQuery("");
    setSearchResults(null);
  }, []);
  useEffect(() => {
    const restore = () => {
      setAuthReady(false);
      authFetch("/api/auth/session", { cache: "no-store" })
        .then(async (r) => {
          if (!r.ok)
            throw new Error(
              "Unable to restore your session. Please sign in again.",
            );
          const data = await r.json();
          setRole(data.role ?? null);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => setAuthReady(true));
    };
    const changed = (e: StorageEvent) => {
      if (e.key === "medikiosk:auth-change") invalidateAuth(false);
    };
    const shown = (e: PageTransitionEvent) => {
      if (e.persisted) {
        invalidateAuth(false);
        restore();
      }
    };
    window.addEventListener("medikiosk:auth-reset", reset);
    window.addEventListener("storage", changed);
    window.addEventListener("pageshow", shown);
    restore();
    return () => {
      window.removeEventListener("medikiosk:auth-reset", reset);
      window.removeEventListener("storage", changed);
      window.removeEventListener("pageshow", shown);
    };
  }, [reset]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const fail = useCallback((e: unknown) => {
    if ((e as Error).name === "AbortError") return;
    if (e instanceof ApiError && e.status === 401) invalidateAuth();
    setError((e as Error).message);
  }, []);
  const loadWorkspace = useCallback(async () => {
    if (!role) return;
    try {
      if (role === "patient") {
        const profile = await api.me();
        if (currentRole.current !== role) return;
        setPatient(profile);
        const data = await api.history(profile.id);
        if (currentRole.current !== role) return;
        setHistory(data);
        setSelected(
          (old) =>
            old ??
            [...data.sessions].reverse().find((s) => s.status === "active") ??
            null,
        );
      } else {
        const data = await api.queue();
        if (currentRole.current !== role) return;
        setQueue([...data.items].reverse());
      }
      setConnected(true);
    } catch (e) {
      if (currentRole.current !== role) return;
      setConnected(false);
      if (e instanceof ApiError && e.status === 404 && role === "patient")
        setShowProfile(true);
      else fail(e);
    }
  }, [role, fail]);
  useEffect(() => {
    if (role) {
      setBusy(true);
      loadWorkspace().finally(() => setBusy(false));
      const t = setInterval(loadWorkspace, 30000);
      return () => clearInterval(t);
    }
  }, [role, loadWorkspace]);
  const selectedId = selected?.id;
  const selectedPatientId = selected?.patient_id;
  const refreshSession = useCallback(async () => {
    if (!selectedId) return;
    const current = await api.session(selectedId);
    setSelected((old) => (old?.id === current.id ? current : old));
    return current;
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId || !role) return;
    const t = setInterval(() => {
      refreshSession().catch(fail);
    }, 15000);
    return () => clearInterval(t);
  }, [selectedId, role, refreshSession, fail]);
  useEffect(() => {
    let cancelled = false;
    if (view === "agents" && selectedId)
      api
        .traces(selectedId)
        .then((data) => {
          if (!cancelled) setTraces(data);
        })
        .catch(fail);
    if (view === "history" && selectedPatientId && role !== "patient")
      api
        .history(selectedPatientId)
        .then((data) => {
          if (!cancelled) setHistory(data);
        })
        .catch(fail);
    return () => {
      cancelled = true;
    };
  }, [view, selectedId, selectedPatientId, role, fail]);
  const activePatient =
    role === "patient"
      ? patient
      : queue.find((q) => q.patient.id === selected?.patient_id)?.patient;
  const sessions =
    role === "patient"
      ? (history?.sessions ?? [])
      : queue.map((q) => q.session);
  const allAlerts = useMemo(() => {
    const alerts = [
      ...(history?.alerts ?? []),
      ...queue.flatMap((q) => q.session.alerts),
      ...(selected?.alerts ?? []),
    ];
    return [...new Map(alerts.map((a) => [a.id, a])).values()].filter(
      (a) => a.status === "open",
    );
  }, [history, queue, selected]);
  const filteredQueue = queue.filter(
    (q) =>
      [
        q.patient.name,
        q.patient.id,
        q.session.id,
        q.session.status,
        label(q.session.status),
        q.session.mode,
        q.session.created_at,
        q.session.language,
        dateTimeLabel(q.session.created_at),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()) &&
      (filter === "all" ||
        (filter === "review"
          ? q.session.status === "awaiting_review"
          : q.session.status === "active")),
  );

  async function selectSession(session: Session, nextView: View = "interview") {
    setSelected(session);
    historySearchVersion.current++;
    setHistorySearching(false);
    setSubmittedQuery("");
    setSearchResults(null);
    setHistory(role === "patient" ? history : null);
    setView(nextView);
    setError("");
    setMobile(false);
    try {
      const loaded = await api.session(session.id);
      setSelected((old) => (old?.id === loaded.id ? loaded : old));
    } catch (e) {
      fail(e);
    }
  }
  function navigate(nextView: View) {
    setView(nextView);
    setMobile(false);
    setError("");
    if (
      !selected &&
      role !== "patient" &&
      nextView !== "overview" &&
      queue.length
    )
      selectSession(queue[0].session, nextView);
  }
  async function logout() {
    invalidateAuth();
    window.history.replaceState(null, "", "/");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok)
        throw new Error(
          "Logout could not clear the session cookie. Retry Logout before leaving this shared device.",
        );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function acknowledge(alert: Alert) {
    const session =
      queue.find((q) => q.session.alerts.some((a) => a.id === alert.id))
        ?.session ?? selected;
    if (!session) return;
    try {
      await api.acknowledge(session.id, alert.id);
      await loadWorkspace();
      if (selected) await refreshSession();
      setToast(
        "Safety alert acknowledged. The action is recorded in the audit trail.",
      );
    } catch (e) {
      fail(e);
    }
  }
  async function searchHistory(e: React.FormEvent) {
    e.preventDefault();
    if (!activePatient) return;
    const query = historyQuery.trim();
    const version = ++historySearchVersion.current;
    setHistorySearching(true);
    setError("");
    try {
      const result = await api.history(activePatient.id, query);
      if (version !== historySearchVersion.current) return;
      setSearchResults(result);
      setSubmittedQuery(query);
    } catch (e) {
      if (version === historySearchVersion.current) fail(e);
    } finally {
      if (version === historySearchVersion.current) setHistorySearching(false);
    }
  }
  const displayedHistory = searchResults ?? history;

  if (!authReady)
    return (
      <div className="initial-loading">
        <Brand />
        <Loading />
      </div>
    );
  if (!role)
    return (
      <Login
        notice={error}
        onLogout={logout}
        onLogin={(r) => {
          invalidateAuth();
          setRole(r);
          setError("");
        }}
      />
    );
  const staff = role !== "patient";
  const title = navigation.find((n) => n.id === view)?.title;
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="mobile-close icon-button"
            aria-label="Close menu"
            onClick={() => setMobile(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-selector">
          <span className="workspace-icon">
            <Heart size={18} />
          </span>
          <div>
            <strong>
              {staff ? "Clinical workspace" : "My care workspace"}
            </strong>
            <small>
              {staff ? "Care team · Demo clinic" : "Your history. Your care."}
            </small>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={view === item.id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} />
              <span>
                {item.id === "interview" && !staff
                  ? "My interview"
                  : item.title}
              </span>
              {item.id === "interview" && staff && (
                <span className="nav-count">
                  {
                    queue.filter((q) => q.session.status === "awaiting_review")
                      .length
                  }
                </span>
              )}
              {item.id === "agents" && <span className="nav-ai">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="care-note">
            <span className="care-note-icon">
              <ShieldCheck size={23} />
            </span>
            <strong>Assistance, with oversight.</strong>
            <p>Every clinical story stays in the hands of your care team.</p>
            <button onClick={() => setShowHelp(true)}>
              How MediKiosk works
              <ArrowUpRight size={13} />
            </button>
          </div>
          <button className="nav-item" onClick={() => setShowHelp(true)}>
            <CircleHelp size={19} />
            Help & information
          </button>
          <div className="sidebar-profile">
            <span className="avatar avatar-green">
              {role === "doctor"
                ? "DR"
                : role === "triage"
                  ? "TR"
                  : (patient?.name[0] ?? "PT")}
            </span>
            <div>
              <strong>
                {role === "doctor"
                  ? "Doctor workspace"
                  : role === "triage"
                    ? "Triage staff"
                    : (patient?.name ?? "Patient")}
              </strong>
              <small>{label(role)} account</small>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-overlay" onClick={() => setMobile(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <button className="button secondary small" onClick={logout}>
              <LogOut size={16} /> Logout
            </button>
            <span className="connection">
              <i className={connected ? "live-dot" : "offline-dot"} />
              {connected ? "Backend connected" : "Connecting…"}
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button notification-button"
              aria-label={`Notifications, ${allAlerts.length} open alerts`}
              onClick={() => setAlertsOpen(!alertsOpen)}
            >
              <Bell size={19} />
              {allAlerts.length > 0 && <i />}
            </button>
            <span className="avatar avatar-small">
              {role === "doctor" ? "DR" : role === "triage" ? "TR" : "PT"}
            </span>
          </div>
        </header>
        <main className="workspace-main">
          {error && (
            <div className="error-banner">
              <Notice tone="red">{error}</Notice>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {view === "overview" ? (
            <>
              <div className="page-title-row">
                <div>
                  <span className="eyebrow">YOUR CONNECTED CARE WORKSPACE</span>
                  <h1>
                    {staff
                      ? "A little more clarity. A lot more care."
                      : `Welcome back${patient ? `, ${patient.name.split(" ")[0]}` : ""}.`}
                  </h1>
                  <p>
                    {staff
                      ? "Patient stories, meaningful details, and your next conversation. All together."
                      : "Let’s bring your health story together, one conversation at a time."}
                  </p>
                </div>
                <div className="title-actions">
                  <button
                    className="button secondary icon-only"
                    aria-label="Refresh workspace"
                    onClick={() => {
                      setBusy(true);
                      loadWorkspace().finally(() => setBusy(false));
                    }}
                  >
                    <RefreshCw size={17} className={busy ? "spin" : ""} />
                  </button>
                  {!staff && (
                    <button
                      className="button primary"
                      onClick={() => setShowNew(true)}
                    >
                      <Plus size={17} />
                      New interview
                    </button>
                  )}
                  <span className="date-chip">
                    <Clock3 size={15} />
                    {new Date().toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <section className="overview-hero">
                <div className="hero-content">
                  <Badge tone="green">
                    <Sparkles size={13} /> A MORE COMPLETE PICTURE
                  </Badge>
                  <h2>
                    Behind every record,
                    <br />
                    there’s a <em>human story.</em>
                  </h2>
                  <p>
                    Listen in their language. Connect the details.
                    <br />
                    Start every consultation one step closer.
                  </p>
                  <button
                    className="button dark"
                    onClick={() =>
                      staff
                        ? navigate("interview")
                        : selected?.status === "active"
                          ? navigate("interview")
                          : setShowNew(true)
                    }
                  >
                    {staff
                      ? "Open consultations"
                      : selected?.status === "active"
                        ? "Continue my interview"
                        : "Start my health story"}
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="hero-visual" aria-hidden="true">
                  <div className="hero-circle circle-large" />
                  <div className="hero-circle circle-small" />
                  <svg className="hero-pulse" viewBox="0 0 400 170" fill="none">
                    <path
                      d="M0 90h80l25-28 27 61 40-109 45 142 29-66h154"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div className="floating-card floating-top">
                    <span className="mini-icon mint">
                      <MessageCircle size={18} />
                    </span>
                    <div>
                      <strong>Every voice matters</strong>
                      <small>English · हिंदी · Your language</small>
                    </div>
                    <span className="small-check">
                      <Check size={12} />
                    </span>
                  </div>
                  <div className="floating-card floating-bottom">
                    <div className="floating-avatars">
                      <span>PT</span>
                      <span>
                        <Stethoscope size={15} />
                      </span>
                    </div>
                    <div>
                      <strong>Better connected care</strong>
                      <small>Patient context. Physician judgment.</small>
                    </div>
                  </div>
                  <div className="hero-cross">
                    <HeartPulse size={43} strokeWidth={1.2} />
                  </div>
                </div>
              </section>
              <section className="stats-grid">
                {[
                  {
                    title: staff ? "Patient sessions" : "Your interviews",
                    value: sessions.length,
                    text: "Connected patient histories",
                    icon: UsersRound,
                    tone: "mint",
                  },
                  {
                    title: "Ready for review",
                    value: sessions.filter(
                      (s) => s.status === "awaiting_review",
                    ).length,
                    text: "A clearer handoff to clinicians",
                    icon: FileCheck2,
                    tone: "peach",
                  },
                  {
                    title: "Conversations in progress",
                    value: sessions.filter((s) => s.status === "active").length,
                    text: "Taking the time to listen",
                    icon: MessageCircle,
                    tone: "lavender",
                  },
                  {
                    title: "Safety alerts",
                    value: allAlerts.length,
                    text: allAlerts.length
                      ? "Awaiting staff acknowledgement"
                      : "No outstanding alerts recorded",
                    icon: ShieldCheck,
                    tone: "sand",
                  },
                ].map((stat) => (
                  <article className="stat-card" key={stat.title}>
                    <div className="stat-top">
                      <span>{stat.title}</span>
                      <span className={`mini-icon ${stat.tone}`}>
                        <stat.icon size={18} />
                      </span>
                    </div>
                    <strong>{stat.value.toString().padStart(2, "0")}</strong>
                    <p>
                      <span className="stat-line" />
                      {stat.text}
                    </p>
                  </article>
                ))}
              </section>
              <div className="overview-columns">
                <section className="card queue-card">
                  <CardTitle
                    title={
                      staff
                        ? "Your next conversations"
                        : "Your health conversations"
                    }
                    subtitle={
                      staff
                        ? "The context you need, before the consultation."
                        : "Pick up where you left off, or review a past interview."
                    }
                    action={
                      <TextLink onClick={() => navigate("interview")}>
                        View all
                      </TextLink>
                    }
                  />
                  {staff ? (
                    <>
                      <div className="queue-toolbar">
                        <div className="segmented">
                          {[
                            { value: "all", name: "All patients" },
                            { value: "review", name: "Ready for review" },
                            { value: "active", name: "In progress" },
                          ].map((f) => (
                            <button
                              key={f.value}
                              className={filter === f.value ? "selected" : ""}
                              onClick={() => setFilter(f.value)}
                            >
                              {f.name}
                            </button>
                          ))}
                        </div>
                        <div className="small-search">
                          <Search size={15} />
                          <input
                            placeholder="Find a patient…"
                            aria-label="Search patients"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                          />
                        </div>
                      </div>
                      <PatientTable
                        items={filteredQueue.slice(0, 6)}
                        onSelect={(s) =>
                          selectSession(
                            s,
                            s.status === "active" ? "interview" : "report",
                          )
                        }
                      />
                    </>
                  ) : (
                    <div className="patient-sessions">
                      {sessions.length ? (
                        [...sessions]
                          .reverse()
                          .slice(0, 4)
                          .map((s) => (
                            <button
                              className="patient-session"
                              key={s.id}
                              onClick={() =>
                                selectSession(
                                  s,
                                  s.status === "active"
                                    ? "interview"
                                    : "report",
                                )
                              }
                            >
                              <span className="mini-icon mint">
                                <MessageCircle size={20} />
                              </span>
                              <div>
                                <strong>
                                  {s.mode === "ayush"
                                    ? "AYUSH health history"
                                    : "General health interview"}
                                </strong>
                                <small>
                                  {dateTimeLabel(s.created_at)} ·{" "}
                                  {s.language === "hi" ? "हिंदी" : "English"}
                                </small>
                              </div>
                              <Status value={s.status} />
                              <ChevronRight size={16} />
                            </button>
                          ))
                      ) : (
                        <Empty
                          title="Your story starts here"
                          text="Begin a guided conversation about your health."
                          action={
                            <button
                              className="button primary"
                              onClick={() => setShowNew(true)}
                            >
                              Start an interview
                              <ArrowRight size={16} />
                            </button>
                          }
                        />
                      )}
                    </div>
                  )}
                </section>
                <section className="card journey-card">
                  <CardTitle
                    title={
                      staff
                        ? "Thoughtful by design"
                        : "Your path to better care"
                    }
                    subtitle="A connected journey, with people at its heart."
                  />
                  <div className="journey-illustration">
                    <span className="journey-heart">
                      <HeartHandshakeIcon />
                    </span>
                    <span className="journey-ring" />
                    <i className="decor-dot dot-one" />
                    <i className="decor-dot dot-two" />
                  </div>
                  <Step
                    number={1}
                    title="Listen to the patient"
                    text="A guided conversation in their language."
                    complete={Boolean(selected?.completeness.answered.length)}
                  />
                  <Step
                    number={2}
                    title="Connect the details"
                    text="Past records, clarifications, and evidence."
                    complete={Boolean(
                      selected?.handoff_status === "draft_ready",
                    )}
                  />
                  <Step
                    number={3}
                    title="Put clinicians in control"
                    text="A clear history, ready for human review."
                    complete={Boolean(selected?.handoff_status === "approved")}
                  />
                </section>
              </div>
              <section className="card agent-overview">
                <CardTitle
                  title="Six specialists. One connected story."
                  subtitle="Working together to organize history. Every decision stays with the clinician."
                  action={
                    <Badge tone="green">
                      <span className="live-dot" />
                      LANGGRAPH WORKFLOW
                    </Badge>
                  }
                />
                <div className="agent-mini-grid">
                  {agents.map((a, i) => (
                    <button key={a.id} onClick={() => navigate("agents")}>
                      <span
                        className={`mini-icon ${["mint", "peach", "lavender", "sand", "mint", "peach"][i]}`}
                      >
                        <a.icon size={19} />
                      </span>
                      <strong>{a.name}</strong>
                      <small>{a.text}</small>
                      <ArrowUpRight size={13} className="agent-mini-arrow" />
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <>
              <div className="page-title-row">
                <div>
                  <span className="eyebrow">
                    {staff ? "CLINICAL WORKSPACE" : "MY CARE WORKSPACE"}
                  </span>
                  <h1>
                    {title === "Consultations" && !staff
                      ? "Your health conversation"
                      : title}
                  </h1>
                  <p>
                    {activePatient
                      ? `${activePatient.name} · ${selected?.mode === "ayush" ? "AYUSH" : "General"} history · ${selected?.language === "hi" ? "हिंदी" : "English"}`
                      : "Select a patient session to explore their connected history."}
                  </p>
                </div>
                <div className="title-actions">
                  {selected && <Status value={selected.status} />}
                  {!staff && (
                    <button
                      className="button primary"
                      onClick={() => setShowNew(true)}
                    >
                      <Plus size={16} />
                      New interview
                    </button>
                  )}
                </div>
              </div>
              {sessions.length > 0 && (
                <div className="session-switcher">
                  <UsersRound size={17} />
                  <label htmlFor="session-select">
                    {staff ? "Patient session" : "My sessions"}
                  </label>
                  <select
                    id="session-select"
                    value={selected?.id ?? ""}
                    onChange={(e) => {
                      const entry = sessions.find(
                        (item) => item.id === e.target.value,
                      );
                      if (entry) selectSession(entry, view);
                    }}
                  >
                    <option value="" disabled>
                      Select a patient
                    </option>
                    {sessions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {queue.find((q) => q.session.id === item.id)?.patient
                          .name ?? patient?.name}{" "}
                        · {dateTimeLabel(item.created_at)} ·{" "}
                        {item.id.slice(0, 6)} · {label(item.status)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {!selected ? (
                <div className="card">
                  <Empty
                    title={
                      staff ? "Select a conversation" : "Ready when you are"
                    }
                    text={
                      staff
                        ? "Choose a patient from the queue to open their history and evidence."
                        : "Start an interview to bring your medical history together."
                    }
                    action={
                      <button
                        className="button primary"
                        onClick={() =>
                          staff ? navigate("overview") : setShowNew(true)
                        }
                      >
                        {staff ? "View patient queue" : "Start an interview"}
                        <ArrowRight size={17} />
                      </button>
                    }
                  />
                </div>
              ) : view === "interview" ? (
                <Interview
                  key={selected.id}
                  session={selected}
                  patient={activePatient ?? null}
                  role={role}
                  onSession={(s) =>
                    setSelected((old) => (old?.id === s.id ? s : old))
                  }
                  onComplete={() => {
                    setView("report");
                    loadWorkspace();
                  }}
                  onError={fail}
                />
              ) : view === "documents" ? (
                <Documents
                  key={selected.id}
                  session={selected}
                  role={role}
                  onError={fail}
                  onUpdated={() => refreshSession().catch(fail)}
                />
              ) : view === "report" ? (
                <ClinicalReport
                  key={selected.id}
                  session={selected}
                  role={role}
                  onError={fail}
                  onUpdated={() => {
                    refreshSession().catch(fail);
                    loadWorkspace();
                  }}
                  notify={setToast}
                />
              ) : view === "history" ? (
                <>
                  <section className="card">
                    <CardTitle
                      title="The patient story, over time"
                      subtitle="Chronological clinical evidence. Original sources stay connected."
                    />
                    <form className="history-search" onSubmit={searchHistory}>
                      <Search size={18} />
                      <input
                        aria-label="Search medical history"
                        placeholder="Search symptoms, medications, or past records…"
                        value={historyQuery}
                        onChange={(e) => {
                          setHistoryQuery(e.target.value);
                          if (!e.target.value.trim()) {
                            historySearchVersion.current++;
                            setHistorySearching(false);
                            setSearchResults(null);
                            setSubmittedQuery("");
                          }
                        }}
                      />
                      <button
                        className="button primary"
                        disabled={historySearching || !activePatient}
                      >
                        {historySearching ? "Searching…" : "Search history"}
                        <ArrowRight size={15} />
                      </button>
                    </form>
                    {displayedHistory && (
                      <div className="history-result-count">
                        <span>
                          {displayedHistory!.facts.length} evidence items
                        </span>
                        <Badge>{label(displayedHistory.retrieval)}</Badge>
                      </div>
                    )}
                    {historySearching ? (
                      <Loading text="Searching your history…" />
                    ) : displayedHistory?.facts.length ? (
                      <div className="timeline">
                        {[...displayedHistory!.facts].reverse().map((f) => (
                          <article className="timeline-item" key={f.id}>
                            <span className="timeline-icon">
                              <FileText size={17} />
                            </span>
                            <div>
                              <div className="timeline-meta">
                                <strong>{label(f.category)}</strong>
                                <span>
                                  {dateLabel(f.clinical_date ?? f.created_at)}
                                </span>
                                <Badge
                                  tone={
                                    f.source.kind === "patient"
                                      ? "green"
                                      : "neutral"
                                  }
                                >
                                  {label(f.source.kind)}
                                </Badge>
                              </div>
                              <p>{f.value}</p>
                              <div className="evidence-snippet">
                                “{f.source.snippet}”
                                {f.source.page && (
                                  <span> · Page {f.source.page}</span>
                                )}
                              </div>
                              <small>
                                {label(f.verification)}
                                {f.medication_status
                                  ? ` · ${label(f.medication_status)}`
                                  : ""}
                              </small>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <Empty
                        title={
                          submittedQuery ? "No results found" : "No history yet"
                        }
                        text={
                          submittedQuery
                            ? `Nothing found for “${submittedQuery}”. Try a different search.`
                            : "New interview answers and processed documents will appear here."
                        }
                      />
                    )}
                  </section>
                </>
              ) : (
                <section className="card">
                  <CardTitle
                    title="A transparent collaboration"
                    subtitle="Understandable agent actions and handoffs, with independent local provenance."
                    action={
                      <button
                        className="button secondary"
                        onClick={() =>
                          api.traces(selected.id).then(setTraces).catch(fail)
                        }
                      >
                        <RefreshCw size={15} />
                        Refresh
                      </button>
                    }
                  />
                  <div className="agent-status-grid">
                    {agents.map((a) => {
                      const entries = traces.filter((t) => t.agent === a.id);
                      return (
                        <article key={a.id}>
                          <span className="mini-icon mint">
                            <a.icon size={20} />
                          </span>
                          <strong>{a.name}</strong>
                          <small>
                            {entries.length
                              ? `${entries.length} recorded actions`
                              : "No recorded actions yet"}
                          </small>
                          {entries.length > 0 && (
                            <Badge tone="green">Recorded</Badge>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  {traces.length ? (
                    <div className="trace-list">
                      {[...traces].reverse().map((t) => (
                        <article key={t.id}>
                          <span className="trace-dot" />
                          <div>
                            <div className="trace-heading">
                              <strong>{t.action}</strong>
                              <time>
                                {new Date(t.created_at).toLocaleTimeString(
                                  "en-IN",
                                  { hour: "2-digit", minute: "2-digit" },
                                )}
                              </time>
                            </div>
                            <div className="trace-tags">
                              <Badge>{label(t.agent)}</Badge>
                              <Badge
                                tone={
                                  t.meko_status === "connected"
                                    ? "green"
                                    : "neutral"
                                }
                              >
                                Meko: {label(t.meko_status)}
                              </Badge>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="The story is still beginning"
                      text="Agent activity appears after messages, document processing, and report generation."
                    />
                  )}
                </section>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>
              <ShieldCheck size={13} />
              Designed to support clinical judgment. Always physician reviewed.
            </span>
            <span>
              MediKiosk <i /> Connected care, thoughtfully.
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {showNew && (
        <NewSession
          patient={patient}
          onClose={() => setShowNew(false)}
          onCreated={(s) => {
            setSelected(s);
            setView("interview");
            setShowNew(false);
            loadWorkspace();
          }}
          onError={fail}
        />
      )}
      {showProfile && (
        <NewPatient
          onClose={() => {
            if (patient) setShowProfile(false);
            else logout();
          }}
          onCreated={(p) => {
            setPatient(p);
            setShowProfile(false);
            setShowNew(true);
            loadWorkspace();
          }}
          onError={fail}
        />
      )}
      {showHelp && (
        <Modal
          title="A clearer story. A human decision."
          subtitle="How MediKiosk supports your care journey"
          onClose={() => setShowHelp(false)}
        >
          <div className="help-body">
            <p>
              MediKiosk collects patient-reported history, organizes documents,
              and brings source evidence into a physician-reviewed report.
            </p>
            <Step
              number={1}
              title="Share with consent"
              text="Patients choose a language and explicitly consent to each processing purpose."
            />
            <Step
              number={2}
              title="Connect, don’t assume"
              text="Old prescriptions do not establish current medicine use. Missing details become clarification questions."
            />
            <Step
              number={3}
              title="Review before approval"
              text="Doctors review, edit, and approve reports before FHIR export."
            />
            <Notice>
              Development demo data is synthetic. Live AI and voice require
              configured providers. This platform does not autonomously diagnose
              or prescribe.
            </Notice>
          </div>
        </Modal>
      )}
      {alertsOpen && (
        <Modal
          title="Safety notifications"
          subtitle="Persisted alerts requiring clinical attention"
          onClose={() => setAlertsOpen(false)}
        >
          {allAlerts.length ? (
            <div className="alerts-list">
              {allAlerts.map((a) => (
                <article key={a.id}>
                  <Badge tone="red">{label(a.severity)}</Badge>
                  <p>{a.message}</p>
                  {staff && (
                    <button
                      className="button secondary"
                      onClick={() => acknowledge(a)}
                    >
                      <Check size={15} />
                      Acknowledge alert
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="No open alerts recorded"
              text="Any safety alerts raised by the backend will appear here."
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function PatientTable({
  items,
  onSelect,
}: {
  items: QueueEntry[];
  onSelect: (s: Session) => void;
}) {
  return items.length ? (
    <div className="table-scroll">
      <table className="patient-table">
        <thead>
          <tr>
            <th>Patient</th>
            <th>Interview</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((q, index) => (
            <tr key={q.session.id} onClick={() => onSelect(q.session)}>
              <td>
                <span
                  className={`avatar patient-avatar avatar-tone-${index % 4}`}
                >
                  {q.patient.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <strong>{q.patient.name}</strong>
                  <small>#{q.session.id.slice(0, 8).toUpperCase()}</small>
                  <small>
                    <time dateTime={q.session.created_at}>
                      {dateTimeLabel(q.session.created_at)}
                    </time>
                  </small>
                </div>
              </td>
              <td>
                <span>
                  {q.session.mode === "ayush"
                    ? "AYUSH history"
                    : "General history"}
                </span>
                <small>
                  {q.session.language === "hi" ? "हिंदी" : "English"} ·{" "}
                  {Math.round(q.session.completeness.score)}% complete
                </small>
              </td>
              <td>
                <Status value={q.session.status} />
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={`Open ${q.patient.name}'s session`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(q.session);
                  }}
                >
                  <ArrowUpRight size={18} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="No results found"
      text="Nothing found. Try a different patient name, session ID, or filter."
    />
  );
}
function HeartHandshakeIcon() {
  return <HeartPulse size={40} strokeWidth={1.3} />;
}

function NewSession({
  patient,
  onClose,
  onCreated,
  onError,
}: {
  patient: Patient | null;
  onClose: () => void;
  onCreated: (s: Session) => void;
  onError: (e: unknown) => void;
}) {
  const [language, setLanguage] = useState(patient?.language ?? "en");
  const [mode, setMode] = useState("general");
  const [busy, setBusy] = useState(false);
  async function create() {
    if (!patient) return;
    setBusy(true);
    try {
      onCreated(await api.createSession(patient.id, language, mode));
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Let’s start with your story."
      subtitle="A few preferences to make this conversation yours."
      onClose={onClose}
    >
      <div className="modal-body">
        <label className="field-label" htmlFor="language">
          Your preferred language
        </label>
        <select
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="en">English</option>
          <option value="hi">हिंदी · Hindi</option>
        </select>
        <label className="field-label">Interview type</label>
        <div className="mode-options">
          <button
            className={mode === "general" ? "selected" : ""}
            onClick={() => setMode("general")}
          >
            <Stethoscope size={23} />
            <strong>General history</strong>
            <small>Symptoms, medications, and your health background.</small>
          </button>
          <button
            className={mode === "ayush" ? "selected" : ""}
            onClick={() => setMode("ayush")}
          >
            <Heart size={23} />
            <strong>AYUSH history</strong>
            <small>
              Include diet, lifestyle, digestion, and traditional history.
            </small>
          </button>
        </div>
        <Notice tone="green">
          You can answer by text or voice, and attach past records. A clinician
          reviews your history before making care decisions.
        </Notice>
        <button
          className="button primary full-width"
          disabled={busy || !patient}
          onClick={create}
        >
          {busy ? "Starting your interview…" : "Begin my conversation"}
          <ArrowRight size={17} />
        </button>
      </div>
    </Modal>
  );
}

function NewPatient({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: (p: Patient) => void;
  onError: (e: unknown) => void;
}) {
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState<Consent>({
    history_collection: false,
    clinician_sharing: false,
    document_processing: false,
    voice_processing: false,
    external_ai_processing: false,
    policy_version: "2026-01",
  });
  const purposes = [
    {
      key: "history_collection",
      name: "Collect my medical history",
      text: "Use my answers to organize a pre-consultation history. Required.",
    },
    {
      key: "clinician_sharing",
      name: "Share with my care team",
      text: "Allow authorized clinicians to review my history. Required.",
    },
    {
      key: "document_processing",
      name: "Process uploaded medical records",
      text: "Extract information from documents I choose to upload.",
    },
    {
      key: "voice_processing",
      name: "Use voice conversations",
      text: "Process microphone audio and transcribe my answers.",
    },
    {
      key: "external_ai_processing",
      name: "Process through the configured AI provider",
      text: "Send necessary clinical text, documents, or voice to the external AI service.",
    },
  ];
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      onCreated(await api.createPatient(name, birth, "en", consent));
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Make this space yours."
      subtitle="Create your patient profile and choose how your information is used."
      onClose={onClose}
    >
      <form className="modal-body" onSubmit={create}>
        <label className="field-label" htmlFor="patient-name">
          Full name
        </label>
        <input
          id="patient-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />
        <label className="field-label" htmlFor="birth-date">
          Date of birth
        </label>
        <input
          id="birth-date"
          type="date"
          value={birth}
          onChange={(e) => setBirth(e.target.value)}
          required
          max={new Date().toISOString().slice(0, 10)}
        />
        <div className="consent-options">
          {purposes.map((p) => (
            <label key={p.key}>
              <input
                type="checkbox"
                checked={Boolean(consent[p.key as keyof Consent])}
                onChange={(e) =>
                  setConsent({ ...consent, [p.key]: e.target.checked })
                }
              />
              <span>
                <strong>{p.name}</strong>
                <small>{p.text}</small>
              </span>
            </label>
          ))}
        </div>
        <button
          className="button primary full-width"
          disabled={
            busy || !consent.history_collection || !consent.clinician_sharing
          }
        >
          {busy ? "Creating your profile…" : "Create profile & continue"}
          <ArrowRight size={17} />
        </button>
      </form>
    </Modal>
  );
}
