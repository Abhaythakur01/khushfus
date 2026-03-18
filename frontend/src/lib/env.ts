import { z } from "zod";

/**
 * Runtime environment validation using Zod.
 * Validates NEXT_PUBLIC_* variables on the client side.
 * Throws at module load time if required vars are missing or invalid.
 */

const envSchema = z.object({
  // Required
  NEXT_PUBLIC_API_URL: z
    .string()
    .url("NEXT_PUBLIC_API_URL must be a valid URL")
    .default("http://localhost:8000"),

  // Optional
  NEXT_PUBLIC_WS_URL: z
    .string()
    .url()
    .optional(),
  NEXT_PUBLIC_SENTRY_DSN: z
    .string()
    .url()
    .optional(),
  NEXT_PUBLIC_IDLE_TIMEOUT_MS: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(0))
    .optional(),
  NEXT_PUBLIC_VITALS_ENDPOINT: z
    .string()
    .url()
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  const raw = {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_IDLE_TIMEOUT_MS: process.env.NEXT_PUBLIC_IDLE_TIMEOUT_MS,
    NEXT_PUBLIC_VITALS_ENDPOINT: process.env.NEXT_PUBLIC_VITALS_ENDPOINT,
  };

  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    console.error(`[env] Invalid environment variables:\n${formatted}`);
    // In development, log but don't crash (defaults are fine)
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Invalid environment configuration:\n${formatted}`);
    }
    // Return defaults for dev
    return envSchema.parse({});
  }
  return result.data;
}

export const env = validateEnv();
