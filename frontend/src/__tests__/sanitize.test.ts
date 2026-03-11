/**
 * Tests for:
 *   - sanitize.ts  (sanitizeHtml, stripHtml, truncateText)
 *   - schemas.ts   (parseResponse, Zod schemas)
 *   - i18n.ts      (useTranslation hook)
 *   - logger.ts    (Logger class)
 */

import { renderHook, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// sanitize.ts
// ---------------------------------------------------------------------------

import { sanitizeHtml, stripHtml, truncateText } from "@/lib/sanitize";

describe("sanitizeHtml", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("returns empty string for null/undefined input", () => {
    expect(sanitizeHtml(null as any)).toBe("");
    expect(sanitizeHtml(undefined as any)).toBe("");
  });

  it("passes through plain text unchanged", () => {
    expect(sanitizeHtml("Hello, world!")).toBe("Hello, world!");
  });

  it("strips disallowed tags but keeps their text content", () => {
    const result = sanitizeHtml("<p>Hello <span>world</span></p>");
    expect(result).not.toContain("<p>");
    expect(result).not.toContain("<span>");
    expect(result).toContain("Hello");
    expect(result).toContain("world");
  });

  it("removes script tags and their entire content", () => {
    const result = sanitizeHtml('<script>alert("xss")</script>safe text');
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
    expect(result).toContain("safe text");
  });

  it("removes style tags and their entire content", () => {
    const result = sanitizeHtml("<style>body{color:red}</style>visible");
    expect(result).not.toContain("<style>");
    expect(result).not.toContain("body{color");
    expect(result).toContain("visible");
  });

  it("preserves the safe tag: <b>", () => {
    expect(sanitizeHtml("<b>bold</b>")).toContain("<b>");
    expect(sanitizeHtml("<b>bold</b>")).toContain("</b>");
  });

  it("preserves the safe tag: <i>", () => {
    expect(sanitizeHtml("<i>italic</i>")).toContain("<i>");
  });

  it("preserves the safe tag: <em>", () => {
    expect(sanitizeHtml("<em>emphasis</em>")).toContain("<em>");
  });

  it("preserves the safe tag: <strong>", () => {
    expect(sanitizeHtml("<strong>strong</strong>")).toContain("<strong>");
  });

  it("preserves the safe tag: <code>", () => {
    expect(sanitizeHtml("<code>code</code>")).toContain("<code>");
  });

  it("preserves the self-closing <br>", () => {
    expect(sanitizeHtml("line<br>break")).toContain("<br>");
  });

  it("strips attributes from allowed safe tags", () => {
    const result = sanitizeHtml('<b class="danger" onclick="evil()">text</b>');
    expect(result).toBe("<b>text</b>");
  });

  it("strips href from anchor tags", () => {
    const result = sanitizeHtml('<a href="http://evil.com">click me</a>');
    expect(result).not.toContain("<a");
    expect(result).not.toContain("href");
    expect(result).toContain("click me");
  });

  it("strips img tags including onerror attributes", () => {
    const result = sanitizeHtml('<img src="x" onerror="evil()"> caption');
    expect(result).not.toContain("<img");
    expect(result).not.toContain("onerror");
    expect(result).toContain("caption");
  });

  it("handles deeply nested disallowed tags", () => {
    const result = sanitizeHtml("<div><section><article>content</article></section></div>");
    expect(result).not.toContain("<div>");
    expect(result).not.toContain("<section>");
    expect(result).toContain("content");
  });
});

describe("stripHtml", () => {
  it("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });

  it("returns empty string for null/undefined input", () => {
    expect(stripHtml(null as any)).toBe("");
    expect(stripHtml(undefined as any)).toBe("");
  });

  it("strips all HTML tags and returns plain text", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("removes script tags and their content", () => {
    const result = stripHtml('<script>alert("xss")</script>text');
    expect(result).not.toContain("alert");
    expect(result).toContain("text");
  });

  it("removes style tags and their content", () => {
    const result = stripHtml("<style>body{color:red}</style>visible");
    expect(result).not.toContain("color");
    expect(result).toContain("visible");
  });

  it("decodes &amp; entity", () => {
    expect(stripHtml("AT&amp;T")).toBe("AT&T");
  });

  it("decodes &lt; and &gt; entities", () => {
    expect(stripHtml("&lt;b&gt;")).toBe("<b>");
  });

  it("decodes &quot; entity", () => {
    expect(stripHtml("say &quot;hello&quot;")).toBe('say "hello"');
  });

  it("decodes &#39; entity", () => {
    expect(stripHtml("it&#39;s")).toBe("it's");
  });

  it("decodes &nbsp; entity into a space", () => {
    expect(stripHtml("a&nbsp;b")).toBe("a b");
  });

  it("handles plain text with no HTML unchanged", () => {
    expect(stripHtml("plain text")).toBe("plain text");
  });
});

describe("truncateText", () => {
  it("returns empty string for empty input", () => {
    expect(truncateText("", 10)).toBe("");
  });

  it("returns empty string for null/undefined input", () => {
    expect(truncateText(null as any, 10)).toBe("");
    expect(truncateText(undefined as any, 10)).toBe("");
  });

  it("returns input unchanged when shorter than maxLen", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("returns input unchanged when exactly equal to maxLen", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis when longer than maxLen", () => {
    const result = truncateText("Hello world!", 5);
    expect(result.endsWith("...")).toBe(true);
    expect(result.length).toBeGreaterThan(3); // at minimum the ellipsis
  });

  it("result does not exceed maxLen + 3 characters (the ellipsis)", () => {
    const result = truncateText("a".repeat(100), 20);
    expect(result.length).toBeLessThanOrEqual(23);
  });

  it("trims trailing whitespace before appending ellipsis", () => {
    const result = truncateText("hello     world", 7);
    expect(result).not.toMatch(/\s+\.\.\.$/);
    expect(result.endsWith("...")).toBe(true);
  });

  it("returns a 500-char capped result for very long strings", () => {
    const long = "x".repeat(1000);
    const result = truncateText(long, 500);
    expect(result.length).toBeLessThanOrEqual(503);
    expect(result.endsWith("...")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// schemas.ts — parseResponse and Zod schemas
// ---------------------------------------------------------------------------

import {
  parseResponse,
  UserSchema,
  ProjectSchema,
  ProjectListSchema,
  MentionSchema,
  PaginatedMentionsSchema,
  DashboardMetricsSchema,
  MeResponseSchema,
  ProjectKeywordSchema,
} from "@/lib/schemas";

describe("parseResponse — UserSchema", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns validated data for a valid user object", () => {
    const valid = { id: 1, email: "a@b.com", full_name: "Test User", role: "admin", org_id: 1 };
    const result = parseResponse(UserSchema, valid);
    expect(result).toEqual(valid);
  });

  it("validates optional avatar_url", () => {
    const valid = {
      id: 1,
      email: "a@b.com",
      full_name: "Test",
      role: "viewer",
      org_id: 2,
      avatar_url: "https://example.com/avatar.png",
    };
    const result = parseResponse(UserSchema, valid);
    expect(result.avatar_url).toBe("https://example.com/avatar.png");
  });

  it("logs warning and returns raw data for invalid user input", () => {
    const invalid = { id: "not-a-number", email: 123 };
    const result = parseResponse(UserSchema, invalid);
    expect(result).toEqual(invalid);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("[schema validation]"),
      expect.any(Array)
    );
  });
});

describe("parseResponse — ProjectSchema", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const baseProject = {
    id: 1,
    name: "Test Project",
    client_name: "Test Client",
    status: "active" as const,
    platforms: "twitter,facebook",
    created_at: "2024-01-01",
    updated_at: "2024-01-02",
  };

  it("validates a minimal project and fills defaults", () => {
    const result = parseResponse(ProjectSchema, baseProject);
    expect(result.keywords).toEqual([]);
    expect(result.mention_count).toBe(0);
    expect(result.avg_sentiment).toBe(0);
    expect(result.total_reach).toBe(0);
  });

  it("validates projects with array platforms", () => {
    const proj = { ...baseProject, platforms: ["twitter", "facebook"] };
    const result = parseResponse(ProjectSchema, proj);
    expect(Array.isArray(result.platforms)).toBe(true);
  });

  it("validates keywords inside a project", () => {
    const proj = {
      ...baseProject,
      keywords: [{ id: 1, term: "brand", keyword_type: "brand", is_active: true }],
    };
    const result = parseResponse(ProjectSchema, proj);
    expect(result.keywords).toHaveLength(1);
    expect(result.keywords[0].term).toBe("brand");
  });

  it("rejects an invalid status value", () => {
    const invalid = { ...baseProject, status: "unknown_status" };
    // parseResponse is graceful — returns raw data and logs warning
    const result = parseResponse(ProjectSchema, invalid);
    expect(console.warn).toHaveBeenCalled();
    expect(result).toEqual(invalid);
  });
});

describe("parseResponse — ProjectListSchema", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("validates an empty array", () => {
    const result = parseResponse(ProjectListSchema, []);
    expect(result).toEqual([]);
  });

  it("validates a list with one project", () => {
    const list = [
      {
        id: 1,
        name: "A",
        client_name: "C",
        status: "active",
        platforms: ["twitter"],
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
      },
    ];
    const result = parseResponse(ProjectListSchema, list);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("A");
  });
});

describe("parseResponse — MentionSchema", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const baseMention = {
    id: 1,
    platform: "twitter",
    text: "Hello world",
    sentiment: "positive",
    sentiment_score: 0.8,
    sentiment_confidence: 0.9,
    source_url: "https://t.co/abc",
    has_media: false,
    is_flagged: false,
    language: "en",
  };

  it("validates a complete mention", () => {
    const result = parseResponse(MentionSchema, baseMention);
    expect(result.id).toBe(1);
    expect(result.sentiment).toBe("positive");
  });

  it("applies defaults for engagement counters", () => {
    const result = parseResponse(MentionSchema, baseMention);
    expect(result.likes).toBe(0);
    expect(result.shares).toBe(0);
    expect(result.comments).toBe(0);
    expect(result.reach).toBe(0);
  });

  it("validates optional nested author object", () => {
    const withAuthor = {
      ...baseMention,
      author: {
        name: "John",
        handle: "@john",
        followers: 500,
        influence_score: 0.7,
        is_bot: false,
      },
    };
    const result = parseResponse(MentionSchema, withAuthor);
    expect(result.author?.name).toBe("John");
    expect(result.author?.is_bot).toBe(false);
  });
});

describe("parseResponse — DashboardMetricsSchema", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("validates metrics with all required fields", () => {
    const data = {
      total_mentions: 42,
      avg_sentiment: 0.6,
      total_reach: 10000,
      total_engagement: 1500,
    };
    const result = parseResponse(DashboardMetricsSchema, data);
    expect(result.total_mentions).toBe(42);
    expect(result.trend).toEqual([]);
    expect(result.sentiment_breakdown).toEqual({});
    expect(result.platform_breakdown).toEqual({});
    expect(result.recent_mentions).toEqual([]);
  });

  it("passthrough allows extra keys on DashboardMetrics", () => {
    const data = {
      total_mentions: 0,
      avg_sentiment: 0,
      total_reach: 0,
      total_engagement: 0,
      custom_extra_key: "some_value",
    };
    const result = parseResponse(DashboardMetricsSchema, data);
    expect((result as any).custom_extra_key).toBe("some_value");
  });
});

describe("parseResponse — MeResponseSchema", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("validates a response with nested user and org", () => {
    const data = {
      user: { id: 1, email: "u@u.com", full_name: "User", role: "admin", org_id: 1 },
      org: { id: 1, name: "Acme", slug: "acme", plan: "enterprise" },
    };
    const result = parseResponse(MeResponseSchema, data);
    expect(result.user?.email).toBe("u@u.com");
    expect(result.org?.name).toBe("Acme");
  });

  it("accepts flat user fields without nested user object", () => {
    const data = {
      id: 5,
      email: "flat@user.com",
      full_name: "Flat User",
      role: "viewer",
      org_id: 2,
    };
    const result = parseResponse(MeResponseSchema, data);
    expect(result.email).toBe("flat@user.com");
  });

  it("accepts null org", () => {
    const data = {
      user: { id: 1, email: "u@u.com", full_name: "User", role: "admin", org_id: 1 },
      org: null,
    };
    const result = parseResponse(MeResponseSchema, data);
    expect(result.org).toBeNull();
  });
});

describe("ProjectKeywordSchema", () => {
  beforeEach(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("validates a keyword with all fields", () => {
    const kw = { id: 1, term: "brand", keyword_type: "brand", is_active: true };
    const result = parseResponse(ProjectKeywordSchema, kw);
    expect(result.term).toBe("brand");
    expect(result.is_active).toBe(true);
  });

  it("rejects keyword missing required fields", () => {
    const invalid = { term: "brand" };
    parseResponse(ProjectKeywordSchema, invalid);
    expect(console.warn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// i18n.ts — useTranslation
// ---------------------------------------------------------------------------

import { useTranslation } from "@/lib/i18n";

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

Object.defineProperty(window, "localStorage", { value: localStorageMock, writable: true });

describe("useTranslation", () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it("returns t function, setLocale, and locale", () => {
    const { result } = renderHook(() => useTranslation());
    expect(typeof result.current.t).toBe("function");
    expect(typeof result.current.setLocale).toBe("function");
    expect(result.current.locale).toBeDefined();
  });

  it("defaults to 'en' locale", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.locale).toBe("en");
  });

  it("t() returns the English translation for nav.dashboard", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("nav.dashboard")).toBe("Dashboard");
  });

  it("t() returns the English translation for nav.mentions", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("nav.mentions")).toBe("Mentions");
  });

  it("t() returns the key itself for an unknown translation key", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("this.key.does.not.exist")).toBe("this.key.does.not.exist");
  });

  it("t() returns button labels from English locale", () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.t("button.save")).toBe("Save");
    expect(result.current.t("button.cancel")).toBe("Cancel");
  });

  it("setLocale persists choice to localStorage", () => {
    const { result } = renderHook(() => useTranslation());
    act(() => {
      result.current.setLocale("en");
    });
    expect(localStorageMock.setItem).toHaveBeenCalledWith("khushfus_locale", "en");
  });

  it("t() does not leave unreplaced {{placeholder}} in output for known keys", () => {
    const { result } = renderHook(() => useTranslation());
    // All en.ts keys are static strings with no interpolation; result should not have {{ }}
    const value = result.current.t("nav.dashboard");
    expect(value).not.toContain("{{");
  });
});

// ---------------------------------------------------------------------------
// logger.ts
// ---------------------------------------------------------------------------

import { logger } from "@/lib/logger";

describe("logger", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("logger.warn delegates to console.warn", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("warning message");
    expect(spy).toHaveBeenCalled();
  });

  it("logger.error delegates to console.error", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    logger.error("error message");
    expect(spy).toHaveBeenCalled();
  });

  it("logger.info delegates to console.info", () => {
    const spy = jest.spyOn(console, "info").mockImplementation(() => {});
    logger.info("info message");
    expect(spy).toHaveBeenCalled();
  });

  it("logger.debug delegates to console.debug", () => {
    const spy = jest.spyOn(console, "debug").mockImplementation(() => {});
    logger.debug("debug message");
    expect(spy).toHaveBeenCalled();
  });

  it("output includes a timestamp bracket", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    logger.warn("test");
    const prefix = spy.mock.calls[0][0] as string;
    expect(prefix).toMatch(/^\[.+\]/);
  });

  it("output includes the message text", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    logger.error("specific error text");
    const allArgs = spy.mock.calls[0].join(" ");
    expect(allArgs).toContain("specific error text");
  });

  it("child logger includes context name in prefix", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const child = logger.child("MyComponent");
    child.warn("child warning");
    const prefix = spy.mock.calls[0][0] as string;
    expect(prefix).toContain("MyComponent");
  });

  it("child logger passes data argument to console", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const child = logger.child("TestCtx");
    const extraData = { statusCode: 500 };
    child.error("error with data", extraData);
    const callArgs = spy.mock.calls[0];
    expect(callArgs).toContain(extraData);
  });

  it("logger.warn with data passes data to console.warn", () => {
    const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const data = { key: "value" };
    logger.warn("warn with data", data);
    const callArgs = spy.mock.calls[0];
    expect(callArgs).toContain(data);
  });

  it("different log levels produce different console methods", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    logger.warn("warning");
    logger.error("error");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
