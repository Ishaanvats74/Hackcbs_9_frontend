export type Role = "patient" | "doctor" | "triage";
export type Patient = {
  id: string;
  name: string;
  birth_date: string;
  language: string;
  created_at: string;
};
export type Alert = {
  id: string;
  severity: string;
  message: string;
  status: string;
  rule_id: string;
  acknowledged_by?: string;
};
export type Completeness = {
  score: number;
  answered: string[];
  missing: string[];
  clinician_required: string[];
};
export type Session = {
  ai_mode?: string;
  id: string;
  patient_id: string;
  language: string;
  mode: string;
  status: string;
  current_question: string;
  current_field: string;
  completeness: Completeness;
  alerts: Alert[];
  pending_clarifications: string[];
  handoff_status: string;
  created_at: string;
};
export type Message = {
  client_message_id?: string;
  processing_status?: string;
  id: string;
  role: string;
  text: string;
  created_at: string;
};
export type Fact = {
  id: string;
  category: string;
  value: string;
  clinical_date?: string;
  created_at: string;
  medication_status?: string;
  verification: string;
  confidence: number;
  source: {
    kind: string;
    reference_id: string;
    snippet: string;
    page?: number;
    extractor: string;
  };
};
export type MedicalDocument = {
  id: string;
  media_type: string;
  status: string;
  attempts: number;
  created_at: string;
  facts: Fact[];
  uncertain: boolean;
  notes: string;
  error?: string;
  content_base64?: string;
};
export type Contradiction = {
  id: string;
  question: string;
  fact_ids: string[];
  status: string;
  resolution_history: { at: string; message_id: string; status: string }[];
};
export type Statement = { section: string; text: string; fact_ids: string[] };
export type Report = {
  id: string;
  status: string;
  version: number;
  language: string;
  created_at: string;
  statements: Statement[];
  evidence: Fact[];
  alerts: Alert[];
  unresolved: Contradiction[];
  unanswered: string[];
  clinician_required: string[];
  approved_by?: string;
  approved_at?: string;
  review_history: { by: string; command: string; at: string; note: string }[];
};
export type Trace = {
  id: string;
  agent: string;
  action: string;
  created_at: string;
  metadata: Record<string, unknown>;
  meko_status: string;
};
export type History = {
  facts: Fact[];
  sessions: Session[];
  alerts: Alert[];
  retrieval: string;
};
export type QueueEntry = { patient: Patient; session: Session };
export type Turn = {
  message_id: string;
  next_question: string;
  choices: string[];
  completeness: Completeness;
  alerts: Alert[];
  pending_clarifications: string[];
  status: string;
};
export type Consent = {
  history_collection: boolean;
  document_processing: boolean;
  external_ai_processing: boolean;
  voice_processing: boolean;
  clinician_sharing: boolean;
  policy_version: string;
};
