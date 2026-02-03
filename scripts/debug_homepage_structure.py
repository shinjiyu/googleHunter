#!/usr/bin/env python3
"""Check Google Trends homepage structure to find search input."""

import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # Go to trends homepage
        await page.goto("https://trends.google.com/", wait_until="networkidle", timeout=30000)
        await asyncio.sleep(3)
        
        print("=== Google Trends Homepage Structure ===\n")
        
        # Get page title
        title = await page.title()
        print(f"Title: {title}")
        print(f"URL: {page.url}\n")
        
        # Find all inputs
        inputs = await page.query_selector_all("input")
        print(f"Inputs found: {len(inputs)}")
        for i, inp in enumerate(inputs):
            inp_type = await inp.get_attribute("type")
            inp_placeholder = await inp.get_attribute("placeholder")
            inp_class = await inp.get_attribute("class")
            inp_name = await inp.get_attribute("name")
            is_visible = await inp.is_visible()
            print(f"  {i}: type={inp_type}, placeholder={inp_placeholder}, name={inp_name}, visible={is_visible}")
        
        # Find all links with "explore" in href
        print("\nExplore links:")
        links = await page.query_selector_all("a[href*='explore']")
        for link in links:
            href = await link.get_attribute("href")
            text = await link.inner_text()
            print(f"  - {text}: {href}")
        
        # Find any combobox or search-like elements
        print("\nSearch-like elements:")
        search_elements = await page.query_selector_all("[role='combobox'], [role='searchbox'], [class*='search'], [class*='Search']")
        for el in search_elements:
            tag = await el.evaluate("el => el.tagName")
            cls = await el.get_attribute("class")
            print(f"  - {tag}: {cls}")
        
        # Get page text summary
        print("\nPage text (first 500 chars):")
        text = await page.evaluate("() => document.body.innerText.substring(0, 500)")
        print(text)
        
        # Screenshot
        await page.screenshot(path="debug_homepage.png")
        print("\nScreenshot saved: debug_homepage.png")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
