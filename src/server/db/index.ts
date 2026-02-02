import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  AnalysisSnapshot,
  DashboardStats,
  Keyword,
  SerpResult,
  TrendSource,
  TrendStatus,
} from '../../shared/types';

// Database path - use project root for development
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data.db');

let db: Database.Database;

export function initDatabase(): Database.Database {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS keywords (
      id TEXT PRIMARY KEY,
      keyword TEXT NOT NULL UNIQUE,
      source TEXT NOT NULL,
      category TEXT,
      first_seen TEXT NOT NULL,
      last_updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analysis_snapshots (
      id TEXT PRIMARY KEY,
      keyword_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      search_volume INTEGER NOT NULL,
      result_count INTEGER NOT NULL,
      competition_score REAL NOT NULL,
      opportunity_score REAL NOT NULL,
      trend TEXT NOT NULL,
      serp_data TEXT NOT NULL,
      FOREIGN KEY (keyword_id) REFERENCES keywords(id)
    );

    CREATE INDEX IF NOT EXISTS idx_keywords_keyword ON keywords(keyword);
    CREATE INDEX IF NOT EXISTS idx_keywords_source ON keywords(source);
    CREATE INDEX IF NOT EXISTS idx_analysis_keyword_id ON analysis_snapshots(keyword_id);
    CREATE INDEX IF NOT EXISTS idx_analysis_timestamp ON analysis_snapshots(timestamp);
    CREATE INDEX IF NOT EXISTS idx_analysis_opportunity ON analysis_snapshots(opportunity_score);
  `);

  console.log('Database initialized at:', DB_PATH);
  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

// Keyword operations
export function createKeyword(
  keyword: string,
  source: TrendSource,
  category?: string
): Keyword {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO keywords (id, keyword, source, category, first_seen, last_updated)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(keyword) DO UPDATE SET last_updated = excluded.last_updated
  `);

  stmt.run(id, keyword, source, category || null, now, now);

  return {
    id,
    keyword,
    source,
    category,
    firstSeen: now,
    lastUpdated: now,
  };
}

export function getKeywordByText(keywordText: string): Keyword | null {
  const db = getDatabase();
  const row = db
    .prepare('SELECT * FROM keywords WHERE keyword = ?')
    .get(keywordText) as KeywordRow | undefined;

  if (!row) return null;
  return rowToKeyword(row);
}

export function getKeywordById(id: string): Keyword | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM keywords WHERE id = ?').get(id) as KeywordRow | undefined;

  if (!row) return null;
  return rowToKeyword(row);
}

export function getAllKeywords(limit = 100, offset = 0): Keyword[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM keywords ORDER BY last_updated DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as KeywordRow[];

  return rows.map(rowToKeyword);
}

export function getKeywordCount(): number {
  const db = getDatabase();
  const result = db.prepare('SELECT COUNT(*) as count FROM keywords').get() as { count: number };
  return result.count;
}

export function searchKeywords(query: string, limit = 50): Keyword[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM keywords WHERE keyword LIKE ? ORDER BY last_updated DESC LIMIT ?')
    .all(`%${query}%`, limit) as KeywordRow[];

  return rows.map(rowToKeyword);
}

// Analysis operations
export function createAnalysisSnapshot(
  keywordId: string,
  searchVolume: number,
  resultCount: number,
  competitionScore: number,
  opportunityScore: number,
  trend: TrendStatus,
  serpData: SerpResult[]
): AnalysisSnapshot {
  const db = getDatabase();
  const id = uuidv4();
  const timestamp = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO analysis_snapshots 
    (id, keyword_id, timestamp, search_volume, result_count, competition_score, opportunity_score, trend, serp_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    keywordId,
    timestamp,
    searchVolume,
    resultCount,
    competitionScore,
    opportunityScore,
    trend,
    JSON.stringify(serpData)
  );

  // Update keyword last_updated
  db.prepare('UPDATE keywords SET last_updated = ? WHERE id = ?').run(timestamp, keywordId);

  return {
    id,
    keywordId,
    timestamp,
    searchVolume,
    resultCount,
    competitionScore,
    opportunityScore,
    trend,
    serpData,
  };
}

export function getLatestAnalysis(keywordId: string): AnalysisSnapshot | null {
  const db = getDatabase();
  const row = db
    .prepare(
      'SELECT * FROM analysis_snapshots WHERE keyword_id = ? ORDER BY timestamp DESC LIMIT 1'
    )
    .get(keywordId) as AnalysisRow | undefined;

  if (!row) return null;
  return rowToAnalysis(row);
}

export function getAnalysisHistory(keywordId: string, limit = 30): AnalysisSnapshot[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      'SELECT * FROM analysis_snapshots WHERE keyword_id = ? ORDER BY timestamp DESC LIMIT ?'
    )
    .all(keywordId, limit) as AnalysisRow[];

  return rows.map(rowToAnalysis);
}

export function getHighOpportunityKeywords(
  minScore: number,
  limit = 50
): Array<{ keyword: Keyword; analysis: AnalysisSnapshot }> {
  const db = getDatabase();

  const rows = db
    .prepare(
      `
    SELECT k.*, a.*,
           k.id as kid, a.id as aid
    FROM keywords k
    INNER JOIN (
      SELECT keyword_id, MAX(timestamp) as max_ts
      FROM analysis_snapshots
      GROUP BY keyword_id
    ) latest ON k.id = latest.keyword_id
    INNER JOIN analysis_snapshots a ON a.keyword_id = latest.keyword_id AND a.timestamp = latest.max_ts
    WHERE a.opportunity_score >= ?
    ORDER BY a.opportunity_score DESC
    LIMIT ?
  `
    )
    .all(minScore, limit) as Array<KeywordRow & AnalysisRow & { kid: string; aid: string }>;

  return rows.map((row) => ({
    keyword: {
      id: row.kid,
      keyword: row.keyword,
      source: row.source as TrendSource,
      category: row.category || undefined,
      firstSeen: row.first_seen,
      lastUpdated: row.last_updated,
    },
    analysis: {
      id: row.aid,
      keywordId: row.keyword_id,
      timestamp: row.timestamp,
      searchVolume: row.search_volume,
      resultCount: row.result_count,
      competitionScore: row.competition_score,
      opportunityScore: row.opportunity_score,
      trend: row.trend as TrendStatus,
      serpData: JSON.parse(row.serp_data),
    },
  }));
}

export function getDashboardStats(): DashboardStats {
  const db = getDatabase();

  const totalKeywords =
    (db.prepare('SELECT COUNT(*) as count FROM keywords').get() as { count: number }).count || 0;

  const today = new Date().toISOString().split('T')[0];
  const newToday =
    (
      db
        .prepare("SELECT COUNT(*) as count FROM keywords WHERE first_seen LIKE ?")
        .get(`${today}%`) as { count: number }
    ).count || 0;

  const highOpportunity =
    (
      db
        .prepare(
          `
    SELECT COUNT(DISTINCT k.id) as count
    FROM keywords k
    INNER JOIN analysis_snapshots a ON k.id = a.keyword_id
    WHERE a.opportunity_score >= 50
  `
        )
        .get() as { count: number }
    ).count || 0;

  const avgResult = db
    .prepare(
      `
    SELECT AVG(a.opportunity_score) as avg
    FROM (
      SELECT keyword_id, MAX(timestamp) as max_ts
      FROM analysis_snapshots
      GROUP BY keyword_id
    ) latest
    INNER JOIN analysis_snapshots a ON a.keyword_id = latest.keyword_id AND a.timestamp = latest.max_ts
  `
    )
    .get() as { avg: number | null };

  return {
    totalKeywords,
    newToday,
    highOpportunity,
    averageOpportunityScore: Math.round(avgResult.avg || 0),
  };
}

// Helper types and functions
interface KeywordRow {
  id: string;
  keyword: string;
  source: string;
  category: string | null;
  first_seen: string;
  last_updated: string;
}

interface AnalysisRow {
  id: string;
  keyword_id: string;
  timestamp: string;
  search_volume: number;
  result_count: number;
  competition_score: number;
  opportunity_score: number;
  trend: string;
  serp_data: string;
}

function rowToKeyword(row: KeywordRow): Keyword {
  return {
    id: row.id,
    keyword: row.keyword,
    source: row.source as TrendSource,
    category: row.category || undefined,
    firstSeen: row.first_seen,
    lastUpdated: row.last_updated,
  };
}

function rowToAnalysis(row: AnalysisRow): AnalysisSnapshot {
  return {
    id: row.id,
    keywordId: row.keyword_id,
    timestamp: row.timestamp,
    searchVolume: row.search_volume,
    resultCount: row.result_count,
    competitionScore: row.competition_score,
    opportunityScore: row.opportunity_score,
    trend: row.trend as TrendStatus,
    serpData: JSON.parse(row.serp_data),
  };
}

export function closeDatabase(): void {
  if (db) {
    db.close();
  }
}
