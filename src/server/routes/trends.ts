import { Request, Response, Router } from 'express';
import type { ApiResponse, DailyTrendItem } from '../../shared/types';
import {
  APP_SEED_KEYWORDS,
  discoverAppIdeasByCategory,
  discoverFromSeed,
  getAppCategories,
} from '../services/appIdeaDiscovery';
import {
  analyzeAppStoreCompetition,
  type AppStoreCompetition,
} from '../services/appStoreAnalyzer';
import {
  AVAILABLE_CATEGORIES,
  discoverNicheKeywords,
  fetchDailyTrends,
  fetchRealTimeTrends,
  fetchRelatedQueries,
  generateLongTailVariations,
  getNicheCategories,
  type NicheCategory,
} from '../services/trendsFetcher';

const router = Router();

/**
 * GET /api/trends/daily
 * Get daily trending searches
 */
router.get('/daily', async (req: Request, res: Response) => {
  try {
    const geo = (req.query.geo as string) || 'US';

    const trends = await fetchDailyTrends({ geo });

    const response: ApiResponse<DailyTrendItem[]> = {
      success: true,
      data: trends,
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching daily trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch daily trends',
    } as ApiResponse<null>);
  }
});

/**
 * GET /api/trends/realtime
 * Get real-time trending topics
 */
router.get('/realtime', async (req: Request, res: Response) => {
  try {
    const geo = (req.query.geo as string) || 'US';

    const trends = await fetchRealTimeTrends({ geo });

    const response: ApiResponse<string[]> = {
      success: true,
      data: trends,
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching real-time trends:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch real-time trends',
    } as ApiResponse<null>);
  }
});

/**
 * GET /api/trends/related/:keyword
 * Get related queries for a keyword
 */
router.get('/related/:keyword', async (req: Request, res: Response) => {
  try {
    const { keyword } = req.params;
    const geo = (req.query.geo as string) || 'US';

    const related = await fetchRelatedQueries(keyword as string, { geo });

    const response: ApiResponse<{ top: string[]; rising: string[] }> = {
      success: true,
      data: related,
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching related queries:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch related queries',
    } as ApiResponse<null>);
  }
});

/**
 * GET /api/trends/categories
 * Get available niche categories
 */
router.get('/categories', (_req: Request, res: Response) => {
  try {
    const categories = getNicheCategories();

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories',
    } as ApiResponse<null>);
  }
});

/**
 * POST /api/trends/discover/:category
 * Discover niche keywords by category
 */
router.post('/discover/:category', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;

    if (!AVAILABLE_CATEGORIES.includes(category as NicheCategory)) {
      return res.status(400).json({
        success: false,
        error: `Invalid category. Available: ${AVAILABLE_CATEGORIES.join(', ')}`,
      } as ApiResponse<null>);
    }

    const keywords = await discoverNicheKeywords(category as NicheCategory);

    res.json({
      success: true,
      data: keywords,
      count: keywords.length,
    });
  } catch (error) {
    console.error('Error discovering niche keywords:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to discover niche keywords',
    } as ApiResponse<null>);
  }
});

/**
 * POST /api/trends/expand-longtail
 * Generate long-tail variations for a keyword
 */
router.post('/expand-longtail', (req: Request, res: Response) => {
  try {
    const { keyword } = req.body;

    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Keyword is required',
      } as ApiResponse<null>);
    }

    const variations = generateLongTailVariations(keyword);

    res.json({
      success: true,
      data: variations,
    });
  } catch (error) {
    console.error('Error generating long-tail variations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate variations',
    } as ApiResponse<null>);
  }
});

// ==================== APP IDEA DISCOVERY ====================

/**
 * GET /api/trends/app-categories
 * Get available app idea categories
 */
router.get('/app-categories', (_req: Request, res: Response) => {
  try {
    const categories = getAppCategories();
    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error('Error fetching app categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch app categories',
    } as ApiResponse<null>);
  }
});

/**
 * GET /api/trends/app-seeds/:category
 * Get seed keywords for an app category
 */
router.get('/app-seeds/:category', (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const seeds = APP_SEED_KEYWORDS[category as keyof typeof APP_SEED_KEYWORDS] || [];

    res.json({
      success: true,
      data: seeds,
    });
  } catch (error) {
    console.error('Error fetching app seeds:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch app seeds',
    } as ApiResponse<null>);
  }
});

/**
 * POST /api/trends/discover-apps/:category
 * Discover app ideas by category (with Google Trends expansion)
 */
router.post('/discover-apps/:category', async (req: Request, res: Response) => {
  try {
    const { category } = req.params;
    const geo = (req.query.geo as string) || 'US';

    const validCategories = Object.keys(APP_SEED_KEYWORDS);
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `Invalid category. Available: ${validCategories.join(', ')}`,
      } as ApiResponse<null>);
    }

    const keywords = await discoverAppIdeasByCategory(
      category as keyof typeof APP_SEED_KEYWORDS,
      geo
    );

    res.json({
      success: true,
      data: keywords,
      count: keywords.length,
    });
  } catch (error) {
    console.error('Error discovering app ideas:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to discover app ideas',
    } as ApiResponse<null>);
  }
});

/**
 * POST /api/trends/discover-from-seed
 * Discover app ideas from a custom seed keyword
 */
router.post('/discover-from-seed', async (req: Request, res: Response) => {
  try {
    const { seed } = req.body;
    const geo = (req.query.geo as string) || 'US';

    if (!seed || typeof seed !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Seed keyword is required',
      } as ApiResponse<null>);
    }

    const keywords = await discoverFromSeed(seed, geo);

    res.json({
      success: true,
      data: keywords,
      count: keywords.length,
    });
  } catch (error) {
    console.error('Error discovering from seed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to discover from seed',
    } as ApiResponse<null>);
  }
});

/**
 * GET /api/trends/app-competition/:keyword
 * Analyze App Store competition for a keyword
 */
router.get('/app-competition/:keyword', async (req: Request, res: Response) => {
  try {
    const { keyword } = req.params;
    const country = (req.query.country as string) || 'us';

    const competition = await analyzeAppStoreCompetition(keyword, country);

    const response: ApiResponse<AppStoreCompetition> = {
      success: true,
      data: competition,
    };

    res.json(response);
  } catch (error) {
    console.error('Error analyzing app competition:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze app competition',
    } as ApiResponse<null>);
  }
});

export default router;
