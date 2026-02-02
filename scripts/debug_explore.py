#!/usr/bin/env python3
"""
debug_explore.py

Debug script to analyze Google Trends explore page and API responses.
"""

import asyncio
import json
import sys
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).parent))

from playwright.async_api import async_playwright


async def main():
    print("=" * 60)
    print("Debug: Google Trends Explore Page")
    print("=" * 60)
    
    captured_requests = []
    captured_responses = {}
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = await context.new_page()
        
        # Capture all network requests
        async def on_request(request):
            url = request.url
            if "trends.google.com" in url and ("api" in url or "batchexecute" in url):
                captured_requests.append({
                    "url": url,
                    "method": request.method,
                })
                print(f"[REQ] {request.method} {url[:100]}...")
        
        async def on_response(response):
            url = response.url
            if "trends.google.com" in url and ("api" in url or "batchexecute" in url):
                status = response.status
                print(f"[RES] {status} {url[:100]}...")
                
                try:
                    body = await response.text()
                    if body.startswith(")]}'"):
                        body = body[5:]
                    
                    # Try to parse as JSON
                    try:
                        data = json.loads(body)
                        captured_responses[url] = {
                            "status": status,
                            "data": data,
                        }
                    except:
                        captured_responses[url] = {
                            "status": status,
                            "body_preview": body[:500],
                        }
                except Exception as e:
                    captured_responses[url] = {
                        "status": status,
                        "error": str(e),
                    }
        
        page.on("request", on_request)
        page.on("response", on_response)
        
        # Navigate to explore page
        keyword = "python"
        url = f"https://trends.google.com/trends/explore?geo=US&q={quote(keyword)}&hl=en-US"
        
        print(f"\n[Navigating to: {url}]")
        
        try:
            await page.goto(url, wait_until="networkidle", timeout=60000)
            print("[Page loaded]")
            
            # Wait for content
            await asyncio.sleep(5)
            
            # Take screenshot
            await page.screenshot(path="debug_explore.png")
            print("[Screenshot saved: debug_explore.png]")
            
            # Get page content summary
            title = await page.title()
            print(f"\n[Page title: {title}]")
            
            # Check for error messages
            error_elements = await page.query_selector_all("[class*='error'], [class*='Error']")
            if error_elements:
                print(f"\n[Found {len(error_elements)} error elements]")
                for el in error_elements[:3]:
                    text = await el.inner_text()
                    print(f"  Error: {text[:100]}")
            
            # Check for chart elements
            charts = await page.query_selector_all("[class*='chart'], svg")
            print(f"\n[Found {len(charts)} chart/svg elements]")
            
            # Check for data widgets
            widgets = await page.query_selector_all("[class*='widget'], [class*='Widget']")
            print(f"[Found {len(widgets)} widget elements]")
            
            # Print intercepted data summary
            print(f"\n[Captured {len(captured_requests)} API requests]")
            print(f"[Captured {len(captured_responses)} API responses]")
            
            for url, resp in captured_responses.items():
                status = resp.get("status", "?")
                has_data = "data" in resp
                print(f"  [{status}] {'DATA' if has_data else 'NO DATA'} - {url[:80]}...")
                
                if has_data and "default" in resp["data"]:
                    data = resp["data"]["default"]
                    if "timelineData" in data:
                        print(f"       -> Has timelineData with {len(data['timelineData'])} points")
                    if "geoMapData" in data:
                        print(f"       -> Has geoMapData with {len(data['geoMapData'])} regions")
                    if "rankedList" in data:
                        print(f"       -> Has rankedList with {len(data['rankedList'])} lists")
            
        except Exception as e:
            print(f"[Navigation error: {e}]")
            import traceback
            traceback.print_exc()
        
        finally:
            await browser.close()
    
    print("\n[Done]")


if __name__ == "__main__":
    asyncio.run(main())
