import { stripHtml, truncateText } from "./sanitize";
import {
  parseResponse,
  ProjectListSchema,
  PaginatedMentionsSchema,
  MeResponseSchema,
} from "./schemas";
import { env } from "./env";

const API_BASE = env.NEXT_PUBLIC_API_URL;

// ---------------------------------------------------------------------------
// 6.3 — CSRF defense-in-depth
// ---------------------------------------------------------------------------

/**
 * Generate a random CSRF token and store it in memory.
 * In a full BFF setup this would come from a server-set meta tag or cookie.
 */
function generateCsrfToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

let csrfToken: string | null = null;

function getCsrfToken(): string {
  if (!csrfToken) {
    csrfToken = generateCsrfToken();
  }
  return csrfToken;
}

// ---------------------------------------------------------------------------
// 6.14 — Shared TypeScript interfaces (replaces `any` throughout)
// ---------------------------------------------------------------------------

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
  org_id: number;
  avatar_url?: string;
}

export interface Organization {
  id: number;
  name: string;
  slug: string;
  plan: string;
  description?: string;
}

export interface ProjectKeyword {
  id: number;
  term: string;
  keyword_type: string;
  is_active: boolean;
}

export interface Project {
  id: number;
  name: string;
  client_name: string;
  description?: string | null;
  status: "active" | "paused" | "archived";
  platforms: string[] | string;
  organization_id?: number;
  keywords: ProjectKeyword[];
  mention_count: number;
  avg_sentiment: number;
  total_reach: number;
  created_at: string;
  updated_at: string;
}

export interface MentionAuthor {
  name: string;
  handle: string;
  avatar_url?: string;
  followers: number;
  influence_score: number;
  is_bot: boolean;
}

export interface Mention {
  id: number;
  platform: string;
  author_name?: string;
  author_handle?: string;
  author_profile_url?: string;
  author_followers?: number;
  author?: Partial<MentionAuthor>;
  text?: string;
  content?: string;
  sentiment: string;
  sentiment_score: number;
  sentiment_confidence: number;
  likes: number;
  shares: number;
  comments: number;
  reach: number;
  matched_keywords?: string;
  keywords?: string[];
  topics?: string[] | string;
  source_url: string;
  has_media: boolean;
  is_flagged: boolean;
  is_bot?: boolean;
  influence_score?: number;
  language: string;
  created_at?: string;
  collected_at?: string;
  published_at?: string;
}

export interface PaginatedMentions {
  items: Mention[];
  total: number;
}

export interface Report {
  id: number;
  project_id: number;
  report_type: string;
  format: string;
  status: "pending" | "generating" | "completed" | "failed";
  file_url?: string;
  created_at: string;
}

export interface AlertRule {
  id: number;
  project_id: number;
  name: string;
  rule_type?: string;
  condition_type?: string;
  threshold: number;
  window_minutes?: number;
  channels?: string[];
  webhook_url?: string;
  is_active: boolean;
  created_at: string;
}

export interface AlertLog {
  id: number;
  rule_id: number;
  rule_name: string;
  message: string;
  triggered_at: string;
  acknowledged: boolean;
}

export interface ScheduledPost {
  id: number;
  project_id?: number | null;
  platform: string;
  content: string;
  scheduled_at: string;
  status: "draft" | "scheduled" | "published" | "failed";
  created_at: string;
}

export interface OrgMember {
  id: number;
  email: string;
  full_name: string;
  role: string;
  joined_at: string;
}

export interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  key?: string;
  api_key?: string;
  token?: string;
  scopes: string[];
  created_at: string;
  expires_at?: string;
}

export interface DashboardMetrics {
  total_mentions: number;
  avg_sentiment: number;
  total_reach: number;
  total_engagement: number;
  trend: Record<string, number>[];
  sentiment_breakdown: Record<string, number>;
  sentiment?: Record<string, number>;
  platform_breakdown: Record<string, number>;
  platforms?: Record<string, number>;
  engagement?: Record<string, number>;
  top_contributors?: Record<string, unknown>[];
  daily_trend?: Record<string, number>[];
  recent_mentions: Mention[];
  [key: string]: unknown;
}

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  user: User;
}

export interface MeResponse {
  user?: User;
  id?: number;
  email?: string;
  full_name?: string;
  role?: string;
  org_id?: number;
  org?: Organization | null;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  /**
   * A user-friendly error message with HTML stripped and length capped.
   * Use this instead of `body` when displaying errors in the UI (6.5).
   */
  public readonly safeMessage: string;

  constructor(
    public status: number,
    public body: string,
  ) {
    // 6.5 — Sanitize error body: strip HTML tags and truncate
    const cleaned = truncateText(stripHtml(body), 500);
    super(`API Error ${status}: ${cleaned}`);
    this.name = "ApiError";
    this.safeMessage = ApiError.toUserMessage(status, cleaned);
  }

  /**
   * Map HTTP status codes to user-friendly messages.
   * Falls back to the (sanitized) body for unrecognized codes.
   */
  private static toUserMessage(status: number, sanitizedBody: string): string {
    switch (status) {
      case 400:
        return sanitizedBody || "Invalid request. Please check your input.";
      case 401:
        return "Your session has expired. Please log in again.";
      case 403:
        return "You do not have permission to perform this action.";
      case 404:
        return "The requested resource was not found.";
      case 409:
        return sanitizedBody || "A conflict occurred. Please try again.";
      case 422:
        return sanitizedBody || "Validation error. Please check your input.";
      case 429:
        return "Too many requests. Please wait a moment and try again.";
      case 500:
      case 502:
      case 503:
      case 504:
        return "A server error occurred. Please try again later.";
      default:
        return sanitizedBody || "An unexpected error occurred.";
    }
  }
}

// ---------------------------------------------------------------------------
// Filter / search param types
// ---------------------------------------------------------------------------

export interface MentionFilters {
  page?: number;
  limit?: number;
  page_size?: number;
  sentiment?: string;
  platform?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  [key: string]: string | number | undefined;
}

export interface SearchParams {
  query: string;
  projectId?: number;
  platform?: string;
  sentiment?: string;
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Request options (extends native RequestInit with our additions)
// ---------------------------------------------------------------------------

interface ApiRequestOptions extends RequestInit {
  /** AbortSignal for fetch cancellation (6.16) */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Retry configuration (6.7)
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

// ---------------------------------------------------------------------------
// Circuit breaker (prevents hammering a down backend)
// ---------------------------------------------------------------------------

class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private readonly threshold = 5; // Open after 5 consecutive failures
  private readonly resetMs = 30_000; // Try again after 30s

  get isOpen(): boolean {
    if (this.failures < this.threshold) return false;
    // Allow a probe after resetMs
    if (Date.now() - this.lastFailure > this.resetMs) return false;
    return true;
  }

  recordSuccess(): void {
    this.failures = 0;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
  }
}

const circuitBreaker = new CircuitBreaker();

// ---------------------------------------------------------------------------
// Request correlation ID
// ---------------------------------------------------------------------------

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isRetryable(method: string, status: number, headers?: Headers): boolean {
  // Never retry 4xx (client errors)
  if (status >= 400 && status < 500) return false;
  // Retry 5xx
  if (status >= 500) {
    // For non-idempotent methods, only retry if idempotency key is present
    if (!SAFE_METHODS.has(method.toUpperCase())) {
      return !!headers?.get("X-Idempotency-Key");
    }
    return true;
  }
  return false;
}

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError && (err.message.includes("fetch") || err.message.includes("network") || err.message.includes("Failed"));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Token storage keys (6.6)
// ---------------------------------------------------------------------------

const TOKEN_KEY = "khushfus_token";
const REFRESH_TOKEN_KEY = "khushfus_refresh_token";

// ---------------------------------------------------------------------------
// ApiClient
// ---------------------------------------------------------------------------

class ApiClient {
  private token: string | null = null;
  private refreshTokenValue: string | null = null;
  private onUnauthorized: (() => void) | null = null;
  private refreshPromise: Promise<boolean> | null = null;

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
    this.refreshTokenValue = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }

  /** Store the refresh token (6.6) */
  setRefreshToken(token: string) {
    this.refreshTokenValue = token;
    if (typeof window !== "undefined") {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    }
  }

  /** Load refresh token from localStorage (call on init) */
  loadRefreshToken() {
    if (typeof window !== "undefined") {
      this.refreshTokenValue = localStorage.getItem(REFRESH_TOKEN_KEY);
    }
  }

  /**
   * Register a callback that fires when the server returns a 401
   * and refresh also fails. The AuthProvider uses this to clear
   * credentials and redirect to login.
   */
  setOnUnauthorized(cb: (() => void) | null) {
    this.onUnauthorized = cb;
  }

  // -----------------------------------------------------------------------
  // 6.6 — Refresh token flow
  // -----------------------------------------------------------------------

  /**
   * Attempt to refresh the access token using the stored refresh token.
   * Returns true if refresh succeeded, false otherwise.
   * De-duplicates concurrent refresh calls.
   */
  async refreshToken(): Promise<boolean> {
    if (!this.refreshTokenValue) return false;

    // If a refresh is already in-flight, wait for it
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = this._doRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async _doRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: this.refreshTokenValue }),
      });

      if (!res.ok) return false;

      const data: { access_token: string; refresh_token?: string } = await res.json();
      this.token = data.access_token;
      if (typeof window !== "undefined") {
        localStorage.setItem(TOKEN_KEY, data.access_token);
      }
      if (data.refresh_token) {
        this.setRefreshToken(data.refresh_token);
      }
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Core request with retry (6.7) + abort support (6.16) + refresh (6.6)
  // -----------------------------------------------------------------------

  /**
   * Send an authenticated HTTP request to the backend API.
   * Handles token injection, CSRF headers, retry with exponential backoff
   * for safe/idempotent methods, and automatic token refresh on 401.
   */
  private async request<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    const method = (options?.method ?? "GET").toUpperCase();
    const canRetry = SAFE_METHODS.has(method) || !!(options?.headers && new Headers(options.headers).get("X-Idempotency-Key"));

    // Circuit breaker: fail fast if backend is down
    if (circuitBreaker.isOpen) {
      throw new ApiError(503, "Service temporarily unavailable. Please try again shortly.");
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= (canRetry ? MAX_RETRIES : 0); attempt++) {
      // Exponential backoff (skip on first attempt)
      if (attempt > 0) {
        await sleep(BACKOFF_MS[attempt - 1] ?? 4000);
      }

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
          "X-CSRF-Token": getCsrfToken(),
          // Correlation ID for distributed tracing
          "X-Request-ID": generateRequestId(),
        };
        if (this.token) {
          headers["Authorization"] = `Bearer ${this.token}`;
        }

        // Timeout: abort if request takes longer than DEFAULT_TIMEOUT_MS
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let signal = options?.signal;
        if (!signal) {
          const controller = new AbortController();
          signal = controller.signal;
          timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
        }

        const res = await fetch(`${API_BASE}${path}`, {
          ...options,
          headers: { ...headers, ...options?.headers },
          signal,
        });

        if (timeoutId) clearTimeout(timeoutId);

        if (!res.ok) {
          const body = await res.text();

          // 6.6 — On 401, try refresh before giving up
          if (res.status === 401) {
            const refreshed = await this.refreshToken();
            if (refreshed) {
              // Retry the original request with the new token
              const retryHeaders: Record<string, string> = {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.token}`,
              };
              const retryRes = await fetch(`${API_BASE}${path}`, {
                ...options,
                headers: { ...retryHeaders, ...options?.headers },
                signal: options?.signal,
              });
              if (retryRes.ok) {
                return retryRes.json();
              }
            }
            // Refresh failed or retry failed — trigger logout
            if (this.onUnauthorized) {
              this.onUnauthorized();
            }
            throw new ApiError(res.status, body);
          }

          // 6.7 — Retry on 5xx for safe / idempotent methods
          if (isRetryable(method, res.status, new Headers(options?.headers ?? {}))) {
            circuitBreaker.recordFailure();
            lastError = new ApiError(res.status, body);
            continue;
          }

          if (res.status >= 500) circuitBreaker.recordFailure();
          throw new ApiError(res.status, body);
        }

        circuitBreaker.recordSuccess();
        return res.json();
      } catch (err) {
        // Abort signals: distinguish user-initiated from timeout
        if (err instanceof DOMException && err.name === "AbortError") {
          // If the caller provided their own signal, it's user-initiated
          if (options?.signal?.aborted) throw err;
          // Otherwise it's our timeout
          circuitBreaker.recordFailure();
          throw new ApiError(408, "Request timed out. Please try again.");
        }

        // Already an ApiError (non-retryable) — rethrow
        if (err instanceof ApiError) {
          throw err;
        }

        // 6.7 — Retry on network errors for safe / idempotent methods
        if (isNetworkError(err) && canRetry && attempt < MAX_RETRIES) {
          circuitBreaker.recordFailure();
          lastError = err;
          continue;
        }

        circuitBreaker.recordFailure();
        throw err;
      }
    }

    // All retries exhausted
    throw lastError;
  }

  // ---------- Auth ----------

  /** Authenticate a user with email/password and return tokens + user info. */
  async login(email: string, password: string): Promise<AuthResponse> {
    const data = await this.request<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    // 6.6 — Store refresh token if the backend returns one
    if (data.refresh_token) {
      this.setRefreshToken(data.refresh_token);
    }
    return data;
  }

  /** Create a new user account and return tokens + user info. */
  async register(email: string, password: string, fullName: string): Promise<AuthResponse> {
    const data = await this.request<AuthResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name: fullName }),
    });
    if (data.refresh_token) {
      this.setRefreshToken(data.refresh_token);
    }
    return data;
  }

  async getMe(signal?: AbortSignal): Promise<MeResponse> {
    const data = await this.request<MeResponse>("/api/v1/auth/me", { signal });
    return parseResponse(MeResponseSchema, data) as MeResponse;
  }

  /** Request a password reset email. */
  async requestPasswordReset(email: string): Promise<void> {
    await this.request<void>("/api/v1/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  /** Reset password using a token from the email link. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    await this.request<void>("/api/v1/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    });
  }

  // ---------- Projects ----------

  /** Fetch all projects for the current user's organization. */
  async getProjects(signal?: AbortSignal): Promise<Project[]> {
    const data = await this.request<Project[]>("/api/v1/projects", { signal });
    return parseResponse(ProjectListSchema, data) as Project[];
  }

  async getProject(id: number, signal?: AbortSignal): Promise<Project> {
    return this.request<Project>(`/api/v1/projects/${id}`, { signal });
  }

  async createProject(data: Record<string, unknown>): Promise<Project> {
    return this.request<Project>("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProject(id: number, data: Partial<Project>): Promise<Project> {
    return this.request<Project>(`/api/v1/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: number): Promise<void> {
    return this.request<void>(`/api/v1/projects/${id}`, {
      method: "DELETE",
    });
  }

  async addKeyword(projectId: number, term: string, keywordType: string = "brand"): Promise<ProjectKeyword> {
    const qs = new URLSearchParams({ term, keyword_type: keywordType }).toString();
    return this.request<ProjectKeyword>(`/api/v1/projects/${projectId}/keywords?${qs}`, {
      method: "POST",
    });
  }

  async triggerCollection(projectId: number, hoursBack: number = 24): Promise<{ status: string }> {
    return this.request<{ status: string }>(`/api/v1/projects/${projectId}/collect`, {
      method: "POST",
      body: JSON.stringify({ hours_back: hoursBack }),
    });
  }

  // ---------- Mentions ----------

  /** Fetch paginated mentions for a project, with optional filters (platform, sentiment, date range, search). */
  async getMentions(projectId: number, params?: MentionFilters, signal?: AbortSignal): Promise<PaginatedMentions | Mention[]> {
    const allParams = { project_id: String(projectId), ...Object.fromEntries(
      Object.entries(params || {})
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)])
    )};
    const qs = new URLSearchParams(allParams).toString();
    const data = await this.request<PaginatedMentions | Mention[]>(`/api/v1/mentions?${qs}`, { signal });
    // Validate paginated shape if it looks like one; otherwise return as-is.
    if (data && typeof data === "object" && "items" in data) {
      return parseResponse(PaginatedMentionsSchema, data) as PaginatedMentions;
    }
    return data;
  }

  async getMention(id: number, signal?: AbortSignal): Promise<Mention> {
    return this.request<Mention>(`/api/v1/mentions/${id}`, { signal });
  }

  async flagMention(id: number, flagged: boolean): Promise<any> {
    return this.request<any>(`/api/v1/mentions/${id}/flag`, {
      method: "POST",
      body: JSON.stringify({ is_flagged: flagged }),
    });
  }

  async updateMentionSentiment(id: number, sentiment: string): Promise<any> {
    return this.request<any>(`/api/v1/mentions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ sentiment }),
    });
  }

  // ---------- Dashboard ----------

  async getDashboardMetrics(projectId: number, days?: number, signal?: AbortSignal): Promise<DashboardMetrics> {
    const qs = days ? `?days=${days}` : '';
    return this.request<DashboardMetrics>(`/api/v1/dashboard/${projectId}${qs}`, { signal });
  }

  // ---------- Search ----------

  /**
   * Full-text search across mentions via POST. Uses POST to avoid leaking search terms in URL query
   * strings (which appear in server logs, browser history, and referrer
   * headers). The backend search endpoint should accept both GET and POST.
   *
   * NOTE (6.39): Sensitive data (passwords, tokens, PII) must NEVER be sent
   * as URL query parameters. Search terms are sent in the POST body.
   */
  async search(params: SearchParams, signal?: AbortSignal): Promise<PaginatedMentions> {
    return this.request<PaginatedMentions>("/api/v1/search", {
      method: "POST",
      body: JSON.stringify({
        query: params.query,
        project_id: params.projectId,
        platform: params.platform,
        sentiment: params.sentiment,
        page: params.page,
        limit: params.limit,
      }),
      signal,
    });
  }

  /**
   * Fallback search via GET (used when the POST search endpoint is unavailable).
   * Search terms in query params are acceptable here since suggestions are
   * typically short, non-sensitive autocomplete prefixes.
   */
  async searchGet(params: SearchParams, signal?: AbortSignal): Promise<PaginatedMentions> {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return this.request<PaginatedMentions>(`/api/v1/search?${qs}`, { signal });
  }

  async getSuggestions(query: string, signal?: AbortSignal): Promise<string[]> {
    return this.request<string[]>(`/api/v1/search/suggestions?q=${encodeURIComponent(query)}`, { signal });
  }

  // ---------- Reports ----------

  async getReports(projectId: number, signal?: AbortSignal): Promise<Report[]> {
    return this.request<Report[]>(`/api/v1/reports?project_id=${projectId}`, { signal });
  }

  async generateReport(projectId: number, type: string, format: string = "pdf"): Promise<Report> {
    return this.request<Report>(
      `/api/v1/reports/generate?project_id=${projectId}&report_type=${encodeURIComponent(type)}&format=${encodeURIComponent(format)}`,
      { method: "POST" },
    );
  }

  // ---------- Alerts ----------

  async getAlertRules(projectId: number, signal?: AbortSignal): Promise<AlertRule[]> {
    return this.request<AlertRule[]>(`/api/v1/alerts/${projectId}/rules`, { signal });
  }

  async createAlertRule(projectId: number, data: Partial<AlertRule>): Promise<AlertRule> {
    return this.request<AlertRule>(`/api/v1/alerts/${projectId}/rules`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getAlertLogs(projectId: number, signal?: AbortSignal): Promise<AlertLog[]> {
    return this.request<AlertLog[]>(`/api/v1/alerts/${projectId}/logs`, { signal });
  }

  // ---------- Publishing ----------

  async getScheduledPosts(projectId: number, signal?: AbortSignal): Promise<ScheduledPost[]> {
    return this.request<ScheduledPost[]>(`/api/v1/projects/${projectId}/posts`, { signal });
  }

  async createPost(data: Record<string, unknown>): Promise<ScheduledPost> {
    return this.request<ScheduledPost>("/api/v1/posts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ---------- Org / Settings ----------

  async getOrg(signal?: AbortSignal): Promise<Organization> {
    return this.request<Organization>("/api/v1/org", { signal });
  }

  async updateOrg(data: Partial<Organization>): Promise<Organization> {
    return this.request<Organization>("/api/v1/org", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async getMembers(signal?: AbortSignal): Promise<OrgMember[]> {
    return this.request<OrgMember[]>("/api/v1/org/members", { signal });
  }

  async inviteMember(email: string, role: string): Promise<OrgMember> {
    return this.request<OrgMember>("/api/v1/org/members/invite", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  }

  async getApiKeys(signal?: AbortSignal): Promise<ApiKey[]> {
    return this.request<ApiKey[]>("/api/v1/org/api-keys", { signal });
  }

  async createApiKey(data: Partial<ApiKey>): Promise<ApiKey & { key?: string }> {
    return this.request<ApiKey & { key?: string }>("/api/v1/org/api-keys", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();
