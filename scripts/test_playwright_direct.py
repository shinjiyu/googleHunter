#!/usr/bin/env python3
"""
test_playwright_direct.py

Direct test of Playwright-based Google Trends fetcher.
This bypasses the protocol simulation layer and directly uses browser automation.
"""

import asyncio
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

from playwright_fetcher import PlaywrightTrendsFetcher, FetcherConfig

# Database path
DB_PATH = Path(__file__).parent.parent / "data.db"


def get_keywords_from_db(limit: int = 10) -> list[str]:
    """Read keywords from SQLite database."""
    if not DB_PATH.exists():
        print(f"[Warning] Database not found at {DB_PATH}")
        return []
    
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT keyword FROM keywords 
            ORDER BY last_updated DESC 
            LIMIT ?
        """, (limit,))
        
        return [row[0] for row in cursor.fetchall()]
    except sqlite3.OperationalError as e:
        print(f"[Error] Database error: {e}")
        return []
    finally:
        conn.close()


async def test_daily_trends(fetcher: PlaywrightTrendsFetcher):
    """Test fetching daily trends."""
    print("\n" + "=" * 60)
    print("TEST 1: Daily Trends (US)")
    print("=" * 60)
    
    try:
        trends = await fetcher.get_daily_trends(geo="US")
        print(f"[OK] Fetched {len(trends)} trending items")
        
        for i, trend in enumerate(trends[:10], 1):
            print(f"  {i}. {trend.title} ({trend.traffic})")
            if trend.related_queries:
                print(f"      Related: {', '.join(trend.related_queries[:3])}")
        
        return True, len(trends)
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        import traceback
        traceback.print_exc()
        return False, 0


async def test_interest_over_time(fetcher: PlaywrightTrendsFetcher, keywords: list[str]):
    """Test fetching interest over time."""
    print("\n" + "=" * 60)
    print(f"TEST 2: Interest Over Time")
    print("=" * 60)
    
    # Use simple keywords for testing
    test_keywords = keywords[:2] if keywords else ["python", "javascript"]
    print(f"  Keywords: {test_keywords}")
    
    try:
        interest = await fetcher.get_interest_over_time(test_keywords, geo="US")
        
        total_points = sum(len(data) for data in interest.values())
        print(f"[OK] Fetched {total_points} data points for {len(interest)} keywords")
        
        for kw, data in interest.items():
            if data:
                latest = data[-1]
                print(f"  {kw}: {latest.value} ({latest.date})")
            else:
                print(f"  {kw}: No data")
        
        return True, total_points
    except Exception as e:
        error_str = str(e)
        if "429" in error_str or "Too Many" in error_str:
            print(f"[RATE LIMITED] Google returned 429")
            return False, 0
        print(f"[FAIL] Error: {e}")
        return False, 0


async def test_related_queries(fetcher: PlaywrightTrendsFetcher, keyword: str):
    """Test fetching related queries."""
    print("\n" + "=" * 60)
    print(f"TEST 3: Related Queries for '{keyword}'")
    print("=" * 60)
    
    try:
        related = await fetcher.get_related_queries(keyword, geo="US")
        
        top_count = len(related.get("top", []))
        rising_count = len(related.get("rising", []))
        
        if top_count + rising_count == 0:
            print(f"[OK] No data returned")
        else:
            print(f"[OK] Fetched {top_count} top queries, {rising_count} rising queries")
        
        if related.get("top"):
            print("  Top Queries:")
            for q in related.get("top", [])[:5]:
                print(f"    - {q.get('query', 'N/A')}: {q.get('value', 'N/A')}")
        
        if related.get("rising"):
            print("  Rising Queries:")
            for q in related.get("rising", [])[:5]:
                print(f"    - {q.get('query', 'N/A')}: {q.get('value', 'N/A')}")
        
        return True, top_count + rising_count
    except Exception as e:
        error_str = str(e)
        if "429" in error_str or "Too Many" in error_str:
            print(f"[RATE LIMITED] Google returned 429")
            return False, 0
        print(f"[FAIL] Error: {e}")
        return False, 0


async def main():
    print("=" * 60)
    print("Google Trends Playwright Direct Test")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # Get keywords from database
    db_keywords = get_keywords_from_db(10)
    if db_keywords:
        print(f"\n[Database] Loaded {len(db_keywords)} keywords:")
        for kw in db_keywords[:5]:
            print(f"  - {kw}")
    else:
        db_keywords = ["python", "javascript", "machine learning"]
        print(f"\n[Using default keywords]: {db_keywords}")
    
    # Initialize Playwright fetcher
    print("\n[Initializing Playwright browser...]")
    config = FetcherConfig(
        headless=True,
        geo="US",
        hl="en-US",
        timeout=120000,  # 2 minutes timeout
    )
    
    results = []
    
    async with PlaywrightTrendsFetcher(config) as fetcher:
        print("[Browser ready]")
        
        # Test 1: Daily Trends
        ok, count = await test_daily_trends(fetcher)
        results.append(("Daily Trends", ok, count))
        
        # Wait between tests
        await asyncio.sleep(2)
        
        # Test 2: Interest Over Time (use simple keywords)
        simple_keywords = ["python", "java"]  # Use simple keywords
        ok, count = await test_interest_over_time(fetcher, simple_keywords)
        results.append(("Interest Over Time", ok, count))
        
        # Wait between tests
        await asyncio.sleep(2)
        
        # Test 3: Related Queries
        ok, count = await test_related_queries(fetcher, "python")
        results.append(("Related Queries", ok, count))
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    
    for name, ok, count in results:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name} (items: {count})")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
