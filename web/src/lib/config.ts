import { z } from "zod";

/**
 * ALL settings come from environment variables and are validated once.
 * The business name lives ONLY here (APP_NAME) so it can be changed in one place.
 */
const DEV_SECRET = "dev-only-change-me-please-123456";

const schema = z
  .object({
    APP_NAME: z.string().min(1).default("Choose Your Dr"),
    APP_ENV: z.enum(["local", "production"]).default("local"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    SESSION_SECRET: z.string().min(16).default(DEV_SECRET),
    /** Max contacts per person per 24h (device OR ip OR phone match). */
    CONTACT_DAILY_LIMIT: z.coerce.number().int().positive().default(5),
    /** Phone OTP is required starting from this contact number (3 = before the 3rd). */
    OTP_REQUIRED_FROM_CONTACT: z.coerce.number().int().positive().default(3),
    /** "console" prints the code to the server log (development only). */
    OTP_PROVIDER: z.enum(["console"]).default("console"),
  })
  .refine((c) => c.APP_ENV !== "production" || c.SESSION_SECRET !== DEV_SECRET, {
    message: "SESSION_SECRET must be changed when APP_ENV=production",
    path: ["SESSION_SECRET"],
  });

export type Config = z.infer<typeof schema>;

export function parseConfig(env: Record<string, string | undefined>): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}

let cached: Config | undefined;

/** Read lazily so `next build` does not need runtime variables. */
export function getConfig(): Config {
  cached ??= parseConfig(process.env);
  return cached;
}

/** Business name without needing the full configuration (safe during `next build`). */
export function getAppName(): string {
  return process.env.APP_NAME?.trim() || "Choose Your Dr";
}
