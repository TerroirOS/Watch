export type Severity = "low" | "medium" | "high";

export interface CaseRecord {
  id: string;
  title: string;
  description: string | null;
  ai_summary: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRecord {
  id: string;
  case_id: string;
  filename: string;
  file_url: string;
  file_type: string | null;
  extracted_text: string | null;
  created_at: string;
}

export interface ExtractedClaimRecord {
  id: string;
  case_id: string;
  document_id: string | null;
  claim_type: string;
  claim_value: string;
  confidence_score: number;
  created_at: string;
}

export interface DiscrepancyRecord {
  id: string;
  case_id: string;
  title: string;
  plain_language_summary: string;
  severity: Severity;
  created_at: string;
}

export interface CaseListItem {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  created_at: string;
  document_count: number;
  discrepancy_count: number;
  highest_severity: Severity | null;
}
