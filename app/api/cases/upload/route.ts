import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractDocumentText, normalizeMimeType } from "@/lib/document-parsing.mjs";
import { getWatchConfig } from "@/lib/env";
import { AppError, createApiErrorResponse } from "@/lib/errors";
import { processWatchCaseDocuments } from "@/lib/openai";

export async function POST(req: NextRequest) {
  try {
    const watchConfig = getWatchConfig();
    const formData = await req.formData();
    const files = formData
      .getAll("documents")
      .filter((value): value is File => value instanceof File);
    const titleValue = formData.get("title");
    const descriptionValue = formData.get("description");
    const title =
      typeof titleValue === "string" && titleValue.trim()
        ? titleValue.trim()
        : "New Watch Case";
    const description = typeof descriptionValue === "string" ? descriptionValue.trim() : "";

    if (files.length === 0) {
      throw new AppError("No files uploaded", {
        status: 400,
        code: "validation_error",
      });
    }

    if (files.length > watchConfig.maxDocuments) {
      throw new AppError(
        `Too many files uploaded. Limit is ${watchConfig.maxDocuments} document(s) per case.`,
        {
          status: 400,
          code: "validation_error",
          details: {
            maxDocuments: watchConfig.maxDocuments,
            receivedDocuments: files.length,
          },
        },
      );
    }

    const parsedDocuments: Awaited<ReturnType<typeof extractDocumentText>>[] = [];

    for (const file of files) {
      const normalizedMimeType = normalizeMimeType(file.type);
      if (!watchConfig.allowedUploadMimeTypes.includes(normalizedMimeType)) {
        throw new AppError(
          `Unsupported file type for ${file.name}. Allowed MIME types: ${watchConfig.allowedUploadMimeTypes.join(", ")}.`,
          {
            status: 415,
            code: "unsupported_media_type",
            details: {
              filename: file.name,
              mimeType: normalizedMimeType,
              allowedMimeTypes: watchConfig.allowedUploadMimeTypes,
            },
          },
        );
      }

      if (file.size > watchConfig.maxUploadBytes) {
        throw new AppError(`${file.name} exceeds the ${watchConfig.maxUploadBytes} byte upload limit.`, {
          status: 413,
          code: "payload_too_large",
          details: {
            filename: file.name,
            maxUploadBytes: watchConfig.maxUploadBytes,
            receivedBytes: file.size,
          },
        });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const parsedDocument = await extractDocumentText({
        buffer,
        mimeType: normalizedMimeType,
        filename: file.name,
      });

      parsedDocuments.push(parsedDocument);
    }

    const { caseId, documentIds } = await db.transaction(async (tx) => {
      const insertedCaseId = await tx.insertReturningId(
        "INSERT INTO cases (title, description) VALUES ($1, $2)",
        [title, description],
      );
      const insertedDocumentIds: string[] = [];

      for (const parsedDocument of parsedDocuments) {
        const documentId = await tx.insertReturningId(
          "INSERT INTO documents (case_id, filename, file_url, file_type, extracted_text) VALUES ($1, $2, $3, $4, $5)",
          [
            insertedCaseId,
            parsedDocument.filename,
            `${watchConfig.uploadPublicBasePath}/${encodeURIComponent(insertedCaseId)}/${encodeURIComponent(parsedDocument.filename)}`,
            parsedDocument.mimeType,
            parsedDocument.extractedText,
          ],
        );
        insertedDocumentIds.push(documentId);
      }

      return { caseId: insertedCaseId, documentIds: insertedDocumentIds };
    });

    const aiResult = await processWatchCaseDocuments(
      parsedDocuments.map((document) => document.extractedText),
    );

    await db.transaction(async (tx) => {
      await tx.execute("UPDATE cases SET ai_summary = $1 WHERE id = $2", [
        aiResult.summary,
        caseId,
      ]);

      for (const entity of aiResult.entities) {
        await tx.execute(
          "INSERT INTO extracted_claims (case_id, document_id, claim_type, claim_value, confidence_score) VALUES ($1, $2, $3, $4, $5)",
          [
            caseId,
            documentIds[0] ?? null,
            entity.claim_type,
            entity.claim_value,
            entity.confidence,
          ],
        );
      }

      for (const discrepancy of aiResult.discrepancies) {
        await tx.execute(
          "INSERT INTO discrepancies (case_id, title, plain_language_summary, severity) VALUES ($1, $2, $3, $4)",
          [caseId, discrepancy.title, discrepancy.description, discrepancy.severity],
        );
      }
    });

    return NextResponse.json({ success: true, caseId });
  } catch (error: unknown) {
    console.error("Error processing upload:", error);
    return createApiErrorResponse(error, {
      code: "internal_error",
      message: "Failed to process files",
      status: 500,
    });
  }
}
