import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  extractDocumentText,
  normalizeDocumentFilename,
  normalizeMimeType,
} from "@/lib/document-parsing.mjs";
import { getWatchConfig } from "@/lib/env";
import { AppError, createApiErrorResponse } from "@/lib/errors";
import { processWatchCaseDocuments } from "@/lib/openai";
import {
  auditLogRepository,
  caseRepository,
  discrepancyRepository,
  documentRepository,
  extractedClaimRepository,
} from "@/lib/repositories";
import { getWatchFileStorage } from "@/lib/storage";

export async function POST(req: NextRequest) {
  let createdCaseId: string | null = null;
  let shouldCleanupCase = false;

  try {
    const watchConfig = getWatchConfig();
    const fileStorage = getWatchFileStorage();
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
        category: "validation",
      });
    }

    if (files.length > watchConfig.maxDocuments) {
      throw new AppError(
        `Too many files uploaded. Limit is ${watchConfig.maxDocuments} document(s) per case.`,
        {
          status: 400,
          code: "validation_error",
          category: "validation",
          details: {
            maxDocuments: watchConfig.maxDocuments,
            receivedDocuments: files.length,
          },
        },
      );
    }

    const seenFilenames = new Set<string>();
    const parsedDocuments: Array<
      Awaited<ReturnType<typeof extractDocumentText>> & {
        buffer: Buffer;
      }
    > = [];
    let totalUploadBytes = 0;

    for (const file of files) {
      totalUploadBytes += file.size;
      if (totalUploadBytes > watchConfig.maxCaseUploadBytes) {
        throw new AppError(
          `Combined upload size exceeds the ${watchConfig.maxCaseUploadBytes} byte per-case limit.`,
          {
            status: 413,
            code: "payload_too_large",
            category: "validation",
            details: {
              maxCaseUploadBytes: watchConfig.maxCaseUploadBytes,
              receivedBytes: totalUploadBytes,
            },
          },
        );
      }

      const normalizedFilename = normalizeDocumentFilename(file.name);
      if (!file.name.trim() || !normalizedFilename.trim()) {
        throw new AppError("Each uploaded document must include a valid filename.", {
          status: 400,
          code: "validation_error",
          category: "validation",
          details: {
            filename: file.name,
          },
        });
      }

      if (seenFilenames.has(normalizedFilename)) {
        throw new AppError(
          `Duplicate document filename detected after normalization: ${normalizedFilename}.`,
          {
            status: 400,
            code: "validation_error",
            category: "validation",
            details: {
              filename: file.name,
              normalizedFilename,
            },
          },
        );
      }

      const normalizedMimeType = normalizeMimeType(file.type);
      if (!watchConfig.allowedUploadMimeTypes.includes(normalizedMimeType)) {
        throw new AppError(
          `Unsupported file type for ${file.name}. Allowed MIME types: ${watchConfig.allowedUploadMimeTypes.join(", ")}.`,
          {
            status: 415,
            code: "unsupported_media_type",
            category: "validation",
            details: {
              filename: file.name,
              mimeType: normalizedMimeType,
              allowedMimeTypes: watchConfig.allowedUploadMimeTypes,
            },
          },
        );
      }

      if (file.size === 0) {
        throw new AppError(`${normalizedFilename} is empty. Upload a non-empty document.`, {
          status: 400,
          code: "validation_error",
          category: "validation",
          details: {
            filename: normalizedFilename,
          },
        });
      }

      if (file.size > watchConfig.maxUploadBytes) {
        throw new AppError(
          `${normalizedFilename} exceeds the ${watchConfig.maxUploadBytes} byte upload limit.`,
          {
            status: 413,
            code: "payload_too_large",
            category: "validation",
            details: {
              filename: normalizedFilename,
              maxUploadBytes: watchConfig.maxUploadBytes,
              receivedBytes: file.size,
            },
          },
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      let parsedDocument: Awaited<ReturnType<typeof extractDocumentText>>;

      try {
        parsedDocument = await extractDocumentText({
          buffer,
          mimeType: normalizedMimeType,
          filename: normalizedFilename,
        });
      } catch (error) {
        throw new AppError(`Unable to parse ${normalizedFilename}.`, {
          status: 400,
          code: "validation_error",
          category: "validation",
          details: {
            filename: normalizedFilename,
            mimeType: normalizedMimeType,
            reason: error instanceof Error ? error.message : String(error),
          },
        });
      }

      if (!parsedDocument.extractedText.trim()) {
        throw new AppError(
          `${normalizedFilename} did not contain any extractable text. Upload a searchable PDF or structured JSON file.`,
          {
            status: 400,
            code: "validation_error",
            category: "validation",
            details: {
              filename: normalizedFilename,
              mimeType: normalizedMimeType,
            },
          },
        );
      }

      parsedDocuments.push({
        ...parsedDocument,
        buffer,
      });
      seenFilenames.add(parsedDocument.filename);
    }

    const { caseId, documentIds } = await db.transaction(async (tx) => {
      const createdCase = await caseRepository.create({ title, description }, tx);
      createdCaseId = createdCase.id;
      shouldCleanupCase = true;
      const insertedDocumentIds: string[] = [];

      await auditLogRepository.create(
        {
          caseId: createdCase.id,
          eventType: "case.created",
          message: "Case created and queued for document analysis.",
          metadata: {
            title: createdCase.title,
            documentCount: parsedDocuments.length,
          },
        },
        tx,
      );

      for (const parsedDocument of parsedDocuments) {
        const storedDocument = await fileStorage.persistDocument({
          caseId: createdCase.id,
          filename: parsedDocument.filename,
          mimeType: parsedDocument.mimeType,
          buffer: parsedDocument.buffer,
        });
        const document = await documentRepository.create(
          {
            caseId: createdCase.id,
            filename: parsedDocument.filename,
            fileUrl: storedDocument.publicUrl,
            fileType: parsedDocument.mimeType,
            extractedText: parsedDocument.extractedText,
          },
          tx,
        );
        insertedDocumentIds.push(document.id);

        await auditLogRepository.create(
          {
            caseId: createdCase.id,
            eventType: "document.ingested",
            message: `Document ingested: ${parsedDocument.filename}`,
            metadata: {
              documentId: document.id,
              filename: parsedDocument.filename,
              mimeType: parsedDocument.mimeType,
            },
          },
          tx,
        );
      }

      return { caseId: createdCase.id, documentIds: insertedDocumentIds };
    });

    const aiResult = await processWatchCaseDocuments(
      parsedDocuments.map((document) => document.extractedText),
    );

    await db.transaction(async (tx) => {
      await caseRepository.updateAiSummary(caseId, aiResult.summary, tx);
      await auditLogRepository.create(
        {
          caseId,
          eventType: "analysis.completed",
          message: "AI summary and entity extraction completed.",
          metadata: {
            summaryLength: aiResult.summary.length,
            entityCount: aiResult.entities.length,
            discrepancyCount: aiResult.discrepancies.length,
          },
        },
        tx,
      );

      for (const entity of aiResult.entities) {
        await extractedClaimRepository.create(
          {
            caseId,
            documentId: documentIds[0] ?? null,
            claimType: entity.claim_type,
            claimValue: entity.claim_value,
            confidenceScore: entity.confidence,
          },
          tx,
        );
      }

      if (aiResult.entities.length > 0) {
        await auditLogRepository.create(
          {
            caseId,
            eventType: "claims.recorded",
            message: `Recorded ${aiResult.entities.length} extracted claim(s).`,
            metadata: {
              entityCount: aiResult.entities.length,
            },
          },
          tx,
        );
      }

      for (const discrepancy of aiResult.discrepancies) {
        await discrepancyRepository.create(
          {
            caseId,
            title: discrepancy.title,
            plainLanguageSummary: discrepancy.description,
            severity: discrepancy.severity,
          },
          tx,
        );
      }

      await auditLogRepository.create(
        {
          caseId,
          eventType: "discrepancies.recorded",
          message: `Recorded ${aiResult.discrepancies.length} discrepancy finding(s).`,
          metadata: {
            discrepancyCount: aiResult.discrepancies.length,
          },
        },
        tx,
      );
    });

    shouldCleanupCase = false;
    return NextResponse.json({ success: true, caseId });
  } catch (error: unknown) {
    console.error("Error processing upload:", error);

    if (shouldCleanupCase && createdCaseId) {
      try {
        const fileStorage = getWatchFileStorage();
        await fileStorage.removeCaseDocuments(createdCaseId);
        await caseRepository.deleteById(createdCaseId);
      } catch (cleanupError) {
        console.error("Error cleaning up failed upload:", cleanupError);
      }
    }

    return createApiErrorResponse(error, {
      code: "internal_error",
      message: "Failed to process files",
      status: 500,
      category: "internal",
      retryable: true,
    });
  }
}
