/**
 * 6.15 — Zod schemas for runtime validation of key API responses.
 *
 * These schemas provide a safety net: if the backend changes shape,
 * we get a logged warning rather than a mysterious runtime crash.
 * Validation is *graceful* — failures log but don't throw.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export const UserSchema = z.object({
  id: z.number(),
  email: z.string(),
  full_name: z.string(),
  role: z.string(),
  org_id: z.number(),
  avatar_url: z.string().optional(),
});

export type UserZ = z.infer<typeof UserSchema>;

// ---------------------------------------------------------------------------
// MeResponse — the /auth/me endpoint returns a superset / union shape
// ---------------------------------------------------------------------------

export const MeResponseSchema = z.object({
  user: UserSchema.optional(),
  id: z.number().optional(),
  email: z.string().optional(),
  full_name: z.string().optional(),
  role: z.string().optional(),
  org_id: z.number().optional(),
  org: z
    .object({
      id: z.number(),
      name: z.string(),
      slug: z.string(),
      plan: z.string(),
      description: z.string().optional(),
    })
    .nullable()
    .optional(),
});

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export const ProjectKeywordSchema = z.object({
  id: z.number(),
  term: z.string(),
  keyword_type: z.string(),
  is_active: z.boolean(),
});

export const ProjectSchema = z.object({
  id: z.number(),
  name: z.string(),
  client_name: z.string(),
  description: z.string().nullish(),
  status: z.enum(["active", "paused", "archived"]).default("active"),
  platforms: z.union([z.array(z.string()), z.string()]),
  organization_id: z.number().optional(),
  keywords: z.array(ProjectKeywordSchema).default([]),
  mention_count: z.number().default(0),
  avg_sentiment: z.number().default(0),
  total_reach: z.number().default(0),
  competitor_ids: z.string().nullish(),
  created_at: z.string(),
  updated_at: z.string().optional(),
});

export const ProjectListSchema = z.array(ProjectSchema);

// ---------------------------------------------------------------------------
// Mention
// ---------------------------------------------------------------------------

export const MentionSchema = z.object({
  id: z.number(),
  platform: z.string(),
  author_name: z.string().nullish(),
  author_handle: z.string().nullish(),
  author_profile_url: z.string().nullish(),
  author_followers: z.number().nullish(),
  author: z
    .object({
      name: z.string().optional(),
      handle: z.string().optional(),
      avatar_url: z.string().optional(),
      followers: z.number().optional(),
      influence_score: z.number().optional(),
      is_bot: z.boolean().optional(),
    })
    .optional(),
  text: z.string().nullish(),
  content: z.string().nullish(),
  sentiment: z.string(),
  sentiment_score: z.number(),
  sentiment_confidence: z.number().optional().default(0),
  likes: z.number().default(0),
  shares: z.number().default(0),
  comments: z.number().default(0),
  reach: z.number().default(0),
  matched_keywords: z.string().nullish(),
  keywords: z.array(z.string()).optional(),
  topics: z.union([z.array(z.string()), z.string()]).nullish(),
  source_url: z.string().nullish(),
  has_media: z.boolean(),
  is_flagged: z.boolean(),
  is_bot: z.boolean().nullish(),
  influence_score: z.number().nullish(),
  author_influence_score: z.number().nullish(),
  author_is_bot: z.boolean().nullish(),
  virality_score: z.number().nullish(),
  media_type: z.string().nullish(),
  language: z.string().optional().default("unknown"),
  created_at: z.string().nullish(),
  collected_at: z.string().nullish(),
  published_at: z.string().nullish(),
});

export const PaginatedMentionsSchema = z.object({
  items: z.array(MentionSchema),
  total: z.number(),
  page: z.number().optional(),
  page_size: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Dashboard Metrics
// ---------------------------------------------------------------------------

export const DashboardMetricsSchema = z.object({
  total_mentions: z.number(),
  avg_sentiment: z.number(),
  total_reach: z.number(),
  total_engagement: z.number(),
  trend: z.array(z.record(z.string(), z.unknown())).default([]),
  sentiment_breakdown: z.record(z.string(), z.number()).default({}),
  sentiment: z.record(z.string(), z.number()).optional(),
  platform_breakdown: z.record(z.string(), z.number()).default({}),
  platforms: z.record(z.string(), z.number()).optional(),
  engagement: z.record(z.string(), z.number()).optional(),
  top_contributors: z.array(z.record(z.string(), z.unknown())).optional(),
  daily_trend: z.array(z.record(z.string(), z.unknown())).optional(),
  recent_mentions: z.array(MentionSchema).default([]),
}).passthrough(); // Allow extra fields (DashboardMetrics has [key: string]: unknown)

// ---------------------------------------------------------------------------
// parseResponse — graceful validation utility
// ---------------------------------------------------------------------------

/**
 * Validate `data` against a Zod schema. On success returns the parsed
 * (and potentially defaulted/coerced) value. On failure, logs a warning
 * and returns the original data unchanged so the app doesn't crash.
 */
export function parseResponse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.warn(
    "[schema validation] Response did not match expected schema. " +
      "This may indicate a backend API change.",
    result.error.issues,
  );
  // Graceful degradation: return the raw data as-is.
  return data as T;
}
