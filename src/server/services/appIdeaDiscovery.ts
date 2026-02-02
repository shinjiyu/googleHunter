/**
 * appIdeaDiscovery.ts
 *
 * Discover app/tool ideas by searching for user needs and problems.
 * Unlike Daily Trends (news/celebrities), this focuses on persistent user needs.
 */

import { spawn } from 'child_process';
import path from 'path';
import type { Keyword } from '../../shared/types';
import { createKeyword, getKeywordByText } from '../db';

const BRIDGE_SCRIPT = path.join(process.cwd(), 'scripts', 'trends_bridge.py');

/**
 * Seed keywords that represent app/tool categories with persistent demand
 */
export const APP_SEED_KEYWORDS = {
  productivity: [
    'habit tracker app',
    'todo list app',
    'time tracker app',
    'pomodoro timer',
    'note taking app',
    'daily planner app',
    'goal tracker',
    'focus app',
    'task manager app',
    'calendar app',
  ],
  health: [
    'sleep tracker app',
    'water reminder app',
    'calorie counter app',
    'workout tracker',
    'meditation app',
    'mood tracker app',
    'fasting app',
    'step counter app',
    'pill reminder app',
    'symptom tracker',
  ],
  finance: [
    'budget app',
    'expense tracker app',
    'savings app',
    'investment tracker',
    'bill reminder app',
    'subscription tracker',
    'debt payoff app',
    'money manager',
    'receipt scanner app',
    'net worth tracker',
  ],
  lifestyle: [
    'recipe app',
    'meal planner app',
    'grocery list app',
    'wardrobe organizer',
    'home inventory app',
    'moving checklist app',
    'cleaning schedule app',
    'plant care app',
    'pet tracker app',
    'travel planner app',
  ],
  learning: [
    'language learning app',
    'flashcard app',
    'reading tracker app',
    'vocabulary app',
    'study planner',
    'quiz app',
    'typing practice app',
    'math practice app',
    'coding practice app',
    'memory training app',
  ],
  utilities: [
    'password manager',
    'qr code scanner',
    'unit converter app',
    'calculator app',
    'file manager app',
    'photo editor app',
    'pdf reader app',
    'screen recorder',
    'clipboard manager',
    'wifi analyzer app',
  ],
  social: [
    'contacts backup app',
    'birthday reminder app',
    'gift tracker app',
    'event planner app',
    'group chat app',
    'anonymous chat app',
    'dating app',
    'networking app',
    'family organizer app',
    'couple app',
  ],
  creative: [
    'drawing app',
    'music maker app',
    'video editor app',
    'meme generator app',
    'collage maker app',
    'font app',
    'logo maker app',
    'animation app',
    'beat maker app',
    'story creator app',
  ],
};

/**
 * Problem-based keywords that indicate unmet needs
 * Format: "how to [verb] [noun]" - suggests need for a tool
 */
export const PROBLEM_PATTERNS = [
  'how to track',
  'how to organize',
  'how to manage',
  'how to remember',
  'how to schedule',
  'how to calculate',
  'how to plan',
  'how to save',
  'how to measure',
  'how to monitor',
  'best app for',
  'app to help',
  'tool for',
  'easy way to',
  'automate',
];

/**
 * Long-tail modifiers for app keywords
 */
export const APP_MODIFIERS = [
  'simple',
  'free',
  'best',
  'easy',
  'minimalist',
  'offline',
  'privacy',
  'open source',
  'no ads',
  'widget',
  'apple watch',
  'android',
  'ios',
];

/**
 * Call Python bridge for related queries
 */
async function getRelatedQueries(
  keyword: string,
  geo: string = 'US'
): Promise<{ top: string[]; rising: string[] }> {
  return new Promise((resolve) => {
    const cmdArgs = [BRIDGE_SCRIPT, 'related_queries', `--keyword=${keyword}`, `--geo=${geo}`];

    const pythonProcess = spawn('python', cmdArgs, {
      cwd: process.cwd(),
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdout = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.on('close', () => {
      try {
        const lines = stdout.trim().split('\n');
        const result = JSON.parse(lines[lines.length - 1]);
        if (result.success) {
          resolve(result.data);
        } else {
          resolve({ top: [], rising: [] });
        }
      } catch {
        resolve({ top: [], rising: [] });
      }
    });

    pythonProcess.on('error', () => {
      resolve({ top: [], rising: [] });
    });

    // Timeout
    setTimeout(() => {
      pythonProcess.kill();
      resolve({ top: [], rising: [] });
    }, 60000);
  });
}

/**
 * Filter keywords that are suitable for app/tool ideas
 */
function isAppRelatedKeyword(keyword: string): boolean {
  const kw = keyword.toLowerCase();

  // Must contain app-related terms or problem-solving patterns
  const appTerms = ['app', 'tool', 'tracker', 'manager', 'planner', 'reminder', 'organizer', 'calculator', 'converter', 'scanner', 'editor', 'maker', 'generator', 'helper'];

  const problemTerms = ['how to', 'best way to', 'easy way to', 'need to', 'want to'];

  const hasAppTerm = appTerms.some((term) => kw.includes(term));
  const hasProblemTerm = problemTerms.some((term) => kw.includes(term));

  // Exclude news/celebrity/sports keywords
  const excludePatterns = [
    'news', 'winner', 'results', 'score', 'game', 'match', 'vs',
    'death', 'died', 'born', 'married', 'divorce',
    'movie', 'show', 'episode', 'season',
    'stock', 'price', 'earnings',
  ];

  const hasExclude = excludePatterns.some((p) => kw.includes(p));

  return (hasAppTerm || hasProblemTerm) && !hasExclude;
}

/**
 * Generate app idea keywords from a seed keyword
 */
export function generateAppKeywords(seedKeyword: string): string[] {
  const keywords: string[] = [seedKeyword];

  // Add modifier variations
  for (const modifier of APP_MODIFIERS.slice(0, 5)) {
    keywords.push(`${modifier} ${seedKeyword}`);
    keywords.push(`${seedKeyword} ${modifier}`);
  }

  // Add problem-based variations
  const core = seedKeyword.replace(/ app$/, '').replace(/ tool$/, '');
  keywords.push(`how to ${core}`);
  keywords.push(`best ${seedKeyword}`);
  keywords.push(`${core} alternatives`);

  return [...new Set(keywords)];
}

/**
 * Discover app ideas from a category
 */
export async function discoverAppIdeasByCategory(
  category: keyof typeof APP_SEED_KEYWORDS,
  geo: string = 'US'
): Promise<Keyword[]> {
  console.log(`[AppIdeaDiscovery] Discovering app ideas for category: ${category}`);

  const discoveredKeywords: Keyword[] = [];
  const seedKeywords = APP_SEED_KEYWORDS[category] || [];

  for (const seed of seedKeywords.slice(0, 5)) {
    // 1. Add the seed keyword itself
    const existing = getKeywordByText(seed);
    if (!existing) {
      const keyword = createKeyword(seed, 'app_idea', category);
      discoveredKeywords.push(keyword);
    }

    // 2. Get related queries from Google Trends
    try {
      const related = await getRelatedQueries(seed, geo);

      // Add rising queries (more valuable)
      for (const query of related.rising.slice(0, 5)) {
        if (isAppRelatedKeyword(query)) {
          const existingQuery = getKeywordByText(query);
          if (!existingQuery) {
            const keyword = createKeyword(query, 'app_idea', category);
            discoveredKeywords.push(keyword);
          }
        }
      }

      // Add top queries
      for (const query of related.top.slice(0, 3)) {
        if (isAppRelatedKeyword(query)) {
          const existingQuery = getKeywordByText(query);
          if (!existingQuery) {
            const keyword = createKeyword(query, 'app_idea', category);
            discoveredKeywords.push(keyword);
          }
        }
      }
    } catch (error) {
      console.error(`[AppIdeaDiscovery] Error getting related queries for "${seed}":`, error);
    }

    // Rate limit
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log(`[AppIdeaDiscovery] Discovered ${discoveredKeywords.length} app ideas in ${category}`);
  return discoveredKeywords;
}

/**
 * Discover app ideas from all categories
 */
export async function discoverAllAppIdeas(geo: string = 'US'): Promise<Keyword[]> {
  const allKeywords: Keyword[] = [];

  for (const category of Object.keys(APP_SEED_KEYWORDS) as Array<keyof typeof APP_SEED_KEYWORDS>) {
    const keywords = await discoverAppIdeasByCategory(category, geo);
    allKeywords.push(...keywords);

    // Rate limit between categories
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return allKeywords;
}

/**
 * Quick discovery from a single seed keyword
 */
export async function discoverFromSeed(
  seedKeyword: string,
  geo: string = 'US'
): Promise<Keyword[]> {
  console.log(`[AppIdeaDiscovery] Expanding from seed: "${seedKeyword}"`);

  const discoveredKeywords: Keyword[] = [];

  // Generate variations
  const variations = generateAppKeywords(seedKeyword);

  for (const variation of variations) {
    const existing = getKeywordByText(variation);
    if (!existing) {
      const keyword = createKeyword(variation, 'app_idea');
      discoveredKeywords.push(keyword);
    }
  }

  // Get related queries
  try {
    const related = await getRelatedQueries(seedKeyword, geo);

    for (const query of [...related.rising, ...related.top].slice(0, 10)) {
      if (isAppRelatedKeyword(query) || query.includes(seedKeyword.split(' ')[0])) {
        const existing = getKeywordByText(query);
        if (!existing) {
          const keyword = createKeyword(query, 'app_idea');
          discoveredKeywords.push(keyword);
        }
      }
    }
  } catch (error) {
    console.error(`[AppIdeaDiscovery] Error expanding seed "${seedKeyword}":`, error);
  }

  return discoveredKeywords;
}

/**
 * Get all app categories with descriptions
 */
export function getAppCategories(): Array<{
  id: string;
  name: string;
  description: string;
  seedCount: number;
}> {
  return [
    { id: 'productivity', name: 'Productivity', description: 'Task management, time tracking, focus tools', seedCount: APP_SEED_KEYWORDS.productivity.length },
    { id: 'health', name: 'Health & Fitness', description: 'Sleep, exercise, diet, mental health', seedCount: APP_SEED_KEYWORDS.health.length },
    { id: 'finance', name: 'Finance', description: 'Budgeting, expense tracking, investments', seedCount: APP_SEED_KEYWORDS.finance.length },
    { id: 'lifestyle', name: 'Lifestyle', description: 'Home, cooking, travel, daily life', seedCount: APP_SEED_KEYWORDS.lifestyle.length },
    { id: 'learning', name: 'Education', description: 'Languages, studying, skill development', seedCount: APP_SEED_KEYWORDS.learning.length },
    { id: 'utilities', name: 'Utilities', description: 'Tools, converters, file management', seedCount: APP_SEED_KEYWORDS.utilities.length },
    { id: 'social', name: 'Social', description: 'Communication, events, relationships', seedCount: APP_SEED_KEYWORDS.social.length },
    { id: 'creative', name: 'Creative', description: 'Art, music, video, design', seedCount: APP_SEED_KEYWORDS.creative.length },
  ];
}
