import { Request, Response, Router } from 'express';
import type { ApiResponse } from '../../shared/types';
import { clearNewOpportunities, getNewOpportunities } from '../jobs/scheduler';

const router = Router();

/**
 * GET /api/alerts
 * Get new opportunity alerts
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const opportunities = getNewOpportunities();

    res.json({
      success: true,
      data: opportunities,
      count: opportunities.length,
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alerts',
    } as ApiResponse<null>);
  }
});

/**
 * POST /api/alerts/clear
 * Clear all alerts
 */
router.post('/clear', (_req: Request, res: Response) => {
  try {
    clearNewOpportunities();

    res.json({
      success: true,
      data: { message: 'Alerts cleared' },
    });
  } catch (error) {
    console.error('Error clearing alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear alerts',
    } as ApiResponse<null>);
  }
});

export default router;
