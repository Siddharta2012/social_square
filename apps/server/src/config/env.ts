import { z } from 'zod';

const booleanFromEnv = z.preprocess((value) => value === 'true', z.boolean());
const optionalUrl = z.string().url().optional().or(z.literal('').transform(() => undefined));
const optionalString = z.string().trim().optional().or(z.literal('').transform(() => undefined));

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: optionalUrl,
  REDIS_URL: optionalUrl,
  REDIS_MOCK: booleanFromEnv.default(false),
  JWT_SECRET: optionalString,
  JWT_EXPIRES_IN: z.string().default('7d'),
  ALLOW_LEGACY_SOCKET_AUTH: booleanFromEnv.default(false),
  ALLOW_PASSWORD_LOGIN: booleanFromEnv.default(false),
  ADMIN_TOKEN: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalUrl,
  LIVEKIT_API_KEY: optionalString,
  LIVEKIT_API_SECRET: optionalString,
  LIVEKIT_URL: optionalUrl,
  ERROR_REPORT_DSN: optionalUrl,
});

const envSchema = baseSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV !== 'test' && !value.JWT_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_SECRET'],
      message: 'JWT_SECRET is required outside tests',
    });
  }

  const googleValues = [value.GOOGLE_CLIENT_ID, value.GOOGLE_CLIENT_SECRET, value.GOOGLE_REDIRECT_URI];
  if (googleValues.some(Boolean) && !googleValues.every(Boolean)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GOOGLE_CLIENT_ID'],
      message: 'GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be set together',
    });
  }

  const livekitValues = [value.LIVEKIT_API_KEY, value.LIVEKIT_API_SECRET, value.LIVEKIT_URL];
  if (livekitValues.some(Boolean) && !livekitValues.every(Boolean)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['LIVEKIT_API_KEY'],
      message: 'LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL must be set together',
    });
  }
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const missing = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  console.error('[env] Invalid environment configuration');
  for (const issue of missing) console.error(`[env] ${issue}`);
  process.exit(1);
}

const parsed = result.data;

export const env = {
  ...parsed,
  JWT_SECRET: parsed.JWT_SECRET ?? 'test-secret-change-in-prod',
  GOOGLE_ENABLED: Boolean(parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET && parsed.GOOGLE_REDIRECT_URI),
  LIVEKIT_CONFIGURED: Boolean(parsed.LIVEKIT_API_KEY && parsed.LIVEKIT_API_SECRET && parsed.LIVEKIT_URL),
  USE_REDIS_MOCK: parsed.REDIS_MOCK || !parsed.REDIS_URL,
};

export type Env = typeof env;
