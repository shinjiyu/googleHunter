import cron from 'node-cron';
import type { AnalysisSnapshot, Keyword } from '../../shared/types';
import { getAllKeywords, getHighOpportunityKeywords, getLatestAnalysis } from '../db';
import { analyzeKeyword, isHighOpportunity } from '../services/opportunityScorer';
import { closeBrowser } from '../services/serpAnalyzer';
import { discoverKeywords, expandKeyword } from '../services/trendsFetcher';

// Store for new opportunities (for alerts)
const newOpportunities: Array<{ keyword: Keyword; analysis: AnalysisSnapshot }> = [];

export function getNewOpportunities() {
  return [...newOpportunities];
}

export function clearNewOpportunities() {
  newOpportunities.length = 0;
}

/**
 * Job: Discover new trending keywords
 * Runs every 6 hours
 */
async function discoverKeywordsJob() {
  console.log('[Scheduler] Starting keyword discovery job...');

  try {
    // Discover from multiple regions
    const regions = ['US', 'GB', 'CA'];

    for (const geo of regions) {
      console.log(`[Scheduler] Discovering keywords for region: ${geo}`);
      await discoverKeywords({ geo });

      // Rate limit between regions
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    console.log('[Scheduler] Keyword discovery job completed');
  } catch (error) {
    console.error('[Scheduler] Error in keyword discovery job:', error);
  }
}

/**
 * Job: Analyze keywords and find opportunities
 * Runs every 2 hours (staggered from discovery)
 */
async function analyzeKeywordsJob() {
  console.log('[Scheduler] Starting keyword analysis job...');

  try {
    const keywords = getAllKeywords(50, 0); // Analyze top 50 keywords
    let analyzedCount = 0;
    let opportunityCount = 0;

    for (const keyword of keywords) {
      // Check if already analyzed recently (within last 12 hours)
      const lastAnalysis = getLatestAnalysis(keyword.id);
      if (lastAnalysis) {
        const lastTime = new Date(lastAnalysis.timestamp).getTime();
        const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
        if (lastTime > twelveHoursAgo) {
          console.log(`[Scheduler] Skipping "${keyword.keyword}" - analyzed recently`);
          continue;
        }
      }

      console.log(`[Scheduler] Analyzing keyword: "${keyword.keyword}"`);

      const analysis = await analyzeKeyword(keyword.id);
      analyzedCount++;

      if (analysis && isHighOpportunity(analysis)) {
        console.log(`[Scheduler] Found opportunity: "${keyword.keyword}" (score: ${analysis.opportunityScore})`);
        opportunityCount++;

        // Track as new opportunity for alerts
        newOpportunities.push({ keyword, analysis });

        // Keep only last 100 opportunities
        if (newOpportunities.length > 100) {
          newOpportunities.shift();
        }
      }

      // Rate limit between analyses
      await new Promise((resolve) => setTimeout(resolve, 10000));

      // Limit to prevent too long runs
      if (analyzedCount >= 20) {
        console.log('[Scheduler] Reached analysis limit, stopping');
        break;
      }
    }

    console.log(
      `[Scheduler] Analysis job completed: ${analyzedCount} analyzed, ${opportunityCount} opportunities found`
    );
  } catch (error) {
    console.error('[Scheduler] Error in keyword analysis job:', error);
  } finally {
    // Close browser after analysis batch
    await closeBrowser();
  }
}

/**
 * Job: Expand high-opportunity keywords to find related long-tail keywords
 * Runs daily
 */
async function expandKeywordsJob() {
  console.log('[Scheduler] Starting keyword expansion job...');

  try {
    const highOpportunity = getHighOpportunityKeywords(60, 10);

    for (const { keyword } of highOpportunity) {
      console.log(`[Scheduler] Expanding keyword: "${keyword.keyword}"`);
      await expandKeyword(keyword.keyword);

      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    console.log('[Scheduler] Keyword expansion job completed');
  } catch (error) {
    console.error('[Scheduler] Error in keyword expansion job:', error);
  }
}

/**
 * Job: Clean up old data
 * Runs weekly
 */
async function cleanupJob() {
  console.log('[Scheduler] Starting cleanup job...');

  // In a production system, you would delete old snapshots here
  // For now, we just log

  console.log('[Scheduler] Cleanup job completed');
}

// Scheduled jobs
let discoveryTask: cron.ScheduledTask | null = null;
let analysisTask: cron.ScheduledTask | null = null;
let expansionTask: cron.ScheduledTask | null = null;
let cleanupTask: cron.ScheduledTask | null = null;

/**
 * Start all scheduled jobs
 */
export function startScheduler() {
  console.log('[Scheduler] Starting scheduled jobs...');

  // Run keyword discovery every 6 hours
  // Cron: 0 */6 * * *
  discoveryTask = cron.schedule('0 */6 * * *', discoverKeywordsJob, {
    scheduled: true,
    timezone: 'UTC',
  });

  // Run keyword analysis every 2 hours (offset by 1 hour from discovery)
  // Cron: 0 1,3,5,7,9,11,13,15,17,19,21,23 * * *
  analysisTask = cron.schedule('0 1-23/2 * * *', analyzeKeywordsJob, {
    scheduled: true,
    timezone: 'UTC',
  });

  // Run keyword expansion daily at 3 AM UTC
  // Cron: 0 3 * * *
  expansionTask = cron.schedule('0 3 * * *', expandKeywordsJob, {
    scheduled: true,
    timezone: 'UTC',
  });

  // Run cleanup weekly on Sunday at 4 AM UTC
  // Cron: 0 4 * * 0
  cleanupTask = cron.schedule('0 4 * * 0', cleanupJob, {
    scheduled: true,
    timezone: 'UTC',
  });

  console.log('[Scheduler] All jobs scheduled');
}

/**
 * Stop all scheduled jobs
 */
export function stopScheduler() {
  console.log('[Scheduler] Stopping scheduled jobs...');

  discoveryTask?.stop();
  analysisTask?.stop();
  expansionTask?.stop();
  cleanupTask?.stop();

  console.log('[Scheduler] All jobs stopped');
}

/**
 * Run jobs manually (for testing/on-demand)
 */
export async function runDiscoveryNow() {
  await discoverKeywordsJob();
}

export async function runAnalysisNow() {
  await analyzeKeywordsJob();
}

export async function runExpansionNow() {
  await expandKeywordsJob();
}
