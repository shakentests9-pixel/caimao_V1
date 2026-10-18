import type { StatementFileType } from "../types";

/**
 * Upload validation. Runs before any parsing:
 *  - size limit, non-empty
 *  - type decided from the file's own bytes (magic number / text check), never from the name or MIME type alone
 *  - rejects binaries, archives, executables and encrypted or script-bearing PDFs
 */
export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PDF_PAGES = 40;
export const MAX_ROWS = 5000;

export type ValidationErrorCode =
  | "EMPTY"
  | "TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "EXTENSION_MISMATCH"
  | "NOT_TEXT"
  | "PDF_ENCRYPTED"
  | "PDF_ACTIVE_CONTENT"
  | "PDF_TOO_MANY_PAGES"
  | "NO_TRANSACTIONS"
  | "UNREADABLE";

export class StatementError extends Error {
  constructor(
    public code: ValidationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

/** Signatures of formats we refuse outright, so a renamed binary is reported clearly. */
const REJECTED_SIGNATURES: number[][] = [
  [0x50, 0x4b, 0x03, 0x04], // zip / xlsx / docx
  [0x4d, 0x5a], // windows executable
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0x1f, 0x8b], // gzip
  [0x52, 0x61, 0x72, 0x21], // rar
  [0xd0, 0xcf, 0x11, 0xe0], // legacy office
];

export function sanitiseFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "statement";
  const clean = base.replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/\s+/g, " ").trim();
  return (clean || "statement").slice(0, 120);
}

export function detectFileType(bytes: Uint8Array, fileName: string): StatementFileType {
  if (bytes.length === 0) throw new StatementError("EMPTY", "The file is empty.");
  if (bytes.length > MAX_STATEMENT_BYTES) throw new StatementError("TOO_LARGE", "The file is larger than 5 MB.");
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    // %PDF-
    if (ext && ext !== "pdf") throw new StatementError("EXTENSION_MISMATCH", "The file's contents don't match its name.");
    return "pdf";
  }
  if (REJECTED_SIGNATURES.some((s) => startsWith(bytes, s))) {
    throw new StatementError("UNSUPPORTED_TYPE", "Only CSV and PDF statements are supported.");
  }
  if (!["csv", "txt", ""].includes(ext)) throw new StatementError("UNSUPPORTED_TYPE", "Only CSV and PDF statements are supported.");
  if (!looksLikeText(bytes)) throw new StatementError("NOT_TEXT", "This doesn't look like a CSV text file.");
  return "csv";
}

/** UTF-8 text with no NUL bytes and few control characters. */
function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 64 * 1024));
  let control = 0;
  for (const b of sample) {
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) control++;
  }
  if (control / sample.length > 0.01) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample.subarray(0, trimToUtf8Boundary(sample)));
    return true;
  } catch {
    return false;
  }
}

/** Avoid failing UTF-8 validation on a multi-byte character cut by the sample window. */
function trimToUtf8Boundary(b: Uint8Array): number {
  let end = b.length;
  for (let i = 0; i < 3 && end > 0; i++) {
    const c = b[end - 1];
    if ((c & 0xc0) === 0x80) end--;
    else if ((c & 0xc0) === 0xc0) {
      end--;
      break;
    } else break;
  }
  return end;
}

/**
 * Cheap structural checks on the raw PDF bytes before pdf.js touches them:
 * encrypted PDFs, and PDFs carrying JavaScript or launch actions, are refused.
 */
export function inspectPdf(bytes: Uint8Array) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 2 * 1024 * 1024)));
  if (/\/Encrypt\b/.test(head)) throw new StatementError("PDF_ENCRYPTED", "This PDF is password-protected. Download an unprotected copy from your bank.");
  if (/\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia)\b/.test(head)) {
    throw new StatementError("PDF_ACTIVE_CONTENT", "This PDF contains scripts or embedded files, so CaiMao won't open it.");
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
