#!/usr/bin/env python3
"""
capture_trends_api.py

Playwright-based tool to capture Google Trends API requests.
Use this to analyze the API structure and extract tokens/cookies.

Usage:
  python capture_trends_api.py --keyword "python" --output captures/
  python capture_trends_api.py --daily-trends --geo US

This tool will:
1. Open a browser to Google Trends
2. Capture all network requests to trends.google.com/trends/api/*
3. Save the request/response data for analysis
4. Extract tokens and cookies needed for direct API calls
"""

import argparse
import asyncio
import json
import os
import re
from datetime import datetime
from typing import Any
from urllib.parse import parse_qs, urlparse

from playwright.async_api import Page, Request, Response, async_playwright


class TrendsAPICapture:
    """Captures and analyzes Google Trends API requests."""

    def __init__(self, output_dir: str = "captures"):
        self.output_dir = output_dir
        self.captured_requests: list[dict[str, Any]] = []
        self.tokens: dict[str, str] = {}
        self.cookies: list[dict[str, Any]] = []
        os.makedirs(output_dir, exist_ok=True)

    async def on_request(self, request: Request) -> None:
        """Handle request events."""
        url = request.url
        if "trends.google.com/trends/api" in url:
            parsed = urlparse(url)
            params = parse_qs(parsed.query)

            req_data = {
                "timestamp": datetime.now().isoformat(),
                "method": request.method,
                "url": url,
                "path": parsed.path,
                "params": {k: v[0] if len(v) == 1 else v for k, v in params.items()},
                "headers": dict(request.headers),
            }

            # Extract token if present
            if "token" in params:
                token_val = params["token"][0] if params["token"] else ""
                endpoint = parsed.path.split("/")[-1]
                self.tokens[endpoint] = token_val
                print(f"[Captured Token] {endpoint}: {token_val[:50]}...")

            self.captured_requests.append(req_data)
            print(f"[Request] {request.method} {parsed.path}")

    async def on_response(self, response: Response) -> None:
        """Handle response events."""
        url = response.url
        if "trends.google.com/trends/api" in url:
            try:
                body = await response.text()
                # Google Trends API responses often have a )]}' prefix
                if body.startswith(")]}'"):
                    body = body[5:]

                # Find the corresponding request
                for req in reversed(self.captured_requests):
                    if req["url"] == url and "response" not in req:
                        req["response"] = {
                            "status": response.status,
                            "headers": dict(response.headers),
                            "body_preview": body[:500] if len(body) > 500 else body,
                            "body_length": len(body),
                        }
                        try:
                            req["response"]["json"] = json.loads(body)
                        except json.JSONDecodeError:
                            pass
                        print(f"[Response] {response.status} - {len(body)} bytes")
                        break
            except Exception as e:
                print(f"[Response Error] {e}")

    async def capture_explore(self, page: Page, keyword: str, geo: str = "US") -> None:
        """Capture API calls from the explore page."""
        url = f"https://trends.google.com/trends/explore?geo={geo}&q={keyword}"
        print(f"\n[Navigate] {url}")

        await page.goto(url, wait_until="networkidle", timeout=120000)
        await asyncio.sleep(3)  # Wait for additional API calls

        # Try to extract tokens from the page content
        await self._extract_embedded_tokens(page)

    async def capture_daily_trends(self, page: Page, geo: str = "US") -> None:
        """Capture API calls from the daily trends page."""
        url = f"https://trends.google.com/trending?geo={geo}&hl=en-US"
        print(f"\n[Navigate] {url}")

        await page.goto(url, wait_until="networkidle", timeout=120000)
        await asyncio.sleep(3)

    async def _extract_embedded_tokens(self, page: Page) -> None:
        """Extract tokens embedded in the page."""
        try:
            content = await page.content()

            # Look for widget tokens in the page
            token_patterns = [
                r'"token"\s*:\s*"([^"]+)"',
                r"token=([A-Za-z0-9_-]+)",
            ]

            for pattern in token_patterns:
                matches = re.findall(pattern, content)
                for i, match in enumerate(matches):
                    key = f"embedded_{i}"
                    if match not in self.tokens.values():
                        self.tokens[key] = match
                        print(f"[Embedded Token] {key}: {match[:50]}...")

        except Exception as e:
            print(f"[Extract Error] {e}")

    async def save_cookies(self, page: Page) -> None:
        """Save browser cookies."""
        context = page.context
        self.cookies = await context.cookies()
        print(f"[Cookies] Captured {len(self.cookies)} cookies")

    def save_results(self) -> str:
        """Save all captured data to files."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        # Save requests
        requests_file = os.path.join(self.output_dir, f"requests_{timestamp}.json")
        with open(requests_file, "w", encoding="utf-8") as f:
            json.dump(self.captured_requests, f, indent=2, ensure_ascii=False)

        # Save tokens
        tokens_file = os.path.join(self.output_dir, f"tokens_{timestamp}.json")
        with open(tokens_file, "w", encoding="utf-8") as f:
            json.dump(self.tokens, f, indent=2)

        # Save cookies
        cookies_file = os.path.join(self.output_dir, f"cookies_{timestamp}.json")
        with open(cookies_file, "w", encoding="utf-8") as f:
            json.dump(self.cookies, f, indent=2)

        # Generate API documentation
        api_doc = self._generate_api_doc()
        doc_file = os.path.join(self.output_dir, f"api_doc_{timestamp}.md")
        with open(doc_file, "w", encoding="utf-8") as f:
            f.write(api_doc)

        print(f"\n[Saved] {requests_file}")
        print(f"[Saved] {tokens_file}")
        print(f"[Saved] {cookies_file}")
        print(f"[Saved] {doc_file}")

        return self.output_dir

    def _generate_api_doc(self) -> str:
        """Generate markdown documentation of captured APIs."""
        doc = "# Google Trends API Documentation\n\n"
        doc += f"Generated: {datetime.now().isoformat()}\n\n"

        # Group by endpoint
        endpoints: dict[str, list[dict]] = {}
        for req in self.captured_requests:
            path = req.get("path", "unknown")
            if path not in endpoints:
                endpoints[path] = []
            endpoints[path].append(req)

        for endpoint, reqs in endpoints.items():
            doc += f"## {endpoint}\n\n"

            for req in reqs[:3]:  # Show first 3 examples
                doc += f"### Request\n"
                doc += f"- Method: `{req.get('method')}`\n"
                doc += f"- URL: `{req.get('url')[:100]}...`\n"
                doc += f"\n**Parameters:**\n```json\n"
                doc += json.dumps(req.get("params", {}), indent=2)
                doc += "\n```\n"

                if "response" in req:
                    resp = req["response"]
                    doc += f"\n### Response\n"
                    doc += f"- Status: `{resp.get('status')}`\n"
                    doc += f"- Size: `{resp.get('body_length')} bytes`\n"
                    if "json" in resp:
                        doc += "\n**Response Preview:**\n```json\n"
                        preview = json.dumps(resp["json"], indent=2)[:1000]
                        doc += preview
                        doc += "\n```\n"

                doc += "\n---\n\n"

        # Add token section
        doc += "## Extracted Tokens\n\n"
        for name, token in self.tokens.items():
            doc += f"- **{name}**: `{token[:50]}...`\n"

        return doc


async def main(args: argparse.Namespace) -> None:
    """Main entry point."""
    capturer = TrendsAPICapture(output_dir=args.output)

    async with async_playwright() as p:
        # Launch browser with visible UI for debugging
        browser = await p.chromium.launch(
            headless=args.headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
            ],
        )

        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="en-US",
        )

        page = await context.new_page()

        # Set up request/response listeners
        page.on("request", capturer.on_request)
        page.on("response", capturer.on_response)

        try:
            if args.daily_trends:
                await capturer.capture_daily_trends(page, geo=args.geo)
            elif args.keyword:
                await capturer.capture_explore(page, keyword=args.keyword, geo=args.geo)
            else:
                # Default: capture both
                await capturer.capture_daily_trends(page, geo=args.geo)
                await capturer.capture_explore(page, keyword="python", geo=args.geo)

            # Save cookies
            await capturer.save_cookies(page)

            # Keep browser open for manual inspection if not headless
            if not args.headless:
                print("\n[Info] Browser is open for inspection. Press Enter to close...")
                await asyncio.get_event_loop().run_in_executor(None, input)

        finally:
            await browser.close()

    # Save results
    capturer.save_results()

    print("\n" + "=" * 60)
    print("Capture complete!")
    print(f"Found {len(capturer.captured_requests)} API requests")
    print(f"Extracted {len(capturer.tokens)} tokens")
    print(f"Results saved to: {args.output}/")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Capture Google Trends API requests using Playwright"
    )
    parser.add_argument(
        "--keyword", "-k", help="Keyword to explore", default=None
    )
    parser.add_argument(
        "--daily-trends", "-d", action="store_true", help="Capture daily trends"
    )
    parser.add_argument(
        "--geo", "-g", default="US", help="Geographic region (e.g., US, CN)"
    )
    parser.add_argument(
        "--output", "-o", default="captures", help="Output directory"
    )
    parser.add_argument(
        "--headless", action="store_true", help="Run in headless mode"
    )

    args = parser.parse_args()
    asyncio.run(main(args))
