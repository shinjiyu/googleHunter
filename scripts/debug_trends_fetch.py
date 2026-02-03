#!/usr/bin/env python3
"""Debug script to test Google Trends data fetching."""

import asyncio
import json
import random
from playwright.async_api import async_playwright

async def main():
    print("=" * 60)
    print("DEBUG: Google Trends Data Fetch Test (Enhanced)")
    print("=" * 60)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800},
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
            }
        )
        page = await context.new_page()
        
        intercepted_data = {}
        all_responses = []
        
        # Set up network interception - capture ALL responses
        async def handle_response(response):
            url = response.url
            status = response.status
            all_responses.append((url[:80], status))
            
            if "trends.google.com" in url:
                try:
                    # Log all trends.google.com responses
                    if status != 200:
                        print(f"[RESPONSE {status}] {url[:100]}")
                    
                    if status == 200:
                        if "multiline" in url or "comparedgeo" in url:
                            print(f"[INTERCEPTED] {url[:100]}...")
                            text = await response.text()
                            if text.startswith(")]}'"):
                                text = text[5:]
                            data = json.loads(text)
                            intercepted_data["multiline"] = data
                            timeline = data.get("default", {}).get("timelineData", [])
                            print(f"  Got {len(timeline)} timeline points")
                        
                        # Also check batchexecute responses
                        if "batchexecute" in url:
                            text = await response.text()
                            print(f"[BATCHEXECUTE] Length: {len(text)}")
                            if "timelineData" in text:
                                print("  Contains timelineData!")
                                intercepted_data["batchexecute"] = text
                            
                except Exception as e:
                    pass
        
        page.on("response", handle_response)
        
        # Step 1: Enhanced warm up
        print("\n[Step 1] Enhanced warm up session...")
        await page.goto("https://trends.google.com/trending?geo=US", wait_until="networkidle", timeout=30000)
        await asyncio.sleep(random.uniform(3, 5))
        
        # Simulate human behavior
        await page.mouse.move(random.randint(200, 600), random.randint(200, 400))
        await page.evaluate("window.scrollBy(0, 300)")
        await asyncio.sleep(random.uniform(2, 3))
        
        # Try clicking a trending item
        try:
            items = await page.query_selector_all("table tbody tr")
            if items:
                print(f"  Found {len(items)} trending items")
                await items[random.randint(0, min(3, len(items)-1))].click()
                await asyncio.sleep(random.uniform(2, 4))
                await page.go_back()
                await asyncio.sleep(random.uniform(1, 2))
        except Exception as e:
            print(f"  Click failed: {e}")
        
        cookies = await context.cookies()
        print(f"  Cookies obtained: {len(cookies)}")
        for c in cookies:
            print(f"    - {c['name']}")
        
        # Step 2: Navigate to explore page
        print("\n[Step 2] Navigating to explore page...")
        keyword = "pomodoro timer"
        url = f"https://trends.google.com/trends/explore?geo=US&q={keyword}"
        print(f"  URL: {url}")
        
        # Set referer
        await page.set_extra_http_headers({
            "Referer": "https://trends.google.com/trending?geo=US",
        })
        
        await asyncio.sleep(random.uniform(2, 4))
        
        response = await page.goto(url, wait_until="networkidle", timeout=60000)
        status = response.status if response else 'None'
        print(f"  Response status: {status}")
        
        # Wait for data
        await asyncio.sleep(8)
        
        # Check page
        title = await page.title()
        print(f"  Page title: {title}")
        
        # Check for errors in page
        page_content = await page.content()
        if "429" in page_content:
            print("  ERROR: 429 in page content")
        if "unusual traffic" in page_content.lower():
            print("  ERROR: Unusual traffic detected")
        
        # Check intercepted data
        print("\n[Step 3] Checking intercepted data...")
        print(f"  Intercepted keys: {list(intercepted_data.keys())}")
        
        if "multiline" in intercepted_data:
            data = intercepted_data["multiline"]
            timeline = data.get("default", {}).get("timelineData", [])
            print(f"  SUCCESS: Got {len(timeline)} data points")
        elif "batchexecute" in intercepted_data:
            print("  Got batchexecute data, need to parse")
        else:
            print("  No data intercepted")
        
        # List non-200 responses
        print("\n[Step 4] Non-200 responses:")
        for url, status in all_responses:
            if status != 200 and status != 204:
                print(f"  [{status}] {url}")
        
        # Check for chart
        print("\n[Step 5] Page analysis...")
        charts = await page.query_selector_all("svg")
        print(f"  SVG elements: {len(charts)}")
        
        widgets = await page.query_selector_all("[class*='widget']")
        print(f"  Widget elements: {len(widgets)}")
        
        # Screenshot
        await page.screenshot(path="debug_trends_page.png", full_page=True)
        print("  Screenshot saved: debug_trends_page.png")
        
        print("\n" + "=" * 60)
        print("DEBUG COMPLETE")
        print("=" * 60)
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
