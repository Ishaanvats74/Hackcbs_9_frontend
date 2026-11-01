import { authFetch } from "./auth-client";
import type {
  Consent,
  Contradiction,
  History,
  MedicalDocument,
  Message,
  Patient,
  QueueEntry,
  Report,
  Role,
  Session,
  Statement,
  Trace,
  Turn,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const response = await authFetch(`/api/backend${path}`, {
    ...options,
    headers,
    cache: "no-store",
    timeoutMs: path.endsWith("/message") ? 55000 : 30000,
  }).catch((error) => {
    if (error.name === "TimeoutError")
      throw new ApiError(
        504,
        path.endsWith("/message")
          ? "The answer took too long to process. Use Retry saved answer to continue without sending it twice."
          : "The service took too long to respond. Please try again.",
      );
    throw error;
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error =
      data.error?.message ??
      data.detail ??
      data.error?.details?.[0]?.message ??
      "The request could not be completed. Please try again.";
    throw new ApiError(
      response.status,
      typeof error === "string"
        ? error
        : (error.message ??
            "Processing interrupted. Your answer was saved; retry to continue."),
    );
  }
  return data as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ role: Role }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<Patient>("/patients/me"),
  patient: (id: string) => request<Patient>(`/patients/${id}`),
  createPatient: (
    name: string,
    birth_date: string,
    language: string,
    consent: Consent,
  ) =>
    request<Patient>("/patients", {
      method: "POST",
      body: JSON.stringify({ name, birth_date, language, consent }),
    }),
  queue: () => request<{ items: QueueEntry[] }>("/patients/queue"),
  history: (id: string, query = "") =>
    request<History>(
      `/patients/${id}/history${query ? `?q=${encodeURIComponent(query)}` : ""}`,
    ),
  createSession: (patient_id: string, language: string, mode: string) =>
    request<Session>("/sessions", {
      method: "POST",
      body: JSON.stringify({ patient_id, language, mode }),
    }),
  session: (id: string) => request<Session>(`/sessions/${id}`),
  messages: (id: string, offset = 0) =>
    request<Message[]>(`/sessions/${id}/messages?limit=500&offset=${offset}`),
  message: (
    id: string,
    text: string,
    key: string,
    selected_answers: string[] = [],
  ) =>
    request<Turn>(`/sessions/${id}/message`, {
      method: "POST",
      body: JSON.stringify({ text, client_message_id: key, selected_answers }),
    }),
  documents: (id: string, content = false) =>
    request<MedicalDocument[]>(
      `/sessions/${id}/documents?include_content=${content}`,
    ),
  upload: (id: string, file: File) => {
    const data = new FormData();
    data.append("file", file);
    return request<MedicalDocument>(`/sessions/${id}/documents`, {
      method: "POST",
      body: data,
    });
  },
  contradictions: (id: string) =>
    request<Contradiction[]>(`/sessions/${id}/contradictions`),
  complete: (id: string) =>
    request<Session>(`/sessions/${id}/complete`, { method: "POST" }),
  acknowledge: (id: string, alert_id: string) =>
    request<Session>(`/sessions/${id}/complete`, {
      method: "POST",
      body: JSON.stringify({ command: "acknowledge_alert", alert_id }),
    }),
  report: (id: string) => request<Report>(`/sessions/${id}/report`),
  review: (
    id: string,
    command: "approve" | "edit" | "reject",
    expected_version: number,
    note: string,
    statements?: Statement[],
  ) =>
    request<Report>(`/sessions/${id}/report`, {
      method: "PATCH",
      body: JSON.stringify({
        command,
        expected_version,
        note,
        ...(statements ? { statements } : {}),
      }),
    }),
  fhir: (id: string) =>
    request<Record<string, unknown>>(`/sessions/${id}/report?format=fhir`),
  traces: (id: string) => request<Trace[]>(`/sessions/${id}/agents/traces`),
};

export function download(
  data: BlobPart,
  filename: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const label = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
export const dateTimeLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : date.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
};
