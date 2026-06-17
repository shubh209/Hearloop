"""
HTTP-only Crawl4AI sidecar for Hearloop business-context import.
Internal use only — bind to 127.0.0.1 in production.
"""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Hearloop Scraper", version="1.0.0")

BLOCKED_HOSTNAME_RE = re.compile(r"^(localhost|.*\.local)$", re.I)
MAX_BODY_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3
DEFAULT_TIMEOUT_MS = 25_000


class CrawlRequest(BaseModel):
    url: str
    mode: str = Field(default="http", pattern="^http$")
    timeoutMs: int = Field(default=DEFAULT_TIMEOUT_MS, ge=1000, le=60_000)


class CrawlResponse(BaseModel):
    markdown: str
    title: str | None
    bytes: int
    statusCode: int | None


def _is_blocked_hostname(hostname: str) -> bool:
    host = hostname.lower().strip("[]")
    if BLOCKED_HOSTNAME_RE.match(host):
        return True
    blocked_prefixes = (
        "127.",
        "10.",
        "192.168.",
        "169.254.",
        "0.",
    )
    if any(host.startswith(p) for p in blocked_prefixes):
        return True
    if host.startswith("172."):
        parts = host.split(".")
        if len(parts) >= 2:
            try:
                second = int(parts[1])
                if 16 <= second <= 31:
                    return True
            except ValueError:
                pass
    if host in ("::1",) or host.startswith("fc") or host.startswith("fd"):
        return True
    return False


def _assert_public_https_url(raw_url: str) -> str:
    from urllib.parse import urlparse

    trimmed = raw_url.strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="url_required")

    parsed = urlparse(trimmed)
    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="https_only")
    if parsed.username or parsed.password:
        raise HTTPException(status_code=400, detail="credentials_not_allowed")
    hostname = (parsed.hostname or "").lower()
    if not hostname or _is_blocked_hostname(hostname):
        raise HTTPException(status_code=400, detail="blocked_host")
    return trimmed


def _resolve_public_hostname(hostname: str) -> None:
    """DNS rebinding guard — reject if any resolved address is private."""
    try:
        infos = socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail="dns_resolution_failed") from exc

    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
        ):
            raise HTTPException(status_code=400, detail="blocked_resolved_ip")


async def _crawl_http(url: str, timeout_ms: int) -> CrawlResponse:
    from crawl4ai import AsyncWebCrawler, CrawlerRunConfig
    from crawl4ai.async_crawler_strategy import AsyncHTTPCrawlerStrategy
    from crawl4ai.async_configs import HTTPCrawlerConfig

    http_strategy = AsyncHTTPCrawlerStrategy(
        browser_config=HTTPCrawlerConfig(
            method="GET",
            verify_ssl=True,
            follow_redirects=True,
            max_redirects=MAX_REDIRECTS,
        )
    )
    run_config = CrawlerRunConfig(word_count_threshold=10)

    async with AsyncWebCrawler(crawler_strategy=http_strategy) as crawler:
        result = await asyncio.wait_for(
            crawler.arun(url=url, config=run_config),
            timeout=timeout_ms / 1000,
        )

    html = getattr(result, "html", "") or ""
    if len(html.encode("utf-8", errors="ignore")) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="response_too_large")

    markdown = getattr(result, "markdown", "") or ""
    if not markdown and hasattr(result, "markdown_v2"):
        markdown = getattr(result, "markdown_v2", "") or ""

    if len(markdown.strip()) < 50:
        raise HTTPException(status_code=422, detail="scrape_empty")

    title = getattr(result, "title", None)
    meta = getattr(result, "metadata", None)
    if not title and isinstance(meta, dict):
        title = meta.get("title")

    return CrawlResponse(
        markdown=markdown,
        title=title,
        bytes=len(html.encode("utf-8", errors="ignore")),
        statusCode=getattr(result, "status_code", None),
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/crawl", response_model=CrawlResponse)
async def crawl(body: CrawlRequest) -> CrawlResponse:
    url = _assert_public_https_url(body.url)
    from urllib.parse import urlparse

    hostname = urlparse(url).hostname or ""
    _resolve_public_hostname(hostname)
    return await _crawl_http(url, body.timeoutMs)
