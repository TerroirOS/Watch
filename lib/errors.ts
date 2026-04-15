import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "validation_error"
  | "unsupported_media_type"
  | "payload_too_large"
  | "not_found"
  | "storage_error"
  | "database_error"
  | "configuration_error"
  | "internal_error";

export type ApiErrorCategory =
  | "validation"
  | "storage"
  | "dependency"
  | "configuration"
  | "internal";

export interface ApiErrorShape {
  code: ApiErrorCode;
  message: string;
  category: ApiErrorCategory;
  requestId: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly category: ApiErrorCategory;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      status: number;
      code: ApiErrorCode;
      category?: ApiErrorCategory;
      retryable?: boolean;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = "AppError";
    this.status = options.status;
    this.code = options.code;
    this.category = options.category ?? "internal";
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

function isDatabaseError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("sqlite") ||
    message.includes("database") ||
    message.includes("no such table") ||
    message.includes("relation") ||
    message.includes("column") ||
    message.includes("constraint")
  );
}

function isConfigurationError(error: Error): boolean {
  return (
    error.message.includes("WATCH_") ||
    error.message.includes("DATABASE_URL") ||
    error.message.includes("OPENAI_API_KEY")
  );
}

function isStorageError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("uploads directory") ||
    message.includes("storage path") ||
    message.includes("enoent") ||
    message.includes("eacces")
  );
}

export function normalizeApiError(
  error: unknown,
  fallback: {
    code: ApiErrorCode;
    message: string;
    status?: number;
    category?: ApiErrorCategory;
    retryable?: boolean;
  },
): { status: number; error: ApiErrorShape } {
  const requestId = randomUUID();

  if (error instanceof AppError) {
    return {
      status: error.status,
      error: {
        code: error.code,
        message: error.message,
        category: error.category,
        requestId,
        retryable: error.retryable,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }

  if (error instanceof Error) {
    if (isConfigurationError(error)) {
      return {
        status: 500,
        error: {
          code: "configuration_error",
          message: error.message,
          category: "configuration",
          requestId,
          retryable: false,
        },
      };
    }

    if (isStorageError(error)) {
      return {
        status: 500,
        error: {
          code: "storage_error",
          message: fallback.message,
          category: "storage",
          requestId,
          retryable: true,
          details: {
            reason: error.message,
          },
        },
      };
    }

    if (isDatabaseError(error)) {
      return {
        status: 500,
        error: {
          code: "database_error",
          message: fallback.message,
          category: "dependency",
          requestId,
          retryable: true,
          details: {
            reason: error.message,
          },
        },
      };
    }

    return {
      status: fallback.status ?? 500,
      error: {
        code: fallback.code,
        message: error.message || fallback.message,
        category: fallback.category ?? "internal",
        requestId,
        retryable: fallback.retryable ?? false,
      },
    };
  }

  return {
    status: fallback.status ?? 500,
    error: {
      code: fallback.code,
      message: fallback.message,
      category: fallback.category ?? "internal",
      requestId,
      retryable: fallback.retryable ?? false,
    },
  };
}

export function createApiErrorResponse(
  error: unknown,
  fallback: {
    code: ApiErrorCode;
    message: string;
    status?: number;
    category?: ApiErrorCategory;
    retryable?: boolean;
  },
) {
  const normalized = normalizeApiError(error, fallback);
  return NextResponse.json(
    { error: normalized.error },
    {
      status: normalized.status,
      headers: {
        "x-request-id": normalized.error.requestId,
      },
    },
  );
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return normalizeApiError(error, {
    code: "internal_error",
    message: fallback,
    status: 500,
  }).error.message;
}
