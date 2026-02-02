import { Request, Response, Router } from 'express';
import type { ApiResponse, Keyword, KeywordOpportunity, PaginatedResponse } from '../../shared/types';
import {
  createKeyword,
  getAllKeywords,
  getAnalysisHistory,
  getKeywordById,
  getKeywordCount,
  getLatestAnalysis,
  searchKeywords,
} from '../db';
import { expandKeyword } from '../services/trendsFetcher';

const router = Router();

/**
 * GET /api/keywords
 * List all keywords with pagination
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const search = req.query.search as string;

    const offset = (page - 1) * pageSize;

    let keywords: Keyword[];
    let total: number;

    if (search) {
      keywords = searchKeywords(search, pageSize);
      total = keywords.length;
    } else {
      keywords = getAllKeywords(pageSize, offset);
      total = getKeywordCount();
    }

    const response: PaginatedResponse<Keyword> = {
      success: true,
      data: keywords,
      total,
      page,
      pageSize,
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching keywords:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch keywords',
    } as ApiResponse<null>);
  }
});

/**
 * GET /api/keywords/:id
 * Get a specific keyword with its analysis history
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const keyword = getKeywordById(id as string);
    if (!keyword) {
      return res.status(404).json({
        success: false,
        error: 'Keyword not found',
      } as ApiResponse<null>);
    }

    const latestAnalysis = getLatestAnalysis(id as string);
    const history = getAnalysisHistory(id as string, 30);

    const trendData = history.map((h) => ({
      date: h.timestamp.split('T')[0],
      value: h.searchVolume,
    })).reverse();

    const response: ApiResponse<KeywordOpportunity> = {
      success: true,
      data: {
        keyword,
        latestAnalysis,
        trendData,
      },
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching keyword:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch keyword',
    } as ApiResponse<null>);
  }
});

/**
 * POST /api/keywords
 * Add a new keyword to track
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { keyword, source = 'related', category } = req.body;

    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Keyword is required',
      } as ApiResponse<null>);
    }

    const newKeyword = createKeyword(keyword.trim(), source, category);

    const response: ApiResponse<Keyword> = {
      success: true,
      data: newKeyword,
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating keyword:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create keyword',
    } as ApiResponse<null>);
  }
});

/**
 * POST /api/keywords/:id/expand
 * Expand a keyword to find related long-tail keywords
 */
router.post('/:id/expand', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const keyword = getKeywordById(id as string);
    if (!keyword) {
      return res.status(404).json({
        success: false,
        error: 'Keyword not found',
      } as ApiResponse<null>);
    }

    const newKeywords = await expandKeyword(keyword.keyword);

    const response: ApiResponse<Keyword[]> = {
      success: true,
      data: newKeywords,
    };

    res.json(response);
  } catch (error) {
    console.error('Error expanding keyword:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to expand keyword',
    } as ApiResponse<null>);
  }
});

export default router;
