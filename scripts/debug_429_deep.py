#!/usr/bin/env python3
"""
Deep debug script for Google Trends 429 error.
Tests various strategies to identify the root cause.
"""

import asyncio
import json
import random
from pathlib import Path
from playwright.async_api import async_playwright

LOG_PATH = Path(r"d:\workspace\googlesearch\.cursor\debug.log")

def log(hypothesis: str, location: str, message: str, data: dict = None):
    """Write NDJSON log entry."""
    entry = {
        "hypothesisId": hypothesis,
        "location": location,
        "message": message,
        "data": data or {},
        "timestamp": int(asyncio.get_event_loop().time() * 1000) if asyncio.get_event_loop().is_running() else 0,
        "sessionId": "debug-429",
    }
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(f"[{hypothesis}] {message}: {data}")


async def test_webdriver_detection(page) -> dict:
    """H1: Test if webdriver is being detected."""
    result = await page.evaluate("""() => {
        return {
            webdriver: navigator.webdriver,
            plugins: navigator.plugins.length,
            languages: navigator.languages,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory,
            // Check for automation indicators
            hasChrome: !!window.chrome,
            hasCDP: !!window.chrome?.csi,
            // Headless detection
            isHeadless: /HeadlessChrome/.test(navigator.userAgent),
        }
    }""")
    return result


async def test_cookies(context) -> dict:
    """H2: Check cookies obtained."""
    cookies = await context.cookies()
    cookie_names = [c["name"] for c in cookies]
    important_cookies = ["NID", "CONSENT", "SOCS", "_GRECAPTCHA", "AEC", "1P_JAR"]
    missing = [c for c in important_cookies if c not in cookie_names]
    return {
        "count": len(cookies),
        "names": cookie_names,
        "missing_important": missing,
    }


async def test_request_headers(page, url: str) -> dict:
    """H3: Capture actual request headers sent."""
    headers_sent = {}
    
    async def capture_request(request):
        if "trends.google.com" in request.url:
            headers_sent.update(request.headers)
    
    page.on("request", capture_request)
    
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
    except Exception as e:
        pass
    
    return headers_sent


async def test_with_stealth(playwright) -> dict:
    """H1 Fix: Test with stealth mode (hide automation)."""
    browser = await playwright.chromium.launch(
        headless=True,
        args=[
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--no-sandbox",
        ]
    )
    
    context = await browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport={"width": 1920, "height": 1080},
        locale="en-US",
        timezone_id="America/New_York",
    )
    
    # Inject stealth scripts
    await context.add_init_script("""
        // Override webdriver
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined,
        });
        
        // Add plugins
        Object.defineProperty(navigator, 'plugins', {
            get: () => [1, 2, 3, 4, 5],
        });
        
        // Override permissions
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters) => (
            parameters.name === 'notifications' ?
                Promise.resolve({ state: Notification.permission }) :
                originalQuery(parameters)
        );
        
        // Add chrome object
        window.chrome = {
            runtime: {},
        };
    """)
    
    page = await context.new_page()
    
    # Test webdriver detection after stealth
    webdriver_test = await test_webdriver_detection(page)
    
    # Visit homepage first
    await page.goto("https://trends.google.com/trending?geo=US", wait_until="networkidle", timeout=30000)
    await asyncio.sleep(random.uniform(3, 5))
    
    # Get cookies
    cookies = await test_cookies(context)
    
    # Try explore page
    response = await page.goto(
        "https://trends.google.com/trends/explore?geo=US&q=python",
        wait_until="domcontentloaded",
        timeout=30000
    )
    
    status = response.status if response else None
    final_url = page.url
    
    await browser.close()
    
    return {
        "webdriver_hidden": webdriver_test.get("webdriver") is None or webdriver_test.get("webdriver") == False,
        "webdriver_test": webdriver_test,
        "cookies": cookies,
        "explore_status": status,
        "final_url": final_url,
        "is_429": status == 429 or "sorry" in final_url,
    }


async def test_with_consent_cookie(playwright) -> dict:
    """H2 Fix: Test with pre-set consent cookies."""
    browser = await playwright.chromium.launch(headless=True)
    
    context = await browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )
    
    # Pre-set consent cookies
    await context.add_cookies([
        {
            "name": "CONSENT",
            "value": "YES+cb.20210720-07-p0.en+FX+410",
            "domain": ".google.com",
            "path": "/",
        },
        {
            "name": "SOCS",
            "value": "CAISHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzEaAmVuIAEaBgiA_LSmBg",
            "domain": ".google.com", 
            "path": "/",
        },
    ])
    
    page = await context.new_page()
    
    # Visit homepage
    await page.goto("https://trends.google.com/trending?geo=US", wait_until="networkidle", timeout=30000)
    await asyncio.sleep(random.uniform(2, 4))
    
    cookies = await test_cookies(context)
    
    # Try explore
    response = await page.goto(
        "https://trends.google.com/trends/explore?geo=US&q=python",
        wait_until="domcontentloaded",
        timeout=30000
    )
    
    status = response.status if response else None
    final_url = page.url
    
    await browser.close()
    
    return {
        "cookies": cookies,
        "explore_status": status,
        "final_url": final_url,
        "is_429": status == 429 or "sorry" in final_url,
    }


async def test_with_human_behavior(playwright) -> dict:
    """H4 Fix: Test with more realistic human behavior."""
    browser = await playwright.chromium.launch(
        headless=True,
        args=["--disable-blink-features=AutomationControlled"]
    )
    
    context = await browser.new_context(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        viewport={"width": 1920, "height": 1080},
    )
    
    page = await context.new_page()
    
    # Step 1: Visit Google first (not trends directly)
    await page.goto("https://www.google.com", wait_until="networkidle", timeout=30000)
    await asyncio.sleep(random.uniform(2, 4))
    
    # Random mouse movements
    for _ in range(3):
        await page.mouse.move(random.randint(100, 800), random.randint(100, 600))
        await asyncio.sleep(random.uniform(0.3, 0.8))
    
    # Step 2: Navigate to trends via link simulation
    await page.goto("https://trends.google.com", wait_until="networkidle", timeout=30000)
    await asyncio.sleep(random.uniform(3, 5))
    
    # Scroll and interact
    await page.evaluate("window.scrollBy(0, 300)")
    await asyncio.sleep(random.uniform(1, 2))
    
    # More mouse movements
    for _ in range(2):
        await page.mouse.move(random.randint(200, 600), random.randint(200, 500))
        await asyncio.sleep(random.uniform(0.5, 1))
    
    # Step 3: Click on trending to establish session
    await page.goto("https://trends.google.com/trending?geo=US", wait_until="networkidle", timeout=30000)
    await asyncio.sleep(random.uniform(3, 5))
    
    cookies = await test_cookies(context)
    
    # Step 4: Now try explore with proper referrer
    await page.set_extra_http_headers({
        "Referer": "https://trends.google.com/trending?geo=US",
    })
    
    # Add delay before explore
    await asyncio.sleep(random.uniform(5, 8))
    
    response = await page.goto(
        "https://trends.google.com/trends/explore?geo=US&q=python",
        wait_until="domcontentloaded",
        timeout=30000
    )
    
    status = response.status if response else None
    final_url = page.url
    
    # Check page content
    content = await page.content()
    has_chart = "line-chart" in content or "interest-over-time" in content.lower()
    
    await browser.close()
    
    return {
        "cookies": cookies,
        "explore_status": status,
        "final_url": final_url,
        "is_429": status == 429 or "sorry" in final_url,
        "has_chart_elements": has_chart,
    }


async def test_network_fingerprint(playwright) -> dict:
    """H5: Check if network/IP is the issue by testing basic Google access."""
    browser = await playwright.chromium.launch(headless=True)
    context = await browser.new_context()
    page = await context.new_page()
    
    results = {}
    
    # Test 1: Basic Google
    try:
        response = await page.goto("https://www.google.com", timeout=10000)
        results["google_com"] = response.status if response else None
    except Exception as e:
        results["google_com"] = str(e)
    
    # Test 2: Google Trends homepage
    try:
        response = await page.goto("https://trends.google.com", timeout=10000)
        results["trends_home"] = response.status if response else None
    except Exception as e:
        results["trends_home"] = str(e)
    
    # Test 3: Trending page
    try:
        response = await page.goto("https://trends.google.com/trending?geo=US", timeout=15000)
        results["trending"] = response.status if response else None
    except Exception as e:
        results["trending"] = str(e)
    
    # Test 4: Explore page (the problematic one)
    try:
        response = await page.goto("https://trends.google.com/trends/explore?geo=US&q=test", timeout=15000)
        results["explore"] = response.status if response else None
        results["explore_url"] = page.url
    except Exception as e:
        results["explore"] = str(e)
    
    await browser.close()
    
    return results


async def main():
    print("=" * 70)
    print("DEEP DEBUG: Google Trends 429 Error Analysis")
    print("=" * 70)
    
    async with async_playwright() as p:
        # Test H5: Network fingerprint first
        print("\n[H5] Testing network/IP access...")
        network_result = await test_network_fingerprint(p)
        log("H5", "network_test", "Network fingerprint test", network_result)
        
        # If explore already works, no need for further tests
        if network_result.get("explore") == 200:
            print("  SUCCESS: Explore page accessible!")
            return
        
        # Test H1: Stealth mode
        print("\n[H1] Testing stealth mode (hide automation)...")
        stealth_result = await test_with_stealth(p)
        log("H1", "stealth_test", "Stealth mode test", stealth_result)
        
        if not stealth_result["is_429"]:
            print("  SUCCESS: Stealth mode works!")
            return
        
        # Test H2: Consent cookies
        print("\n[H2] Testing with consent cookies...")
        consent_result = await test_with_consent_cookie(p)
        log("H2", "consent_test", "Consent cookie test", consent_result)
        
        if not consent_result["is_429"]:
            print("  SUCCESS: Consent cookies work!")
            return
        
        # Test H4: Human behavior
        print("\n[H4] Testing with human behavior simulation...")
        human_result = await test_with_human_behavior(p)
        log("H4", "human_test", "Human behavior test", human_result)
        
        if not human_result["is_429"]:
            print("  SUCCESS: Human behavior simulation works!")
            return
        
        print("\n" + "=" * 70)
        print("SUMMARY: All strategies failed. Likely causes:")
        print("  1. IP/Network temporarily blocked by Google")
        print("  2. Need to use real browser or proxy")
        print("  3. Google's anti-bot has updated")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
