"""
PII masking utilities for KhushFus.

Masks personally identifiable information (emails, phone numbers, SSNs,
credit card numbers) in text before it enters the NLP pipeline or is stored.
"""

import re

# Pre-compiled patterns for performance
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

# US/international phone formats: +1-555-123-4567, (555) 123-4567, 555.123.4567, etc.
_PHONE_RE = re.compile(
    r"(?<!\d)"  # negative lookbehind to avoid matching inside longer numbers
    r"(?:\+?\d{1,3}[-.\s]?)?"  # optional country code
    r"(?:\(?\d{2,4}\)?[-.\s]?)"  # area code
    r"\d{3,4}[-.\s]?\d{3,4}"
    r"(?!\d)"  # negative lookahead
)

# SSN: 123-45-6789 or 123 45 6789
_SSN_RE = re.compile(r"\b\d{3}[-\s]\d{2}[-\s]\d{4}\b")

# Credit card: 4 groups of 4 digits separated by spaces or dashes, or 16 consecutive digits
_CC_RE = re.compile(r"\b\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4}\b|\b\d{16}\b")


def mask_pii(text: str) -> str:
    """Replace PII patterns in *text* with placeholder tokens.

    Masking order matters: SSN and CC are checked before phone numbers
    to avoid partial matches.

    Returns:
        The text with PII replaced by ``[EMAIL]``, ``[PHONE]``, ``[SSN]``,
        or ``[CC]`` tokens.
    """
    text = _EMAIL_RE.sub("[EMAIL]", text)
    text = _SSN_RE.sub("[SSN]", text)
    text = _CC_RE.sub("[CC]", text)
    text = _PHONE_RE.sub("[PHONE]", text)
    return text
