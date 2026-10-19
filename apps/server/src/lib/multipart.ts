import { AppError } from '../http/errors.js';

/**
 * A small multipart/form-data reader (RFC 7578, RFC 2046 section 5.1) for one buffered upload, so the server needs
 * no extra package. Fastify collects the body (with its body limit) before this runs. Only what Volume sends is
 * read: form fields and files with a Content-Disposition name, and an optional Content-Type per part.
 */

export interface FormPart {
  name: string;
  filename: string | null;
  contentType: string | null;
  data: Buffer;
}

export interface MultipartLimits {
  /** Most parts in one body. */
  maxParts?: number;
  /** Most bytes in one part's headers. */
  maxHeaderBytes?: number;
}

const CRLF = Buffer.from('\r\n');
const HEADER_END = Buffer.from('\r\n\r\n');

function bad(message = 'The upload is not valid multipart/form-data.'): AppError {
  return new AppError('validation_failed', message);
}

/** The boundary parameter of a multipart/form-data Content-Type, or null. RFC 2046: 1 to 70 characters. */
export function boundaryOf(contentType: string): string | null {
  const [type, ...params] = contentType.split(';');
  if (type?.trim().toLowerCase() !== 'multipart/form-data') return null;
  for (const param of params) {
    const eq = param.indexOf('=');
    if (eq < 0) continue;
    if (param.slice(0, eq).trim().toLowerCase() !== 'boundary') continue;
    let value = param.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
    return value.length >= 1 && value.length <= 70 && /^[0-9A-Za-z'()+_,\-./:=? ]+$/.test(value) ? value : null;
  }
  return null;
}

function dispositionParam(header: string, key: string): string | null {
  const m = new RegExp(`;\\s*${key}="([^"]*)"`, 'i').exec(header) ?? new RegExp(`;\\s*${key}=([^;\\s"]+)`, 'i').exec(header);
  return m?.[1] ?? null;
}

/** Splits a buffered multipart body into its parts. Throws a 400 AppError for anything malformed. */
export function parseMultipart(contentType: string, body: Buffer, limits: MultipartLimits = {}): FormPart[] {
  const maxParts = limits.maxParts ?? 8;
  const maxHeaderBytes = limits.maxHeaderBytes ?? 4096;
  const boundary = boundaryOf(contentType);
  if (!boundary) throw bad('Send the upload as multipart/form-data with a boundary.');
  const delimiter = Buffer.from(`--${boundary}`);
  const between = Buffer.from(`\r\n--${boundary}`);
  // The first delimiter may follow a preamble, which is ignored.
  let pos = body.indexOf(delimiter);
  if (pos < 0) throw bad();
  pos += delimiter.length;
  const parts: FormPart[] = [];
  for (;;) {
    if (body.subarray(pos, pos + 2).toString('latin1') === '--') return parts;
    if (!body.subarray(pos, pos + 2).equals(CRLF)) throw bad();
    pos += 2;
    const headerEnd = body.indexOf(HEADER_END, pos);
    if (headerEnd < 0 || headerEnd - pos > maxHeaderBytes) throw bad();
    const headers = new Map<string, string>();
    for (const line of body.subarray(pos, headerEnd).toString('utf8').split('\r\n')) {
      const colon = line.indexOf(':');
      if (colon <= 0) throw bad();
      headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
    }
    const start = headerEnd + HEADER_END.length;
    const end = body.indexOf(between, start);
    if (end < 0) throw bad();
    const disposition = headers.get('content-disposition') ?? '';
    if (!/^form-data\s*(;|$)/i.test(disposition)) throw bad();
    const name = dispositionParam(disposition, 'name');
    if (!name) throw bad();
    parts.push({
      name,
      filename: dispositionParam(disposition, 'filename'),
      contentType: headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? null,
      data: body.subarray(start, end),
    });
    if (parts.length > maxParts) throw bad('The upload has too many parts.');
    pos = end + between.length;
  }
}
