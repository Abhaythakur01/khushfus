const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`API Error ${status}: ${body}`);
    this.name = "ApiError";
  }
}

export interface MentionFilters {
  page?: number;
  limit?: number;
  sentiment?: string;
  platform?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface SearchParams {
  query: string;
  projectId?: number;
  platform?: string;
  sentiment?: string;
  page?: number;
  limit?: number;
}

class ApiClient {
  private token: string | null = null;
  private onUnauthorized: (() => void) | null = null;

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  /**
   * Register a callback that fires when the server returns a 401.
   * The AuthProvider uses this to clear credentials and redirect to login.
   */
  setOnUnauthorized(cb: (() => void) | null) {
    this.onUnauthorized = cb;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...headers, ...options?.headers },
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 401 && this.onUnauthorized) {
        this.onUnauthorized();
      }
      throw new ApiError(res.status, body);
    }
    return res.json();
  }

  // ---------- Auth ----------

  async login(email: string, password: string) {
    return this.request<{ access_token: string; user: any }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async register(email: string, password: string, fullName: string) {
    return this.request<{ access_token: string; user: any }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, full_name: fullName }),
    });
  }

  async getMe() {
    return this.request<any>("/api/auth/me");
  }

  // ---------- Projects ----------

  async getProjects() {
    return this.request<any[]>("/api/projects");
  }

  async getProject(id: number) {
    return this.request<any>(`/api/projects/${id}`);
  }

  async createProject(data: any) {
    return this.request<any>("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProject(id: number, data: any) {
    return this.request<any>(`/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteProject(id: number) {
    return this.request<void>(`/api/projects/${id}`, {
      method: "DELETE",
    });
  }

  // ---------- Mentions ----------

  async getMentions(projectId: number, params?: MentionFilters) {
    const qs = params ? "?" + new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)])
    ).toString() : "";
    return this.request<any>(`/api/projects/${projectId}/mentions${qs}`);
  }

  async getMention(id: number) {
    return this.request<any>(`/api/mentions/${id}`);
  }

  // ---------- Dashboard ----------

  async getDashboardMetrics(projectId: number) {
    return this.request<any>(`/api/projects/${projectId}/dashboard`);
  }

  // ---------- Search ----------

  async search(params: SearchParams) {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return this.request<any>(`/api/search?${qs}`);
  }

  async getSuggestions(query: string) {
    return this.request<string[]>(`/api/search/suggestions?q=${encodeURIComponent(query)}`);
  }

  // ---------- Reports ----------

  async getReports(projectId: number) {
    return this.request<any[]>(`/api/projects/${projectId}/reports`);
  }

  async generateReport(projectId: number, type: string) {
    return this.request<any>(`/api/projects/${projectId}/reports`, {
      method: "POST",
      body: JSON.stringify({ type }),
    });
  }

  // ---------- Alerts ----------

  async getAlertRules(projectId: number) {
    return this.request<any[]>(`/api/projects/${projectId}/alerts/rules`);
  }

  async createAlertRule(projectId: number, data: any) {
    return this.request<any>(`/api/projects/${projectId}/alerts/rules`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getAlertLogs(projectId: number) {
    return this.request<any[]>(`/api/projects/${projectId}/alerts/logs`);
  }

  // ---------- Publishing ----------

  async getScheduledPosts(projectId: number) {
    return this.request<any[]>(`/api/projects/${projectId}/posts`);
  }

  async createPost(data: any) {
    return this.request<any>("/api/posts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ---------- Org / Settings ----------

  async getOrg() {
    return this.request<any>("/api/org");
  }

  async updateOrg(data: any) {
    return this.request<any>("/api/org", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async getMembers() {
    return this.request<any[]>("/api/org/members");
  }

  async inviteMember(email: string, role: string) {
    return this.request<any>("/api/org/members/invite", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  }

  async getApiKeys() {
    return this.request<any[]>("/api/org/api-keys");
  }

  async createApiKey(data: any) {
    return this.request<any>("/api/org/api-keys", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();
