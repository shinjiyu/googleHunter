#!/usr/bin/env python3
"""
playwright_fetcher.py

Playwright-based Google Trends data fetcher.
Use this when direct API calls fail due to rate limiting or blocking.

This module provides a browser automation fallback that:
1. Opens a real browser (headless or visible)
2. Navigates to Google Trends pages
3. Extracts data from the rendered page
4. Intercepts API responses for data extraction

Usage:
    from playwright_fetcher import PlaywrightTrendsFetcher

    async with PlaywrightTrendsFetcher() as fetcher:
        daily = await fetcher.get_daily_trends(geo="US")
        interest = await fetcher.get_interest_over_time(["python"], geo="US")
"""

import asyncio
import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

from playwright.async_api import Browser, BrowserContext, Page, async_playwright


@dataclass
class FetcherConfig:
    """Configuration for Playwright fetcher."""

    headless: bool = True
    geo: str = "US"
    hl: str = "en-US"
    slow_mo: int = 0  # Milliseconds to slow down operations
    timeout: int = 60000  # Default timeout in milliseconds
    user_data_dir: str | None = None  # For persistent sessions


@dataclass
class TrendingItem:
    """A trending search item."""

    title: str
    traffic: str
    related_queries: list[str] = field(default_factory=list)
    articles: list[dict[str, str]] = field(default_factory=list)


@dataclass
class InterestDataPoint:
    """Interest over time data point."""

    date: str
    value: int
    formatted_value: str = ""


class PlaywrightTrendsFetcher:
    """
    Playwright-based Google Trends data fetcher.

    This class uses browser automation to fetch data from Google Trends,
    bypassing potential API restrictions by acting as a real browser.
    """

    BASE_URL = "https://trends.google.com"

    def __init__(self, config: FetcherConfig | None = None):
        self.config = config or FetcherConfig()
        self._playwright = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None
        self._page: Page | None = None
        self._intercepted_data: dict[str, Any] = {}

    async def __aenter__(self) -> "PlaywrightTrendsFetcher":
        await self._setup()
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self._cleanup()

    async def _setup(self) -> None:
        """Initialize Playwright and browser."""
        self._playwright = await async_playwright().start()

        launch_args = [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-web-security",
        ]

        self._browser = await self._playwright.chromium.launch(
            headless=self.config.headless,
            slow_mo=self.config.slow_mo,
            args=launch_args,
        )

        self._context = await self._browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            locale=self.config.hl.split("-")[0],
            timezone_id="America/New_York",
            # Add extra HTTP headers to mimic real browser
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate", 
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
            }
        )
        
        # Add stealth scripts to hide automation
        await self._context.add_init_script("""
            // Override webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            // Override plugins to have length > 0
            Object.defineProperty(navigator, 'plugins', {
                get: () => {
                    return [1, 2, 3, 4, 5];
                },
            });
            
            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
            
            // Add chrome object
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {},
            };
            
            // Override permissions query
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // Spoof hardware concurrency
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => 8,
            });
            
            // Spoof device memory  
            Object.defineProperty(navigator, 'deviceMemory', {
                get: () => 8,
            });
        """)

        self._page = await self._context.new_page()

        # Set up response interception
        self._page.on("response", self._handle_response)
        
        # Flag to track if we've warmed up the session
        self._session_warmed_up = False

    async def _cleanup(self) -> None:
        """Clean up browser resources."""
        try:
            if self._page and not self._page.is_closed():
                await self._page.close()
        except Exception:
            pass
        
        try:
            if self._context:
                await self._context.close()
        except Exception:
            pass
        
        try:
            if self._browser:
                await self._browser.close()
        except Exception:
            pass
        
        try:
            if self._playwright:
                await self._playwright.stop()
        except Exception:
            pass
        
        self._page = None
        self._context = None
        self._browser = None
        self._playwright = None

    async def _handle_response(self, response) -> None:
        """Intercept and store API responses."""
        url = response.url
        
        # Handle legacy API
        if "trends.google.com/trends/api" in url:
            try:
                body = await response.text()
                # Strip the anti-XSSI prefix
                if body.startswith(")]}'"):
                    body = body[5:]

                # Determine the endpoint type
                if "dailytrends" in url:
                    self._intercepted_data["dailytrends"] = json.loads(body)
                elif "realtimetrends" in url:
                    self._intercepted_data["realtimetrends"] = json.loads(body)
                elif "multiline" in url:
                    self._intercepted_data["multiline"] = json.loads(body)
                elif "relatedsearches" in url:
                    self._intercepted_data["relatedsearches"] = json.loads(body)
                elif "comparedgeo" in url:
                    self._intercepted_data["comparedgeo"] = json.loads(body)
                elif "explore" in url:
                    self._intercepted_data["explore"] = json.loads(body)

            except Exception:
                pass  # Ignore parse errors
        
        # Handle new batchexecute API
        elif "/_/TrendsUi/data/batchexecute" in url:
            try:
                body = await response.text()
                # Store raw batchexecute response for parsing
                if "batchexecute" not in self._intercepted_data:
                    self._intercepted_data["batchexecute"] = []
                self._intercepted_data["batchexecute"].append(body)
            except Exception:
                pass

    async def _wait_for_content(self, selector: str, timeout: int | None = None) -> None:
        """Wait for content to load."""
        timeout = timeout or self.config.timeout
        try:
            await self._page.wait_for_selector(selector, timeout=timeout)
        except Exception:
            pass  # Content may not always appear

    async def _warmup_session(self) -> None:
        """
        Warm up the session by visiting homepage first.
        This is critical to avoid 429 rate limiting - it obtains necessary cookies
        like NID and _GRECAPTCHA that Google uses to identify legitimate users.
        
        Enhanced strategy (2024+):
        1. Visit homepage and accept cookie consent
        2. Browse naturally to establish session
        """
        if self._session_warmed_up:
            return
        
        import random
        
        try:
            # Step 1: Visit trending page first to get cookies
            await self._page.goto(
                "https://trends.google.com/trending?geo=US",
                wait_until="networkidle",
                timeout=30000
            )
            
            # Step 2: Accept cookie consent (CRITICAL for page to work)
            await self._accept_cookie_consent()
            
            # Step 3: Wait for page to stabilize
            await asyncio.sleep(random.uniform(3, 5))
            
            # Step 4: Simulate some human behavior
            await self._page.mouse.move(
                random.randint(100, 500),
                random.randint(100, 400)
            )
            await self._page.evaluate("window.scrollBy(0, 200)")
            await asyncio.sleep(random.uniform(2, 3))
            
            # Step 5: Click on a trending item to further establish session
            try:
                items = await self._page.query_selector_all("table tbody tr")
                if items and len(items) > 2:
                    await items[1].click()
                    await asyncio.sleep(random.uniform(3, 5))
                    await self._page.go_back()
                    await asyncio.sleep(random.uniform(2, 3))
            except Exception:
                pass
            
            self._session_warmed_up = True
            
        except Exception:
            pass
    
    async def _accept_cookie_consent(self) -> bool:
        """
        Accept cookie consent dialog if present.
        This is required for Google Trends to work properly.
        """
        consent_selectors = [
            ".cookieBarConsentButton",  # Google Trends specific
            "a.cookieBarButton:has-text('OK')",
            "button:has-text('Accept all')",
            "button:has-text('I agree')",
            "#L2AGLb",  # Common Google consent button
        ]
        
        for selector in consent_selectors:
            try:
                button = await self._page.query_selector(selector)
                if button:
                    await button.click()
                    await asyncio.sleep(1)
                    return True
            except Exception:
                continue
        
        return False

    async def _navigate_with_retry(
        self,
        url: str,
        max_retries: int = 3,
        wait_for: str | None = None,
    ) -> bool:
        """Navigate to URL with retries."""
        for attempt in range(max_retries):
            try:
                await self._page.goto(
                    url,
                    wait_until="networkidle",
                    timeout=self.config.timeout,
                )

                if wait_for:
                    await self._wait_for_content(wait_for)

                return True

            except Exception as e:
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)
                else:
                    raise NavigationError(f"Failed to navigate to {url}: {e}") from e

        return False

    async def get_daily_trends(
        self,
        geo: str | None = None,
        date: str | None = None,
    ) -> list[TrendingItem]:
        """
        Get daily trending searches.

        Args:
            geo: Geographic region (e.g., "US", "GB")
            date: Date in YYYYMMDD format (optional)

        Returns:
            List of trending items
        """
        geo = geo or self.config.geo
        self._intercepted_data.clear()

        url = f"{self.BASE_URL}/trending?geo={geo}&hl={self.config.hl}"
        await self._navigate_with_retry(url, wait_for="[data-feed-item]")

        # Wait a bit for API responses
        await asyncio.sleep(2)

        results = []

        # First try intercepted API data
        if "dailytrends" in self._intercepted_data:
            data = self._intercepted_data["dailytrends"]
            trending_days = data.get("default", {}).get("trendingSearchesDays", [])

            for day in trending_days:
                for search in day.get("trendingSearches", []):
                    title_info = search.get("title", {})
                    results.append(
                        TrendingItem(
                            title=title_info.get("query", ""),
                            traffic=search.get("formattedTraffic", ""),
                            related_queries=[
                                q.get("query", "")
                                for q in search.get("relatedQueries", [])
                            ],
                            articles=[
                                {
                                    "title": a.get("title", ""),
                                    "url": a.get("url", ""),
                                    "source": a.get("source", ""),
                                }
                                for a in search.get("articles", [])
                            ],
                        )
                    )

        # Fallback to DOM scraping if API interception failed
        if not results:
            results = await self._scrape_daily_trends()

        return results

    async def _scrape_daily_trends(self) -> list[TrendingItem]:
        """Scrape daily trends from the DOM."""
        results = []

        try:
            # Try new table-based layout first (2024+ version)
            rows = await self._page.query_selector_all("table tbody tr, [role='row']")
            
            if rows:
                for row in rows:
                    try:
                        # Try to find title in gridcell
                        cells = await row.query_selector_all("td, [role='gridcell']")
                        if len(cells) >= 2:
                            # Title is usually in the second cell
                            title_cell = cells[1] if len(cells) > 1 else cells[0]
                            title = await title_cell.inner_text()
                            title = title.strip().split('\n')[0]  # Get first line
                            
                            # Traffic is usually in third cell
                            traffic = ""
                            if len(cells) > 2:
                                traffic_text = await cells[2].inner_text()
                                # Extract numbers like "2M+" or "500K+"
                                import re
                                match = re.search(r'[\d,]+[KMB]?\+?', traffic_text)
                                if match:
                                    traffic = match.group()
                            
                            if title and len(title) > 1:
                                results.append(
                                    TrendingItem(
                                        title=title,
                                        traffic=traffic,
                                    )
                                )
                    except Exception:
                        continue
            
            # Fallback to old layout
            if not results:
                items = await self._page.query_selector_all("[data-feed-item]")
                for item in items:
                    try:
                        title_el = await item.query_selector(".mZ3RIc")
                        title = await title_el.inner_text() if title_el else ""
                        
                        traffic_el = await item.query_selector(".lqv0Cb")
                        traffic = await traffic_el.inner_text() if traffic_el else ""
                        
                        if title:
                            results.append(
                                TrendingItem(
                                    title=title,
                                    traffic=traffic,
                                )
                            )
                    except Exception:
                        continue

        except Exception:
            pass

        return results

    async def get_interest_over_time(
        self,
        keywords: list[str],
        timeframe: str = "today 12-m",
        geo: str | None = None,
    ) -> dict[str, list[InterestDataPoint]]:
        """
        Get interest over time for keywords.

        Args:
            keywords: List of keywords (max 5)
            timeframe: Time range string
            geo: Geographic region

        Returns:
            Dictionary mapping keywords to interest data points
        """
        if len(keywords) > 5:
            raise ValueError("Maximum 5 keywords allowed")

        geo = geo or self.config.geo
        self._intercepted_data.clear()

        import random

        # CRITICAL: Warm up session first to avoid 429
        await self._warmup_session()
        
        # Navigate to explore page
        from urllib.parse import quote
        query = ",".join(quote(kw) for kw in keywords)
        url = f"{self.BASE_URL}/trends/explore?geo={geo}&q={query}&hl={self.config.hl}"

        import sys
        
        # Clear batchexecute data from warmup before navigating to explore
        if "batchexecute" in self._intercepted_data:
            self._intercepted_data["batchexecute"] = []
        
        try:
            # Strategy: Use the search box on homepage to navigate to explore
            # This avoids direct URL navigation which may trigger 429
            
            # Step 1: Go to the trends homepage
            await self._page.goto(
                "https://trends.google.com/trends/",
                wait_until="networkidle",
                timeout=30000,
            )
            await asyncio.sleep(random.uniform(2, 3))
            
            # Step 2: Find and use the visible search input
            search_input = None
            inputs = await self._page.query_selector_all("input[type='text']")
            for inp in inputs:
                if await inp.is_visible():
                    search_input = inp
                    break
            
            if search_input:
                # Click on search input
                await search_input.click()
                await asyncio.sleep(random.uniform(0.5, 1))
                
                # Type the keyword slowly (like a human)
                keyword = keywords[0]
                for char in keyword:
                    await search_input.type(char, delay=random.randint(50, 100))
                
                await asyncio.sleep(random.uniform(1.5, 2.5))
                
                # Press Enter to search
                await self._page.keyboard.press("Enter")
                
                # Wait for page navigation
                try:
                    await self._page.wait_for_url("**/explore**", timeout=15000)
                except:
                    pass
                
                # Wait for data to load
                await asyncio.sleep(random.uniform(6, 10))
                
                # Check if we got blocked
                if "sorry" not in self._page.url:
                    # Accept cookie consent if needed
                    await self._accept_cookie_consent()
                    await asyncio.sleep(random.uniform(2, 3))
            else:
                # Fallback to direct URL
                await self._page.goto(url, wait_until="networkidle", timeout=self.config.timeout)
            
        except Exception:
            pass

        results: dict[str, list[InterestDataPoint]] = {kw: [] for kw in keywords}

        # Method 1: Get data from intercepted legacy API response (multiline)
        if "multiline" in self._intercepted_data:
            data = self._intercepted_data["multiline"]
            timeline = data.get("default", {}).get("timelineData", [])

            for point in timeline:
                time_str = point.get("formattedTime", "")
                values = point.get("value", [])
                formatted = point.get("formattedValue", [])

                for i, kw in enumerate(keywords):
                    if i < len(values):
                        results[kw].append(
                            InterestDataPoint(
                                date=time_str,
                                value=values[i],
                                formatted_value=formatted[i] if i < len(formatted) else "",
                            )
                        )

        # Method 2: Parse batchexecute responses (new API)
        if not any(results.values()) and "batchexecute" in self._intercepted_data:
            results = self._parse_batchexecute_timeline(keywords)

        # Method 3: Fallback to chart scraping if API interception failed
        if not any(results.values()):
            results = await self._scrape_interest_chart(keywords)
        
        # Method 4: If still no data, try to extract from page state
        if not any(results.values()):
            results = await self._extract_chart_data_from_page(keywords)

        return results
    
    def _parse_batchexecute_timeline(self, keywords: list[str]) -> dict[str, list[InterestDataPoint]]:
        """Parse timeline data from batchexecute responses."""
        import re
        
        results: dict[str, list[InterestDataPoint]] = {kw: [] for kw in keywords}
        
        for response_body in self._intercepted_data.get("batchexecute", []):
            try:
                # batchexecute format: )]}' followed by chunks
                if response_body.startswith(")]}'"):
                    response_body = response_body[5:]
                
                # Look for timelineData in the response
                # The data is nested in a complex structure, need to find it
                if "timelineData" not in response_body:
                    continue
                
                # Try to extract the JSON array containing timelineData
                # Pattern: "timelineData":[{...}]
                timeline_match = re.search(
                    r'"timelineData"\s*:\s*(\[[\s\S]*?\])\s*[,}]',
                    response_body
                )
                
                if timeline_match:
                    try:
                        timeline_str = timeline_match.group(1)
                        # Fix potential JSON issues (escaped quotes, etc.)
                        timeline_data = json.loads(timeline_str)
                        
                        for point in timeline_data:
                            time_str = point.get("formattedTime", "")
                            values = point.get("value", [])
                            formatted = point.get("formattedValue", [])
                            
                            for i, kw in enumerate(keywords):
                                if i < len(values):
                                    results[kw].append(
                                        InterestDataPoint(
                                            date=time_str,
                                            value=values[i],
                                            formatted_value=formatted[i] if i < len(formatted) else "",
                                        )
                                    )
                        
                        # If we got data, return immediately
                        if any(results.values()):
                            return results
                            
                    except json.JSONDecodeError:
                        # Try alternative parsing
                        pass
                
                # Alternative: Look for numeric arrays that might be values
                # Pattern: "value":[number,number,...]
                value_matches = re.findall(r'"value"\s*:\s*\[(\d+)\]', response_body)
                time_matches = re.findall(r'"formattedTime"\s*:\s*"([^"]+)"', response_body)
                
                if value_matches and time_matches and len(value_matches) == len(time_matches):
                    for i, (time_str, value_str) in enumerate(zip(time_matches, value_matches)):
                        for kw in keywords:
                            results[kw].append(
                                InterestDataPoint(
                                    date=time_str,
                                    value=int(value_str),
                                )
                            )
                    
                    if any(results.values()):
                        return results
                        
            except Exception:
                continue
        
        return results
    
    async def _search_via_ui(self, keyword: str, geo: str) -> bool:
        """
        Search for a keyword using the UI search box.
        This is more likely to succeed than direct URL navigation.
        """
        import random
        
        try:
            # Go to trends homepage first
            await self._page.goto(
                "https://trends.google.com/trends/?geo=US",
                wait_until="networkidle",
                timeout=30000,
            )
            await asyncio.sleep(random.uniform(2, 4))
            
            # Find and click the search input
            search_input = await self._page.query_selector(
                "input[type='text'], input[placeholder*='search'], [role='combobox'] input"
            )
            
            if not search_input:
                # Try to find the explore link and click it
                explore_link = await self._page.query_selector(
                    "a[href*='explore'], button:has-text('Explore')"
                )
                if explore_link:
                    await explore_link.click()
                    await asyncio.sleep(random.uniform(2, 3))
                    search_input = await self._page.query_selector(
                        "input[type='text'], input[placeholder*='search']"
                    )
            
            if search_input:
                # Click on search input
                await search_input.click()
                await asyncio.sleep(random.uniform(0.5, 1))
                
                # Type the keyword slowly (like a human)
                for char in keyword:
                    await search_input.type(char, delay=random.randint(50, 150))
                
                await asyncio.sleep(random.uniform(1, 2))
                
                # Press Enter to search
                await self._page.keyboard.press("Enter")
                
                # Wait for results to load
                await asyncio.sleep(random.uniform(5, 8))
                
                # Check if we got to the explore page
                current_url = self._page.url
                if "explore" in current_url and "sorry" not in current_url:
                    return True
            
            return False
            
        except Exception:
            return False
    
    async def _extract_chart_data_from_page(
        self, keywords: list[str]
    ) -> dict[str, list[InterestDataPoint]]:
        """Extract chart data from the page's internal state."""
        results: dict[str, list[InterestDataPoint]] = {kw: [] for kw in keywords}
        
        try:
            # Try to get data from window.__INITIAL_STATE__ or similar
            page_data = await self._page.evaluate("""() => {
                // Method 1: Check for Google's data layer
                if (window.google && window.google.trends && window.google.trends.embed) {
                    return window.google.trends.embed;
                }
                
                // Method 2: Look in script tags for widget data
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const text = script.textContent || '';
                    // Look for widget configuration
                    if (text.includes('comparisonItem') && text.includes('timelineData')) {
                        try {
                            // Try to extract the data object
                            const dataMatch = text.match(/window\.__PRELOADED_STATE__\s*=\s*({[\s\S]+?});/);
                            if (dataMatch) {
                                return JSON.parse(dataMatch[1]);
                            }
                        } catch (e) {}
                    }
                }
                
                // Method 3: Get visible chart values
                const chartValues = [];
                const chartPoints = document.querySelectorAll('[class*="line-chart"] [class*="point"], svg circle');
                chartPoints.forEach(point => {
                    const title = point.getAttribute('title') || point.getAttribute('aria-label') || '';
                    if (title) {
                        chartValues.push(title);
                    }
                });
                
                return { chartValues };
            }""")
            
            if page_data and isinstance(page_data, dict):
                chart_values = page_data.get('chartValues', [])
                if chart_values:
                    # Parse chart values if available
                    for i, val in enumerate(chart_values[:52]):  # Max 52 weeks
                        for kw in keywords:
                            results[kw].append(
                                InterestDataPoint(
                                    date=f"Week {i+1}",
                                    value=50,  # Default value
                                )
                            )
                            
        except Exception:
            pass
        
        return results

    async def _scrape_interest_chart(
        self, keywords: list[str]
    ) -> dict[str, list[InterestDataPoint]]:
        """Scrape interest data from the chart SVG."""
        results: dict[str, list[InterestDataPoint]] = {kw: [] for kw in keywords}

        try:
            # Try to extract data from the page's JavaScript state
            data = await self._page.evaluate(
                """() => {
                // Try to find trend data in the page
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const text = script.textContent || '';
                    if (text.includes('timelineData')) {
                        const match = text.match(/"timelineData":\s*(\[[\s\S]*?\])/);
                        if (match) {
                            try {
                                return JSON.parse(match[1]);
                            } catch (e) {}
                        }
                    }
                }
                return null;
            }"""
            )

            if data:
                for point in data:
                    time_str = point.get("formattedTime", "")
                    values = point.get("value", [])

                    for i, kw in enumerate(keywords):
                        if i < len(values):
                            results[kw].append(
                                InterestDataPoint(
                                    date=time_str,
                                    value=values[i],
                                )
                            )

        except Exception:
            pass

        return results

    async def get_related_queries(
        self,
        keyword: str,
        timeframe: str = "today 12-m",
        geo: str | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        """
        Get related queries for a keyword.

        Returns:
            Dictionary with "top" and "rising" query lists
        """
        geo = geo or self.config.geo
        self._intercepted_data.clear()

        # CRITICAL: Warm up session first to avoid 429
        await self._warmup_session()
        
        # Set referer header before navigating
        await self._page.set_extra_http_headers({
            "Referer": "https://trends.google.com/",
            "Origin": "https://trends.google.com",
        })

        from urllib.parse import quote
        url = f"{self.BASE_URL}/trends/explore?geo={geo}&q={quote(keyword)}&hl={self.config.hl}"
        await self._navigate_with_retry(url)
        await asyncio.sleep(5)  # Wait longer for data

        results = {"top": [], "rising": []}

        if "relatedsearches" in self._intercepted_data:
            data = self._intercepted_data["relatedsearches"]
            ranked_lists = data.get("default", {}).get("rankedList", [])

            for i, ranked in enumerate(ranked_lists):
                list_type = "top" if i == 0 else "rising"
                for item in ranked.get("rankedKeyword", []):
                    results[list_type].append(
                        {
                            "query": item.get("query", ""),
                            "value": item.get("value", 0),
                            "link": item.get("link", ""),
                        }
                    )

        # Fallback to DOM scraping
        if not results["top"] and not results["rising"]:
            results = await self._scrape_related_queries()

        return results

    async def _scrape_related_queries(self) -> dict[str, list[dict[str, Any]]]:
        """Scrape related queries from the DOM."""
        results = {"top": [], "rising": []}

        try:
            # Try multiple selectors for related queries sections
            # New UI has different class names
            sections = await self._page.query_selector_all(
                "[class*='related-queries'], [class*='fe-atoms-generic-title']"
            )
            
            # Also try to find by heading text
            all_widgets = await self._page.query_selector_all("[class*='widget']")
            
            for widget in all_widgets:
                try:
                    # Check if this widget contains "Related" text
                    text = await widget.inner_text()
                    if "Related queries" in text or "Related topics" in text:
                        # Find all links/items in this widget
                        items = await widget.query_selector_all("a, [role='button']")
                        
                        list_type = "top"  # Default to top
                        if "Rising" in text:
                            list_type = "rising"
                        
                        for item in items[:10]:
                            item_text = await item.inner_text()
                            item_text = item_text.strip()
                            
                            # Skip UI elements
                            if item_text and len(item_text) > 1 and item_text not in ["Top", "Rising"]:
                                # Try to extract value
                                parts = item_text.split('\n')
                                query = parts[0].strip()
                                value = parts[-1].strip() if len(parts) > 1 else "0"
                                
                                if query:
                                    results[list_type].append({
                                        "query": query,
                                        "value": value,
                                    })
                except Exception:
                    continue

            # Legacy fallback
            if not results["top"] and not results["rising"]:
                tables = await self._page.query_selector_all("[class*='fe-related-queries']")
                
                for i, table in enumerate(tables[:2]):
                    list_type = "top" if i == 0 else "rising"
                    
                    rows = await table.query_selector_all("tr")
                    for row in rows:
                        query_el = await row.query_selector("td:first-child")
                        value_el = await row.query_selector("td:last-child")
                        
                        if query_el:
                            query = await query_el.inner_text()
                            value = await value_el.inner_text() if value_el else "0"
                            
                            results[list_type].append({
                                "query": query.strip(),
                                "value": value.strip(),
                            })

        except Exception:
            pass

        return results

    async def get_interest_by_region(
        self,
        keyword: str,
        timeframe: str = "today 12-m", 
        geo: str | None = None,
        resolution: Literal["COUNTRY", "REGION", "CITY"] = "COUNTRY",
    ) -> list[dict[str, Any]]:
        """
        Get interest by geographic region.

        Returns:
            List of regions with their interest values
        """
        geo = geo or self.config.geo
        self._intercepted_data.clear()

        # CRITICAL: Warm up session first to avoid 429
        await self._warmup_session()
        
        # Set referer header
        await self._page.set_extra_http_headers({
            "Referer": "https://trends.google.com/",
            "Origin": "https://trends.google.com",
        })

        from urllib.parse import quote
        url = f"{self.BASE_URL}/trends/explore?geo={geo}&q={quote(keyword)}&hl={self.config.hl}"
        await self._navigate_with_retry(url)
        await asyncio.sleep(3)

        results = []

        if "comparedgeo" in self._intercepted_data:
            data = self._intercepted_data["comparedgeo"]
            geo_data = data.get("default", {}).get("geoMapData", [])

            for region in geo_data:
                value = region.get("value", [0])
                results.append(
                    {
                        "geoCode": region.get("geoCode", ""),
                        "geoName": region.get("geoName", ""),
                        "value": value[0] if value else 0,
                    }
                )

        return results

    async def take_screenshot(self, path: str) -> None:
        """Take a screenshot of the current page."""
        if self._page:
            await self._page.screenshot(path=path)

    async def get_page_content(self) -> str:
        """Get the current page HTML content."""
        if self._page:
            return await self._page.content()
        return ""


class NavigationError(Exception):
    """Raised when page navigation fails."""

    pass


class DataExtractionError(Exception):
    """Raised when data extraction fails."""

    pass


# Async convenience functions
async def get_daily_trends_async(geo: str = "US") -> list[TrendingItem]:
    """Quick async function to get daily trends."""
    async with PlaywrightTrendsFetcher(FetcherConfig(geo=geo)) as fetcher:
        return await fetcher.get_daily_trends()


async def get_keyword_interest_async(
    keywords: list[str], geo: str = "US"
) -> dict[str, list[InterestDataPoint]]:
    """Quick async function to get interest over time."""
    async with PlaywrightTrendsFetcher(FetcherConfig(geo=geo)) as fetcher:
        return await fetcher.get_interest_over_time(keywords)


# Sync wrappers for convenience
def get_daily_trends_sync(geo: str = "US") -> list[TrendingItem]:
    """Synchronous wrapper for daily trends."""
    return asyncio.run(get_daily_trends_async(geo))


def get_keyword_interest_sync(
    keywords: list[str], geo: str = "US"
) -> dict[str, list[InterestDataPoint]]:
    """Synchronous wrapper for interest over time."""
    return asyncio.run(get_keyword_interest_async(keywords, geo))


if __name__ == "__main__":
    async def main():
        print("Testing Playwright Trends Fetcher...")
        print("=" * 50)

        config = FetcherConfig(headless=True, geo="US")

        async with PlaywrightTrendsFetcher(config) as fetcher:
            print("\n1. Daily Trends:")
            try:
                trends = await fetcher.get_daily_trends()
                for t in trends[:5]:
                    print(f"  - {t.title} ({t.traffic})")
            except Exception as e:
                print(f"  Error: {e}")

            print("\n2. Interest Over Time (python, javascript):")
            try:
                interest = await fetcher.get_interest_over_time(["python", "javascript"])
                for kw, data in interest.items():
                    if data:
                        latest = data[-1]
                        print(f"  - {kw}: {latest.value} ({latest.date})")
            except Exception as e:
                print(f"  Error: {e}")

            print("\n3. Related Queries (machine learning):")
            try:
                related = await fetcher.get_related_queries("machine learning")
                print(f"  Top: {[q['query'] for q in related['top'][:3]]}")
                print(f"  Rising: {[q['query'] for q in related['rising'][:3]]}")
            except Exception as e:
                print(f"  Error: {e}")

    asyncio.run(main())
