// @ts-check

import path from "node:path";
import { PDFParse } from "pdf-parse";

/**
 * @typedef {{
 *   buffer: Buffer;
 *   mimeType: string;
 *   filename: string;
 * }} ExtractDocumentTextInput
 */

/**
 * @typedef {{
 *   filename: string;
 *   mimeType: string;
 *   extractedText: string;
 * }} ExtractDocumentTextResult
 */

/**
 * @param {string} mimeType
 * @returns {string}
 */
export function normalizeMimeType(mimeType) {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * @param {string} filename
 * @returns {string}
 */
export function normalizeDocumentFilename(filename) {
  const baseName = path.basename(filename).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-");
  const collapsedWhitespace = baseName.replace(/\s+/g, " ").trim();
  const withoutLeadingDots = collapsedWhitespace.replace(/^\.+/, "");
  return withoutLeadingDots || "document";
}

/**
 * @param {string} text
 * @returns {string}
 */
export function normalizeDocumentText(text) {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @param {unknown} value
 * @param {string[]} [prefix]
 * @returns {string[]}
 */
function flattenJsonValue(value, prefix = []) {
  if (value === null || value === undefined) {
    return prefix.length > 0 ? [`${prefix.join(".")}: null`] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flattenJsonValue(entry, [...prefix, String(index + 1)]));
  }

  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => flattenJsonValue(entry, [...prefix, key]));
  }

  return [`${prefix.join(".")}: ${String(value)}`];
}

/**
 * @param {string | Record<string, unknown> | unknown[]} jsonValue
 * @returns {string}
 */
export function jsonDocumentToText(jsonValue) {
  const parsedValue = typeof jsonValue === "string" ? JSON.parse(jsonValue) : jsonValue;
  const flattened = flattenJsonValue(parsedValue);
  return normalizeDocumentText(flattened.join("\n"));
}

/**
 * @param {ExtractDocumentTextInput} input
 * @returns {Promise<ExtractDocumentTextResult>}
 */
export async function extractDocumentText({ buffer, mimeType, filename }) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const normalizedFilename = normalizeDocumentFilename(filename);
  let extractedText = "";

  if (normalizedMimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    extractedText = result.text;
  } else if (normalizedMimeType === "application/json") {
    extractedText = jsonDocumentToText(buffer.toString("utf-8"));
  } else {
    extractedText = buffer.toString("utf-8");
  }

  return {
    filename: normalizedFilename,
    mimeType: normalizedMimeType,
    extractedText: normalizeDocumentText(extractedText),
  };
}
