import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

// Mock the API module
jest.mock("@/lib/api", () => ({
  api: {
    setToken: jest.fn(),
    clearToken: jest.fn(),
    getMe: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, val: string) => {
      store[key] = val;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Helper component to inspect auth context
function AuthConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="loading">{String(auth.isLoading)}</span>
      <span data-testid="user">{auth.user ? auth.user.email : "none"}</span>
      <button onClick={() => auth.login("test@test.com", "pass123")}>Login</button>
      <button onClick={auth.logout}>Logout</button>
    </div>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  localStorageMock.clear();
});

describe("AuthProvider", () => {
  it("renders children", () => {
    (api.getMe as jest.Mock).mockRejectedValue(new Error("no token"));
    render(
      <AuthProvider>
        <div>child content</div>
      </AuthProvider>
    );
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("starts with isLoading true and isAuthenticated false when no stored token", async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );
    // After mount with no token, isLoading should resolve to false
    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
  });

  it("restores session from stored token", async () => {
    localStorageMock.getItem.mockReturnValue("stored-token");
    (api.getMe as jest.Mock).mockResolvedValue({
      user: { id: 1, email: "user@example.com", full_name: "User", role: "admin", org_id: 1 },
      org: { id: 1, name: "Org", slug: "org", plan: "pro" },
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("authenticated").textContent).toBe("true");
    });
    expect(screen.getByTestId("user").textContent).toBe("user@example.com");
    expect(api.setToken).toHaveBeenCalledWith("stored-token");
  });

  it("clears auth when stored token is invalid", async () => {
    localStorageMock.getItem.mockReturnValue("bad-token");
    (api.getMe as jest.Mock).mockRejectedValue(new Error("401"));

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
    expect(api.clearToken).toHaveBeenCalled();
  });
});

describe("useAuth", () => {
  it("throws when used outside AuthProvider", () => {
    // Suppress React error boundary output
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<AuthConsumer />)).toThrow(
      "useAuth must be used within an AuthProvider"
    );

    consoleSpy.mockRestore();
  });

  it("login calls api.login and sets authenticated state", async () => {
    (api.login as jest.Mock).mockResolvedValue({
      access_token: "new-token",
      user: { id: 2, email: "test@test.com", full_name: "Test", role: "member", org_id: 1 },
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });

    await act(async () => {
      screen.getByText("Login").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("authenticated").textContent).toBe("true");
    });
    expect(screen.getByTestId("user").textContent).toBe("test@test.com");
    expect(api.login).toHaveBeenCalledWith("test@test.com", "pass123");
    expect(localStorageMock.setItem).toHaveBeenCalledWith("khushfus_token", "new-token");
  });

  it("logout clears auth state", async () => {
    localStorageMock.getItem.mockReturnValue("tok");
    (api.getMe as jest.Mock).mockResolvedValue({
      user: { id: 1, email: "u@u.com", full_name: "U", role: "admin", org_id: 1 },
    });

    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("authenticated").textContent).toBe("true");
    });

    await act(async () => {
      screen.getByText("Logout").click();
    });

    expect(screen.getByTestId("authenticated").textContent).toBe("false");
    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("khushfus_token");
    expect(api.clearToken).toHaveBeenCalled();
  });
});
