#!/usr/bin/env python3
"""
Debug actual page content to see what's being loaded.
"""

import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright
from urllib.parse import quote


async def main():
    keyword = "pomodoro timer"
    
    print("=" * 70)
    print("DEBUG: Page Content Analysis")
    print("=" * 70)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
        )
        page = await context.new_page()
        
        # Track console messages
        console_messages = []
        page.on("console", lambda msg: console_messages.append(f"[{msg.type}] {msg.text}"))
        
        # Track errors
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        
        # Warmup
        print("\n[Step 1] Warmup...")
        await page.goto("https://trends.google.com/trending?geo=US", wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)
        print(f"  Console messages: {len(console_messages)}")
        print(f"  Errors: {len(errors)}")
        
        # Navigate to explore
        print("\n[Step 2] Navigate to explore...")
        url = f"https://trends.google.com/trends/explore?geo=US&q={quote(keyword)}&hl=en-US"
        
        response = await page.goto(url, wait_until="load", timeout=60000)
        
        print(f"  Status: {response.status if response else None}")
        print(f"  URL: {page.url}")
        
        # Wait for content to load
        print("\n[Step 3] Waiting for page content...")
        await asyncio.sleep(5)
        
        # Check page title
        title = await page.title()
        print(f"  Title: {title}")
        
        # Get page HTML structure
        html = await page.content()
        print(f"  HTML length: {len(html)} bytes")
        
        # Check for specific elements
        print("\n[Step 4] Checking page elements...")
        
        # Check for error messages
        error_elements = await page.query_selector_all("[class*='error'], [class*='Error']")
        print(f"  Error elements: {len(error_elements)}")
        
        # Check for loading indicators
        loading = await page.query_selector_all("[class*='loading'], [class*='Loading'], [class*='spinner']")
        print(f"  Loading elements: {len(loading)}")
        
        # Check for charts
        charts = await page.query_selector_all("svg, canvas, [class*='chart']")
        print(f"  Chart elements: {len(charts)}")
        
        # Check for the explore-specific widgets
        widgets = await page.query_selector_all("[class*='widget'], [class*='comparison']")
        print(f"  Widget elements: {len(widgets)}")
        
        # Check for the search input
        search_input = await page.query_selector("input[type='text'], [role='combobox']")
        print(f"  Search input found: {search_input is not None}")
        
        # Check for keyword chips/tags
        chips = await page.query_selector_all("[class*='chip'], [class*='term']")
        print(f"  Keyword chips: {len(chips)}")
        
        # Get visible text content
        body_text = await page.evaluate("() => document.body.innerText.substring(0, 2000)")
        print(f"\n[Step 5] Page text preview:")
        print(f"  {body_text[:500]}...")
        
        # Check for blocked content message
        if "unusual traffic" in body_text.lower() or "captcha" in body_text.lower():
            print("\n  ⚠️ DETECTED: Unusual traffic / captcha message")
        
        if "consent" in body_text.lower() or "agree" in body_text.lower():
            print("\n  ⚠️ DETECTED: Consent dialog may be blocking")
        
        # Check console errors
        if errors:
            print(f"\n[Step 6] Page errors:")
            for e in errors[:5]:
                print(f"  - {e[:200]}")
        
        # Save screenshots
        print("\n[Step 7] Saving screenshots...")
        await page.screenshot(path="debug_explore_full.png", full_page=True)
        print("  Saved: debug_explore_full.png")
        
        await page.screenshot(path="debug_explore_viewport.png")
        print("  Saved: debug_explore_viewport.png")
        
        # Save HTML for analysis
        with open("debug_explore.html", "w", encoding="utf-8") as f:
            f.write(html)
        print("  Saved: debug_explore.html")
        
        await browser.close()
    
    print("\n" + "=" * 70)
    print("DEBUG COMPLETE - Check saved files for details")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
