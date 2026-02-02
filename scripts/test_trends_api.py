#!/usr/bin/env python3
"""
test_trends_api.py

Test script for the Google Trends API library.
Reads keywords from the existing SQLite database and tests the API.
"""

import asyncio
import os
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Suppress warnings
import warnings
warnings.filterwarnings("ignore")

import logging
logging.basicConfig(level=logging.WARNING)

from trends_api import TrendsAPI, TrendsAPIConfig

# Database path
DB_PATH = Path(__file__).parent.parent / "data.db"


def get_keywords_from_db(limit: int = 10) -> list[dict]:
    """Read keywords from SQLite database."""
    if not DB_PATH.exists():
        print(f"[Warning] Database not found at {DB_PATH}")
        return []
    
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        cursor.execute("""
            SELECT id, keyword, source, category, first_seen, last_updated 
            FROM keywords 
            ORDER BY last_updated DESC 
            LIMIT ?
        """, (limit,))
        
        rows = cursor.fetchall()
        keywords = [dict(row) for row in rows]
        return keywords
    except sqlite3.OperationalError as e:
        print(f"[Error] Database error: {e}")
        return []
    finally:
        conn.close()


def get_db_stats() -> dict:
    """Get statistics from the database."""
    if not DB_PATH.exists():
        return {"error": "Database not found"}
    
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    try:
        stats = {}
        
        # Total keywords
        cursor.execute("SELECT COUNT(*) FROM keywords")
        stats["total_keywords"] = cursor.fetchone()[0]
        
        # Keywords by source
        cursor.execute("""
            SELECT source, COUNT(*) as count 
            FROM keywords 
            GROUP BY source 
            ORDER BY count DESC
        """)
        stats["by_source"] = dict(cursor.fetchall())
        
        # Total analysis snapshots
        cursor.execute("SELECT COUNT(*) FROM analysis_snapshots")
        stats["total_snapshots"] = cursor.fetchone()[0]
        
        return stats
    except sqlite3.OperationalError as e:
        return {"error": str(e)}
    finally:
        conn.close()


def test_daily_trends(api: TrendsAPI):
    """Test fetching daily trends."""
    print("\n" + "=" * 60)
    print("TEST 1: Daily Trends (US)")
    print("=" * 60)
    
    try:
        trends = api.daily_trends(geo="US")
        print(f"[OK] Fetched {len(trends)} trending items")
        
        for i, trend in enumerate(trends[:5], 1):
            source_tag = f"[{trend.source}]"
            print(f"  {i}. {source_tag:12} {trend.title} ({trend.traffic})")
            if trend.related_queries:
                print(f"      Related: {', '.join(trend.related_queries[:3])}")
        
        return True
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return False


def test_interest_over_time(api: TrendsAPI, keywords: list[str]):
    """Test fetching interest over time."""
    print("\n" + "=" * 60)
    print(f"TEST 2: Interest Over Time ({', '.join(keywords[:3])}...)")
    print("=" * 60)
    
    try:
        # Only use first 5 keywords (API limit)
        test_keywords = keywords[:5]
        interest = api.interest_over_time(test_keywords, timeframe="today 3-m")
        
        print(f"[OK] Fetched data for {len(interest)} keywords")
        
        for kw, data in interest.items():
            if data:
                latest = data[-1]
                oldest = data[0]
                source_tag = f"[{latest.source}]"
                change = latest.value - oldest.value
                change_str = f"+{change}" if change > 0 else str(change)
                print(f"  {source_tag:12} {kw}: {latest.value} ({latest.date}) | Change: {change_str}")
            else:
                print(f"  {kw}: No data")
        
        return True
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return False


def test_related_queries(api: TrendsAPI, keyword: str):
    """Test fetching related queries."""
    print("\n" + "=" * 60)
    print(f"TEST 3: Related Queries for '{keyword}'")
    print("=" * 60)
    
    try:
        related = api.related_queries(keyword, timeframe="today 3-m")
        
        print(f"[OK] Fetched related queries")
        
        print("  Top Queries:")
        for q in related.get("top", [])[:5]:
            source_tag = f"[{q.source}]"
            print(f"    {source_tag:12} {q.query}: {q.value}")
        
        print("  Rising Queries:")
        for q in related.get("rising", [])[:5]:
            source_tag = f"[{q.source}]"
            print(f"    {source_tag:12} {q.query}: {q.value}")
        
        return True
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return False


def test_interest_by_region(api: TrendsAPI, keyword: str):
    """Test fetching interest by region."""
    print("\n" + "=" * 60)
    print(f"TEST 4: Interest by Region for '{keyword}'")
    print("=" * 60)
    
    try:
        regions = api.interest_by_region(keyword, timeframe="today 3-m")
        
        print(f"[OK] Fetched data for {len(regions)} regions")
        
        for region in regions[:10]:
            print(f"  {region.get('geoName', 'Unknown')}: {region.get('value', 0)}")
        
        return True
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return False


def test_realtime_trends(api: TrendsAPI):
    """Test fetching realtime trends."""
    print("\n" + "=" * 60)
    print("TEST 5: Realtime Trends")
    print("=" * 60)
    
    try:
        trends = api.realtime_trends(geo="US")
        
        print(f"[OK] Fetched {len(trends)} realtime stories")
        
        for i, story in enumerate(trends[:5], 1):
            title = story.get("title", "N/A")
            entities = story.get("entityNames", [])
            print(f"  {i}. {title}")
            if entities:
                print(f"      Entities: {', '.join(entities[:3])}")
        
        return True
    except Exception as e:
        print(f"[FAIL] Error: {e}")
        return False


def main():
    print("=" * 60)
    print("Google Trends API Test Suite")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    # Check database
    print("\n[Database Stats]")
    stats = get_db_stats()
    if "error" in stats:
        print(f"  Error: {stats['error']}")
        # Use default test keywords
        db_keywords = []
    else:
        print(f"  Total keywords: {stats.get('total_keywords', 0)}")
        print(f"  Total snapshots: {stats.get('total_snapshots', 0)}")
        print(f"  By source: {stats.get('by_source', {})}")
        
        # Get keywords from database
        db_keywords = get_keywords_from_db(20)
        print(f"\n[Loaded {len(db_keywords)} keywords from database]")
        for kw in db_keywords[:5]:
            print(f"  - {kw['keyword']} (source: {kw['source']})")
    
    # Prepare test keywords
    if db_keywords:
        test_keywords = [kw["keyword"] for kw in db_keywords[:10]]
    else:
        # Default test keywords
        test_keywords = ["python", "javascript", "machine learning", "AI", "ChatGPT"]
        print(f"\n[Using default test keywords]")
    
    # Initialize API
    print("\n[Initializing API]")
    config = TrendsAPIConfig(
        geo="US",
        hl="en-US",
        use_fallback=True,  # Enable Playwright fallback
        headless=True,
    )
    
    results = []
    
    try:
        with TrendsAPI(config) as api:
            # Run tests
            results.append(("Daily Trends", test_daily_trends(api)))
            results.append(("Interest Over Time", test_interest_over_time(api, test_keywords)))
            results.append(("Related Queries", test_related_queries(api, test_keywords[0])))
            results.append(("Interest by Region", test_interest_by_region(api, test_keywords[0])))
            results.append(("Realtime Trends", test_realtime_trends(api)))
    
    except Exception as e:
        print(f"\n[FATAL ERROR] {e}")
        import traceback
        traceback.print_exc()
    
    # Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, ok in results if ok)
    total = len(results)
    
    for name, ok in results:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\nAll tests passed!")
        return 0
    else:
        print("\nSome tests failed. Check logs above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
