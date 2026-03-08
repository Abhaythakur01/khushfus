import hashlib
import hmac
import json
import os
import time

WEBHOOK_SECRET = os.getenv("WEBHOOK_SIGNING_SECRET", "dev-webhook-secret")


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
    if abs(time.time() - int(timestamp)) > max_age:
        return False
    body = json.dumps(payload, sort_keys=True, default=str)
    expected = hmac.new(
        secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
