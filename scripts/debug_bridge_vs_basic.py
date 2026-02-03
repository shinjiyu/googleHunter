#!/usr/bin/env python3
"""
Compare trends_bridge behavior vs basic test to find the difference.
"""

import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright
from urllib.parse import quote

LOG_PATH = Path(r"d:\workspace\googlesearch\.cursor\debug.log")

def log(msg: str, data: dict = None):
    entry = {
        "location": "bridge_vs_basic",
        "message": msg,
        "data": data or {},
    }
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(f"  {msg}: {json.dumps(data, ensure_ascii=False) if data else ''}")


async def basic_test(keyword: str) -> dict:
    """Basic test that worked."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        url = f"https://trends.google.com/trends/explore?geo=US&q={quote(keyword)}"
        
        response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        
        result = {
            "status": response.status if response else None,
            "url": page.url,
            "method": "basic",
        }
        
        await browser.close()
        return result


async def bridge_style_test(keyword: str) -> dict:
    """Test mimicking trends_bridge / playwright_fetcher behavior."""
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
        
        # Set up response interception (like playwright_fetcher)
        async def handle_response(response):
            url = response.url
            if "trends.google.com/trends/api" in url and response.status == 200:
                try:
                    if "multiline" in url:
                        body = await response.text()
                        if body.startswith(")]}'"):
                            body = body[5:]
                        intercepted_data["multiline"] = json.loads(body)
                except:
                    pass
        
        page.on("response", handle_response)
        
        # Step 1: Warmup (like _warmup_session)
        await page.goto(
            "https://trends.google.com/trending?geo=US",
            wait_until="networkidle",
            timeout=30000
        )
        await asyncio.sleep(3)
        
        # Step 2: Set headers (like get_interest_over_time)
        await page.set_extra_http_headers({
            "Referer": "https://trends.google.com/trending?geo=US",
            "Origin": "https://trends.google.com",
        })
        
        # Step 3: Navigate to explore (like get_interest_over_time)
        url = f"https://trends.google.com/trends/explore?geo=US&q={quote(keyword)}&hl=en-US"
        
        response = await page.goto(
            url,
            wait_until="networkidle",  # This is what playwright_fetcher uses
            timeout=30000
        )
        
        await asyncio.sleep(5)
        
        result = {
            "status": response.status if response else None,
            "url": page.url,
            "method": "bridge_style",
            "has_multiline_data": "multiline" in intercepted_data,
            "data_points": len(intercepted_data.get("multiline", {}).get("default", {}).get("timelineData", [])) if "multiline" in intercepted_data else 0,
        }
        
        await browser.close()
        return result


async def test_with_networkidle_vs_domcontent(keyword: str) -> dict:
    """Compare networkidle vs domcontentloaded."""
    results = {}
    
    async with async_playwright() as p:
        # Test 1: domcontentloaded
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        url = f"https://trends.google.com/trends/explore?geo=US&q={quote(keyword)}"
        
        response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        results["domcontentloaded"] = {
            "status": response.status if response else None,
            "url": page.url,
        }
        await browser.close()
        
        # Test 2: networkidle
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            response = await page.goto(url, wait_until="networkidle", timeout=30000)
            results["networkidle"] = {
                "status": response.status if response else None,
                "url": page.url,
            }
        except Exception as e:
            results["networkidle"] = {"error": str(e)}
        
        await browser.close()
    
    return results


async def test_with_warmup_vs_direct(keyword: str) -> dict:
    """Compare with warmup vs direct navigation."""
    results = {}
    
    async with async_playwright() as p:
        url = f"https://trends.google.com/trends/explore?geo=US&q={quote(keyword)}"
        
        # Test 1: Direct navigation (no warmup)
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        results["direct"] = {
            "status": response.status if response else None,
            "url": page.url,
        }
        await browser.close()
        
        # Test 2: With warmup
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # Warmup
        await page.goto("https://trends.google.com/trending?geo=US", wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)
        
        response = await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        results["with_warmup"] = {
            "status": response.status if response else None,
            "url": page.url,
        }
        await browser.close()
    
    return results


async def main():
    keyword = "pomodoro timer"
    
    print("=" * 70)
    print(f"DEBUG: Comparing approaches for keyword: {keyword}")
    print("=" * 70)
    
    # Test 1: Basic vs Bridge style
    print("\n[Test 1] Basic test...")
    basic_result = await basic_test(keyword)
    log("Basic test", basic_result)
    
    print("\n[Test 2] Bridge style test...")
    bridge_result = await bridge_style_test(keyword)
    log("Bridge style test", bridge_result)
    
    # Test 3: networkidle vs domcontentloaded
    print("\n[Test 3] networkidle vs domcontentloaded...")
    wait_result = await test_with_networkidle_vs_domcontent(keyword)
    log("Wait strategy test", wait_result)
    
    # Test 4: warmup vs direct
    print("\n[Test 4] warmup vs direct...")
    warmup_result = await test_with_warmup_vs_direct(keyword)
    log("Warmup test", warmup_result)
    
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"Basic: {basic_result}")
    print(f"Bridge: {bridge_result}")
    print(f"Wait: {wait_result}")
    print(f"Warmup: {warmup_result}")


if __name__ == "__main__":
    asyncio.run(main())
