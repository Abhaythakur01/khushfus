"""Minimal env-var-based feature flag utility.

Usage:
    from shared.feature_flags import is_feature_enabled

    if is_feature_enabled("dark_mode"):
        ...

Enable a flag by setting the env var ``FEATURE_DARK_MODE=1`` (or ``true``/``yes``).
"""

import os

_TRUTHY = {"1", "true", "yes", "on"}


def is_feature_enabled(flag_name: str, default: bool = False) -> bool:
    """Check whether a feature flag is enabled via environment variable.

    Looks up ``FEATURE_{FLAG_NAME}`` (uppercased).  Recognised truthy values
    are ``1``, ``true``, ``yes``, and ``on`` (case-insensitive).  If the env
    var is absent the *default* value is returned.
    """
    env_key = f"FEATURE_{flag_name.upper()}"
    value = os.getenv(env_key)
    if value is None:
        return default
    return value.strip().lower() in _TRUTHY
