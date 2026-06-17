#!/usr/bin/env python3
"""
HTTP-only Crawl4AI spike — business context import feasibility.

Crawls 5 quick-service automotive homepages with AsyncHTTPCrawlerStrategy
(no Playwright/Chromium). Records latency, markdown size, and a quality heuristic.

Run:
  python3 -m venv .venv-spike && source .venv-spike/bin/activate
  pip install crawl4ai
  python testing/spike/crawl4ai-http-spike.py

Optional:
  SPIKE_URLS="https://a.com,https://b.com" python testing/spike/crawl4ai-http-spike.py
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
from dataclasses import asdict, dataclass
from typing import Any

# Default: national quick-service automotive chains (brochure-style homepages)
DEFAULT_URLS = [
    "https://www.jiffylube.com/",
    "https://www.vioc.com/",
    "https://www.midas.com/",
    "https://www.meineke.com/",
    "https://www.pepboys.com/",
]

# Keywords we expect on a usable business-context draft for this vertical
AUTOMOTIVE_SIGNALS = re.compile(
    r"\b(oil|tire|brake|service|automotive|vehicle|car|maintenance|repair|lube)\b",
    re.I,
)


@dataclass
class SpikeResult:
    url: str
    ok: bool
    latency_ms: int
    status_code: int | None
    html_chars: int
    markdown_chars: int
    title: str | None
    automotive_signals: int
    excerpt: str
    error: str | None


def quality_heuristic(markdown: str, title: str | None) -> tuple[int, bool]:
    """Returns (signal_count, likely_usable_for_bedrock_summarize)."""
    text = f"{title or ''}\n{markdown}"
    signals = len(AUTOMOTIVE_SIGNALS.findall(text))
    usable = len(markdown.strip()) >= 200 and signals >= 2
    return signals, usable


async def crawl_one(url: str) -> SpikeResult:
    from crawl4ai import AsyncWebCrawler, CrawlerRunConfig
    from crawl4ai.async_crawler_strategy import AsyncHTTPCrawlerStrategy
    from crawl4ai.async_configs import HTTPCrawlerConfig

    start = time.perf_counter()
    status_code: int | None = None
    html_chars = 0
    markdown_chars = 0
    title: str | None = None
    excerpt = ""
    error: str | None = None
    ok = False
    signals = 0

    try:
        http_strategy = AsyncHTTPCrawlerStrategy(
            browser_config=HTTPCrawlerConfig(
                method="GET",
                verify_ssl=True,
                follow_redirects=True,
            )
        )
        run_config = CrawlerRunConfig(
            word_count_threshold=10,
            remove_overlay_elements=False,
        )

        async with AsyncWebCrawler(crawler_strategy=http_strategy) as crawler:
            result = await crawler.arun(url=url, config=run_config)

        elapsed = int((time.perf_counter() - start) * 1000)
        status_code = getattr(result, "status_code", None)
        html = getattr(result, "html", "") or ""
        markdown = getattr(result, "markdown", "") or ""
        if not markdown and hasattr(result, "markdown_v2"):
            markdown = getattr(result, "markdown_v2", "") or ""

        html_chars = len(html)
        markdown_chars = len(markdown)
        title = getattr(result, "title", None) or _title_from_metadata(result)
        excerpt = markdown.strip().replace("\n", " ")[:240]
        signals, usable = quality_heuristic(markdown, title)
        ok = bool(
            status_code in (200, None)
            and usable
            and not getattr(result, "success", True) is False
        )
        if getattr(result, "success", True) is False:
            error = getattr(result, "error_message", None) or "crawl reported success=false"
            ok = False

        return SpikeResult(
            url=url,
            ok=ok,
            latency_ms=elapsed,
            status_code=status_code,
            html_chars=html_chars,
            markdown_chars=markdown_chars,
            title=title,
            automotive_signals=signals,
            excerpt=excerpt,
            error=error,
        )
    except Exception as exc:  # noqa: BLE001 — spike script
        elapsed = int((time.perf_counter() - start) * 1000)
        return SpikeResult(
            url=url,
            ok=False,
            latency_ms=elapsed,
            status_code=status_code,
            html_chars=html_chars,
            markdown_chars=markdown_chars,
            title=title,
            automotive_signals=signals,
            excerpt=excerpt,
            error=str(exc),
        )


def _title_from_metadata(result: Any) -> str | None:
    meta = getattr(result, "metadata", None)
    if isinstance(meta, dict):
        return meta.get("title")
    return None


async def main() -> int:
    urls = os.environ.get("SPIKE_URLS", "").strip()
    targets = [u.strip() for u in urls.split(",") if u.strip()] if urls else DEFAULT_URLS

    print("Crawl4AI HTTP-only spike")
    print(f"URLs: {len(targets)}")
    print("-" * 60)

    results: list[SpikeResult] = []
    for url in targets:
        print(f"Crawling {url} ...", flush=True)
        r = await crawl_one(url)
        results.append(r)
        status = "OK" if r.ok else "FAIL"
        print(
            f"  [{status}] {r.latency_ms}ms | md={r.markdown_chars} | signals={r.automotive_signals}"
            + (f" | err={r.error}" if r.error else "")
        )

    passed = sum(1 for r in results if r.ok)
    rate = passed / len(results) if results else 0
    latencies = [r.latency_ms for r in results if r.ok]
    p95 = sorted(latencies)[int(len(latencies) * 0.95) - 1] if latencies else None

    summary = {
        "mode": "http_only",
        "total": len(results),
        "passed": passed,
        "success_rate": round(rate, 3),
        "p95_latency_ms": p95,
        "results": [asdict(r) for r in results],
    }

    out_path = os.path.join(
        os.path.dirname(__file__), "crawl4ai-http-spike-results.json"
    )
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print("-" * 60)
    print(f"Success: {passed}/{len(results)} ({rate:.0%})")
    if p95 is not None:
        print(f"p95 latency (successful): {p95}ms")
    print(f"Results written to {out_path}")

    return 0 if rate >= 0.6 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
