"""SSRF-safe URL validation for outbound HTTP requests.

Use ``validate_url(url)`` before fetching any user-controllable URL
to block requests to private/internal networks.
"""

import ipaddress
import logging
import socket
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

_BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),       # loopback
    ipaddress.ip_network("10.0.0.0/8"),         # private class A
    ipaddress.ip_network("172.16.0.0/12"),      # private class B
    ipaddress.ip_network("192.168.0.0/16"),     # private class C
    ipaddress.ip_network("169.254.0.0/16"),     # link-local / cloud metadata
    ipaddress.ip_network("0.0.0.0/8"),          # "this" network
    ipaddress.ip_network("::1/128"),            # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),           # IPv6 unique local
    ipaddress.ip_network("fe80::/10"),          # IPv6 link-local
]

_ALLOWED_SCHEMES = {"http", "https"}


def validate_url(url: str, allow_internal: bool = False) -> str:
    """Validate that a URL is safe from SSRF attacks.

    Args:
        url: The URL to validate.
        allow_internal: If True, skip private IP checks (for trusted callers only).

    Returns:
        The validated URL string.

    Raises:
        ValueError: If the URL is unsafe (blocked scheme, private IP, unresolvable).
    """
    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise ValueError(f"Blocked URL scheme: {parsed.scheme!r}")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("No hostname in URL")

    resolved_ip = None
    if not allow_internal:
        try:
            addr_infos = socket.getaddrinfo(hostname, None)
        except socket.gaierror:
            raise ValueError(f"Cannot resolve hostname: {hostname}")

        for addr_info in addr_infos:
            ip = ipaddress.ip_address(addr_info[4][0])
            for network in _BLOCKED_NETWORKS:
                if ip in network:
                    raise ValueError(f"URL resolves to blocked network ({ip})")

        # Use the first resolved IP so callers can pin to it (prevents DNS rebinding)
        resolved_ip = addr_infos[0][4][0]

    return url


def validate_url_with_pin(url: str, allow_internal: bool = False) -> tuple[str, str | None]:
    """Validate a URL and return the resolved IP to pin connections against DNS rebinding.

    Args:
        url: The URL to validate.
        allow_internal: If True, skip private IP checks (for trusted callers only).

    Returns:
        Tuple of (validated_url, resolved_ip). resolved_ip is None when allow_internal=True.

    Raises:
        ValueError: If the URL is unsafe (blocked scheme, private IP, unresolvable).
    """
    parsed = urlparse(url)
    if parsed.scheme not in _ALLOWED_SCHEMES:
        raise ValueError(f"Blocked URL scheme: {parsed.scheme!r}")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("No hostname in URL")

    resolved_ip = None
    if not allow_internal:
        try:
            addr_infos = socket.getaddrinfo(hostname, None)
        except socket.gaierror:
            raise ValueError(f"Cannot resolve hostname: {hostname}")

        for addr_info in addr_infos:
            ip = ipaddress.ip_address(addr_info[4][0])
            for network in _BLOCKED_NETWORKS:
                if ip in network:
                    raise ValueError(f"URL resolves to blocked network ({ip})")

        resolved_ip = addr_infos[0][4][0]

    return url, resolved_ip
