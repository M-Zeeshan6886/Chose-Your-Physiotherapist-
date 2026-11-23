import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, notFound, toErrorResponse } from "@/lib/http";

async function read(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe("error responses use one standard shape", () => {
  it("AppError keeps its status and code", async () => {
    const r = await read(toErrorResponse(notFound("Therapist")));
    expect(r.status).toBe(404);
    expect(r.body).toMatchObject({ ok: false, error: { code: "not_found", message: "Therapist not found" } });
  });

  it("validation errors list the fields", async () => {
    const parsed = z.object({ city_id: z.number() }).safeParse({ city_id: "x" });
    if (parsed.success) throw new Error("expected failure");
    const r = await read(toErrorResponse(parsed.error));
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("validation_error");
    expect(r.body.error.details[0].field).toBe("city_id");
  });

  it("SQL rule exceptions become 422 with the rule text", async () => {
    const r = await read(toErrorResponse({ code: "P0001", message: "promotion already used" }));
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({ code: "rule_violation", message: "promotion already used" });
  });

  it("maps duplicate and bad-reference database errors", async () => {
    expect((await read(toErrorResponse({ code: "23505" }))).status).toBe(409);
    expect((await read(toErrorResponse({ code: "23503" }))).status).toBe(400);
  });

  it("hides details of unknown errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await read(toErrorResponse(new Error("password=secret leaked")));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("secret");
    spy.mockRestore();
  });

  it("AppError is a real Error", () => {
    expect(new AppError(418, "teapot", "x")).toBeInstanceOf(Error);
  });
});
