#!/usr/bin/env python3
"""
debug_bypass_429.py

Debug script to research bypassing Google Trends 429 rate limiting.
Tests various strategies with detailed logging.
"""

import asyncio
import json
import os
import random
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).parent))

from playwright.async_api import async_playwright

# Debug logging configuration
LOG_PATH = Path(r"d:\workspace\googlesearch\.cursor\debug.log")

def log_debug(location: str, message: str, data: dict, hypothesis_id: str = ""):
    """Write debug log entry to file."""
    # #region agent log
    entry = {
        "timestamp": int(datetime.now().timestamp() * 1000),
        "location": location,
        "message": message,
        "data": data,
        "sessionId": "debug-session",
        "runId": "bypass-429",
        "hypothesisId": hypothesis_id
    }
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    # #endregion


async def test_bypass_strategies():
    """Test different strategies to bypass 429 rate limiting."""
    
    log_debug("debug_bypass_429.py:37", "Starting bypass test", {"strategies": ["warmup", "referer", "interaction", "delay"]}, "START")
    
    async with async_playwright() as p:
        # Launch browser with stealth settings
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
            ]
        )
        
        # Create context with realistic settings
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="en-US",
            timezone_id="America/New_York",
            # Add extra HTTP headers
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Cache-Control": "max-age=0",
            }
        )
        
        page = await context.new_page()
        
        # Track API responses
        api_responses = []
        
        async def on_response(response):
            url = response.url
            if "trends.google.com" in url:
                status = response.status
                api_responses.append({"url": url[:100], "status": status})
                
                # #region agent log
                log_debug(
                    "debug_bypass_429.py:82", 
                    f"API Response: {status}", 
                    {"url": url[:150], "status": status, "is_429": status == 429},
                    "B" if "explore" in url else "A"
                )
                # #endregion
        
        page.on("response", on_response)
        
        # ============ STRATEGY 1: Warmup with homepage first ============
        print("\n[Strategy 1] Warming up with homepage...")
        log_debug("debug_bypass_429.py:93", "Strategy 1: Visiting homepage first", {}, "A")
        
        try:
            await page.goto("https://trends.google.com/", wait_until="networkidle", timeout=30000)
            
            # Get cookies after homepage
            cookies = await context.cookies()
            cookie_names = [c["name"] for c in cookies]
            
            # #region agent log
            log_debug(
                "debug_bypass_429.py:103", 
                "Homepage loaded, cookies obtained", 
                {"cookie_count": len(cookies), "cookie_names": cookie_names[:10]},
                "A"
            )
            # #endregion
            
            print(f"  Cookies obtained: {len(cookies)}")
            print(f"  Cookie names: {cookie_names[:5]}")
            
        except Exception as e:
            log_debug("debug_bypass_429.py:114", "Homepage failed", {"error": str(e)}, "A")
            print(f"  Homepage error: {e}")
        
        # ============ STRATEGY 2: Add delay before explore ============
        print("\n[Strategy 2] Adding delay before explore...")
        delay_seconds = random.uniform(2, 4)
        log_debug("debug_bypass_429.py:120", "Strategy 2: Adding delay", {"delay_seconds": delay_seconds}, "D")
        await asyncio.sleep(delay_seconds)
        
        # ============ STRATEGY 3: Navigate via clicking (simulate user) ============
        print("\n[Strategy 3] Simulating user interaction...")
        log_debug("debug_bypass_429.py:125", "Strategy 3: User interaction", {}, "E")
        
        try:
            # Try to find and click explore button/link
            explore_link = await page.query_selector('a[href*="explore"], button:has-text("Explore")')
            if explore_link:
                await explore_link.click()
                await page.wait_for_load_state("networkidle")
                log_debug("debug_bypass_429.py:133", "Clicked explore link", {"success": True}, "E")
                print("  Clicked explore link")
            else:
                log_debug("debug_bypass_429.py:136", "No explore link found, navigating directly", {}, "E")
                print("  No explore link found")
        except Exception as e:
            log_debug("debug_bypass_429.py:139", "Click failed", {"error": str(e)}, "E")
        
        # ============ STRATEGY 4: Navigate to explore with proper referer ============
        print("\n[Strategy 4] Navigate to explore with referer...")
        
        # Set referer header
        await page.set_extra_http_headers({
            "Referer": "https://trends.google.com/",
            "Origin": "https://trends.google.com",
        })
        
        log_debug("debug_bypass_429.py:150", "Strategy 4: Navigate with referer", {"referer": "https://trends.google.com/"}, "B")
        
        keyword = "python"
        explore_url = f"https://trends.google.com/trends/explore?geo=US&q={quote(keyword)}&hl=en-US"
        
        try:
            # Clear api_responses before this test
            api_responses.clear()
            
            await page.goto(explore_url, wait_until="domcontentloaded", timeout=60000)
            
            # Wait for content
            await asyncio.sleep(5)
            
            # Check page title for 429
            title = await page.title()
            is_429_page = "429" in title or "Too Many" in title
            
            # #region agent log
            log_debug(
                "debug_bypass_429.py:169", 
                "Explore page result", 
                {
                    "title": title,
                    "is_429_page": is_429_page,
                    "api_responses_count": len(api_responses),
                    "any_429": any(r["status"] == 429 for r in api_responses)
                },
                "B"
            )
            # #endregion
            
            print(f"  Page title: {title}")
            print(f"  Is 429 page: {is_429_page}")
            print(f"  API responses: {len(api_responses)}")
            
            # Log all API response statuses
            status_counts = {}
            for r in api_responses:
                status = r["status"]
                status_counts[status] = status_counts.get(status, 0) + 1
            
            log_debug("debug_bypass_429.py:189", "API status summary", {"status_counts": status_counts}, "B")
            print(f"  Status counts: {status_counts}")
            
            # If successful, try to get data
            if not is_429_page:
                print("\n[SUCCESS] Page loaded without 429!")
                
                # Check for chart data
                charts = await page.query_selector_all("svg, [class*='chart']")
                log_debug("debug_bypass_429.py:198", "Chart elements found", {"count": len(charts)}, "B")
                print(f"  Chart elements: {len(charts)}")
                
                # Take screenshot
                await page.screenshot(path="debug_bypass_success.png")
                print("  Screenshot saved: debug_bypass_success.png")
            else:
                print("\n[BLOCKED] Still getting 429")
                await page.screenshot(path="debug_bypass_blocked.png")
                print("  Screenshot saved: debug_bypass_blocked.png")
                
        except Exception as e:
            log_debug("debug_bypass_429.py:210", "Explore navigation failed", {"error": str(e)}, "B")
            print(f"  Explore error: {e}")
        
        # ============ STRATEGY 5: Try with fresh context and different approach ============
        print("\n[Strategy 5] Fresh context with stealth JS...")
        
        # Create new context
        context2 = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        
        page2 = await context2.new_page()
        
        # Add stealth script to hide automation
        await page2.add_init_script("""
            // Override webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
            
            // Override chrome runtime
            window.chrome = {
                runtime: {}
            };
        """)
        
        log_debug("debug_bypass_429.py:247", "Strategy 5: Stealth context created", {}, "C")
        
        api_responses_2 = []
        
        async def on_response_2(response):
            url = response.url
            if "trends.google.com" in url:
                status = response.status
                api_responses_2.append({"url": url[:100], "status": status})
        
        page2.on("response", on_response_2)
        
        try:
            # First visit homepage
            await page2.goto("https://trends.google.com/", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(3)
            
            # Then visit trending page (which works)
            await page2.goto("https://trends.google.com/trending?geo=US", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(2)
            
            # Now try explore from trending page context
            await page2.goto(explore_url, wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(5)
            
            title2 = await page2.title()
            is_429_page_2 = "429" in title2 or "Too Many" in title2
            
            status_counts_2 = {}
            for r in api_responses_2:
                status = r["status"]
                status_counts_2[status] = status_counts_2.get(status, 0) + 1
            
            log_debug(
                "debug_bypass_429.py:281", 
                "Strategy 5 result", 
                {
                    "title": title2,
                    "is_429_page": is_429_page_2,
                    "status_counts": status_counts_2
                },
                "C"
            )
            
            print(f"  Page title: {title2}")
            print(f"  Is 429 page: {is_429_page_2}")
            print(f"  Status counts: {status_counts_2}")
            
        except Exception as e:
            log_debug("debug_bypass_429.py:296", "Strategy 5 failed", {"error": str(e)}, "C")
            print(f"  Strategy 5 error: {e}")
        
        await context2.close()
        
        # ============ Final Summary ============
        print("\n" + "=" * 60)
        print("FINAL SUMMARY")
        print("=" * 60)
        
        log_debug(
            "debug_bypass_429.py:307", 
            "Test completed", 
            {"total_strategies_tested": 5},
            "END"
        )
        
        await browser.close()


if __name__ == "__main__":
    asyncio.run(test_bypass_strategies())
