import { describe, expect, it } from "vitest";
import { normalizePkPhone } from "@/lib/phone";
import { readVerifiedPhone, signPhoneToken } from "@/lib/identity";

process.env.DATABASE_URL ??= "postgres://x";

describe("normalizePkPhone", () => {
  it.each([
    ["0300-1234567", "923001234567"],
    ["03001234567", "923001234567"],
    ["+92 300 1234567", "923001234567"],
    ["923001234567", "923001234567"],
    ["00923001234567", "923001234567"],
  ])("accepts %s", (input, expected) => expect(normalizePkPhone(input)).toBe(expected));

  it.each(["", "abc", "0211234567", "12345", "+1 202 555 0100", "03001234"])("rejects %s", (input) =>
    expect(normalizePkPhone(input)).toBeNull(),
  );
});

describe("verified phone cookie", () => {
  it("round trips", () => {
    expect(readVerifiedPhone(signPhoneToken("923001234567"))).toBe("923001234567");
  });
  it("rejects a tampered phone", () => {
    const t = signPhoneToken("923001234567").replace("923001234567", "923009999999");
    expect(readVerifiedPhone(t)).toBeNull();
  });
  it("rejects an expired token", () => {
    const old = signPhoneToken("923001234567", Date.now() - 31 * 24 * 3600 * 1000);
    expect(readVerifiedPhone(old)).toBeNull();
  });
  it("rejects garbage and empty", () => {
    expect(readVerifiedPhone("garbage")).toBeNull();
    expect(readVerifiedPhone(undefined)).toBeNull();
  });
});
