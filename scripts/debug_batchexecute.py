#!/usr/bin/env python3
"""
Debug batchexecute responses to find timelineData.
"""

import asyncio
import json
import re
from pathlib import Path
from playwright.async_api import async_playwright
from urllib.parse import quote

LOG_PATH = Path(r"d:\workspace\googlesearch\.cursor\debug.log")


def parse_batchexecute_response(text: str) -> list:
    """Parse batchexecute response format."""
    results = []
    
    # Remove the anti-XSSI prefix
    if text.startswith(")]}'"):
        text = text[5:]
    
    # batchexecute format: multiple chunks separated by newlines
    # Each chunk starts with a number (length) followed by the actual data
    lines = text.strip().split('\n')
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.isdigit():
            # This is a length indicator, next line is the data
            if i + 1 < len(lines):
                data_line = lines[i + 1]
                try:
                    parsed = json.loads(data_line)
                    results.append(parsed)
                except:
                    # Try to find JSON within the line
                    try:
                        # Look for nested JSON
                        if isinstance(data_line, str) and data_line.startswith('['):
                            results.append({"raw": data_line[:500]})
                    except:
                        pass
            i += 2
        else:
            i += 1
    
    return results


def extract_timeline_data(text: str) -> dict:
    """Try to extract timelineData from batchexecute response."""
    # Look for timelineData pattern
    pattern = r'"timelineData"\s*:\s*\[(.*?)\]'
    match = re.search(pattern, text, re.DOTALL)
    
    if match:
        return {"found": True, "preview": match.group(0)[:300]}
    
    # Look for value arrays that might be timeline data
    value_pattern = r'"value"\s*:\s*\[(\d+(?:,\s*\d+)*)\]'
    values = re.findall(value_pattern, text)
    
    if values:
        return {"found_values": True, "value_count": len(values), "sample": values[:3]}
    
    return {"found": False}


async def main():
    keyword = "pomodoro timer"
    
    print("=" * 70)
    print("DEBUG: batchexecute Response Analysis")
    print("=" * 70)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        batchexecute_responses = []
        
        async def capture_batchexecute(response):
            url = response.url
            if "batchexecute" in url and response.status == 200:
                try:
                    body = await response.text()
                    rpcid_match = re.search(r'rpcids=([^&]+)', url)
                    rpcid = rpcid_match.group(1) if rpcid_match else "unknown"
                    
                    batchexecute_responses.append({
                        "rpcid": rpcid,
                        "url": url,
                        "body_length": len(body),
                        "body": body,
                    })
                except Exception as e:
                    print(f"  Error capturing: {e}")
        
        page.on("response", capture_batchexecute)
        
        # Warmup
        print("\n[Step 1] Warmup...")
        await page.goto("https://trends.google.com/trending?geo=US", wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)
        
        # Clear responses from warmup
        warmup_count = len(batchexecute_responses)
        print(f"  Warmup batchexecute responses: {warmup_count}")
        
        # Navigate to explore
        print("\n[Step 2] Navigate to explore...")
        url = f"https://trends.google.com/trends/explore?geo=US&q={quote(keyword)}&hl=en-US"
        await page.goto(url, wait_until="networkidle", timeout=60000)
        
        # Wait for additional requests
        await asyncio.sleep(8)
        
        explore_responses = batchexecute_responses[warmup_count:]
        print(f"  Explore batchexecute responses: {len(explore_responses)}")
        
        # Analyze each response
        print("\n[Step 3] Analyzing batchexecute responses...")
        
        for i, resp in enumerate(explore_responses):
            print(f"\n  Response {i+1}: rpcid={resp['rpcid']}, size={resp['body_length']} bytes")
            
            body = resp["body"]
            
            # Check for timelineData
            timeline_info = extract_timeline_data(body)
            print(f"    timelineData: {timeline_info}")
            
            # Check what kind of data this contains
            if "interest" in body.lower():
                print("    Contains 'interest' keyword")
            if "compare" in body.lower():
                print("    Contains 'compare' keyword")
            if "timeline" in body.lower():
                print("    Contains 'timeline' keyword")
            if "value" in body and "[" in body:
                # Try to find numeric arrays
                num_arrays = re.findall(r'\[(\d+(?:,\d+){5,})\]', body)
                if num_arrays:
                    print(f"    Found {len(num_arrays)} numeric arrays")
                    print(f"    Sample array: [{num_arrays[0][:50]}...]")
            
            # Save large responses for manual inspection
            if resp["body_length"] > 10000:
                filename = f"debug_batchexecute_{resp['rpcid']}.txt"
                with open(filename, "w", encoding="utf-8") as f:
                    f.write(body)
                print(f"    Saved to {filename}")
        
        # Try scrolling/interacting to trigger more data loading
        print("\n[Step 4] Trying to trigger more data loading...")
        await page.evaluate("window.scrollBy(0, 500)")
        await asyncio.sleep(3)
        
        # Click on any chart area
        try:
            chart = await page.query_selector("svg, [class*='chart']")
            if chart:
                await chart.hover()
                await asyncio.sleep(1)
                print("  Hovered over chart")
        except:
            pass
        
        await asyncio.sleep(3)
        
        new_responses = batchexecute_responses[warmup_count + len(explore_responses):]
        print(f"  New responses after interaction: {len(new_responses)}")
        
        # Final check - try to get data from window object
        print("\n[Step 5] Checking window/page state...")
        page_data = await page.evaluate("""() => {
            // Try various ways to find the data
            const results = {};
            
            // Check for global data objects
            if (window.__INITIAL_DATA__) results.initial_data = true;
            if (window.__PRELOADED_STATE__) results.preloaded_state = true;
            if (window.google) results.google_obj = Object.keys(window.google || {});
            
            // Check for any object with timelineData
            for (const key in window) {
                try {
                    if (typeof window[key] === 'object' && window[key]) {
                        const str = JSON.stringify(window[key]);
                        if (str && str.includes('timelineData')) {
                            results.found_in = key;
                            break;
                        }
                    }
                } catch (e) {}
            }
            
            return results;
        }""")
        print(f"  Page state: {page_data}")
        
        await browser.close()
    
    print("\n" + "=" * 70)
    print("DEBUG COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
