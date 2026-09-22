import { z } from "zod";

/**
 * The only place in the server that reads process.env.
 * Everything else imports `config`.
 */

const booleanish = z
  .string()
  .transform((v) => v.trim().toLowerCase())
  .refine((v) => ["true", "false", "1", "0", "yes", "no"].includes(v), {
    message: "expected a boolean-ish value (true/false)",
  })
  .transform((v) => v === "true" || v === "1" || v === "yes");

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3200),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_PATH: z.string().default("finance-tracker.db"),

  TYPESAFE_API_KEY: z.string().min(1).optional(),
  TYPESAFE_MODEL: z.string().default("jev-latest"),
  TYPESAFE_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(8),
  TYPESAFE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),
  TYPESAFE_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  SUGGEST_ON_IMPORT: booleanish.default("true"),
  SUGGESTION_CATEGORY_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.5),
  SUGGESTION_SPLIT_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),
  SUGGESTION_EXEMPLARS_PER_CATEGORY: z.coerce.number().int().min(0).max(20).default(5),
  SUGGESTION_MAX_CRITERIA_CHARS: z.coerce.number().int().min(1000).default(20000),
});

export interface AppConfig {
  port: number;
  corsOrigin: string;
  dbPath: string;
  typesafe: {
    apiKey: string | null;
    model: string;
    concurrency: number;
    timeoutMs: number;
    maxRetries: number;
    suggestOnImport: boolean;
    categoryConfidenceThreshold: number;
    splitConfidenceThreshold: number;
    maxExemplarsPerCategory: number;
    maxCriteriaChars: number;
  };
}

function build(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;

  return Object.freeze({
    port: env.PORT,
    corsOrigin: env.CORS_ORIGIN,
    dbPath: env.DATABASE_PATH,
    typesafe: Object.freeze({
      apiKey: env.TYPESAFE_API_KEY ?? null,
      model: env.TYPESAFE_MODEL,
      concurrency: env.TYPESAFE_CONCURRENCY,
      timeoutMs: env.TYPESAFE_TIMEOUT_MS,
      maxRetries: env.TYPESAFE_MAX_RETRIES,
      suggestOnImport: env.SUGGEST_ON_IMPORT,
      categoryConfidenceThreshold: env.SUGGESTION_CATEGORY_CONFIDENCE,
      splitConfidenceThreshold: env.SUGGESTION_SPLIT_CONFIDENCE,
      maxExemplarsPerCategory: env.SUGGESTION_EXEMPLARS_PER_CATEGORY,
      maxCriteriaChars: env.SUGGESTION_MAX_CRITERIA_CHARS,
    }),
  });
}

export const config: AppConfig = build();
