import { api, ApiError } from "@/lib/api";

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

    it("search builds query string from params", async () => {
      mockFetch.mockResolvedValueOnce(mockJsonResponse(200, { results: [] }));
      await api.search({ query: "test", platform: "twitter" });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("query=test");
      expect(url).toContain("platform=twitter");
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
