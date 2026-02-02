#!/usr/bin/env node
/**
 * Delete all non-app_idea keywords from the database
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'data.db');

const db = new Database(DB_PATH);

// Delete analysis snapshots for non-app_idea keywords
const snapshotResult = db.prepare(`
  DELETE FROM analysis_snapshots 
  WHERE keyword_id IN (SELECT id FROM keywords WHERE source != 'app_idea')
`).run();
console.log('Deleted analysis snapshots:', snapshotResult.changes);

// Delete non-app_idea keywords
const keywordResult = db.prepare(`DELETE FROM keywords WHERE source != 'app_idea'`).run();
console.log('Deleted keywords:', keywordResult.changes);

// Verify
const remaining = db.prepare('SELECT source, COUNT(*) as count FROM keywords GROUP BY source').all();
console.log('Remaining keywords:', JSON.stringify(remaining, null, 2));

// List all remaining keywords
const keywords = db.prepare('SELECT keyword, category FROM keywords ORDER BY keyword').all();
console.log('\nRemaining app ideas:');
keywords.forEach(k => console.log(`  - ${k.keyword} (${k.category || 'uncategorized'})`));

db.exec('VACUUM');
db.close();
console.log('\nDone!');
