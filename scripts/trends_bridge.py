#!/usr/bin/env python3
"""
trends_bridge.py

Bridge script for Node.js to call the Google Trends library.
Outputs JSON to stdout for Node.js consumption.

Usage:
    python trends_bridge.py daily_trends --geo=US
    python trends_bridge.py interest_over_time --keywords="python,java" --geo=US
    python trends_bridge.py related_queries --keyword="python" --geo=US
"""

import asyncio
import json
import sys
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

from playwright_fetcher import PlaywrightTrendsFetcher, FetcherConfig


def output_json(data: dict) -> None:
    """Output JSON to stdout."""
    print(json.dumps(data, ensure_ascii=False))


def output_error(message: str) -> None:
    """Output error as JSON."""
    output_json({"error": message, "success": False})


async def fetch_daily_trends(geo: str = "US", hl: str = "en-US") -> None:
    """Fetch daily trending searches."""
    config = FetcherConfig(geo=geo, hl=hl, headless=True)
    
    async with PlaywrightTrendsFetcher(config) as fetcher:
        try:
            trends = await fetcher.get_daily_trends()
            
            items = []
            for trend in trends:
                items.append({
                    "title": trend.title,
                    "formattedTraffic": trend.traffic,
                    "relatedQueries": [],
                    "articles": [],
                })
            
            output_json({
                "success": True,
                "data": items,
            })
        except Exception as e:
            output_error(str(e))


async def fetch_interest_over_time(keywords: list[str], geo: str = "US", hl: str = "en-US") -> None:
    """Fetch interest over time for keywords."""
    config = FetcherConfig(geo=geo, hl=hl, headless=True)
    
    async with PlaywrightTrendsFetcher(config) as fetcher:
        try:
            interest = await fetcher.get_interest_over_time(keywords, geo=geo)
            
            # Format data for Node.js
            result = {}
            for keyword, data_points in interest.items():
                result[keyword] = [
                    {"date": dp.date, "value": dp.value}
                    for dp in data_points
                ]
            
            output_json({
                "success": True,
                "data": result,
            })
        except Exception as e:
            output_error(str(e))


async def fetch_related_queries(keyword: str, geo: str = "US", hl: str = "en-US") -> None:
    """Fetch related queries for a keyword."""
    config = FetcherConfig(geo=geo, hl=hl, headless=True)
    
    async with PlaywrightTrendsFetcher(config) as fetcher:
        try:
            related = await fetcher.get_related_queries(keyword, geo=geo)
            
            output_json({
                "success": True,
                "data": {
                    "top": [q.get("query", "") for q in related.get("top", [])],
                    "rising": [q.get("query", "") for q in related.get("rising", [])],
                },
            })
        except Exception as e:
            output_error(str(e))


def main():
    if len(sys.argv) < 2:
        output_error("Usage: python trends_bridge.py <command> [options]")
        sys.exit(1)
    
    command = sys.argv[1]
    
    # Parse arguments
    args = {}
    for arg in sys.argv[2:]:
        if arg.startswith("--"):
            key, _, value = arg[2:].partition("=")
            args[key] = value
    
    geo = args.get("geo", "US")
    hl = args.get("hl", "en-US")
    
    if command == "daily_trends":
        asyncio.run(fetch_daily_trends(geo, hl))
    
    elif command == "interest_over_time":
        keywords_str = args.get("keywords", "")
        if not keywords_str:
            output_error("--keywords is required")
            sys.exit(1)
        keywords = [k.strip() for k in keywords_str.split(",")]
        asyncio.run(fetch_interest_over_time(keywords, geo, hl))
    
    elif command == "related_queries":
        keyword = args.get("keyword", "")
        if not keyword:
            output_error("--keyword is required")
            sys.exit(1)
        asyncio.run(fetch_related_queries(keyword, geo, hl))
    
    else:
        output_error(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
