#!/usr/bin/env python3
"""
google_trends_client.py

Low-level Google Trends API client using protocol simulation.
Based on reverse-engineered API structure from browser captures.

This client directly calls Google Trends internal APIs without Playwright.
If direct API calls fail (e.g., due to rate limiting), use playwright_fetcher.py as fallback.
"""

import json
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Literal
from urllib.parse import quote, urlencode

import httpx


@dataclass
class TrendsConfig:
    """Configuration for Google Trends API client."""

    geo: str = "US"
    hl: str = "en-US"
    tz: int = -480  # Timezone offset in minutes (US Pacific = -480)
    category: int = 0  # 0 = All categories
    property_filter: str = ""  # "youtube", "news", "images", "froogle" (shopping), or ""


@dataclass
class TokenInfo:
    """Token information for API requests."""

    token: str
    request_data: dict[str, Any]
    expires_at: float = field(default_factory=lambda: time.time() + 3600)

    @property
    def is_expired(self) -> bool:
        return time.time() > self.expires_at


@dataclass
class TrendingSearch:
    """A single trending search item."""

    title: str
    traffic: str  # e.g., "100K+"
    related_queries: list[str] = field(default_factory=list)
    articles: list[dict[str, str]] = field(default_factory=list)
    image_url: str = ""


@dataclass
class InterestPoint:
    """A data point for interest over time."""

    date: str
    value: int
    formatted_value: str = ""
    is_partial: bool = False


@dataclass
class RelatedQuery:
    """A related query item."""

    query: str
    value: int | str  # Can be number or "Breakout"
    link: str = ""


class GoogleTrendsClient:
    """
    Low-level Google Trends API client.

    This client simulates the browser's interaction with Google Trends APIs.
    It handles token acquisition, cookie management, and request formatting.
    
    Note: Google Trends has two API systems:
    - Legacy API (/trends/api/*): Used for explore page
    - New batchexecute API (/_/TrendsUi/data/batchexecute): Used for trending page
    """

    BASE_URL = "https://trends.google.com"
    
    # Legacy API endpoints (explore page)
    EXPLORE_URL = f"{BASE_URL}/trends/api/explore"
    DAILYTRENDS_URL = f"{BASE_URL}/trends/api/dailytrends"
    REALTIMETRENDS_URL = f"{BASE_URL}/trends/api/realtimetrends"
    MULTILINE_URL = f"{BASE_URL}/trends/api/widgetdata/multiline"
    RELATED_URL = f"{BASE_URL}/trends/api/widgetdata/relatedsearches"
    COMPAREDGEO_URL = f"{BASE_URL}/trends/api/widgetdata/comparedgeo"
    AUTOCOMPLETE_URL = f"{BASE_URL}/trends/api/autocomplete"
    
    # New batchexecute API (trending page)
    BATCHEXECUTE_URL = f"{BASE_URL}/_/TrendsUi/data/batchexecute"

    def __init__(
        self,
        config: TrendsConfig | None = None,
        cookies: list[dict[str, Any]] | None = None,
        proxy: str | None = None,
        timeout: float = 30.0,
    ):
        self.config = config or TrendsConfig()
        self._cookies = cookies or []
        self._tokens: dict[str, TokenInfo] = {}
        self._session_cookies: dict[str, str] = {}

        # Configure HTTP client
        transport_kwargs: dict[str, Any] = {}
        if proxy:
            transport_kwargs["proxy"] = proxy

        self._client = httpx.Client(
            timeout=timeout,
            follow_redirects=True,
            headers=self._get_default_headers(),
            **transport_kwargs,
        )

        # Rate limiting
        self._last_request_time = 0.0
        self._min_request_interval = 1.0  # seconds

    def _get_default_headers(self) -> dict[str, str]:
        """Get default headers that mimic a real browser."""
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "Referer": "https://trends.google.com/trends/explore",
        }

    def _rate_limit(self) -> None:
        """Apply rate limiting between requests."""
        elapsed = time.time() - self._last_request_time
        if elapsed < self._min_request_interval:
            time.sleep(self._min_request_interval - elapsed)
        self._last_request_time = time.time()

    def _parse_response(self, text: str) -> Any:
        """
        Parse Google Trends API response.

        Responses often have a )]}' prefix that needs to be stripped.
        """
        # Strip the anti-XSSI prefix
        if text.startswith(")]}'"):
            text = text[5:]
        elif text.startswith(")]}\n"):
            text = text[4:]

        return json.loads(text)

    def _clean_request_data(self, request_data: dict[str, Any]) -> dict[str, Any]:
        """
        Clean request data to avoid scraper detection.
        
        Google's API sometimes includes userConfig with userType: USER_TYPE_SCRAPER
        which may trigger stricter rate limiting.
        """
        cleaned = request_data.copy()
        
        # Remove or modify userConfig to avoid scraper detection
        if "userConfig" in cleaned:
            del cleaned["userConfig"]
        
        return cleaned

    def _make_request(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        method: str = "GET",
    ) -> Any:
        """Make an API request with rate limiting and error handling."""
        self._rate_limit()

        try:
            if method == "GET":
                response = self._client.get(url, params=params)
            else:
                response = self._client.post(url, data=params)

            response.raise_for_status()

            # Update session cookies
            for cookie in response.cookies.jar:
                self._session_cookies[cookie.name] = cookie.value

            return self._parse_response(response.text)

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                raise RateLimitError("Rate limited by Google Trends") from e
            elif e.response.status_code == 400:
                raise InvalidRequestError(f"Invalid request: {e.response.text}") from e
            raise APIError(f"HTTP error {e.response.status_code}") from e
        except json.JSONDecodeError as e:
            raise ParseError(f"Failed to parse response: {e}") from e

    def _get_explore_tokens(
        self,
        keywords: list[str],
        timeframe: str = "today 12-m",
        geo: str | None = None,
    ) -> dict[str, TokenInfo]:
        """
        Get widget tokens from the explore endpoint.

        These tokens are required for subsequent API calls.
        """
        geo = geo or self.config.geo

        # Build comparison items
        comparison_items = [
            {"keyword": kw, "geo": geo, "time": timeframe} for kw in keywords
        ]

        params = {
            "hl": self.config.hl,
            "tz": self.config.tz,
            "req": json.dumps(
                {
                    "comparisonItem": comparison_items,
                    "category": self.config.category,
                    "property": self.config.property_filter,
                }
            ),
            "tz": self.config.tz,  # Duplicate tz as seen in captures
        }

        data = self._make_request(self.EXPLORE_URL, params, method="POST")

        tokens = {}
        if "widgets" in data:
            for widget in data["widgets"]:
                widget_id = widget.get("id", "")
                token = widget.get("token", "")
                request = widget.get("request", {})

                if token:
                    tokens[widget_id] = TokenInfo(
                        token=token,
                        request_data=request,
                    )

        return tokens

    def get_daily_trends(
        self,
        geo: str | None = None,
        date: str | None = None,
    ) -> list[TrendingSearch]:
        """
        Get daily trending searches.

        Args:
            geo: Geographic region (e.g., "US", "GB", "JP")
            date: Date in YYYYMMDD format (default: today)

        Returns:
            List of trending search items
        """
        geo = geo or self.config.geo

        if date is None:
            date = datetime.now().strftime("%Y%m%d")

        params = {
            "hl": self.config.hl,
            "tz": self.config.tz,
            "geo": geo,
            "ns": 15,  # Number of results
            "ed": date,
        }

        data = self._make_request(self.DAILYTRENDS_URL, params)

        results = []
        trending_days = data.get("default", {}).get("trendingSearchesDays", [])

        for day in trending_days:
            for search in day.get("trendingSearches", []):
                title_info = search.get("title", {})
                results.append(
                    TrendingSearch(
                        title=title_info.get("query", ""),
                        traffic=search.get("formattedTraffic", ""),
                        related_queries=[
                            q.get("query", "") for q in search.get("relatedQueries", [])
                        ],
                        articles=[
                            {
                                "title": a.get("title", ""),
                                "url": a.get("url", ""),
                                "source": a.get("source", ""),
                            }
                            for a in search.get("articles", [])
                        ],
                        image_url=search.get("image", {}).get("newsUrl", ""),
                    )
                )

        return results

    def get_realtime_trends(
        self,
        geo: str | None = None,
        category: str = "all",
    ) -> list[dict[str, Any]]:
        """
        Get real-time trending topics.

        Args:
            geo: Geographic region
            category: Category filter (all, e, b, t, m, s)
                     e=Entertainment, b=Business, t=Top stories
                     m=Health, s=Science/Tech

        Returns:
            List of real-time trending stories
        """
        geo = geo or self.config.geo

        params = {
            "hl": self.config.hl,
            "tz": self.config.tz,
            "geo": geo,
            "cat": category,
            "fi": 0,
            "fs": 0,
            "ri": 300,
            "rs": 20,
            "sort": 0,
        }

        data = self._make_request(self.REALTIMETRENDS_URL, params)

        stories = []
        for story in data.get("storySummaries", {}).get("trendingStories", []):
            stories.append(
                {
                    "title": story.get("title", ""),
                    "entityNames": story.get("entityNames", []),
                    "articles": story.get("articles", []),
                    "image": story.get("image", {}),
                }
            )

        return stories

    def get_interest_over_time(
        self,
        keywords: list[str],
        timeframe: str = "today 12-m",
        geo: str | None = None,
    ) -> dict[str, list[InterestPoint]]:
        """
        Get interest over time for keywords.

        Args:
            keywords: List of keywords to compare (max 5)
            timeframe: Time range (e.g., "today 12-m", "2024-01-01 2024-12-31")
            geo: Geographic region

        Returns:
            Dictionary mapping keywords to their interest data
        """
        if len(keywords) > 5:
            raise InvalidRequestError("Maximum 5 keywords allowed")

        geo = geo or self.config.geo

        # First, get tokens
        tokens = self._get_explore_tokens(keywords, timeframe, geo)

        # Find the TIMESERIES token
        timeseries_token = None
        for widget_id, token_info in tokens.items():
            if "TIMESERIES" in widget_id:
                timeseries_token = token_info
                break

        if not timeseries_token:
            raise TokenError("Could not obtain TIMESERIES token")

        # Make the request
        params = {
            "hl": self.config.hl,
            "tz": self.config.tz,
            "req": json.dumps(self._clean_request_data(timeseries_token.request_data)),
            "token": timeseries_token.token,
        }

        data = self._make_request(self.MULTILINE_URL, params)

        # Parse results
        results: dict[str, list[InterestPoint]] = {kw: [] for kw in keywords}

        timeline = data.get("default", {}).get("timelineData", [])
        for point in timeline:
            time_str = point.get("formattedTime", "")
            values = point.get("value", [])
            formatted = point.get("formattedValue", [])
            is_partial = point.get("isPartial", False)

            for i, kw in enumerate(keywords):
                if i < len(values):
                    results[kw].append(
                        InterestPoint(
                            date=time_str,
                            value=values[i],
                            formatted_value=formatted[i] if i < len(formatted) else "",
                            is_partial=is_partial,
                        )
                    )

        return results

    def get_related_queries(
        self,
        keyword: str,
        timeframe: str = "today 12-m",
        geo: str | None = None,
    ) -> dict[str, list[RelatedQuery]]:
        """
        Get related queries for a keyword.

        Returns:
            Dictionary with "top" and "rising" query lists
        """
        geo = geo or self.config.geo

        # Get tokens
        tokens = self._get_explore_tokens([keyword], timeframe, geo)

        # Find RELATED_QUERIES token
        related_token = None
        for widget_id, token_info in tokens.items():
            if "RELATED_QUERIES" in widget_id:
                related_token = token_info
                break

        if not related_token:
            raise TokenError("Could not obtain RELATED_QUERIES token")

        params = {
            "hl": self.config.hl,
            "tz": self.config.tz,
            "req": json.dumps(self._clean_request_data(related_token.request_data)),
            "token": related_token.token,
        }

        data = self._make_request(self.RELATED_URL, params)

        results = {"top": [], "rising": []}

        ranked_lists = data.get("default", {}).get("rankedList", [])
        for ranked in ranked_lists:
            list_type = "top" if ranked.get("rankedKeyword") else "rising"
            keywords_list = ranked.get("rankedKeyword", [])

            for item in keywords_list:
                query = item.get("query", "")
                value = item.get("value", 0)
                if item.get("formattedValue") == "Breakout":
                    value = "Breakout"

                results[list_type].append(
                    RelatedQuery(
                        query=query,
                        value=value,
                        link=item.get("link", ""),
                    )
                )

        return results

    def get_related_topics(
        self,
        keyword: str,
        timeframe: str = "today 12-m",
        geo: str | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        """
        Get related topics for a keyword.

        Returns:
            Dictionary with "top" and "rising" topic lists
        """
        geo = geo or self.config.geo

        # Get tokens
        tokens = self._get_explore_tokens([keyword], timeframe, geo)

        # Find RELATED_TOPICS token
        related_token = None
        for widget_id, token_info in tokens.items():
            if "RELATED_TOPICS" in widget_id:
                related_token = token_info
                break

        if not related_token:
            raise TokenError("Could not obtain RELATED_TOPICS token")

        params = {
            "hl": self.config.hl,
            "tz": self.config.tz,
            "req": json.dumps(self._clean_request_data(related_token.request_data)),
            "token": related_token.token,
        }

        data = self._make_request(self.RELATED_URL, params)

        results = {"top": [], "rising": []}

        ranked_lists = data.get("default", {}).get("rankedList", [])
        for ranked in ranked_lists:
            list_type = "top" if ranked.get("rankedKeyword") else "rising"
            topics_list = ranked.get("rankedKeyword", [])

            for item in topics_list:
                topic = item.get("topic", {})
                results[list_type].append(
                    {
                        "title": topic.get("title", ""),
                        "type": topic.get("type", ""),
                        "value": item.get("value", 0),
                        "link": item.get("link", ""),
                    }
                )

        return results

    def get_interest_by_region(
        self,
        keyword: str,
        timeframe: str = "today 12-m",
        geo: str | None = None,
        resolution: Literal["COUNTRY", "REGION", "CITY", "DMA"] = "COUNTRY",
    ) -> list[dict[str, Any]]:
        """
        Get interest by geographic region.

        Args:
            keyword: Search keyword
            timeframe: Time range
            geo: Base geographic region
            resolution: Geographic resolution level

        Returns:
            List of regions with their interest values
        """
        geo = geo or self.config.geo

        # Get tokens
        tokens = self._get_explore_tokens([keyword], timeframe, geo)

        # Find GEO_MAP token
        geo_token = None
        for widget_id, token_info in tokens.items():
            if "GEO_MAP" in widget_id:
                geo_token = token_info
                break

        if not geo_token:
            raise TokenError("Could not obtain GEO_MAP token")

        # Modify request for resolution and clean scraper markers
        request_data = self._clean_request_data(geo_token.request_data)
        request_data["resolution"] = resolution

        params = {
            "hl": self.config.hl,
            "tz": self.config.tz,
            "req": json.dumps(request_data),
            "token": geo_token.token,
        }

        data = self._make_request(self.COMPAREDGEO_URL, params)

        results = []
        geo_data = data.get("default", {}).get("geoMapData", [])
        for region in geo_data:
            results.append(
                {
                    "geoCode": region.get("geoCode", ""),
                    "geoName": region.get("geoName", ""),
                    "value": region.get("value", [0])[0] if region.get("value") else 0,
                    "formattedValue": region.get("formattedValue", [""])[0]
                    if region.get("formattedValue")
                    else "",
                    "maxValueIndex": region.get("maxValueIndex", 0),
                }
            )

        return results

    def autocomplete(
        self,
        query: str,
        hl: str | None = None,
    ) -> list[dict[str, str]]:
        """
        Get autocomplete suggestions for a query.

        Returns:
            List of suggestion dictionaries with "mid", "title", and "type"
        """
        hl = hl or self.config.hl

        params = {
            "hl": hl,
            "tz": self.config.tz,
        }

        url = f"{self.AUTOCOMPLETE_URL}/{quote(query)}"
        data = self._make_request(url, params)

        results = []
        topics = data.get("default", {}).get("topics", [])
        for topic in topics:
            results.append(
                {
                    "mid": topic.get("mid", ""),
                    "title": topic.get("title", ""),
                    "type": topic.get("type", ""),
                }
            )

        return results

    def get_trending_now(
        self,
        geo: str | None = None,
        category: str = "all",
        count: int = 25,
    ) -> list[TrendingSearch]:
        """
        Get currently trending searches using the new batchexecute API.
        
        This uses the same API as the Google Trends "Trending Now" page.
        
        Args:
            geo: Geographic region (e.g., "US", "GB")
            category: Category filter (not implemented in new API)
            count: Number of results to fetch
            
        Returns:
            List of trending search items
        """
        geo = geo or self.config.geo
        
        # First, we need to get a session by visiting the trending page
        # The batchexecute API requires specific session parameters
        try:
            # Try the legacy dailytrends API first as fallback
            return self.get_daily_trends(geo=geo)
        except Exception:
            # If legacy fails, the caller should use playwright_fetcher
            raise APIError(
                "Trending API requires browser session. "
                "Use PlaywrightTrendsFetcher for trending data."
            )

    def close(self) -> None:
        """Close the HTTP client."""
        self._client.close()

    def __enter__(self) -> "GoogleTrendsClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()


# Custom exceptions
class GoogleTrendsError(Exception):
    """Base exception for Google Trends errors."""

    pass


class RateLimitError(GoogleTrendsError):
    """Raised when rate limited by Google."""

    pass


class TokenError(GoogleTrendsError):
    """Raised when token acquisition fails."""

    pass


class InvalidRequestError(GoogleTrendsError):
    """Raised for invalid request parameters."""

    pass


class ParseError(GoogleTrendsError):
    """Raised when response parsing fails."""

    pass


class APIError(GoogleTrendsError):
    """Raised for general API errors."""

    pass


# Convenience functions
def get_trending_now(geo: str = "US") -> list[TrendingSearch]:
    """Quick function to get today's trending searches."""
    with GoogleTrendsClient(TrendsConfig(geo=geo)) as client:
        return client.get_daily_trends()


def get_keyword_trend(keyword: str, geo: str = "US") -> list[InterestPoint]:
    """Quick function to get trend data for a single keyword."""
    with GoogleTrendsClient(TrendsConfig(geo=geo)) as client:
        results = client.get_interest_over_time([keyword])
        return results.get(keyword, [])


if __name__ == "__main__":
    # Simple test
    print("Testing Google Trends Client...")

    try:
        with GoogleTrendsClient() as client:
            print("\n1. Daily Trends:")
            trends = client.get_daily_trends(geo="US")
            for t in trends[:3]:
                print(f"  - {t.title} ({t.traffic})")

            print("\n2. Interest Over Time:")
            interest = client.get_interest_over_time(["python", "javascript"])
            for kw, data in interest.items():
                if data:
                    latest = data[-1]
                    print(f"  - {kw}: {latest.value} ({latest.date})")

            print("\n3. Related Queries:")
            related = client.get_related_queries("machine learning")
            print(f"  Top: {[q.query for q in related['top'][:3]]}")
            print(f"  Rising: {[q.query for q in related['rising'][:3]]}")

    except GoogleTrendsError as e:
        print(f"Error: {e}")
        print("Try using playwright_fetcher.py as fallback")
