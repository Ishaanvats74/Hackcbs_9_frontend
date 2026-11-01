"use client";

import { useEffectEvent, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  LoaderCircle,
  Pencil,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { api, ApiError, dateLabel, download, label } from "@/lib/api";
import type { Fact, Report, Role, Session, Statement } from "@/lib/types";
import { Badge, CardTitle, Empty, Loading, Modal, Notice, Status } from "./ui";

export function ClinicalReport({
  session,
  role,
  onError,
  onUpdated,
  notify,
}: {
  session: Session;
  role: Role;
  onError: (e: unknown) => void;
  onUpdated: () => void;
  notify: (s: string) => void;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<Fact | null>(null);
  const [confirmation, setConfirmation] = useState<"approve" | "reject" | null>(
    null,
  );
  async function load() {
    try {
      const data = await api.report(session.id);
      setReport(data);
      setStatements(data.statements);
      setPending(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setPending(true);
      else onError(e);
    } finally {
      setLoading(false);
    }
  }
  const loadLatest = useEffectEvent(load);
  useEffect(() => {
    loadLatest();
  }, [session.id]);
  useEffect(() => {
    if (
      !pending ||
      session.handoff_status === "failed" ||
      session.status === "active"
    )
      return;
    const t = setInterval(() => loadLatest(), 5000);
    return () => clearInterval(t);
  }, [pending, session.id, session.handoff_status, session.status]);
  async function prepare() {
    setBusy(true);
    try {
      await api.complete(session.id);
      setPending(true);
      onUpdated();
      notify(
        "Your report is being prepared. This view will update when it is ready.",
      );
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function review(command: "approve" | "edit" | "reject") {
    if (!report) return;
    setBusy(true);
    try {
      const data = await api.review(
        session.id,
        command,
        report.version,
        note,
        editing ? statements : undefined,
      );
      setReport(data);
      setStatements(data.statements);
      setEditing(false);
      setConfirmation(null);
      setNote("");
      onUpdated();
      notify(
        command === "approve"
          ? "Report approved. Physician-reviewed FHIR export is now available."
          : command === "edit"
            ? "Your changes are saved as a new report version."
            : "Report marked as rejected for review.",
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConfirmation(null);
        notify(
          "The report changed. Your unsaved edits are preserved. Reopen this report to review the latest version before saving.",
        );
      }
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function exportFhir() {
    setBusy(true);
    try {
      const data = await api.fhir(session.id);
      download(
        JSON.stringify(data, null, 2),
        `medikiosk-fhir-${session.id.slice(0, 8)}.json`,
        "application/fhir+json",
      );
      notify("FHIR R4 document exported.");
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function acknowledge(id: string) {
    setBusy(true);
    try {
      await api.acknowledge(session.id, id);
      await load();
      onUpdated();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="card">
        <Loading text="Connecting the history and evidence…" />
      </div>
    );
  if (!report)
    return (
      <div className="card">
        <Empty
          title={
            session.handoff_status === "failed"
              ? "The report needs another try"
              : pending && session.status !== "active"
                ? "Bringing the story together…"
                : "A clearer handoff starts with the history."
          }
          text={
            session.handoff_status === "failed"
              ? "The backend could not finish report generation. Your saved history is preserved."
              : pending && session.status !== "active"
                ? "The handoff agent is preparing an evidence-linked draft for physician review."
                : "Complete the interview to prepare a draft report. Missing history areas remain clearly marked."
          }
          action={
            session.status === "active" ||
            session.handoff_status === "failed" ? (
              <button
                className="button primary"
                disabled={busy || role === "triage"}
                onClick={prepare}
              >
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <ClipboardCheck size={17} />
                )}
                {session.handoff_status === "failed"
                  ? "Retry report generation"
                  : "Prepare clinical report"}
              </button>
            ) : (
              <button className="button secondary" onClick={load}>
                <RefreshCw size={16} />
                Check report status
              </button>
            )
          }
        />
      </div>
    );
  const openAlerts = report.alerts.filter((a) => a.status === "open");
  return (
    <div className="report-layout">
      <section className="card report-document">
        {session.ai_mode === "mock" && (
          <Notice>
            Mock AI · Synthetic demo report. Requires clinical review.
          </Notice>
        )}
        <div className="report-toolbar">
          <div className="report-document-title">
            <span className="mini-icon mint">
              <FileCheck2 size={21} />
            </span>
            <div>
              <h3>Clinical history summary</h3>
              <p>
                Prepared for physician review ·{" "}
                {report.language === "hi" ? "हिंदी" : "English"}
              </p>
            </div>
          </div>
          <div className="report-toolbar-actions">
            <Badge>Version {report.version}</Badge>
            <Status value={report.status} />
            {role === "doctor" && (
              <button
                className="icon-button"
                aria-label={editing ? "Cancel editing" : "Edit report"}
                onClick={() => {
                  setEditing(!editing);
                  setStatements(report.statements);
                }}
              >
                {editing ? <X size={17} /> : <Pencil size={17} />}
              </button>
            )}
          </div>
        </div>
        <div className="report-paper">
          <div className="report-paper-heading">
            <span className="eyebrow">
              MEDIKIOSK · CONNECTED CLINICAL HISTORY
            </span>
            <h2>A patient story, with evidence.</h2>
            <div>
              <span>Created {dateLabel(report.created_at)}</span>
              <span>Session #{session.id.slice(0, 8).toUpperCase()}</span>
            </div>
          </div>
          {report.status === "approved" ? (
            <div className="approved-strip">
              <CheckCircle2 size={17} />
              Physician approved on {dateLabel(report.approved_at!)} ·{" "}
              {report.approved_by}
            </div>
          ) : (
            <Notice>
              This is a {label(report.status).toLowerCase()} history report.
              Patient statements and extracted documents require clinical
              review.
            </Notice>
          )}
          {(editing ? statements : report.statements).length ? (
            (editing ? statements : report.statements).map(
              (statement, index) => (
                <article className="report-section" key={index}>
                  <h3>{label(statement.section)}</h3>
                  {editing ? (
                    <div className="statement-editor">
                      <textarea
                        aria-label={`Edit ${label(statement.section)}`}
                        value={statement.text}
                        maxLength={5000}
                        onChange={(e) =>
                          setStatements((old) =>
                            old.map((s, i) =>
                              i === index ? { ...s, text: e.target.value } : s,
                            ),
                          )
                        }
                      />
                      <button
                        className="text-link danger-text"
                        onClick={() =>
                          setStatements((old) =>
                            old.filter((_, i) => i !== index),
                          )
                        }
                      >
                        Remove statement
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <p>{statement.text}</p>
                  )}
                  <div className="citation-list">
                    {statement.fact_ids.map((id, i) => {
                      const source = report.evidence.find((f) => f.id === id);
                      return (
                        <button
                          key={id}
                          onClick={() => setEvidence(source ?? null)}
                        >
                          <FileText size={12} />
                          {source ? label(source.source.kind) : "Evidence"}
                          {source?.source.page
                            ? ` · p.${source.source.page}`
                            : ` ${i + 1}`}
                          <ArrowRight size={11} />
                        </button>
                      );
                    })}
                  </div>
                </article>
              ),
            )
          ) : (
            <Empty
              title="No statements in this report"
              text="The report preserves only available evidence. A physician can review the source record."
            />
          )}
          {report.unanswered.length > 0 && (
            <div className="report-unanswered">
              <h4>History areas still to explore</h4>
              <div>
                {report.unanswered.map((f) => (
                  <Badge key={f}>{label(f)}</Badge>
                ))}
              </div>
            </div>
          )}
          <div className="report-clinician-note">
            <StethoscopeIcon />
            <p>
              Requires a clinician:{" "}
              {report.clinician_required.map(label).join(", ")}.<br />
              This report does not establish a diagnosis or treatment plan.
            </p>
          </div>
        </div>
      </section>
      <aside className="report-review-column">
        <section className="card review-card">
          <CardTitle
            title={role === "doctor" ? "Your clinical review" : "Review status"}
            subtitle="Human judgment, at every handoff."
          />
          <div className="review-body">
            <div className="review-status">
              <span>
                <ShieldCheck size={23} />
              </span>
              <div>
                <strong>
                  {report.status === "approved"
                    ? "Reviewed & approved"
                    : "Ready for a closer look"}
                </strong>
                <p>
                  {role === "doctor"
                    ? "Review each statement and its source before approval."
                    : "The authorized physician reviews and approves this record."}
                </p>
              </div>
            </div>
            {role === "doctor" && (
              <>
                <label className="field-label" htmlFor="review-note">
                  Review note <span>(optional)</span>
                </label>
                <textarea
                  id="review-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Add context for the care team…"
                />
                {editing ? (
                  <button
                    className="button primary full-width"
                    disabled={busy}
                    onClick={() => review("edit")}
                  >
                    <Check size={16} />
                    Save new version
                  </button>
                ) : (
                  <>
                    <button
                      className="button primary full-width"
                      disabled={
                        busy ||
                        openAlerts.length > 0 ||
                        report.status === "approved"
                      }
                      onClick={() => setConfirmation("approve")}
                    >
                      <CheckCircle2 size={17} />
                      {report.status === "approved"
                        ? "Report approved"
                        : "Approve clinical report"}
                    </button>
                    <div className="review-secondary">
                      <button
                        className="button secondary"
                        onClick={() => setEditing(true)}
                        disabled={busy}
                      >
                        <Pencil size={15} />
                        Edit report
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => setConfirmation("reject")}
                        disabled={busy}
                      >
                        Reject draft
                      </button>
                    </div>
                  </>
                )}
                {openAlerts.length > 0 && (
                  <small className="review-warning">
                    Acknowledge open safety alerts before approving.
                  </small>
                )}
                <button
                  className="button secondary full-width export-button"
                  disabled={busy || report.status !== "approved" || editing}
                  onClick={exportFhir}
                >
                  <ArrowDownToLine size={16} />
                  Export FHIR R4
                </button>
              </>
            )}
            <small className="review-version-note">
              Version checks protect against concurrent edits. Any edit
              invalidates previous approval.
            </small>
          </div>
        </section>
        {report.alerts.length > 0 && (
          <section className="card report-alerts">
            <CardTitle
              title="Safety & attention"
              subtitle="Persisted alerts from the safety workflow."
            />
            <div className="review-body">
              {report.alerts.map((a) => (
                <article key={a.id}>
                  <Status value={a.status} />
                  <p>{a.message}</p>
                  {a.status === "open" && role !== "patient" && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => acknowledge(a.id)}
                    >
                      <Check size={14} />
                      Acknowledge alert
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
        {report.unresolved.length > 0 && (
          <section className="card">
            <CardTitle
              title="Clarifications to review"
              subtitle="Preserved sources. No assumptions."
            />
            <div className="review-body clarification-list">
              {report.unresolved.map((c) => (
                <article key={c.id}>
                  <Badge tone="amber">
                    {c.status === "open"
                      ? "Awaiting clarification"
                      : "Patient clarified"}
                  </Badge>
                  <p>{c.question}</p>
                  <small>{label(c.status)}</small>
                </article>
              ))}
            </div>
          </section>
        )}
        {report.review_history.length > 0 && (
          <section className="card">
            <CardTitle title="Review trail" />
            <div className="review-body review-history">
              {report.review_history.map((r, i) => (
                <div key={i}>
                  <CheckCircle2 size={15} />
                  <div>
                    <strong>
                      {label(r.command)} · {r.by}
                    </strong>
                    <small>{dateLabel(r.at)}</small>
                    {r.note && <p>{r.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </aside>
      {evidence && (
        <Modal
          title="The source behind the statement"
          subtitle="Original evidence, preserved for review"
          onClose={() => setEvidence(null)}
        >
          <div className="modal-body evidence-modal">
            <div>
              <Badge tone="green">{label(evidence.category)}</Badge>
              <Badge>{label(evidence.source.kind)}</Badge>
              {evidence.source.page && (
                <Badge>Page {evidence.source.page}</Badge>
              )}
            </div>
            <h3>{evidence.value}</h3>
            <blockquote>“{evidence.source.snippet}”</blockquote>
            <dl>
              <dt>Verification</dt>
              <dd>{label(evidence.verification)}</dd>
              <dt>Recorded</dt>
              <dd>{dateLabel(evidence.created_at)}</dd>
              <dt>Extraction confidence</dt>
              <dd>{Math.round(evidence.confidence * 100)}%</dd>
              <dt>Source reference</dt>
              <dd className="mono">{evidence.source.reference_id}</dd>
            </dl>
            <Notice>
              Source linkage establishes provenance. A physician must assess
              whether the report wording faithfully represents the evidence.
            </Notice>
          </div>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={
            confirmation === "approve"
              ? "Approve this clinical history?"
              : "Reject this draft?"
          }
          subtitle={
            confirmation === "approve"
              ? `You are reviewing version ${report.version}.`
              : "The original history and evidence remain preserved."
          }
          onClose={() => setConfirmation(null)}
        >
          <div className="modal-body">
            <p>
              {confirmation === "approve"
                ? "Confirm that you have reviewed the report, its evidence, unresolved clarifications, and outstanding history areas. Approval records your account and enables FHIR export."
                : "This records a rejected review status. You can add a review note before confirming."}
            </p>
            <button
              className="button primary full-width"
              disabled={busy}
              onClick={() => review(confirmation)}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              {confirmation === "approve"
                ? "Confirm physician approval"
                : "Confirm rejection"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function StethoscopeIcon() {
  return <ShieldCheck size={20} />;
}
