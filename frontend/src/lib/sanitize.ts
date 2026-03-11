/**
 * Simple HTML sanitizer for user-generated content.
 *
 * Strips all HTML tags except a small allowlist of safe inline elements.
 * This is a defense-in-depth measure. React already escapes text content
 * rendered via JSX, but this utility is useful when you need to process
 * strings before display (e.g., error messages from the backend).
 *
 * For richer sanitization needs (e.g., rendering HTML from a CMS),
 * consider importing DOMPurify instead.
 */

const SAFE_TAGS = new Set(["b", "i", "em", "strong", "code", "br"]);

/**
 * Strip HTML tags from a string. Only tags in the SAFE_TAGS allowlist are
 * preserved; all others (including their attributes) are removed.
 */
export function sanitizeHtml(input: string): string {
  if (!input) return "";
  // Remove script/style blocks entirely (including content)
  let cleaned = input.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  // Strip disallowed tags but keep their text content
  cleaned = cleaned.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g, (match, tag) => {
    const lower = tag.toLowerCase();
    if (SAFE_TAGS.has(lower)) {
      // Keep safe tags but strip any attributes
      if (match.startsWith("</")) return `</${lower}>`;
      if (lower === "br") return "<br>";
      return `<${lower}>`;
    }
    return "";
  });
  return cleaned;
}

/**
 * Strip ALL HTML tags and return plain text.
 * Also decodes common HTML entities.
 */
export function stripHtml(input: string): string {
  if (!input) return "";
  let text = input.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  text = text.replace(/<[^>]+>/g, "");
  // Decode common entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  return text;
}

/**
 * Truncate a string to maxLen characters, appending an ellipsis if truncated.
 */
export function truncateText(input: string, maxLen: number): string {
  if (!input || input.length <= maxLen) return input || "";
  return input.slice(0, maxLen).trimEnd() + "...";
}
