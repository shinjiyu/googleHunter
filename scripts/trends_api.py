#!/usr/bin/env python3
"""
trends_api.py

Unified Google Trends API - combines protocol simulation with Playwright fallback.

This module provides a single, easy-to-use interface for accessing Google Trends data.
It automatically falls back to Playwright browser automation when direct API calls fail.

Usage:
    from trends_api import TrendsAPI

    # Synchronous usage
    api = TrendsAPI()
    daily = api.daily_trends(geo="US")
    interest = api.interest_over_time(["python", "javascript"])

    # Async usage
    async with TrendsAPI() as api:
        daily = await api.daily_trends_async(geo="US")
        interest = await api.interest_over_time_async(["python", "javascript"])
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

# Import our modules
from google_trends_client import (
    GoogleTrendsClient,
    GoogleTrendsError,
    InterestPoint,
    RateLimitError,
    RelatedQuery,
    TokenError,
    TrendingSearch,
    TrendsConfig,
)
from playwright_fetcher import (
    FetcherConfig,
    InterestDataPoint,
    PlaywrightTrendsFetcher,
    TrendingItem,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class TrendsAPIConfig:
    """Configuration for the unified Trends API."""

    geo: str = "US"
    hl: str = "en-US"
    tz: int = -480

    # Fallback settings
    use_fallback: bool = True  # Automatically use Playwright when API fails
    fallback_on_rate_limit: bool = True
    fallback_on_token_error: bool = True

    # Playwright settings
    headless: bool = True
    browser_timeout: int = 60000

    # Retry settings
    max_retries: int = 3
    retry_delay: float = 2.0

    # Proxy (optional)
    proxy: str | None = None


@dataclass
class UnifiedTrendingItem:
    """Unified trending item format."""

    title: str
    traffic: str
    related_queries: list[str] = field(default_factory=list)
    articles: list[dict[str, str]] = field(default_factory=list)
    source: str = "api"  # "api" or "playwright"


@dataclass
class UnifiedInterestPoint:
    """Unified interest data point format."""

    date: str
    value: int
    formatted_value: str = ""
    is_partial: bool = False
    source: str = "api"


@dataclass
class UnifiedRelatedQuery:
    """Unified related query format."""

    query: str
    value: int | str
    link: str = ""
    source: str = "api"


class TrendsAPI:
    """
    Unified Google Trends API with automatic fallback.

    This class tries direct API calls first, then falls back to Playwright
    browser automation if the API calls fail.
    """

    def __init__(self, config: TrendsAPIConfig | None = None):
        self.config = config or TrendsAPIConfig()

        # Initialize direct API client
        api_config = TrendsConfig(
            geo=self.config.geo,
            hl=self.config.hl,
            tz=self.config.tz,
        )
        self._api_client = GoogleTrendsClient(
            config=api_config,
            proxy=self.config.proxy,
        )

        # Playwright fetcher (lazy initialization)
        self._playwright_fetcher: PlaywrightTrendsFetcher | None = None
        self._playwright_initialized = False

    async def _get_playwright_fetcher(self) -> PlaywrightTrendsFetcher:
        """Get or initialize the Playwright fetcher."""
        if self._playwright_fetcher is None:
            fetcher_config = FetcherConfig(
                headless=self.config.headless,
                geo=self.config.geo,
                hl=self.config.hl,
                timeout=self.config.browser_timeout,
            )
            self._playwright_fetcher = PlaywrightTrendsFetcher(fetcher_config)
            await self._playwright_fetcher._setup()
            self._playwright_initialized = True

        return self._playwright_fetcher

    def _should_fallback(self, error: Exception) -> bool:
        """Determine if we should fall back to Playwright."""
        if not self.config.use_fallback:
            return False

        if isinstance(error, RateLimitError) and self.config.fallback_on_rate_limit:
            logger.info("Rate limited, falling back to Playwright")
            return True

        if isinstance(error, TokenError) and self.config.fallback_on_token_error:
            logger.info("Token error, falling back to Playwright")
            return True

        if isinstance(error, GoogleTrendsError):
            logger.info(f"API error ({type(error).__name__}), falling back to Playwright")
            return True

        return False

    # ==================== Daily Trends ====================

    def daily_trends(
        self,
        geo: str | None = None,
        date: str | None = None,
    ) -> list[UnifiedTrendingItem]:
        """
        Get daily trending searches (synchronous).

        Args:
            geo: Geographic region (e.g., "US", "GB", "JP")
            date: Date in YYYYMMDD format (default: today)

        Returns:
            List of trending items
        """
        return asyncio.run(self.daily_trends_async(geo, date))

    async def daily_trends_async(
        self,
        geo: str | None = None,
        date: str | None = None,
    ) -> list[UnifiedTrendingItem]:
        """Get daily trending searches (async)."""
        geo = geo or self.config.geo

        # Try direct API first
        try:
            results = self._api_client.get_daily_trends(geo=geo, date=date)
            return [
                UnifiedTrendingItem(
                    title=r.title,
                    traffic=r.traffic,
                    related_queries=r.related_queries,
                    articles=r.articles,
                    source="api",
                )
                for r in results
            ]

        except Exception as e:
            if self._should_fallback(e):
                return await self._daily_trends_playwright(geo, date)
            raise

    async def _daily_trends_playwright(
        self,
        geo: str,
        date: str | None = None,
    ) -> list[UnifiedTrendingItem]:
        """Get daily trends using Playwright fallback."""
        fetcher = await self._get_playwright_fetcher()
        results = await fetcher.get_daily_trends(geo=geo, date=date)

        return [
            UnifiedTrendingItem(
                title=r.title,
                traffic=r.traffic,
                related_queries=r.related_queries,
                articles=r.articles,
                source="playwright",
            )
            for r in results
        ]

    # ==================== Interest Over Time ====================

    def interest_over_time(
        self,
        keywords: list[str],
        timeframe: str = "today 12-m",
        geo: str | None = None,
    ) -> dict[str, list[UnifiedInterestPoint]]:
        """
        Get interest over time for keywords (synchronous).

        Args:
            keywords: List of keywords (max 5)
            timeframe: Time range (e.g., "today 12-m", "2024-01-01 2024-12-31")
            geo: Geographic region

        Returns:
            Dictionary mapping keywords to interest data points
        """
        return asyncio.run(self.interest_over_time_async(keywords, timeframe, geo))

    async def interest_over_time_async(
        self,
        keywords: list[str],
        timeframe: str = "today 12-m",
        geo: str | None = None,
    ) -> dict[str, list[UnifiedInterestPoint]]:
        """Get interest over time (async)."""
        geo = geo or self.config.geo

        try:
            results = self._api_client.get_interest_over_time(
                keywords=keywords,
                timeframe=timeframe,
                geo=geo,
            )

            return {
                kw: [
                    UnifiedInterestPoint(
                        date=p.date,
                        value=p.value,
                        formatted_value=p.formatted_value,
                        is_partial=p.is_partial,
                        source="api",
                    )
                    for p in points
                ]
                for kw, points in results.items()
            }

        except Exception as e:
            if self._should_fallback(e):
                return await self._interest_over_time_playwright(keywords, timeframe, geo)
            raise

    async def _interest_over_time_playwright(
        self,
        keywords: list[str],
        timeframe: str,
        geo: str,
    ) -> dict[str, list[UnifiedInterestPoint]]:
        """Get interest over time using Playwright fallback."""
        fetcher = await self._get_playwright_fetcher()
        results = await fetcher.get_interest_over_time(
            keywords=keywords,
            timeframe=timeframe,
            geo=geo,
        )

        return {
            kw: [
                UnifiedInterestPoint(
                    date=p.date,
                    value=p.value,
                    formatted_value=p.formatted_value,
                    source="playwright",
                )
                for p in points
            ]
            for kw, points in results.items()
        }

    # ==================== Related Queries ====================

    def related_queries(
        self,
        keyword: str,
        timeframe: str = "today 12-m",
        geo: str | None = None,
    ) -> dict[str, list[UnifiedRelatedQuery]]:
        """
        Get related queries for a keyword (synchronous).

        Returns:
            Dictionary with "top" and "rising" query lists
        """
        return asyncio.run(self.related_queries_async(keyword, timeframe, geo))

    async def related_queries_async(
        self,
        keyword: str,
        timeframe: str = "today 12-m",
        geo: str | None = None,
    ) -> dict[str, list[UnifiedRelatedQuery]]:
        """Get related queries (async)."""
        geo = geo or self.config.geo

        try:
            results = self._api_client.get_related_queries(
                keyword=keyword,
                timeframe=timeframe,
                geo=geo,
            )

            return {
                query_type: [
                    UnifiedRelatedQuery(
                        query=q.query,
                        value=q.value,
                        link=q.link,
                        source="api",
                    )
                    for q in queries
                ]
                for query_type, queries in results.items()
            }

        except Exception as e:
            if self._should_fallback(e):
                return await self._related_queries_playwright(keyword, timeframe, geo)
            raise

    async def _related_queries_playwright(
        self,
        keyword: str,
        timeframe: str,
        geo: str,
    ) -> dict[str, list[UnifiedRelatedQuery]]:
        """Get related queries using Playwright fallback."""
        fetcher = await self._get_playwright_fetcher()
        results = await fetcher.get_related_queries(
            keyword=keyword,
            timeframe=timeframe,
            geo=geo,
        )

        return {
            query_type: [
                UnifiedRelatedQuery(
                    query=q["query"],
                    value=q.get("value", 0),
                    link=q.get("link", ""),
                    source="playwright",
                )
                for q in queries
            ]
            for query_type, queries in results.items()
        }

    # ==================== Real-Time Trends ====================

    def realtime_trends(
        self,
        geo: str | None = None,
        category: str = "all",
    ) -> list[dict[str, Any]]:
        """
        Get real-time trending topics (synchronous).

        Args:
            geo: Geographic region
            category: Category filter

        Returns:
            List of trending story dictionaries
        """
        geo = geo or self.config.geo

        try:
            return self._api_client.get_realtime_trends(geo=geo, category=category)
        except GoogleTrendsError as e:
            logger.warning(f"Real-time trends API failed: {e}")
            return []

    # ==================== Interest by Region ====================

    def interest_by_region(
        self,
        keyword: str,
        timeframe: str = "today 12-m",
        geo: str | None = None,
        resolution: Literal["COUNTRY", "REGION", "CITY", "DMA"] = "COUNTRY",
    ) -> list[dict[str, Any]]:
        """
        Get interest by geographic region (synchronous).

        Returns:
            List of regions with their interest values
        """
        return asyncio.run(
            self.interest_by_region_async(keyword, timeframe, geo, resolution)
        )

    async def interest_by_region_async(
        self,
        keyword: str,
        timeframe: str = "today 12-m",
        geo: str | None = None,
        resolution: Literal["COUNTRY", "REGION", "CITY", "DMA"] = "COUNTRY",
    ) -> list[dict[str, Any]]:
        """Get interest by region (async)."""
        geo = geo or self.config.geo

        try:
            return self._api_client.get_interest_by_region(
                keyword=keyword,
                timeframe=timeframe,
                geo=geo,
                resolution=resolution,
            )

        except Exception as e:
            if self._should_fallback(e):
                fetcher = await self._get_playwright_fetcher()
                return await fetcher.get_interest_by_region(
                    keyword=keyword,
                    timeframe=timeframe,
                    geo=geo,
                )
            raise

    # ==================== Autocomplete ====================

    def autocomplete(self, query: str) -> list[dict[str, str]]:
        """
        Get autocomplete suggestions for a query.

        Returns:
            List of suggestion dictionaries
        """
        try:
            return self._api_client.autocomplete(query)
        except GoogleTrendsError as e:
            logger.warning(f"Autocomplete failed: {e}")
            return []

    # ==================== Utility Methods ====================

    def set_geo(self, geo: str) -> None:
        """Change the default geographic region."""
        self.config.geo = geo
        self._api_client.config.geo = geo

    def set_language(self, hl: str) -> None:
        """Change the interface language."""
        self.config.hl = hl
        self._api_client.config.hl = hl

    def enable_fallback(self, enable: bool = True) -> None:
        """Enable or disable Playwright fallback."""
        self.config.use_fallback = enable

    def set_proxy(self, proxy: str | None) -> None:
        """Set a proxy for API requests."""
        self.config.proxy = proxy
        # Recreate the API client with the new proxy
        api_config = TrendsConfig(
            geo=self.config.geo,
            hl=self.config.hl,
            tz=self.config.tz,
        )
        self._api_client.close()
        self._api_client = GoogleTrendsClient(
            config=api_config,
            proxy=proxy,
        )

    async def close(self) -> None:
        """Clean up resources."""
        self._api_client.close()

        if self._playwright_fetcher and self._playwright_initialized:
            await self._playwright_fetcher._cleanup()
            self._playwright_fetcher = None
            self._playwright_initialized = False

    def close_sync(self) -> None:
        """Synchronous cleanup."""
        asyncio.run(self.close())

    async def __aenter__(self) -> "TrendsAPI":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    def __enter__(self) -> "TrendsAPI":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close_sync()


# ==================== Convenience Functions ====================


def get_trending(geo: str = "US") -> list[UnifiedTrendingItem]:
    """Quick function to get today's trending searches."""
    with TrendsAPI(TrendsAPIConfig(geo=geo)) as api:
        return api.daily_trends()


def get_trend(keywords: list[str], geo: str = "US") -> dict[str, list[UnifiedInterestPoint]]:
    """Quick function to get interest over time for keywords."""
    with TrendsAPI(TrendsAPIConfig(geo=geo)) as api:
        return api.interest_over_time(keywords)


def get_related(keyword: str, geo: str = "US") -> dict[str, list[UnifiedRelatedQuery]]:
    """Quick function to get related queries."""
    with TrendsAPI(TrendsAPIConfig(geo=geo)) as api:
        return api.related_queries(keyword)


# ==================== CLI ====================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Google Trends API CLI")
    parser.add_argument("command", choices=["daily", "interest", "related", "realtime"])
    parser.add_argument("--keywords", "-k", help="Comma-separated keywords")
    parser.add_argument("--geo", "-g", default="US", help="Geographic region")
    parser.add_argument("--timeframe", "-t", default="today 12-m", help="Time range")
    parser.add_argument("--no-fallback", action="store_true", help="Disable Playwright fallback")

    args = parser.parse_args()

    config = TrendsAPIConfig(
        geo=args.geo,
        use_fallback=not args.no_fallback,
    )

    with TrendsAPI(config) as api:
        if args.command == "daily":
            print(f"\nDaily Trends ({args.geo}):")
            print("-" * 40)
            for item in api.daily_trends()[:10]:
                print(f"  [{item.source}] {item.title} ({item.traffic})")

        elif args.command == "interest":
            if not args.keywords:
                print("Error: --keywords required for 'interest' command")
                exit(1)

            keywords = [k.strip() for k in args.keywords.split(",")]
            print(f"\nInterest Over Time ({args.geo}):")
            print("-" * 40)

            results = api.interest_over_time(keywords, timeframe=args.timeframe)
            for kw, data in results.items():
                if data:
                    latest = data[-1]
                    print(f"  [{latest.source}] {kw}: {latest.value} ({latest.date})")

        elif args.command == "related":
            if not args.keywords:
                print("Error: --keywords required for 'related' command")
                exit(1)

            keyword = args.keywords.split(",")[0].strip()
            print(f"\nRelated Queries for '{keyword}' ({args.geo}):")
            print("-" * 40)

            results = api.related_queries(keyword, timeframe=args.timeframe)
            print("  Top Queries:")
            for q in results["top"][:5]:
                print(f"    [{q.source}] {q.query}: {q.value}")
            print("  Rising Queries:")
            for q in results["rising"][:5]:
                print(f"    [{q.source}] {q.query}: {q.value}")

        elif args.command == "realtime":
            print(f"\nReal-Time Trends ({args.geo}):")
            print("-" * 40)
            for story in api.realtime_trends()[:10]:
                print(f"  - {story.get('title', 'N/A')}")
