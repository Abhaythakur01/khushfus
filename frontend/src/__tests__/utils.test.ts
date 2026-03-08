import { cn, formatNumber, formatDate, formatDateTime, truncate, capitalize, getInitials } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "extra")).toBe("base extra");
  });

  it("merges tailwind classes, last wins", () => {
    const result = cn("px-4", "px-6");
    expect(result).toBe("px-6");
  });
});

describe("formatNumber", () => {
  it("returns plain number below 1000", () => {
    expect(formatNumber(42)).toBe("42");
    expect(formatNumber(999)).toBe("999");
  });

  it("formats thousands with K", () => {
    expect(formatNumber(1000)).toBe("1K");
    expect(formatNumber(1500)).toBe("1.5K");
    expect(formatNumber(23400)).toBe("23.4K");
  });

  it("formats millions with M", () => {
    expect(formatNumber(1000000)).toBe("1M");
    expect(formatNumber(2500000)).toBe("2.5M");
  });

  it("formats billions with B", () => {
    expect(formatNumber(1000000000)).toBe("1B");
    expect(formatNumber(3700000000)).toBe("3.7B");
  });

  it("removes trailing .0", () => {
    expect(formatNumber(2000)).toBe("2K");
    expect(formatNumber(5000000)).toBe("5M");
  });
});

describe("formatDate", () => {
  it("formats an ISO date string", () => {
    expect(formatDate("2024-06-15T12:00:00Z")).toBe("Jun 15, 2024");
  });

  it("formats a Date object", () => {
    const d = new Date(2024, 0, 1); // Jan 1 2024
    expect(formatDate(d)).toBe("Jan 1, 2024");
  });
});

describe("formatDateTime", () => {
  it("formats date string with time", () => {
    // Note: exact output depends on local timezone, just ensure it contains date parts
    const result = formatDateTime("2024-06-15T14:30:00Z");
    expect(result).toContain("Jun 15, 2024");
    expect(result).toContain("at");
  });

  it("formats a Date object with time", () => {
    const d = new Date(2024, 5, 15, 14, 30); // Jun 15 2024 2:30 PM local
    const result = formatDateTime(d);
    expect(result).toContain("Jun 15, 2024");
    expect(result).toContain("2:30 PM");
  });
});

describe("truncate", () => {
  it("returns full string if shorter than limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns full string if equal to limit", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends ellipsis if longer", () => {
    expect(truncate("hello world", 5)).toBe("hello...");
  });

  it("trims trailing whitespace before ellipsis", () => {
    expect(truncate("hello world foo", 6)).toBe("hello...");
  });
});

describe("capitalize", () => {
  it("capitalizes first letter and lowercases rest", () => {
    expect(capitalize("hello")).toBe("Hello");
    expect(capitalize("WORLD")).toBe("World");
    expect(capitalize("fOO")).toBe("Foo");
  });

  it("handles single character", () => {
    expect(capitalize("a")).toBe("A");
  });
});

describe("getInitials", () => {
  it("returns initials from a full name", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("returns at most two characters", () => {
    expect(getInitials("John Michael Doe")).toBe("JM");
  });

  it("returns single initial for single name", () => {
    expect(getInitials("Alice")).toBe("A");
  });

  it("uppercases initials", () => {
    expect(getInitials("alice bob")).toBe("AB");
  });
});
