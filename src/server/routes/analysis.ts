import { Request, Response, Router } from 'express';
import type { ApiResponse, DashboardStats } from '../../shared/types';
import { getDashboardStats, getHighOpportunityKeywords, getKeywordById } from '../db';
import { runAnalysisNow, runDiscoveryNow } from '../jobs/scheduler';
import { analyzeKeyword, quickAnalyze } from '../services/opportunityScorer';

const router = Router();

/**
 * GET /api/analysis/opportunities
 * Get high-opportunity keywords
 */
router.get('/opportunities', (req: Request, res: Response) => {
  try {
    const minScore = parseInt(req.query.minScore as string) || 50;
    const limit = parseInt(req.query.limit as string) || 50;

    const opportunities = getHighOpportunityKeywords(minScore, limit);

    res.json({
      success: true,
      data: opportunities,
    });
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch opportunities',
    } as ApiResponse<null>);
  }
});

/**
 * GET /api/analysis/stats
 * Get dashboard statistics
 */
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = getDashboardStats();

    const response: ApiResponse<DashboardStats> = {
      success: true,
      data: stats,
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats',
    } as ApiResponse<null>);
  }
});

/**
 * POST /api/analysis/run/:id
 * Run analysis for a specific keyword
 */
router.post('/run/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const keyword = getKeywordById(id as string);
    if (!keyword) {
      return res.status(404).json({
        success: false,
        error: 'Keyword not found',
      } as ApiResponse<null>);
    }

    const analysis = await analyzeKeyword(id as string);

    if (!analysis) {
      return res.status(500).json({
        success: false,
        error: 'Analysis failed',
      } as ApiResponse<null>);
    }

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error('Error running analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run analysis',
    } as ApiResponse<null>);
  }
});

/**
 * POST /api/analysis/quick
 * Quick analysis for a keyword (no SERP scraping)
 */
router.post('/quick', async (req: Request, res: Response) => {
  try {
    const { keyword, geo = 'US' } = req.body;

    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Keyword is required',
      } as ApiResponse<null>);
    }

    const result = await quickAnalyze(keyword, { geo });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error running quick analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run quick analysis',
    } as ApiResponse<null>);
  }
});

/**
 * POST /api/analysis/discover
 * Trigger keyword discovery manually
 */
router.post('/discover', async (_req: Request, res: Response) => {
  try {
    // Run discovery in background
    runDiscoveryNow().catch(console.error);

    res.json({
      success: true,
      data: { message: 'Discovery started' },
    });
  } catch (error) {
    console.error('Error starting discovery:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start discovery',
    } as ApiResponse<null>);
  }
});

/**
 * POST /api/analysis/run-all
 * Trigger analysis for all keywords manually
 */
router.post('/run-all', async (_req: Request, res: Response) => {
  try {
    // Run analysis in background
    runAnalysisNow().catch(console.error);

    res.json({
      success: true,
      data: { message: 'Analysis started' },
    });
  } catch (error) {
    console.error('Error starting analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start analysis',
    } as ApiResponse<null>);
  }
});

export default router;
