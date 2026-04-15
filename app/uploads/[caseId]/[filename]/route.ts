import { NextRequest, NextResponse } from "next/server";
import { AppError, createApiErrorResponse } from "@/lib/errors";
import { normalizeDocumentFilename } from "@/lib/document-parsing.mjs";
import { documentRepository } from "@/lib/repositories";
import { getWatchFileStorage } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ caseId: string; filename: string }> },
) {
  try {
    const { caseId, filename } = await context.params;
    const normalizedFilename = normalizeDocumentFilename(decodeURIComponent(filename));
    const document = await documentRepository.findByCaseIdAndFilename(caseId, normalizedFilename);

    if (!document) {
      throw new AppError("Document not found.", {
        status: 404,
        code: "not_found",
        category: "validation",
      });
    }

    const fileStorage = getWatchFileStorage();
    const storedDocument = await fileStorage.readDocument({
      caseId,
      filename: document.filename,
    });

    return new NextResponse(new Uint8Array(storedDocument.buffer), {
      headers: {
        "Content-Type": document.file_type ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${document.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return createApiErrorResponse(
        new AppError("Stored document file is missing.", {
          status: 404,
          code: "not_found",
          category: "storage",
        }),
        {
          code: "not_found",
          message: "Document not found",
          status: 404,
          category: "storage",
        },
      );
    }

    return createApiErrorResponse(error, {
      code: "internal_error",
      message: "Failed to load document",
      status: 500,
      category: "internal",
      retryable: true,
    });
  }
}
