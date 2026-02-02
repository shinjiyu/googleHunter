import { spawn } from 'child_process';
import path from 'path';
import type { DailyTrendItem, Keyword, TrendDataPoint } from '../../shared/types';
import { createKeyword, getKeywordByText } from '../db';

// Rate limiting - Google Trends has undocumented rate limits
const DELAY_BETWEEN_REQUESTS = 2000; // 2 seconds

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TrendsFetcherConfig {
  geo: string;
  category?: string;
}

// Available niche categories for discovery
export const AVAILABLE_CATEGORIES = [
  'lifestyle',
  'health',
  'home',
  'hobby',
  'finance',
  'education',
  'travel',
  'pets',
  'tech',
] as const;

export type NicheCategory = (typeof AVAILABLE_CATEGORIES)[number];

const DEFAULT_CONFIG: TrendsFetcherConfig = {
  geo: 'US',
};

// Python bridge script path
const BRIDGE_SCRIPT = path.join(process.cwd(), 'scripts', 'trends_bridge.py');

/**
 * Call Python trends bridge script
 */
async function callPythonBridge(
  command: string,
  args: Record<string, string>
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  return new Promise((resolve) => {
    const cmdArgs = [BRIDGE_SCRIPT, command];
    for (const [key, value] of Object.entries(args)) {
      cmdArgs.push(`--${key}=${value}`);
    }

    console.log(`[TrendsFetcher] Calling Python bridge: ${command}`);

    const pythonProcess = spawn('python', cmdArgs, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        console.error(`[TrendsFetcher] Python bridge error: ${stderr}`);
        resolve({ success: false, error: stderr || `Process exited with code ${code}` });
        return;
      }

      try {
        // Parse JSON output (may have multiple lines, take the last JSON)
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const result = JSON.parse(lastLine);
        resolve(result);
      } catch (e) {
        console.error(`[TrendsFetcher] Failed to parse Python output: ${stdout}`);
        resolve({ success: false, error: 'Failed to parse Python output' });
      }
    });

    pythonProcess.on('error', (err) => {
      console.error(`[TrendsFetcher] Failed to start Python: ${err.message}`);
      resolve({ success: false, error: err.message });
    });

    // Timeout after 120 seconds (Playwright may take time)
    setTimeout(() => {
      pythonProcess.kill();
      resolve({ success: false, error: 'Python bridge timeout' });
    }, 120000);
  });
}

/**
 * Fetch daily trending searches from Google Trends
 * Uses our custom Playwright-based library that bypasses rate limiting
 */
export async function fetchDailyTrends(
  config: TrendsFetcherConfig = DEFAULT_CONFIG
): Promise<DailyTrendItem[]> {
  // Try Python bridge first (our custom library)
  const result = await callPythonBridge('daily_trends', { geo: config.geo });

  if (result.success && Array.isArray(result.data)) {
    console.log(`[TrendsFetcher] Got ${result.data.length} trends from Python bridge`);
    return result.data as DailyTrendItem[];
  }

  // Fallback to mock data
  console.log('[TrendsFetcher] Python bridge failed, using mock data for daily trends');
  return getMockDailyTrends(config.geo);
}

/**
 * Mock daily trends data for when API is blocked
 * Includes diverse categories for finding niche opportunities
 */
function getMockDailyTrends(geo: string): DailyTrendItem[] {
  // Combine all categories for more diverse results
  const allTrends = [
    ...NICHE_CATEGORIES.lifestyle,
    ...NICHE_CATEGORIES.health,
    ...NICHE_CATEGORIES.home,
    ...NICHE_CATEGORIES.hobby,
    ...NICHE_CATEGORIES.finance,
    ...NICHE_CATEGORIES.education,
    ...NICHE_CATEGORIES.travel,
    ...NICHE_CATEGORIES.pets,
    ...NICHE_CATEGORIES.tech,
  ];

  // Shuffle and return a subset
  return shuffleArray(allTrends).slice(0, 15);
}

/**
 * Niche categories with long-tail keywords
 */
const NICHE_CATEGORIES: Record<string, DailyTrendItem[]> = {
  // 生活方式 - Lifestyle
  lifestyle: [
    { title: 'minimalist wardrobe capsule', formattedTraffic: '8K+', relatedQueries: ['33 piece wardrobe', 'capsule wardrobe checklist', 'minimalist fashion men'], articles: [] },
    { title: 'digital detox weekend ideas', formattedTraffic: '5K+', relatedQueries: ['no phone challenge', 'screen free activities', 'unplug retreat'], articles: [] },
    { title: 'slow living morning routine', formattedTraffic: '12K+', relatedQueries: ['intentional living tips', 'mindful morning habits', 'calm morning routine'], articles: [] },
    { title: 'zero waste bathroom swaps', formattedTraffic: '6K+', relatedQueries: ['plastic free toiletries', 'sustainable bathroom products', 'eco friendly soap'], articles: [] },
    { title: 'apartment balcony garden ideas', formattedTraffic: '15K+', relatedQueries: ['small space vegetable garden', 'balcony herb garden', 'vertical balcony planter'], articles: [] },
  ],

  // 健康养生 - Health & Wellness
  health: [
    { title: 'desk job posture exercises', formattedTraffic: '18K+', relatedQueries: ['office stretches', 'sitting posture corrector', 'work from home back pain'], articles: [] },
    { title: 'sleep anxiety remedies natural', formattedTraffic: '22K+', relatedQueries: ['cant sleep racing thoughts', 'bedtime anxiety relief', 'sleep meditation for anxiety'], articles: [] },
    { title: 'meal prep for one person', formattedTraffic: '25K+', relatedQueries: ['single serving meal prep', 'cooking for one recipes', 'solo meal planning'], articles: [] },
    { title: 'eye strain from screens relief', formattedTraffic: '14K+', relatedQueries: ['computer eye fatigue', 'blue light headache cure', '20 20 20 rule'], articles: [] },
    { title: 'gut health breakfast ideas', formattedTraffic: '11K+', relatedQueries: ['probiotic breakfast recipes', 'fiber rich morning meals', 'anti inflammatory breakfast'], articles: [] },
  ],

  // 家居生活 - Home & Living
  home: [
    { title: 'small apartment storage hacks', formattedTraffic: '30K+', relatedQueries: ['studio apartment organization', 'vertical storage ideas', 'hidden storage furniture'], articles: [] },
    { title: 'remove musty smell from closet', formattedTraffic: '9K+', relatedQueries: ['closet odor eliminator', 'old house smell removal', 'mold smell in wardrobe'], articles: [] },
    { title: 'soundproof room cheap diy', formattedTraffic: '16K+', relatedQueries: ['noise reduction apartment', 'sound dampening panels diy', 'block neighbor noise'], articles: [] },
    { title: 'clean grout without scrubbing', formattedTraffic: '20K+', relatedQueries: ['tile grout cleaner homemade', 'steam clean grout', 'grout whitening hack'], articles: [] },
    { title: 'keep house cool without ac', formattedTraffic: '35K+', relatedQueries: ['cool room naturally', 'summer cooling hacks', 'portable evaporative cooler'], articles: [] },
  ],

  // 兴趣爱好 - Hobbies
  hobby: [
    { title: 'beginner woodworking small projects', formattedTraffic: '12K+', relatedQueries: ['simple wood crafts', 'first woodworking project', 'hand tool woodworking'], articles: [] },
    { title: 'indoor photography ideas at home', formattedTraffic: '8K+', relatedQueries: ['creative home photoshoot', 'diy photo backdrop', 'natural light photography tips'], articles: [] },
    { title: 'learn calligraphy for beginners', formattedTraffic: '15K+', relatedQueries: ['modern calligraphy practice', 'brush lettering basics', 'calligraphy pen for beginners'], articles: [] },
    { title: 'start bullet journal simple', formattedTraffic: '18K+', relatedQueries: ['minimalist bullet journal', 'bujo for beginners', 'simple spread ideas'], articles: [] },
    { title: 'aquarium plants low maintenance', formattedTraffic: '7K+', relatedQueries: ['easy aquatic plants', 'no co2 aquarium plants', 'low light fish tank plants'], articles: [] },
  ],

  // 理财省钱 - Personal Finance
  finance: [
    { title: 'save money on groceries single', formattedTraffic: '22K+', relatedQueries: ['grocery budget one person', 'cheap meals for one', 'single person food budget'], articles: [] },
    { title: 'negotiate rent reduction', formattedTraffic: '10K+', relatedQueries: ['ask landlord lower rent', 'rent negotiation letter', 'renew lease lower price'], articles: [] },
    { title: 'side hustle from phone', formattedTraffic: '28K+', relatedQueries: ['make money smartphone only', 'mobile side income', 'phone only freelance work'], articles: [] },
    { title: 'wedding on small budget', formattedTraffic: '40K+', relatedQueries: ['cheap wedding ideas', 'diy wedding decorations', 'affordable wedding venues'], articles: [] },
    { title: 'first car buying mistakes', formattedTraffic: '15K+', relatedQueries: ['used car buying tips', 'dealer tricks to avoid', 'car negotiation strategies'], articles: [] },
  ],

  // 学习教育 - Education & Learning
  education: [
    { title: 'study techniques for slow learners', formattedTraffic: '12K+', relatedQueries: ['learning disability study tips', 'memory tricks for studying', 'understand concepts faster'], articles: [] },
    { title: 'learn language while sleeping', formattedTraffic: '8K+', relatedQueries: ['sleep learning audio', 'passive language learning', 'subliminal language course'], articles: [] },
    { title: 'online courses worth paying for', formattedTraffic: '18K+', relatedQueries: ['best paid online courses', 'udemy vs coursera', 'certifications that pay off'], articles: [] },
    { title: 'speed reading for textbooks', formattedTraffic: '9K+', relatedQueries: ['read academic papers faster', 'study book in one day', 'skim reading technique'], articles: [] },
    { title: 'write thesis without motivation', formattedTraffic: '6K+', relatedQueries: ['dissertation procrastination help', 'thesis writing block', 'finish thesis tips'], articles: [] },
  ],

  // 旅行出行 - Travel
  travel: [
    { title: 'travel alone as introvert', formattedTraffic: '11K+', relatedQueries: ['solo travel for shy people', 'introvert friendly destinations', 'quiet travel experiences'], articles: [] },
    { title: 'pack light for two weeks', formattedTraffic: '14K+', relatedQueries: ['minimalist packing list', 'carry on only trip', 'capsule travel wardrobe'], articles: [] },
    { title: 'work remotely from another country', formattedTraffic: '25K+', relatedQueries: ['digital nomad visa', 'work abroad legally', 'remote work time zone'], articles: [] },
    { title: 'road trip snacks healthy', formattedTraffic: '8K+', relatedQueries: ['no cooler road trip food', 'car snacks that dont melt', 'clean eating travel snacks'], articles: [] },
    { title: 'fly with anxiety tips', formattedTraffic: '20K+', relatedQueries: ['fear of flying overcome', 'turbulence anxiety help', 'airplane panic attack'], articles: [] },
  ],

  // 宠物 - Pets
  pets: [
    { title: 'cat wont eat new food', formattedTraffic: '16K+', relatedQueries: ['picky cat eating tips', 'transition cat food slowly', 'cat food topper ideas'], articles: [] },
    { title: 'dog barks when left alone', formattedTraffic: '22K+', relatedQueries: ['separation anxiety dog training', 'stop dog barking apartment', 'calm dog when leaving'], articles: [] },
    { title: 'fish tank cloudy after cleaning', formattedTraffic: '7K+', relatedQueries: ['bacterial bloom aquarium', 'cloudy water new tank', 'clear fish tank fast'], articles: [] },
    { title: 'rabbit bonding not working', formattedTraffic: '4K+', relatedQueries: ['bonding rabbits fighting', 'rabbit introduction tips', 'how long rabbit bonding takes'], articles: [] },
    { title: 'indoor cat enrichment ideas', formattedTraffic: '13K+', relatedQueries: ['bored cat solutions', 'diy cat toys', 'apartment cat activities'], articles: [] },
  ],

  // 科技工具 - Tech (kept but diversified)
  tech: [
    { title: 'phone battery draining fast fix', formattedTraffic: '45K+', relatedQueries: ['android battery optimization', 'iphone battery health tips', 'apps draining battery'], articles: [] },
    { title: 'wifi slow in one room only', formattedTraffic: '28K+', relatedQueries: ['wifi dead zone fix', 'mesh wifi worth it', 'wifi extender setup'], articles: [] },
    { title: 'recover deleted photos free', formattedTraffic: '35K+', relatedQueries: ['photo recovery android', 'undelete pictures iphone', 'sd card photo recovery'], articles: [] },
    { title: 'smart home for renters', formattedTraffic: '12K+', relatedQueries: ['no drill smart devices', 'portable smart home', 'apartment automation ideas'], articles: [] },
    { title: 'old laptop what to do', formattedTraffic: '18K+', relatedQueries: ['repurpose old computer', 'linux for old laptop', 'recycle laptop safely'], articles: [] },
  ],
};

/**
 * Shuffle array randomly
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Fetch real-time trending topics
 * Note: Real-time trends use the same data source as daily trends for now
 */
export async function fetchRealTimeTrends(
  config: TrendsFetcherConfig = DEFAULT_CONFIG
): Promise<string[]> {
  // Use daily trends as source for real-time topics
  const dailyTrends = await fetchDailyTrends(config);

  if (dailyTrends.length > 0) {
    const topics = dailyTrends.map((t) => t.title).filter(Boolean);
    console.log(`[TrendsFetcher] Got ${topics.length} real-time topics from daily trends`);
    return [...new Set(topics)];
  }

  // Fallback to mock data
  console.log('[TrendsFetcher] Using mock data for real-time trends');
  return getMockRealTimeTrends();
}

/**
 * Mock real-time trends data - diverse niche topics
 */
function getMockRealTimeTrends(): string[] {
  const allTopics = [
    // 生活问题
    'how to fall asleep in 5 minutes',
    'apartment too hot no ac',
    'neighbor noise complaint letter',
    'remove coffee stain from carpet',
    'fix squeaky door hinge',

    // 职场问题
    'ask for raise email template',
    'coworker taking credit for work',
    'work from home productivity tips',
    'quit job without notice consequences',
    'career change at 40',

    // 人际关系
    'make friends as adult introvert',
    'long distance relationship activities',
    'deal with difficult family members',
    'small talk topics for networking',
    'apologize sincerely after argument',

    // 健康问题
    'headache wont go away for days',
    'cant sleep mind racing',
    'lower back pain from sitting',
    'stress eating how to stop',
    'motivation to exercise at home',

    // 财务问题
    'live on one income family',
    'pay off debt fast low income',
    'cheap healthy meals weekly',
    'save for house while renting',
    'hidden fees to avoid',

    // 技术问题
    'computer running slow suddenly',
    'phone storage full but nothing there',
    'printer not connecting to wifi',
    'forgot password recovery options',
    'backup photos before phone dies',
  ];

  return shuffleArray(allTopics).slice(0, 15);
}

/**
 * Get related queries for a keyword (long-tail expansion)
 * Uses our custom Playwright-based library
 */
export async function fetchRelatedQueries(
  keyword: string,
  config: TrendsFetcherConfig = DEFAULT_CONFIG
): Promise<{ top: string[]; rising: string[] }> {
  // Try Python bridge first
  const result = await callPythonBridge('related_queries', {
    keyword,
    geo: config.geo,
  });

  if (result.success && result.data) {
    const data = result.data as { top: string[]; rising: string[] };
    console.log(
      `[TrendsFetcher] Got ${data.top?.length || 0} top, ${data.rising?.length || 0} rising queries from Python bridge`
    );
    return {
      top: data.top || [],
      rising: data.rising || [],
    };
  }

  // Fallback to mock data
  console.log(`[TrendsFetcher] Using mock related queries for "${keyword}"`);
  return getMockRelatedQueries(keyword);
}

/**
 * Mock related queries based on keyword - generates realistic long-tail variations
 */
function getMockRelatedQueries(keyword: string): { top: string[]; rising: string[] } {
  const kw = keyword.toLowerCase();

  // Long-tail modifiers for different intents
  const problemModifiers = ['how to fix', 'why is', 'help with', 'solve', 'stop'];
  const solutionModifiers = ['best way to', 'easy way to', 'quick', 'diy', 'homemade'];
  const specifcModifiers = ['for beginners', 'at home', 'without tools', 'cheap', 'free'];
  const contextModifiers = ['in apartment', 'for seniors', 'for kids', 'while working', 'on budget'];

  return {
    top: [
      `${solutionModifiers[Math.floor(Math.random() * solutionModifiers.length)]} ${kw}`,
      `${kw} ${specifcModifiers[Math.floor(Math.random() * specifcModifiers.length)]}`,
      `${kw} ${contextModifiers[Math.floor(Math.random() * contextModifiers.length)]}`,
      `${kw} tips and tricks`,
      `${kw} step by step`,
    ],
    rising: [
      `${problemModifiers[Math.floor(Math.random() * problemModifiers.length)]} ${kw}`,
      `${kw} not working`,
      `${kw} alternatives`,
      `${kw} reddit`,
      `${kw} 2026 guide`,
    ],
  };
}

/**
 * Get interest over time for a keyword
 * Uses our custom Playwright-based library
 */
export async function fetchInterestOverTime(
  keyword: string,
  config: TrendsFetcherConfig = DEFAULT_CONFIG
): Promise<TrendDataPoint[]> {
  // Try Python bridge first
  const result = await callPythonBridge('interest_over_time', {
    keywords: keyword,
    geo: config.geo,
  });

  if (result.success && result.data) {
    const data = result.data as Record<string, Array<{ date: string; value: number }>>;
    const keywordData = data[keyword] || [];
    console.log(`[TrendsFetcher] Got ${keywordData.length} data points from Python bridge`);
    return keywordData.map((point) => ({
      date: point.date,
      value: point.value,
    }));
  }

  // Fallback to mock data
  console.log(`[TrendsFetcher] Using mock interest data for "${keyword}"`);
  return getMockInterestOverTime();
}

/**
 * Mock interest over time data
 */
function getMockInterestOverTime(): TrendDataPoint[] {
  const data: TrendDataPoint[] = [];
  const now = new Date();

  for (let i = 12; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i * 7);
    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: Math.floor(Math.random() * 40) + 30, // Random value between 30-70
    });
  }

  return data;
}

/**
 * Discover and save new keywords from all sources
 */
export async function discoverKeywords(
  config: TrendsFetcherConfig = DEFAULT_CONFIG
): Promise<Keyword[]> {
  const discoveredKeywords: Keyword[] = [];

  console.log('Starting keyword discovery...');

  // 1. Fetch daily trends
  try {
    console.log('Fetching daily trends...');
    const dailyTrends = await fetchDailyTrends(config);

    for (const trend of dailyTrends) {
      const existing = getKeywordByText(trend.title);
      if (!existing && trend.title) {
        const keyword = createKeyword(trend.title, 'daily_trend');
        discoveredKeywords.push(keyword);
      }

      // Also add related queries from daily trends
      for (const relatedQuery of trend.relatedQueries.slice(0, 5)) {
        const existing = getKeywordByText(relatedQuery);
        if (!existing && relatedQuery) {
          const keyword = createKeyword(relatedQuery, 'related');
          discoveredKeywords.push(keyword);
        }
      }
    }

    await delay(DELAY_BETWEEN_REQUESTS);
  } catch (error) {
    console.error('Error in daily trends discovery:', error);
  }

  // 2. Fetch real-time trends
  try {
    console.log('Fetching real-time trends...');
    const realTimeTrends = await fetchRealTimeTrends(config);

    for (const topic of realTimeTrends) {
      const existing = getKeywordByText(topic);
      if (!existing && topic) {
        const keyword = createKeyword(topic, 'realtime');
        discoveredKeywords.push(keyword);
      }
    }

    await delay(DELAY_BETWEEN_REQUESTS);
  } catch (error) {
    console.error('Error in real-time trends discovery:', error);
  }

  console.log(`Discovered ${discoveredKeywords.length} new keywords`);
  return discoveredKeywords;
}

/**
 * Expand a keyword to find related long-tail keywords
 */
export async function expandKeyword(
  keyword: string,
  config: TrendsFetcherConfig = DEFAULT_CONFIG
): Promise<Keyword[]> {
  const discoveredKeywords: Keyword[] = [];

  try {
    const related = await fetchRelatedQueries(keyword, config);

    // Add rising queries (more valuable for finding opportunities)
    for (const query of related.rising) {
      const existing = getKeywordByText(query);
      if (!existing && query) {
        const kw = createKeyword(query, 'related');
        discoveredKeywords.push(kw);
      }
    }

    // Add top queries
    for (const query of related.top.slice(0, 10)) {
      const existing = getKeywordByText(query);
      if (!existing && query) {
        const kw = createKeyword(query, 'related');
        discoveredKeywords.push(kw);
      }
    }
  } catch (error) {
    console.error(`Error expanding keyword "${keyword}":`, error);
  }

  return discoveredKeywords;
}

/**
 * Get current search volume (relative score 0-100) for a keyword
 */
export async function getSearchVolume(
  keyword: string,
  config: TrendsFetcherConfig = DEFAULT_CONFIG
): Promise<number> {
  try {
    const trendData = await fetchInterestOverTime(keyword, config);

    if (trendData.length === 0) {
      return 0;
    }

    // Get average of last 7 days or available data
    const recentData = trendData.slice(-7);
    const sum = recentData.reduce((acc, point) => acc + point.value, 0);
    return Math.round(sum / recentData.length);
  } catch (error) {
    console.error(`Error getting search volume for "${keyword}":`, error);
    return 0;
  }
}

/**
 * Detect trend direction
 */
export function detectTrend(trendData: TrendDataPoint[]): 'rising' | 'stable' | 'declining' {
  if (trendData.length < 4) {
    return 'stable';
  }

  const recent = trendData.slice(-4);
  const older = trendData.slice(-8, -4);

  if (older.length === 0) {
    return 'stable';
  }

  const recentAvg = recent.reduce((acc, p) => acc + p.value, 0) / recent.length;
  const olderAvg = older.reduce((acc, p) => acc + p.value, 0) / older.length;

  const changePercent = ((recentAvg - olderAvg) / (olderAvg || 1)) * 100;

  if (changePercent > 20) {
    return 'rising';
  } else if (changePercent < -20) {
    return 'declining';
  }

  return 'stable';
}

/**
 * Discover niche keywords by category
 */
export async function discoverNicheKeywords(
  category: NicheCategory
): Promise<Keyword[]> {
  const discoveredKeywords: Keyword[] = [];

  console.log(`[TrendsFetcher] Discovering niche keywords for category: ${category}`);

  const categoryData = NICHE_CATEGORIES[category] || [];

  for (const trend of categoryData) {
    // Add main keyword
    const existing = getKeywordByText(trend.title);
    if (!existing && trend.title) {
      const keyword = createKeyword(trend.title, 'daily_trend', category);
      discoveredKeywords.push(keyword);
    }

    // Add related queries
    for (const relatedQuery of trend.relatedQueries) {
      const existingRelated = getKeywordByText(relatedQuery);
      if (!existingRelated && relatedQuery) {
        const keyword = createKeyword(relatedQuery, 'related', category);
        discoveredKeywords.push(keyword);
      }
    }
  }

  console.log(`[TrendsFetcher] Discovered ${discoveredKeywords.length} niche keywords in ${category}`);
  return discoveredKeywords;
}

/**
 * Get all available niche categories with counts
 */
export function getNicheCategories(): Array<{ id: NicheCategory; name: string; count: number }> {
  const categoryNames: Record<NicheCategory, string> = {
    lifestyle: '生活方式 Lifestyle',
    health: '健康养生 Health',
    home: '家居生活 Home',
    hobby: '兴趣爱好 Hobbies',
    finance: '理财省钱 Finance',
    education: '学习教育 Education',
    travel: '旅行出行 Travel',
    pets: '宠物 Pets',
    tech: '科技工具 Tech',
  };

  return AVAILABLE_CATEGORIES.map(cat => ({
    id: cat,
    name: categoryNames[cat],
    count: NICHE_CATEGORIES[cat]?.length || 0,
  }));
}

/**
 * Generate long-tail variations of a keyword
 */
export function generateLongTailVariations(keyword: string): string[] {
  const kw = keyword.toLowerCase();

  const variations = [
    // Problem-focused
    `how to ${kw}`,
    `why ${kw} not working`,
    `${kw} problems`,
    `fix ${kw} issues`,
    `${kw} help`,

    // Solution-focused
    `best ${kw}`,
    `${kw} tips`,
    `${kw} guide`,
    `easy ${kw}`,
    `diy ${kw}`,

    // Context-specific
    `${kw} for beginners`,
    `${kw} at home`,
    `${kw} without experience`,
    `cheap ${kw}`,
    `${kw} on budget`,

    // Comparison/Alternative
    `${kw} vs`,
    `${kw} alternatives`,
    `${kw} reviews`,
    `is ${kw} worth it`,

    // Time-specific
    `${kw} 2026`,
    `${kw} latest`,
    `${kw} trends`,
  ];

  return variations;
}
