import { db, type DatabaseExecutor } from "@/lib/db";
import { DEFAULT_CASE_STATUS } from "@/lib/case-workflow";
import type {
  AuditLogRecord,
  CaseListItem,
  CaseRecord,
  DiscrepancyRecord,
  DocumentRecord,
  ExtractedClaimRecord,
  Severity,
} from "@/lib/types";

type RepositoryClient = Pick<DatabaseExecutor, "query" | "execute" | "insertReturningId">;

export interface CreateCaseInput {
  title: string;
  description: string;
  status?: string | null;
}

export interface CreateDocumentInput {
  caseId: string;
  filename: string;
  fileUrl: string;
  fileType: string | null;
  extractedText: string;
}

export interface CreateExtractedClaimInput {
  caseId: string;
  documentId: string | null;
  claimType: string;
  claimValue: string;
  confidenceScore: number;
}

export interface CreateDiscrepancyInput {
  caseId: string;
  title: string;
  plainLanguageSummary: string;
  severity: Severity;
}

export interface CreateAuditLogInput {
  caseId: string;
  eventType: string;
  actorType?: string | null;
  actorId?: string | null;
  message: string;
  metadata?: Record<string, unknown> | null;
}

export interface CaseDetailRecord {
  caseData: CaseRecord;
  documents: DocumentRecord[];
  claims: ExtractedClaimRecord[];
  discrepancies: DiscrepancyRecord[];
  auditLogs: AuditLogRecord[];
}

const DEFAULT_CLIENT: RepositoryClient = db;

const CASE_LIST_QUERY = `
  SELECT
    c.id,
    c.title,
    c.description,
    c.status,
    c.created_at,
    COUNT(DISTINCT d.id) AS document_count,
    COUNT(DISTINCT disc.id) AS discrepancy_count,
    CASE MAX(
      CASE disc.severity
        WHEN 'high' THEN 3
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 1
        ELSE 0
      END
    )
      WHEN 3 THEN 'high'
      WHEN 2 THEN 'medium'
      WHEN 1 THEN 'low'
      ELSE NULL
    END AS highest_severity
  FROM cases c
  LEFT JOIN documents d ON d.case_id = c.id
  LEFT JOIN discrepancies disc ON disc.case_id = c.id
  GROUP BY c.id
  ORDER BY c.created_at DESC
`;

const DISCREPANCY_ORDER_SQL = `
  CASE severity
    WHEN 'high' THEN 3
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 1
    ELSE 0
  END DESC,
  created_at DESC
`;

async function getCaseById(id: string, client: RepositoryClient = DEFAULT_CLIENT) {
  const result = await client.query<CaseRecord>("SELECT * FROM cases WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export const caseRepository = {
  async list(client: RepositoryClient = DEFAULT_CLIENT): Promise<CaseListItem[]> {
    const result = await client.query<CaseListItem>(CASE_LIST_QUERY);
    return result.rows;
  },

  async findById(id: string, client: RepositoryClient = DEFAULT_CLIENT): Promise<CaseRecord | null> {
    return getCaseById(id, client);
  },

  async findByTitle(
    title: string,
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<CaseRecord | null> {
    const result = await client.query<CaseRecord>(
      "SELECT * FROM cases WHERE title = $1 ORDER BY created_at ASC LIMIT 1",
      [title],
    );
    return result.rows[0] ?? null;
  },

  async create(
    input: CreateCaseInput,
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<CaseRecord> {
    const caseId = await client.insertReturningId(
      "INSERT INTO cases (title, description, status) VALUES ($1, $2, $3)",
      [input.title, input.description, input.status ?? DEFAULT_CASE_STATUS],
    );
    const createdCase = await getCaseById(caseId, client);

    if (!createdCase) {
      throw new Error(`Failed to load case ${caseId} after creation.`);
    }

    return createdCase;
  },

  async updateAiSummary(
    caseId: string,
    aiSummary: string,
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<void> {
    await client.execute(
      "UPDATE cases SET ai_summary = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [aiSummary, caseId],
    );
  },

  async updateStatus(
    caseId: string,
    status: CaseRecord["status"],
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<void> {
    await client.execute(
      "UPDATE cases SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [status ?? DEFAULT_CASE_STATUS, caseId],
    );
  },

  async deleteById(caseId: string, client: RepositoryClient = DEFAULT_CLIENT): Promise<void> {
    await client.execute("DELETE FROM cases WHERE id = $1", [caseId]);
  },

  async getDetail(
    id: string,
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<CaseDetailRecord | null> {
    const caseData = await getCaseById(id, client);

    if (!caseData) {
      return null;
    }

    const [documents, claims, discrepancies, auditLogs] = await Promise.all([
      documentRepository.listByCaseId(id, client),
      extractedClaimRepository.listByCaseId(id, client),
      discrepancyRepository.listByCaseId(id, client),
      auditLogRepository.listByCaseId(id, client),
    ]);

    return {
      caseData,
      documents,
      claims,
      discrepancies,
      auditLogs,
    };
  },
};

export const documentRepository = {
  async findByCaseIdAndFilename(
    caseId: string,
    filename: string,
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<DocumentRecord | null> {
    const result = await client.query<DocumentRecord>(
      "SELECT * FROM documents WHERE case_id = $1 AND filename = $2 ORDER BY created_at ASC LIMIT 1",
      [caseId, filename],
    );
    return result.rows[0] ?? null;
  },

  async listByCaseId(
    caseId: string,
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<DocumentRecord[]> {
    const result = await client.query<DocumentRecord>(
      "SELECT * FROM documents WHERE case_id = $1 ORDER BY created_at ASC",
      [caseId],
    );
    return result.rows;
  },

  async create(
    input: CreateDocumentInput,
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<DocumentRecord> {
    const documentId = await client.insertReturningId(
      "INSERT INTO documents (case_id, filename, file_url, file_type, extracted_text) VALUES ($1, $2, $3, $4, $5)",
      [input.caseId, input.filename, input.fileUrl, input.fileType, input.extractedText],
    );
    const result = await client.query<DocumentRecord>("SELECT * FROM documents WHERE id = $1", [documentId]);
    const createdDocument = result.rows[0];

    if (!createdDocument) {
      throw new Error(`Failed to load document ${documentId} after creation.`);
    }

    return createdDocument;
  },

  async deleteByCaseId(caseId: string, client: RepositoryClient = DEFAULT_CLIENT): Promise<void> {
    await client.execute("DELETE FROM documents WHERE case_id = $1", [caseId]);
  },
};

export const extractedClaimRepository = {
  async listByCaseId(
    caseId: string,
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<ExtractedClaimRecord[]> {
    const result = await client.query<ExtractedClaimRecord>(
      "SELECT * FROM extracted_claims WHERE case_id = $1 ORDER BY confidence_score DESC, created_at DESC",
      [caseId],
    );
    return result.rows;
  },

  async create(
    input: CreateExtractedClaimInput,
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<void> {
    await client.execute(
      "INSERT INTO extracted_claims (case_id, document_id, claim_type, claim_value, confidence_score) VALUES ($1, $2, $3, $4, $5)",
      [
        input.caseId,
        input.documentId,
        input.claimType,
        input.claimValue,
        input.confidenceScore,
      ],
    );
  },

  async deleteByCaseId(caseId: string, client: RepositoryClient = DEFAULT_CLIENT): Promise<void> {
    await client.execute("DELETE FROM extracted_claims WHERE case_id = $1", [caseId]);
  },
};

export const discrepancyRepository = {
  async listByCaseId(
    caseId: string,
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<DiscrepancyRecord[]> {
    const result = await client.query<DiscrepancyRecord>(
      `SELECT * FROM discrepancies WHERE case_id = $1 ORDER BY ${DISCREPANCY_ORDER_SQL}`,
      [caseId],
    );
    return result.rows;
  },

  async create(
    input: CreateDiscrepancyInput,
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<void> {
    await client.execute(
      "INSERT INTO discrepancies (case_id, title, plain_language_summary, severity) VALUES ($1, $2, $3, $4)",
      [input.caseId, input.title, input.plainLanguageSummary, input.severity],
    );
  },

  async deleteByCaseId(caseId: string, client: RepositoryClient = DEFAULT_CLIENT): Promise<void> {
    await client.execute("DELETE FROM discrepancies WHERE case_id = $1", [caseId]);
  },
};

export const auditLogRepository = {
  async listByCaseId(
    caseId: string,
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<AuditLogRecord[]> {
    const result = await client.query<AuditLogRecord>(
      "SELECT * FROM audit_logs WHERE case_id = $1 ORDER BY created_at DESC, id DESC",
      [caseId],
    );
    return result.rows;
  },

  async create(
    input: CreateAuditLogInput,
    client: RepositoryClient = DEFAULT_CLIENT,
  ): Promise<void> {
    await client.execute(
      "INSERT INTO audit_logs (case_id, event_type, actor_type, actor_id, message, metadata_json) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        input.caseId,
        input.eventType,
        input.actorType ?? "system",
        input.actorId ?? null,
        input.message,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    );
  },
};
