import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

/**
 * Every API answers in ONE shape:
 *   success: { ok: true,  data: ... }
 *   failure: { ok: false, error: { code, message, details? } }
 */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new AppError(404, "not_found", `${what} not found`);
export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "bad_request", message, details);
export const unauthorized = (message = "Login required") => new AppError(401, "unauthorized", message);
export const forbidden = (message = "Not allowed") => new AppError(403, "forbidden", message);

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

type PgLikeError = { code?: string; message?: string };

function err(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

/** Turns any thrown value into a safe, consistent JSON error response. */
export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof AppError) return err(e.status, e.code, e.message, e.details);
  if (e instanceof z.ZodError) {
    return err(
      400,
      "validation_error",
      "Some fields are invalid",
      e.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
    );
  }
  const pg = (e ?? {}) as PgLikeError;
  switch (pg.code) {
    case "P0001": // RAISE EXCEPTION inside our SQL business-rule functions: message is safe to show
      return err(422, "rule_violation", pg.message ?? "Rule violated");
    case "23505":
      return err(409, "already_exists", "This record already exists");
    case "23503":
      return err(400, "bad_reference", "A referenced record does not exist");
    case "23514":
    case "22P02":
      return err(400, "invalid_value", "A value is not allowed");
  }
  console.error("[unhandled error]", e); // details only in the server log, never in the response
  return err(500, "internal_error", "Something went wrong");
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wrap every route handler with this so errors always use the standard shape. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}

export async function parseJson<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
  return schema.parse(body);
}

export function parseQuery<S extends z.ZodType>(req: NextRequest, schema: S): z.infer<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}
