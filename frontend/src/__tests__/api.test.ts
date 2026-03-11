import { api, ApiError } from "@/lib/api";
import { parseResponse, ProjectListSchema, UserSchema } from "@/lib/schemas";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  api.clearToken();
});

function mockJsonResponse(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe("ApiClient", () => {
  describe("base URL", () => {
    it("uses localhost:8000 by default", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { ok: true }));
      await api.getMe();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/auth/me",
        expect.any(Object)
      );
    });
  });

  describe("auth headers", () => {
    it("includes Content-Type header", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, {}));
      await api.getMe();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers["Content-Type"]).toBe("application/json");
    });

    it("does not include Authorization when no token set", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, {}));
      await api.getMe();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers["Authorization"]).toBeUndefined();
    });

    it("includes Bearer token when set", async () => {
      api.setToken("my-secret-token");
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, {}));
      await api.getMe();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers["Authorization"]).toBe("Bearer my-secret-token");
    });

    it("removes token after clearToken", async () => {
      api.setToken("temp-token");
      api.clearToken();
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, {}));
      await api.getMe();
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers["Authorization"]).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("throws ApiError on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(401, { detail: "Unauthorized" }));
      await expect(api.getMe()).rejects.toThrow(ApiError);
    });

    it("ApiError contains status and body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Forbidden"),
      });
      try {
        await api.getMe();
        fail("Should have thrown");
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(403);
        expect(err.body).toBe("Forbidden");
      }
    });
  });

  describe("API methods exist and are callable", () => {
    it("login sends POST with email and password", async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(200, { access_token: "tok", user: {} })
      );
      await api.login("a@b.com", "pass");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/auth/login",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "a@b.com", password: "pass" }),
        })
      );
    });

    it("register sends POST with email, password, and full_name", async () => {
      mockFetch.mockResolvedValueOnce(
        mockJsonResponse(200, { access_token: "tok", user: {} })
      );
      await api.register("a@b.com", "pass", "Full Name");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/auth/register",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "a@b.com", password: "pass", full_name: "Full Name" }),
        })
      );
    });

    it("getProjects calls GET /api/projects", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, []));
      await api.getProjects();
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/projects",
        expect.any(Object)
      );
    });

    it("createProject sends POST", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { id: 1 }));
      await api.createProject({ name: "Test" });
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/projects",
        expect.objectContaining({ method: "POST" })
      );
    });

    it("deleteProject sends DELETE", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, undefined));
      await api.deleteProject(5);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/projects/5",
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("getMentions builds query string from filters", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { items: [] }));
      await api.getMentions(1, { page: 2, sentiment: "positive" });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/api/projects/1/mentions");
      expect(url).toContain("page=2");
      expect(url).toContain("sentiment=positive");
    });

    it("search sends POST with params in body (6.39)", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { results: [] }));
      await api.search({ query: "test", platform: "twitter" });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/search");
      const options = mockFetch.mock.calls[0][1] as RequestInit;
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body as string);
      expect(body.query).toBe("test");
      expect(body.platform).toBe("twitter");
    });

    it("generateReport sends POST", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { id: 1 }));
      await api.generateReport(3, "weekly");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/projects/3/reports",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ type: "weekly" }),
        })
      );
    });

    it("inviteMember sends POST with email and role", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, {}));
      await api.inviteMember("new@org.com", "editor");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:8000/api/org/members/invite",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "new@org.com", role: "editor" }),
        })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// 6.5 — ApiError.safeMessage
// ---------------------------------------------------------------------------

describe("ApiError.safeMessage", () => {
  it("returns user-friendly message for 401", () => {
    const err = new ApiError(401, "token expired");
    expect(err.safeMessage).toBe("Your session has expired. Please log in again.");
  });

  it("returns user-friendly message for 403", () => {
    const err = new ApiError(403, "forbidden");
    expect(err.safeMessage).toBe("You do not have permission to perform this action.");
  });

  it("returns user-friendly message for 404", () => {
    const err = new ApiError(404, "");
    expect(err.safeMessage).toBe("The requested resource was not found.");
  });

  it("returns user-friendly message for 429", () => {
    const err = new ApiError(429, "rate limited");
    expect(err.safeMessage).toBe("Too many requests. Please wait a moment and try again.");
  });

  it("returns server error message for 500", () => {
    const err = new ApiError(500, "internal error");
    expect(err.safeMessage).toBe("A server error occurred. Please try again later.");
  });

  it("strips HTML tags from body in safeMessage", () => {
    const err = new ApiError(400, '<script>alert("xss")</script>Bad input');
    expect(err.safeMessage).not.toContain("<script>");
    expect(err.safeMessage).toContain("Bad input");
  });

  it("truncates long error bodies", () => {
    const longBody = "x".repeat(1000);
    const err = new ApiError(400, longBody);
    // safeMessage should be capped (truncateText at 500 chars)
    expect(err.safeMessage.length).toBeLessThan(600);
  });
});

// ---------------------------------------------------------------------------
// 6.7 — Retry logic
// ---------------------------------------------------------------------------

describe("Retry logic", () => {
  it("retries GET on 500 and eventually succeeds", async () => {
    // First call: 500, second call: 200
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Server Error"),
        headers: new Headers(),
      })
      .mockResolvedValueOnce(mockJsonResponse(200, { ok: true }));

    const result = await api.getMe();
    expect(result).toEqual({ ok: true });
    // Should have been called twice (1 initial + 1 retry)
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not retry POST on 500 (no idempotency key)", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Server Error"),
      headers: new Headers(),
    });

    await expect(api.createProject({ name: "Test" })).rejects.toThrow(ApiError);
    // POST without idempotency key should NOT retry
    expect(mockFetch.mock.calls.length).toBe(1);
  });

  it("does not retry on 400 client error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Bad Request"),
    });

    await expect(api.getMe()).rejects.toThrow(ApiError);
    expect(mockFetch.mock.calls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 6.3 — CSRF token generation
// ---------------------------------------------------------------------------

describe("CSRF token", () => {
  it("includes X-CSRF-Token header on requests", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(200, {}));
    await api.getMe();
    const callArgs = mockFetch.mock.calls[0];
    const csrfToken = callArgs[1].headers["X-CSRF-Token"];
    expect(csrfToken).toBeDefined();
    expect(typeof csrfToken).toBe("string");
    expect(csrfToken.length).toBeGreaterThan(0);
  });

  it("includes X-Requested-With header for CORS protection", async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(200, {}));
    await api.getMe();
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers["X-Requested-With"]).toBe("XMLHttpRequest");
  });
});

// ---------------------------------------------------------------------------
// 6.15 — Zod parseResponse
// ---------------------------------------------------------------------------

describe("parseResponse (Zod validation)", () => {
  it("returns parsed data on valid input", () => {
    const validUser = { id: 1, email: "a@b.com", full_name: "Test", role: "admin", org_id: 1 };
    const result = parseResponse(UserSchema, validUser);
    expect(result).toEqual(validUser);
  });

  it("logs warning and returns raw data on invalid input (graceful degradation)", () => {
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const invalidUser = { id: "not-a-number", email: 123 };
    const result = parseResponse(UserSchema, invalidUser);
    // Should return the raw data as-is
    expect(result).toEqual(invalidUser);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[schema validation]"),
      expect.any(Array),
    );
    consoleSpy.mockRestore();
  });

  it("validates project list schema correctly", () => {
    const projects = [
      {
        id: 1,
        name: "Project A",
        client_name: "Client",
        status: "active",
        platforms: ["twitter"],
        keywords: [],
        mention_count: 0,
        avg_sentiment: 0,
        total_reach: 0,
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
      },
    ];
    const result = parseResponse(ProjectListSchema, projects);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Project A");
  });
});
