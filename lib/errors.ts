import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "validation_error"
  | "unsupported_media_type"
  | "payload_too_large"
  | "database_error"
  | "configuration_error"
  | "internal_error";

export interface ApiErrorShape {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      status: number;
      code: ApiErrorCode;
      details?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = "AppError";
    this.status = options.status;
    this.code = options.code;
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

export function normalizeApiError(
  error: unknown,
  fallback: { code: ApiErrorCode; message: string; status?: number },
): { status: number; error: ApiErrorShape } {
  if (error instanceof AppError) {
    return {
      status: error.status,
      error: {
        code: error.code,
        message: error.message,
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
        },
      };
    }

    if (isDatabaseError(error)) {
      return {
        status: 500,
        error: {
          code: "database_error",
          message: fallback.message,
        },
      };
    }

    return {
      status: fallback.status ?? 500,
      error: {
        code: fallback.code,
        message: error.message || fallback.message,
      },
    };
  }

  return {
    status: fallback.status ?? 500,
    error: {
      code: fallback.code,
      message: fallback.message,
    },
  };
}

export function createApiErrorResponse(
  error: unknown,
  fallback: { code: ApiErrorCode; message: string; status?: number },
) {
  const normalized = normalizeApiError(error, fallback);
  return NextResponse.json({ error: normalized.error }, { status: normalized.status });
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return normalizeApiError(error, {
    code: "internal_error",
    message: fallback,
    status: 500,
  }).error.message;
}
