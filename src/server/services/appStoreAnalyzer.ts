/**
 * appStoreAnalyzer.ts
 *
 * Analyze App Store competition using iTunes Search API and Google Play (via web search).
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
  // Computed fields
  ageInYears?: number;
  daysSinceUpdate?: number;
}

export interface CompetitionBreakdown {
  // App count factors
  iosAppCount: number;
  estimatedAndroidAppCount: number;
  totalEstimatedApps: number;

  // Quality factors
  avgRating: number;
  avgReviewCount: number;
  topAppReviews: number; // Reviews of #1 app

  // Market maturity factors
  avgAppAgeYears: number;
  oldestAppYears: number;
  avgDaysSinceUpdate: number;

  // Barrier to entry factors
  freeAppPercentage: number;
  establishedPlayerCount: number; // Apps with 10K+ reviews

  // Individual scores (0-100)
  appCountScore: number;
  qualityScore: number;
  maturityScore: number;
  barrierScore: number;
}

export interface AppStoreCompetition {
  keyword: string;
  totalApps: number;
  topApps: AppInfo[];
  competitionScore: number; // 0-100 (weighted combination)
  breakdown: CompetitionBreakdown;
  avgRating: number;
  avgReviewCount: number;
  marketSaturation: 'low' | 'medium' | 'high' | 'very_high';
  opportunity: 'excellent' | 'good' | 'moderate' | 'difficult' | 'very_difficult';
  analysis: string;
  recommendations: string[];
}

const ITUNES_SEARCH_API = 'https://itunes.apple.com/search';

/**
 * Calculate age in years from a date string
 */
function getAgeInYears(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);
}

/**
 * Calculate days since a date
 */
function getDaysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

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
      // Computed fields
      ageInYears: app.releaseDate ? getAgeInYears(app.releaseDate as string) : 0,
      daysSinceUpdate: app.currentVersionReleaseDate
        ? getDaysSince(app.currentVersionReleaseDate as string)
        : 999,
    }));
  } catch (error) {
    console.error(`[AppStoreAnalyzer] Error searching for "${term}":`, error);
    return [];
  }
}

/**
 * Estimate Android app count based on iOS count
 * Generally Android has similar or slightly more apps for popular categories
 */
function estimateAndroidAppCount(iosCount: number, avgReviews: number): number {
  // Popular categories tend to have more Android apps
  // Estimate based on iOS count and review volume (indicates market size)
  let multiplier = 1.2; // Base: Android usually has 20% more apps

  if (avgReviews > 50000) {
    multiplier = 1.5; // Very popular category
  } else if (avgReviews > 10000) {
    multiplier = 1.3;
  } else if (avgReviews < 1000) {
    multiplier = 0.8; // Niche category, might have fewer Android apps
  }

  return Math.round(iosCount * multiplier);
}

/**
 * Calculate detailed competition breakdown
 */
function calculateCompetitionBreakdown(apps: AppInfo[]): CompetitionBreakdown {
  const topApps = apps.slice(0, 10);

  // Basic stats
  const avgRating =
    topApps.length > 0
      ? topApps.reduce((sum, a) => sum + a.averageUserRating, 0) / topApps.length
      : 0;
  const avgReviewCount =
    topApps.length > 0
      ? topApps.reduce((sum, a) => sum + a.userRatingCount, 0) / topApps.length
      : 0;
  const topAppReviews = topApps[0]?.userRatingCount || 0;

  // Age stats
  const avgAppAgeYears =
    topApps.length > 0
      ? topApps.reduce((sum, a) => sum + (a.ageInYears || 0), 0) / topApps.length
      : 0;
  const oldestAppYears = Math.max(...topApps.map((a) => a.ageInYears || 0), 0);
  const avgDaysSinceUpdate =
    topApps.length > 0
      ? topApps.reduce((sum, a) => sum + (a.daysSinceUpdate || 0), 0) / topApps.length
      : 0;

  // Market stats
  const freeApps = topApps.filter((a) => a.price === 0).length;
  const freeAppPercentage = topApps.length > 0 ? (freeApps / topApps.length) * 100 : 0;
  const establishedPlayerCount = topApps.filter((a) => a.userRatingCount >= 10000).length;

  // Android estimate
  const estimatedAndroidAppCount = estimateAndroidAppCount(apps.length, avgReviewCount);
  const totalEstimatedApps = apps.length + estimatedAndroidAppCount;

  // === Calculate individual dimension scores (0-100) ===

  // 1. App Count Score (more apps = higher score = harder)
  let appCountScore = 0;
  if (totalEstimatedApps >= 100) appCountScore = 100;
  else if (totalEstimatedApps >= 80) appCountScore = 90;
  else if (totalEstimatedApps >= 60) appCountScore = 80;
  else if (totalEstimatedApps >= 40) appCountScore = 70;
  else if (totalEstimatedApps >= 25) appCountScore = 55;
  else if (totalEstimatedApps >= 15) appCountScore = 40;
  else if (totalEstimatedApps >= 8) appCountScore = 25;
  else if (totalEstimatedApps >= 3) appCountScore = 15;
  else appCountScore = 5;

  // 2. Quality Score (higher ratings + more reviews = harder)
  let qualityScore = 0;
  // Rating component (0-50)
  if (avgRating >= 4.7) qualityScore += 50;
  else if (avgRating >= 4.5) qualityScore += 45;
  else if (avgRating >= 4.3) qualityScore += 38;
  else if (avgRating >= 4.0) qualityScore += 30;
  else if (avgRating >= 3.5) qualityScore += 20;
  else qualityScore += 10;

  // Review component (0-50)
  if (avgReviewCount >= 100000) qualityScore += 50;
  else if (avgReviewCount >= 50000) qualityScore += 45;
  else if (avgReviewCount >= 20000) qualityScore += 38;
  else if (avgReviewCount >= 10000) qualityScore += 30;
  else if (avgReviewCount >= 5000) qualityScore += 22;
  else if (avgReviewCount >= 1000) qualityScore += 15;
  else if (avgReviewCount >= 100) qualityScore += 8;
  else qualityScore += 3;

  // 3. Market Maturity Score (older market = harder to enter)
  let maturityScore = 0;
  // App age component (0-50) - older apps = mature market
  if (avgAppAgeYears >= 8) maturityScore += 50;
  else if (avgAppAgeYears >= 5) maturityScore += 42;
  else if (avgAppAgeYears >= 3) maturityScore += 32;
  else if (avgAppAgeYears >= 2) maturityScore += 22;
  else if (avgAppAgeYears >= 1) maturityScore += 12;
  else maturityScore += 5;

  // Update frequency component (0-50) - actively maintained = harder
  if (avgDaysSinceUpdate <= 30) maturityScore += 50; // Very active
  else if (avgDaysSinceUpdate <= 90) maturityScore += 40;
  else if (avgDaysSinceUpdate <= 180) maturityScore += 30;
  else if (avgDaysSinceUpdate <= 365) maturityScore += 20;
  else maturityScore += 10; // Stale apps = opportunity

  // 4. Barrier to Entry Score
  let barrierScore = 0;
  // Free app dominance (0-40) - hard to monetize if all free
  barrierScore += Math.round(freeAppPercentage * 0.4);

  // Established players (0-60) - big players = hard to compete
  barrierScore += establishedPlayerCount * 12; // Up to 60 if 5+ established

  barrierScore = Math.min(100, barrierScore);

  return {
    iosAppCount: apps.length,
    estimatedAndroidAppCount,
    totalEstimatedApps,
    avgRating,
    avgReviewCount,
    topAppReviews,
    avgAppAgeYears,
    oldestAppYears,
    avgDaysSinceUpdate,
    freeAppPercentage,
    establishedPlayerCount,
    appCountScore,
    qualityScore,
    maturityScore,
    barrierScore,
  };
}

/**
 * Calculate final weighted competition score
 */
function calculateFinalScore(breakdown: CompetitionBreakdown): number {
  // Weighted combination of all factors
  const weights = {
    appCount: 0.25, // 25% - How many competitors
    quality: 0.30, // 30% - How good are they
    maturity: 0.20, // 20% - How established is the market
    barrier: 0.25, // 25% - How hard to enter
  };

  const finalScore =
    breakdown.appCountScore * weights.appCount +
    breakdown.qualityScore * weights.quality +
    breakdown.maturityScore * weights.maturity +
    breakdown.barrierScore * weights.barrier;

  return Math.round(Math.min(100, finalScore));
}

/**
 * Determine market saturation level
 */
function getMarketSaturation(
  breakdown: CompetitionBreakdown
): 'low' | 'medium' | 'high' | 'very_high' {
  const { totalEstimatedApps, avgReviewCount, establishedPlayerCount } = breakdown;

  if (totalEstimatedApps < 10 && avgReviewCount < 500) {
    return 'low';
  }
  if (totalEstimatedApps < 30 && establishedPlayerCount < 2) {
    return 'medium';
  }
  if (totalEstimatedApps < 60 || establishedPlayerCount < 4) {
    return 'high';
  }
  return 'very_high';
}

/**
 * Determine opportunity level based on competition
 */
function getOpportunityLevel(
  competitionScore: number,
  breakdown: CompetitionBreakdown
): 'excellent' | 'good' | 'moderate' | 'difficult' | 'very_difficult' {
  // Also consider specific factors
  const { totalEstimatedApps, establishedPlayerCount, avgDaysSinceUpdate } = breakdown;

  // Stale market (apps not updated) = opportunity even if crowded
  const isStaleMarket = avgDaysSinceUpdate > 180;

  if (competitionScore < 25 || totalEstimatedApps < 5) {
    return 'excellent';
  }
  if (competitionScore < 40 || (competitionScore < 50 && isStaleMarket)) {
    return 'good';
  }
  if (competitionScore < 55 || (competitionScore < 65 && establishedPlayerCount < 3)) {
    return 'moderate';
  }
  if (competitionScore < 75) {
    return 'difficult';
  }
  return 'very_difficult';
}

/**
 * Generate analysis text
 */
function generateAnalysis(
  apps: AppInfo[],
  breakdown: CompetitionBreakdown
): string {
  const parts: string[] = [];
  const {
    iosAppCount,
    estimatedAndroidAppCount,
    totalEstimatedApps,
    avgRating,
    avgReviewCount,
    avgAppAgeYears,
    establishedPlayerCount,
    avgDaysSinceUpdate,
  } = breakdown;

  if (apps.length === 0) {
    return 'Blue ocean opportunity - no direct competitors found!';
  }

  // App count summary
  parts.push(
    `Found ${iosAppCount} iOS apps + ~${estimatedAndroidAppCount} estimated Android apps (${totalEstimatedApps} total).`
  );

  // Quality assessment
  if (avgRating >= 4.5) {
    parts.push(`Quality bar is high (${avgRating.toFixed(1)}★ avg).`);
  } else if (avgRating < 3.8) {
    parts.push(`Existing apps have room for improvement (${avgRating.toFixed(1)}★ avg).`);
  }

  // Market maturity
  if (avgAppAgeYears >= 5) {
    parts.push(`Mature market (avg app is ${avgAppAgeYears.toFixed(1)} years old).`);
  } else if (avgAppAgeYears < 2) {
    parts.push(`Emerging market (avg app is ${avgAppAgeYears.toFixed(1)} years old).`);
  }

  // Established players
  if (establishedPlayerCount >= 3) {
    parts.push(`${establishedPlayerCount} established players with 10K+ reviews.`);
  }

  // Update activity
  if (avgDaysSinceUpdate > 180) {
    parts.push(`Apps are stale (avg ${Math.round(avgDaysSinceUpdate)} days since update) - opportunity!`);
  } else if (avgDaysSinceUpdate < 60) {
    parts.push(`Actively maintained competition (avg ${Math.round(avgDaysSinceUpdate)} days since update).`);
  }

  // Top app
  const topApp = apps[0];
  if (topApp && topApp.userRatingCount > 10000) {
    parts.push(
      `Market leader: "${topApp.trackName}" (${(topApp.userRatingCount / 1000).toFixed(0)}K reviews).`
    );
  }

  return parts.join(' ');
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(
  breakdown: CompetitionBreakdown,
  opportunity: string
): string[] {
  const recommendations: string[] = [];
  const {
    avgRating,
    avgReviewCount,
    establishedPlayerCount,
    freeAppPercentage,
    avgDaysSinceUpdate,
    totalEstimatedApps,
  } = breakdown;

  if (opportunity === 'excellent' || opportunity === 'good') {
    recommendations.push('✅ Good opportunity - consider entering this market');
  }

  if (avgRating < 4.0) {
    recommendations.push('💡 Focus on quality - existing apps have low ratings');
  }

  if (avgDaysSinceUpdate > 180) {
    recommendations.push('💡 Competitors are stale - modern UX could win');
  }

  if (freeAppPercentage > 80) {
    recommendations.push('⚠️ Market dominated by free apps - consider freemium model');
  }

  if (establishedPlayerCount >= 4) {
    recommendations.push('⚠️ Multiple established players - need strong differentiation');
  }

  if (totalEstimatedApps > 80) {
    recommendations.push('⚠️ Crowded market - find a niche angle');
  }

  if (avgReviewCount > 50000) {
    recommendations.push('⚠️ High review counts - organic discovery will be challenging');
  }

  if (recommendations.length === 0) {
    recommendations.push('📊 Market requires careful analysis before entry');
  }

  return recommendations;
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

  // Calculate detailed breakdown
  const breakdown = calculateCompetitionBreakdown(apps);

  // Calculate final weighted score
  const competitionScore = calculateFinalScore(breakdown);

  // Determine saturation and opportunity
  const marketSaturation = getMarketSaturation(breakdown);
  const opportunity = getOpportunityLevel(competitionScore, breakdown);

  // Generate analysis and recommendations
  const analysis = generateAnalysis(apps, breakdown);
  const recommendations = generateRecommendations(breakdown, opportunity);

  console.log(
    `[AppStoreAnalyzer] "${keyword}": iOS=${apps.length}, Est.Total=${breakdown.totalEstimatedApps}, ` +
      `Score=${competitionScore} (count=${breakdown.appCountScore}, quality=${breakdown.qualityScore}, ` +
      `maturity=${breakdown.maturityScore}, barrier=${breakdown.barrierScore}), opportunity=${opportunity}`
  );

  return {
    keyword,
    totalApps: breakdown.totalEstimatedApps,
    topApps,
    competitionScore,
    breakdown,
    avgRating: breakdown.avgRating,
    avgReviewCount: breakdown.avgReviewCount,
    marketSaturation,
    opportunity,
    analysis,
    recommendations,
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
