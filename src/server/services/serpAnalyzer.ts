import { Browser, chromium, Page } from 'playwright';
import type { SerpResult } from '../../shared/types';

let browser: Browser | null = null;

// Rate limiting for SERP requests
const MIN_DELAY_BETWEEN_REQUESTS = 5000; // 5 seconds minimum
const MAX_DELAY_BETWEEN_REQUESTS = 10000; // 10 seconds maximum
let lastRequestTime = 0;

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Initialize the browser instance
 */
export async function initBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
    });
    console.log('Browser initialized');
  }
  return browser;
}

/**
 * Close the browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    console.log('Browser closed');
  }
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url;
  }
}

/**
 * Analyze SERP results for a keyword
 */
export async function analyzeSERP(
  keyword: string,
  geo: string = 'us'
): Promise<{
  results: SerpResult[];
  totalResults: number;
}> {
  // Respect rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_DELAY_BETWEEN_REQUESTS) {
    await delay(MIN_DELAY_BETWEEN_REQUESTS - timeSinceLastRequest);
  }

  const browser = await initBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    geolocation: geo === 'us' ? { latitude: 37.7749, longitude: -122.4194 } : undefined,
  });

  const page = await context.newPage();

  try {
    // Navigate to Google
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=en&gl=${geo}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for results to load
    await page.waitForSelector('#search', { timeout: 10000 }).catch(() => null);

    // Random delay to appear more human
    await delay(randomDelay(1000, 3000));

    // Extract total results count
    const totalResults = await extractTotalResults(page);

    // Extract search results
    const results = await extractSearchResults(page);

    lastRequestTime = Date.now();

    return {
      results,
      totalResults,
    };
  } catch (error) {
    console.error(`Error analyzing SERP for "${keyword}":`, error);
    throw error;
  } finally {
    await context.close();
  }
}

/**
 * Extract total results count from SERP
 */
async function extractTotalResults(page: Page): Promise<number> {
  try {
    const resultStats = await page.$('#result-stats');
    if (resultStats) {
      const text = await resultStats.textContent();
      if (text) {
        // Extract number from "About X results"
        const match = text.match(/[\d,]+/);
        if (match) {
          return parseInt(match[0].replace(/,/g, ''), 10);
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return 0;
}

/**
 * Extract search results from SERP
 */
async function extractSearchResults(page: Page): Promise<SerpResult[]> {
  const results: SerpResult[] = [];

  try {
    // Get all search result containers
    const resultElements = await page.$$('#search .g');

    let position = 0;
    for (const element of resultElements.slice(0, 10)) {
      try {
        // Check if it's an ad
        const isAd = (await element.$('[data-text-ad]')) !== null;

        // Extract link
        const linkElement = await element.$('a');
        if (!linkElement) continue;

        const url = (await linkElement.getAttribute('href')) || '';
        if (!url || url.startsWith('/search') || url.startsWith('#')) continue;

        // Extract title
        const titleElement = await element.$('h3');
        const title = titleElement ? ((await titleElement.textContent()) || '') : '';

        // Extract snippet
        const snippetElement = await element.$('[data-sncf], .VwiC3b, .IsZvec');
        const snippet = snippetElement ? ((await snippetElement.textContent()) || '') : '';

        position++;
        results.push({
          position,
          title,
          url,
          domain: extractDomain(url),
          snippet,
          isAd,
        });
      } catch {
        // Skip this result if extraction fails
        continue;
      }
    }
  } catch (error) {
    console.error('Error extracting search results:', error);
  }

  return results;
}

/**
 * Calculate competition score based on SERP analysis
 * Returns a score from 0 (low competition) to 100 (high competition)
 */
export function calculateCompetitionScore(
  results: SerpResult[],
  totalResults: number,
  keyword: string
): number {
  if (results.length === 0) {
    return 0;
  }

  let score = 0;

  // 1. Total results factor (0-25 points)
  // More results = higher competition
  if (totalResults > 100000000) {
    score += 25;
  } else if (totalResults > 10000000) {
    score += 20;
  } else if (totalResults > 1000000) {
    score += 15;
  } else if (totalResults > 100000) {
    score += 10;
  } else if (totalResults > 10000) {
    score += 5;
  }

  // 2. Domain authority factor (0-35 points)
  // Check for high-authority domains in top results
  const highAuthorityDomains = [
    'wikipedia.org',
    'amazon.com',
    'youtube.com',
    'facebook.com',
    'twitter.com',
    'linkedin.com',
    'reddit.com',
    'medium.com',
    'forbes.com',
    'nytimes.com',
    'bbc.com',
    'cnn.com',
    'gov',
    'edu',
  ];

  const top5Results = results.slice(0, 5);
  const highAuthorityCount = top5Results.filter((r) =>
    highAuthorityDomains.some(
      (domain) => r.domain.includes(domain) || r.domain.endsWith('.gov') || r.domain.endsWith('.edu')
    )
  ).length;

  score += highAuthorityCount * 7; // Up to 35 points

  // 3. Title match factor (0-20 points)
  // How well do top results match the exact keyword?
  const keywordLower = keyword.toLowerCase();
  const exactMatchCount = top5Results.filter((r) =>
    r.title.toLowerCase().includes(keywordLower)
  ).length;

  score += exactMatchCount * 4; // Up to 20 points

  // 4. Content type factor (0-20 points)
  // Check if results are specific solution pages vs forums/Q&A
  const forumDomains = [
    'quora.com',
    'reddit.com',
    'stackoverflow.com',
    'answers.yahoo.com',
    'forums',
    'community',
  ];

  const forumCount = top5Results.filter((r) =>
    forumDomains.some((domain) => r.domain.includes(domain) || r.url.includes(domain))
  ).length;

  // More forum results = lower competition (easier to rank with quality content)
  score += (5 - forumCount) * 4; // Up to 20 points

  // Normalize to 0-100
  return Math.min(100, Math.max(0, score));
}

/**
 * Analyze content quality signals
 * Returns a score from 0 (poor match) to 100 (excellent match)
 */
export function analyzeContentMatch(results: SerpResult[], keyword: string): number {
  if (results.length === 0) {
    return 100; // No results = no competition, good opportunity
  }

  const keywordWords = keyword.toLowerCase().split(/\s+/);

  let totalMatchScore = 0;

  for (const result of results.slice(0, 10)) {
    let matchScore = 0;
    const titleLower = result.title.toLowerCase();
    const snippetLower = result.snippet.toLowerCase();

    // Check keyword presence in title
    const titleMatches = keywordWords.filter((word) => titleLower.includes(word)).length;
    matchScore += (titleMatches / keywordWords.length) * 50;

    // Check keyword presence in snippet
    const snippetMatches = keywordWords.filter((word) => snippetLower.includes(word)).length;
    matchScore += (snippetMatches / keywordWords.length) * 30;

    // Check for exact phrase match
    if (titleLower.includes(keyword.toLowerCase())) {
      matchScore += 20;
    }

    totalMatchScore += matchScore;
  }

  // Average match score across results
  const avgMatch = totalMatchScore / Math.min(results.length, 10);

  // Invert: low match = good opportunity (content gap)
  return Math.max(0, 100 - avgMatch);
}

/**
 * Detect if there's a content gap for this keyword
 */
export function hasContentGap(results: SerpResult[], keyword: string): boolean {
  if (results.length < 5) {
    return true; // Few results = content gap
  }

  // Check if top results are mostly forums/Q&A (indicating unmet demand)
  const forumPatterns = ['quora', 'reddit', 'forum', 'answers', 'ask', 'help'];
  const forumResults = results
    .slice(0, 5)
    .filter(
      (r) =>
        forumPatterns.some(
          (p) => r.domain.includes(p) || r.title.toLowerCase().includes(p)
        )
    );

  if (forumResults.length >= 3) {
    return true; // Many forum results = content gap
  }

  // Check for poor content match
  const contentMatchScore = analyzeContentMatch(results, keyword);
  return contentMatchScore > 50; // High score = poor match = content gap
}
