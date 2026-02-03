#!/usr/bin/env python3
"""
Debug API interception - find out why multiline data is not captured.
"""

import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright
from urllib.parse import quote

LOG_PATH = Path(r"d:\workspace\googlesearch\.cursor\debug.log")

def log(msg: str, data: dict = None):
    entry = {"message": msg, "data": data or {}}
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(f"  {msg}")
    if data:
        print(f"    {json.dumps(data, ensure_ascii=False)[:500]}")


async def main():
    keyword = "pomodoro timer"
    
    print("=" * 70)
    print("DEBUG: API Interception Analysis")
    print("=" * 70)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        all_responses = []
        trends_responses = []
        
        async def capture_all_responses(response):
            url = response.url
            status = response.status
            content_type = response.headers.get("content-type", "")
            
            all_responses.append({
                "url": url[:150],
                "status": status,
                "type": content_type[:50],
            })
            
            # Capture all trends.google.com responses
            if "trends.google.com" in url:
                try:
                    body = await response.text()
                    trends_responses.append({
                        "url": url,
                        "status": status,
                        "body_length": len(body),
                        "body_preview": body[:200] if len(body) < 500 else body[:200] + "...",
                        "has_timeline": "timelineData" in body,
                        "has_multiline": "multiline" in url,
                    })
                except:
                    trends_responses.append({
                        "url": url,
                        "status": status,
                        "error": "could not read body",
                    })
        
        page.on("response", capture_all_responses)
        
        # Step 1: Warmup
        print("\n[Step 1] Warmup...")
        await page.goto("https://trends.google.com/trending?geo=US", wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)
        log("After warmup", {"responses": len(all_responses), "trends_responses": len(trends_responses)})
        
        # Step 2: Navigate to explore
        print("\n[Step 2] Navigate to explore...")
        url = f"https://trends.google.com/trends/explore?geo=US&q={quote(keyword)}&hl=en-US"
        response = await page.goto(url, wait_until="networkidle", timeout=60000)
        await asyncio.sleep(5)
        
        log("After explore", {
            "page_status": response.status if response else None,
            "page_url": page.url,
            "total_responses": len(all_responses),
            "trends_responses": len(trends_responses),
        })
        
        # Analyze trends responses
        print("\n[Step 3] Analyzing trends API responses...")
        
        api_responses = [r for r in trends_responses if "/api/" in r.get("url", "") or "batchexecute" in r.get("url", "")]
        
        print(f"\n  Found {len(api_responses)} API responses:")
        for r in api_responses:
            print(f"    - [{r.get('status')}] {r.get('url', '')[:80]}")
            print(f"      Body: {r.get('body_length', 0)} bytes, timeline: {r.get('has_timeline', False)}")
        
        log("API responses", {"count": len(api_responses), "responses": api_responses})
        
        # Find responses with timelineData
        timeline_responses = [r for r in trends_responses if r.get("has_timeline")]
        print(f"\n  Responses with timelineData: {len(timeline_responses)}")
        for r in timeline_responses:
            print(f"    - {r.get('url', '')[:80]}")
            log("Timeline response found", r)
        
        # Check page content for charts
        print("\n[Step 4] Checking page content...")
        
        # Check for chart elements
        charts = await page.query_selector_all("svg, [class*='chart'], [class*='line']")
        print(f"  Chart/SVG elements: {len(charts)}")
        
        # Check for widgets
        widgets = await page.query_selector_all("[class*='widget'], [class*='explore']")
        print(f"  Widget elements: {len(widgets)}")
        
        # Try to get data from page state
        page_state = await page.evaluate("""() => {
            const scripts = Array.from(document.querySelectorAll('script'));
            for (const script of scripts) {
                const text = script.textContent || '';
                if (text.includes('timelineData')) {
                    return {found: true, preview: text.substring(0, 300)};
                }
            }
            return {found: false};
        }""")
        
        print(f"  Page has timelineData in scripts: {page_state.get('found')}")
        if page_state.get("found"):
            log("Found timelineData in page", page_state)
        
        # Save screenshot
        await page.screenshot(path="debug_explore_page.png", full_page=True)
        print("  Screenshot saved: debug_explore_page.png")
        
        await browser.close()
    
    print("\n" + "=" * 70)
    print("DEBUG COMPLETE - Check debug.log for full details")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
