/* Fetch wrapper for the Volume server (apps/server, routes under /api/v1).

   - JSON in, JSON out. The one exception is the raw upload in assets.ts, which the server requires.
   - Every call takes an optional AbortSignal (TanStack Query passes one to each queryFn).
   - Errors always arrive as ApiError, built from the server's { error: { code, message, details } }.
   - No keys. The OpenRouter key lives on the server and never reaches the browser.
   - Hosted sign-in (Clerk): each request carries the session token as a Bearer header (see setAuthTokenGetter), and
     same-origin requests also send Clerk's own session cookie, which is what EventSource streams, images and
     download links rely on. Locally (AUTH_MODE=local) there is neither. */

/** Base path. In the browser the Vite dev and preview servers proxy /api to the local server. */
export const DEFAULT_API_BASE = "/api/v1";

let apiBase = DEFAULT_API_BASE;

/** Points the client at another base, for example "http://127.0.0.1:5199/api/v1" in the live check. */
export function configureApi(options: { baseUrl: string }): void {
  apiBase = options.baseUrl.replace(/\/+$/, "");
}

type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter | null = null;

/** Hosted sign-in registers Clerk's getToken here; null clears it. */
export function setAuthTokenGetter(getter: TokenGetter | null): void {
  tokenGetter = getter;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!tokenGetter) return {};
  try {
    const token = await tokenGetter();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Error codes the server sends (apps/server/src/http/errors.ts), plus two the client adds. */
export type ApiErrorCode =
  | "validation_failed"
  | "not_found"
  | "conflict"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "bad_host"
  | "bad_origin"
  | "payload_too_large"
  | "unsupported_media_type"
  | "budget_exceeded"
  | "model_unavailable"
  | "provider_error"
  | "invalid_state"
  | "internal_error"
  /** The server could not be reached (stopped, wrong port, proxy down). */
  | "network_error"
  /** The response was not the documented JSON error shape. */
  | "http_error";

/** One field problem from a validation_failed error. */
export interface ApiFieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | (string & {});
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field issues when the server rejected the input (400 validation_failed), otherwise []. */
  get fieldIssues(): ApiFieldIssue[] {
    if (!Array.isArray(this.details)) return [];
    return this.details.filter(
      (d): d is ApiFieldIssue =>
        typeof d === "object" && d !== null && typeof (d as ApiFieldIssue).path === "string" && typeof (d as ApiFieldIssue).message === "string",
    );
  }

  /** True for a 409 the screen can resolve by reloading (stale baseVersion or baseVersionId). */
  get isConflict(): boolean {
    return this.code === "conflict";
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  signal?: AbortSignal | undefined;
  query?: Record<string, QueryValue> | undefined;
}

/** Builds "<base><path>?a=1&b=2", leaving out undefined and null values. */
export function apiUrl(path: string, query?: Record<string, QueryValue>): string {
  let url = `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

/** Encodes one path segment (ids are ULIDs today, but nothing from the screen goes into a path raw). */
export function seg(id: string): string {
  return encodeURIComponent(id);
}

function errorFromBody(status: number, body: unknown, fallback: string): ApiError {
  if (typeof body === "object" && body !== null && "error" in body) {
    const e = body.error;
    if (typeof e === "object" && e !== null) {
      const { code, message, details } = e as { code?: unknown; message?: unknown; details?: unknown };
      if (typeof code === "string" && typeof message === "string") return new ApiError(status, code, message, details);
    }
  }
  return new ApiError(status, "http_error", fallback);
}

async function readJson(res: Response): Promise<unknown> {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isAbort(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

/** Low-level request. `body` is sent as JSON when given; a raw Blob is sent as-is (uploads only). */
export async function apiRequest<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...(await authHeaders()) };
  let payload: BodyInit | undefined;
  if (body instanceof Blob) {
    payload = body;
    headers["Content-Type"] = body.type || "application/octet-stream";
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }

  const init: RequestInit = { method, headers, credentials: "same-origin", cache: "no-store" };
  if (payload !== undefined) init.body = payload;
  if (options.signal) init.signal = options.signal;

  let res: Response;
  try {
    res = await fetch(apiUrl(path, options.query), init);
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiError(0, "network_error", "The Volume server is not answering. Check your connection, then try again.");
  }

  if (res.status === 204) return undefined as T;
  const json = await readJson(res);
  if (!res.ok) throw errorFromBody(res.status, json, `The server answered ${res.status}.`);
  return json as T;
}

/** A file the server answered with, and the name from its Content-Disposition (null when it sent none). */
export interface ApiDownload {
  blob: Blob;
  filename: string | null;
}

/** A request that answers with a file (for example a zip) instead of JSON. Errors arrive as ApiError, like apiRequest. */
export async function apiDownload(method: "GET" | "POST", path: string, accept: string, options: RequestOptions = {}): Promise<ApiDownload> {
  const init: RequestInit = { method, headers: { Accept: accept, ...(await authHeaders()) }, credentials: "same-origin", cache: "no-store" };
  if (options.signal) init.signal = options.signal;
  let res: Response;
  try {
    res = await fetch(apiUrl(path, options.query), init);
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiError(0, "network_error", "The Volume server is not answering. Check your connection, then try again.");
  }
  if (!res.ok) throw errorFromBody(res.status, await readJson(res), `The server answered ${res.status}.`);
  const m = /filename="?([^";]+)"?/i.exec(res.headers.get("content-disposition") ?? "");
  return { blob: await res.blob(), filename: m?.[1] ?? null };
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => apiRequest<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => apiRequest<T>("POST", path, body, options),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) => apiRequest<T>("PATCH", path, body, options),
  put: <T>(path: string, body: unknown, options?: RequestOptions) => apiRequest<T>("PUT", path, body, options),
  delete: <T = void>(path: string, options?: RequestOptions) => apiRequest<T>("DELETE", path, undefined, options),
};
