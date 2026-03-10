"""HTML sanitization for user-generated and scraped content."""

import re

# Pattern to strip all HTML tags
_TAG_RE = re.compile(r'<[^>]+>')
# Pattern to strip script/style elements and their content
_SCRIPT_RE = re.compile(r'<(script|style)[^>]*>.*?</\1>', re.DOTALL | re.IGNORECASE)


def strip_html(text: str) -> str:
    """Remove all HTML tags from text, keeping only text content.

    This is a defense-in-depth measure. Use for mention text that should
    never contain HTML when displayed.
    """
    if not text:
        return text
    # Remove script/style blocks first
    text = _SCRIPT_RE.sub('', text)
    # Remove all remaining tags
    text = _TAG_RE.sub('', text)
    # Decode common HTML entities
    text = text.replace('&amp;', '&')
    text = text.replace('&lt;', '<')
    text = text.replace('&gt;', '>')
    text = text.replace('&quot;', '"')
    text = text.replace('&#39;', "'")
    text = text.replace('&nbsp;', ' ')
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text
