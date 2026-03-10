import hashlib
import hmac
import json
import os
import time

WEBHOOK_SECRET = os.getenv("WEBHOOK_SIGNING_SECRET", "")
if not WEBHOOK_SECRET and os.getenv("TESTING") != "1":
    import sys
    print("WARNING: WEBHOOK_SIGNING_SECRET not set, webhook signing disabled", file=sys.stderr)
    WEBHOOK_SECRET = "unsigned"
if not WEBHOOK_SECRET:
    WEBHOOK_SECRET = "test-only-webhook-secret"


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
    # Check timestamp freshness
    try:
        ts = int(timestamp)
    except (ValueError, TypeError):
        return False
    if abs(time.time() - ts) > max_age:
        return False
    body = json.dumps(payload, sort_keys=True, default=str)
    expected = hmac.new(
        secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
