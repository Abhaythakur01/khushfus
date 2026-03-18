"""HMAC-based webhook payload signing and verification.

Used by the notification service (outbound webhooks) and alert rule delivery
to ensure webhook payloads are authentic and untampered.

Usage:
    from shared.webhook import sign_payload, verify_signature

    # Signing (sender side — dict payload)
    headers = sign_payload(payload_dict)

    # Signing (sender side — raw bytes)
    sig_header = sign_raw(secret, body_bytes)

    # Verification (receiver side — dict payload)
    is_valid = verify_signature(payload_dict, sig, timestamp)

    # Verification (receiver side — raw bytes)
    is_valid = verify_raw(secret, body_bytes, signature_header)
"""

import hashlib
import hmac
import json
import logging
import os
import time

logger = logging.getLogger(__name__)

WEBHOOK_SECRET = os.getenv("WEBHOOK_SIGNING_SECRET", "")
if not WEBHOOK_SECRET and os.getenv("TESTING") != "1":
    import sys

    print("WARNING: WEBHOOK_SIGNING_SECRET not set, webhook signing disabled", file=sys.stderr)
    WEBHOOK_SECRET = "unsigned"
if not WEBHOOK_SECRET:
    WEBHOOK_SECRET = "test-only-webhook-secret"

if os.getenv("ENVIRONMENT") == "production":
    import sys

    if not os.getenv("WEBHOOK_SIGNING_SECRET") or WEBHOOK_SECRET == "unsigned":
        print("FATAL: WEBHOOK_SIGNING_SECRET must be set to a strong secret in production!", file=sys.stderr)
        sys.exit(1)

SIGNATURE_ALGORITHM = "sha256"


def sign_payload(payload: dict, secret: str | None = None) -> dict:
    """Sign a webhook payload. Returns headers dict with signature and timestamp."""
    secret = secret or WEBHOOK_SECRET
    timestamp = str(int(time.time()))
    body = json.dumps(payload, sort_keys=True, default=str)
    signature = hmac.new(
        secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256
    ).hexdigest()
    return {
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": timestamp,
    }


def verify_signature(
    payload: dict,
    signature: str,
    timestamp: str,
    secret: str | None = None,
    max_age: int = 300,
) -> bool:
    """Verify a webhook signature. Returns True if valid and not expired."""
    secret = secret or WEBHOOK_SECRET
    try:
        ts = int(timestamp)
    except (ValueError, TypeError):
        logger.warning("Invalid webhook timestamp: %s", timestamp)
        return False
    age = abs(time.time() - ts)
    if age > max_age:
        logger.warning("Webhook signature expired: age=%d max_age=%d", age, max_age)
        return False
    body = json.dumps(payload, sort_keys=True, default=str)
    expected = hmac.new(
        secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)


def sign_raw(secret: str, payload: bytes, timestamp: int | None = None) -> str:
    """Generate HMAC-SHA256 signature for raw bytes payload.

    Returns a compact header value: ``t=<ts>,sha256=<hex>``.
    """
    ts = timestamp or int(time.time())
    signed_content = f"{ts}.".encode() + payload
    sig = hmac.new(secret.encode(), signed_content, hashlib.sha256).hexdigest()
    return f"t={ts},{SIGNATURE_ALGORITHM}={sig}"


def verify_raw(
    secret: str,
    payload: bytes,
    signature_header: str,
    tolerance_seconds: int = 300,
) -> bool:
    """Verify an HMAC-SHA256 signature on raw bytes.

    Args:
        secret: The shared secret.
        payload: Raw request body bytes.
        signature_header: Format: ``t=<ts>,sha256=<hex>``.
        tolerance_seconds: Maximum age (default 5 min).
    """
    try:
        parts = dict(part.split("=", 1) for part in signature_header.split(","))
        ts = int(parts["t"])
        received_sig = parts.get(SIGNATURE_ALGORITHM, "")
    except (ValueError, KeyError):
        logger.warning("Malformed webhook signature header")
        return False

    age = abs(int(time.time()) - ts)
    if age > tolerance_seconds:
        logger.warning("Webhook signature too old: %d seconds", age)
        return False

    signed_content = f"{ts}.".encode() + payload
    expected = hmac.new(secret.encode(), signed_content, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received_sig)
