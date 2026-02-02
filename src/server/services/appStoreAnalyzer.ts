/**
 * appStoreAnalyzer.ts
 *
 * Analyze App Store competition using iTunes Search API.
 * This provides real data about existing apps for a given keyword/concept.
 */

export interface AppInfo {
  trackId: number;
  trackName: string;
  bundleId: string;
  sellerName: string;
  averageUserRating: number;
  userRatingCount: number;
  price: number;
  primaryGenreName: string;
  releaseDate: string;
  currentVersionReleaseDate: string;
  trackViewUrl: string;
}

export interface AppStoreCompetition {
  keyword: string;
  totalApps: number;
  topApps: AppInfo[];
  competitionScore: number; // 0-100
  avgRating: number;
  avgReviewCount: number;
  marketSaturation: 'low' | 'medium' | 'high' | 'very_high';
  opportunity: 'excellent' | 'good' | 'moderate' | 'difficult' | 'very_difficult';
  analysis: string;
}

const ITUNES_SEARCH_API = 'https://itunes.apple.com/search';

/**
 * Search App Store via iTunes API
 */
async function searchAppStore(
  term: string,
  country: string = 'us',
  limit: number = 50
): Promise<AppInfo[]> {
  const url = new URL(ITUNES_SEARCH_API);
  url.searchParams.set('term', term);
  url.searchParams.set('country', country);
  url.searchParams.set('media', 'software');
  url.searchParams.set('limit', limit.toString());

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`iTunes API error: ${response.status}`);
    }

    const data = await response.json();
    return (data.results || []).map((app: Record<string, unknown>) => ({
      trackId: app.trackId,
      trackName: app.trackName,
      bundleId: app.bundleId,
      sellerName: app.sellerName,
      averageUserRating: app.averageUserRating || 0,
      userRatingCount: app.userRatingCount || 0,
      price: app.price || 0,
      primaryGenreName: app.primaryGenreName,
      releaseDate: app.releaseDate,
      currentVersionReleaseDate: app.currentVersionReleaseDate,
      trackViewUrl: app.trackViewUrl,
    }));
  } catch (error) {
    console.error(`[AppStoreAnalyzer] Error searching for "${term}":`, error);
    return [];
  }
}

/**
 * Calculate App Store competition score
 *
 * Factors:
 * - Number of existing apps (more = higher competition)
 * - Average rating of top apps (higher = harder to compete)
 * - Average review count (more reviews = established players)
 * - Price distribution (free apps make it harder)
 */
function calculateAppStoreCompetition(apps: AppInfo[]): number {
  if (apps.length === 0) {
    return 0; // No competition!
  }

  let score = 0;

  // 1. Number of apps factor (0-30 points)
  if (apps.length >= 50) {
    score += 30;
  } else if (apps.length >= 30) {
    score += 25;
  } else if (apps.length >= 20) {
    score += 20;
  } else if (apps.length >= 10) {
    score += 15;
  } else if (apps.length >= 5) {
    score += 10;
  } else {
    score += 5;
  }

  // 2. Top apps quality factor (0-35 points)
  const topApps = apps.slice(0, 10);
  const avgRating = topApps.reduce((sum, a) => sum + a.averageUserRating, 0) / topApps.length;

  if (avgRating >= 4.5) {
    score += 35;
  } else if (avgRating >= 4.0) {
    score += 28;
  } else if (avgRating >= 3.5) {
    score += 20;
  } else if (avgRating >= 3.0) {
    score += 12;
  } else {
    score += 5;
  }

  // 3. Review count factor (0-25 points)
  // High review counts indicate established, hard-to-beat players
  const avgReviews = topApps.reduce((sum, a) => sum + a.userRatingCount, 0) / topApps.length;

  if (avgReviews >= 100000) {
    score += 25;
  } else if (avgReviews >= 50000) {
    score += 22;
  } else if (avgReviews >= 10000) {
    score += 18;
  } else if (avgReviews >= 5000) {
    score += 14;
  } else if (avgReviews >= 1000) {
    score += 10;
  } else if (avgReviews >= 100) {
    score += 5;
  } else {
    score += 2;
  }

  // 4. Free apps factor (0-10 points)
  // Many free apps = harder to monetize
  const freeApps = topApps.filter((a) => a.price === 0).length;
  score += freeApps; // 0-10 points based on free app count

  return Math.min(100, score);
}

/**
 * Determine market saturation level
 */
function getMarketSaturation(
  appCount: number,
  avgReviews: number
): 'low' | 'medium' | 'high' | 'very_high' {
  if (appCount < 5 || avgReviews < 100) {
    return 'low';
  }
  if (appCount < 15 || avgReviews < 1000) {
    return 'medium';
  }
  if (appCount < 30 || avgReviews < 10000) {
    return 'high';
  }
  return 'very_high';
}

/**
 * Determine opportunity level based on competition
 */
function getOpportunityLevel(
  competitionScore: number,
  appCount: number
): 'excellent' | 'good' | 'moderate' | 'difficult' | 'very_difficult' {
  if (competitionScore < 20 || appCount < 3) {
    return 'excellent';
  }
  if (competitionScore < 40 || appCount < 10) {
    return 'good';
  }
  if (competitionScore < 60) {
    return 'moderate';
  }
  if (competitionScore < 80) {
    return 'difficult';
  }
  return 'very_difficult';
}

/**
 * Generate analysis text
 */
function generateAnalysis(
  keyword: string,
  apps: AppInfo[],
  competitionScore: number,
  avgRating: number,
  avgReviews: number
): string {
  const parts: string[] = [];

  if (apps.length === 0) {
    return `No apps found for "${keyword}" - this is a blue ocean opportunity!`;
  }

  if (apps.length < 5) {
    parts.push(`Only ${apps.length} apps found - low competition.`);
  } else if (apps.length >= 50) {
    parts.push(`${apps.length}+ apps in this category - saturated market.`);
  } else {
    parts.push(`${apps.length} competing apps found.`);
  }

  if (avgRating >= 4.5) {
    parts.push(`Top apps have excellent ratings (${avgRating.toFixed(1)}/5) - quality bar is high.`);
  } else if (avgRating < 3.5) {
    parts.push(`Top apps have mediocre ratings (${avgRating.toFixed(1)}/5) - opportunity to do better.`);
  }

  if (avgReviews >= 50000) {
    parts.push(`Established players with ${Math.round(avgReviews / 1000)}K+ reviews.`);
  } else if (avgReviews < 1000) {
    parts.push(`Low review counts - market is not yet dominated.`);
  }

  const topApp = apps[0];
  if (topApp) {
    parts.push(`Top app: "${topApp.trackName}" by ${topApp.sellerName}.`);
  }

  return parts.join(' ');
}

/**
 * Main function: Analyze App Store competition for a keyword
 */
export async function analyzeAppStoreCompetition(
  keyword: string,
  country: string = 'us'
): Promise<AppStoreCompetition> {
  console.log(`[AppStoreAnalyzer] Analyzing competition for "${keyword}"...`);

  const apps = await searchAppStore(keyword, country, 50);

  const topApps = apps.slice(0, 10);
  const avgRating =
    topApps.length > 0
      ? topApps.reduce((sum, a) => sum + a.averageUserRating, 0) / topApps.length
      : 0;
  const avgReviewCount =
    topApps.length > 0
      ? topApps.reduce((sum, a) => sum + a.userRatingCount, 0) / topApps.length
      : 0;

  const competitionScore = calculateAppStoreCompetition(apps);
  const marketSaturation = getMarketSaturation(apps.length, avgReviewCount);
  const opportunity = getOpportunityLevel(competitionScore, apps.length);
  const analysis = generateAnalysis(keyword, apps, competitionScore, avgRating, avgReviewCount);

  console.log(
    `[AppStoreAnalyzer] "${keyword}": ${apps.length} apps, competition=${competitionScore}, opportunity=${opportunity}`
  );

  return {
    keyword,
    totalApps: apps.length,
    topApps,
    competitionScore,
    avgRating,
    avgReviewCount,
    marketSaturation,
    opportunity,
    analysis,
  };
}

/**
 * Batch analyze multiple keywords
 */
export async function analyzeMultipleKeywords(
  keywords: string[],
  country: string = 'us'
): Promise<AppStoreCompetition[]> {
  const results: AppStoreCompetition[] = [];

  for (const keyword of keywords) {
    const result = await analyzeAppStoreCompetition(keyword, country);
    results.push(result);

    // Rate limit - iTunes API has limits
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}

/**
 * Get low-competition app ideas from a list of keywords
 */
export async function findLowCompetitionApps(
  keywords: string[],
  maxCompetition: number = 50
): Promise<AppStoreCompetition[]> {
  const allResults = await analyzeMultipleKeywords(keywords);
  return allResults.filter((r) => r.competitionScore <= maxCompetition);
}
