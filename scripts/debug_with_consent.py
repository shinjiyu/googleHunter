#!/usr/bin/env python3
"""
Test with cookie consent handling.
"""

import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright
from urllib.parse import quote

LOG_PATH = Path(r"d:\workspace\googlesearch\.cursor\debug.log")


async def main():
    keyword = "pomodoro timer"
    
    print("=" * 70)
    print("DEBUG: Testing with Cookie Consent Handling")
    print("=" * 70)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            locale="en-US",
        )
        page = await context.new_page()
        
        # Track batchexecute responses
        timeline_data = []
        
        async def capture_responses(response):
            url = response.url
            if "batchexecute" in url and response.status == 200:
                try:
                    body = await response.text()
                    if "timelineData" in body or "value" in body:
                        timeline_data.append({
                            "url": url[:80],
                            "has_timeline": "timelineData" in body,
                            "body_length": len(body),
                        })
                except:
                    pass
        
        page.on("response", capture_responses)
        
        # Step 1: Go to trends homepage
        print("\n[Step 1] Navigate to homepage...")
        await page.goto("https://trends.google.com/", wait_until="networkidle", timeout=30000)
        await asyncio.sleep(2)
        
        # Step 2: Handle cookie consent
        print("\n[Step 2] Handling cookie consent...")
        
        # Try multiple selectors for consent buttons
        consent_selectors = [
            "button:has-text('Accept all')",
            "button:has-text('OK, got it')",
            "button:has-text('I agree')",
            "button:has-text('Accept')",
            "[aria-label='Accept all']",
            "[aria-label='Accept']",
            "button.tHlp8d",  # Google's consent button class
            "#L2AGLb",  # Common Google consent button ID
        ]
        
        consent_clicked = False
        for selector in consent_selectors:
            try:
                button = await page.query_selector(selector)
                if button:
                    await button.click()
                    print(f"  Clicked consent button: {selector}")
                    consent_clicked = True
                    await asyncio.sleep(2)
                    break
            except Exception as e:
                continue
        
        if not consent_clicked:
            print("  No consent button found or clicked")
        
        # Step 3: Navigate to trending first (better warmup)
        print("\n[Step 3] Navigate to trending...")
        await page.goto("https://trends.google.com/trending?geo=US", wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)
        
        # Check consent again on trending page
        for selector in consent_selectors:
            try:
                button = await page.query_selector(selector)
                if button:
                    await button.click()
                    print(f"  Clicked consent button on trending: {selector}")
                    await asyncio.sleep(2)
                    break
            except:
                continue
        
        # Step 4: Navigate to explore
        print("\n[Step 4] Navigate to explore...")
        url = f"https://trends.google.com/trends/explore?geo=US&q={quote(keyword)}&hl=en-US"
        
        response = await page.goto(url, wait_until="networkidle", timeout=60000)
        
        print(f"  Status: {response.status if response else None}")
        
        # Handle consent again if it appears
        for selector in consent_selectors:
            try:
                button = await page.query_selector(selector)
                if button and await button.is_visible():
                    await button.click()
                    print(f"  Clicked consent button on explore: {selector}")
                    await asyncio.sleep(2)
                    break
            except:
                continue
        
        # Wait for data to load
        print("\n[Step 5] Waiting for data...")
        await asyncio.sleep(8)
        
        # Check for chart
        charts = await page.query_selector_all("svg, [class*='chart'], canvas")
        print(f"  Chart elements: {len(charts)}")
        
        # Check for errors
        errors = await page.query_selector_all("[class*='error'], [class*='Error']")
        print(f"  Error elements: {len(errors)}")
        
        # Check batchexecute responses
        print(f"\n[Step 6] Timeline data responses: {len(timeline_data)}")
        for td in timeline_data:
            print(f"  - {td}")
        
        # Try to extract data from page
        print("\n[Step 7] Extracting data from page...")
        
        # Method 1: Try to get data from window object
        page_data = await page.evaluate("""() => {
            const results = {};
            
            // Look for any data in Angular scope
            try {
                const scope = angular.element(document.body).scope();
                if (scope && scope.explorerController) {
                    results.has_explorer = true;
                }
            } catch (e) {}
            
            // Check for embedded data
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const text = script.textContent || '';
                if (text.includes('timelineData')) {
                    // Try to extract the data
                    const match = text.match(/"timelineData"\s*:\s*\[([\s\S]*?)\]/);
                    if (match) {
                        results.found_timeline = true;
                        results.preview = match[0].substring(0, 200);
                    }
                }
            }
            
            // Check for visible chart data
            const chartTexts = document.querySelectorAll('[class*="chart"] text, svg text');
            results.chart_texts = Array.from(chartTexts).map(t => t.textContent).slice(0, 10);
            
            return results;
        }""")
        
        print(f"  Page data: {json.dumps(page_data, indent=2)}")
        
        # Save screenshot
        await page.screenshot(path="debug_with_consent.png", full_page=True)
        print("\n  Screenshot saved: debug_with_consent.png")
        
        # Get visible text
        body_text = await page.evaluate("() => document.body.innerText.substring(0, 1000)")
        print(f"\n[Step 8] Page text preview:")
        print(f"  {body_text[:300]}...")
        
        await browser.close()
    
    print("\n" + "=" * 70)
    print("DEBUG COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
