"use client";

import { useEffectEvent, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CheckCircle2,
  FileImage,
  FileText,
  LoaderCircle,
  Paperclip,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { api, dateLabel, download, label } from "@/lib/api";
import type { MedicalDocument, Role, Session } from "@/lib/types";
import { Badge, CardTitle, Empty, Loading, Notice, Status } from "./ui";

export function Documents({
  session,
  role,
  onError,
  onUpdated,
}: {
  session: Session;
  role: Role;
  onError: (e: unknown) => void;
  onUpdated: () => void;
}) {
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [filenames, setFilenames] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const editable = role === "patient" && session.status === "active";
  async function load() {
    try {
      const docs = await api.documents(session.id);
      setDocuments(docs);
      setSelected((old) => old ?? docs[0]?.id ?? null);
    } catch (e) {
      onError(e);
    } finally {
      setLoading(false);
    }
  }
  const loadLatest = useEffectEvent(load);
  useEffect(() => {
    loadLatest();
    const timer = setInterval(() => loadLatest(), 12000);
    return () => clearInterval(timer);
  }, [session.id]);
  async function upload(file?: File) {
    if (!file || !editable) return;
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) {
      onError(new Error("Please choose a PDF, PNG, or JPEG document."));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      onError(new Error("Please choose a document smaller than 10 MB."));
      return;
    }
    setUploading(true);
    try {
      const doc = await api.upload(session.id, file);
      setFilenames((old) => ({ ...old, [doc.id]: file.name }));
      setSelected(doc.id);
      await load();
      onUpdated();
    } catch (e) {
      onError(e);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }
  async function getOriginal(doc: MedicalDocument) {
    try {
      const records = await api.documents(session.id, true);
      const record = records.find((d) => d.id === doc.id);
      if (!record?.content_base64)
        throw new Error("The original document is not available.");
      const bytes = Uint8Array.from(atob(record.content_base64), (c) =>
        c.charCodeAt(0),
      );
      const extension =
        doc.media_type === "application/pdf"
          ? "pdf"
          : doc.media_type === "image/png"
            ? "png"
            : "jpg";
      download(
        bytes,
        filenames[doc.id] ??
          `medical-document-${doc.id.slice(0, 8)}.${extension}`,
        doc.media_type,
      );
    } catch (e) {
      onError(e);
    }
  }
  const current = documents.find((d) => d.id === selected);
  if (loading)
    return (
      <div className="card">
        <Loading text="Loading your documents…" />
      </div>
    );
  return (
    <div className="documents-layout">
      <section className="card">
        <CardTitle
          title="Medical records, connected"
          subtitle="Prescriptions, reports, and the details that matter."
        />
        <div className="documents-body">
          {editable && (
            <div
              className={`upload-zone ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                upload(e.dataTransfer.files[0]);
              }}
            >
              <span className="upload-icon">
                {uploading ? (
                  <LoaderCircle size={28} className="spin" />
                ) : (
                  <UploadCloud size={28} />
                )}
              </span>
              <h3>
                {uploading
                  ? "Saving your document…"
                  : "A fuller picture starts with your records."}
              </h3>
              <p>
                Drop a prescription or medical report here, or choose a file.
              </p>
              <input
                ref={input}
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                className="sr-only"
                aria-label="Upload medical document"
                onChange={(e) => upload(e.target.files?.[0])}
              />
              <button
                className="button primary"
                onClick={() => input.current?.click()}
                disabled={uploading}
              >
                <Paperclip size={16} />
                Choose a document
              </button>
              <small>PDF, PNG, or JPEG · Up to 10 MB · Private storage</small>
            </div>
          )}
          {documents.length ? (
            <div className="document-list">
              {documents.map((d, i) => (
                <button
                  key={d.id}
                  className={selected === d.id ? "selected" : ""}
                  onClick={() => setSelected(d.id)}
                >
                  <span
                    className={`document-icon ${d.media_type === "application/pdf" ? "peach" : "lavender"}`}
                  >
                    {d.media_type === "application/pdf" ? (
                      <FileText size={22} />
                    ) : (
                      <FileImage size={22} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {filenames[d.id] ??
                        `Medical ${d.media_type === "application/pdf" ? "report" : "image"} ${i + 1}`}
                    </strong>
                    <small>
                      {dateLabel(d.created_at)} · {d.facts.length} extracted
                      details
                    </small>
                  </div>
                  <Status value={d.status} />
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            !editable && (
              <Empty
                title="No documents in this session"
                text="Records uploaded during the interview will be available here with source evidence."
              />
            )
          )}
          <div className="document-privacy">
            <ShieldCheck size={16} />
            Files stay in private storage and are available only to authorized
            accounts.
          </div>
        </div>
      </section>
      <section className="card extraction-card">
        <CardTitle
          title="From document to evidence"
          subtitle="Readable details, with the original source attached."
        />
        {current ? (
          <div className="extraction-body">
            <div className="extraction-summary">
              <Status value={current.status} />
              <button
                className="text-link"
                onClick={() => getOriginal(current)}
              >
                Download original
                <ArrowDownToLine size={14} />
              </button>
            </div>
            {current.error && (
              <Notice tone="red">
                {current.error}. Processing attempts: {current.attempts}.
              </Notice>
            )}
            {current.status === "queued" || current.status === "processing" ? (
              <div className="processing-document">
                <LoaderCircle size={30} className="spin" />
                <h3>Connecting the details…</h3>
                <p>
                  Your document is safely stored. Extraction runs in the
                  background.
                </p>
                <small>This view updates automatically.</small>
              </div>
            ) : (
              <>
                {current.uncertain && (
                  <Notice>
                    Some details could not be read confidently. A clinician
                    should review the original.
                  </Notice>
                )}
                {current.facts.length ? (
                  current.facts.map((f) => (
                    <article className="extracted-fact" key={f.id}>
                      <div>
                        <Badge tone="green">{label(f.category)}</Badge>
                        <small>Page {f.source.page ?? "—"}</small>
                      </div>
                      <h4>{f.value}</h4>
                      <blockquote>“{f.source.snippet}”</blockquote>
                      <span>
                        <CheckCircle2 size={13} />
                        {label(f.verification)} ·{" "}
                        {Math.round(f.confidence * 100)}% extraction confidence
                      </span>
                      {f.medication_status && (
                        <p className="fact-temporal-note">
                          {label(f.medication_status)} · A previous prescription
                          does not establish current use.
                        </p>
                      )}
                    </article>
                  ))
                ) : (
                  <Empty
                    title="No readable details extracted"
                    text="Review the original record. No missing or unreadable text has been invented."
                  />
                )}
              </>
            )}
            {current.notes && (
              <p className="extraction-notes">{current.notes}</p>
            )}
          </div>
        ) : (
          <Empty
            title="The details will appear here"
            text="Choose a document to see extracted facts, confidence, and source evidence."
          />
        )}
      </section>
    </div>
  );
}
