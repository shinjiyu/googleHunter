#!/usr/bin/env node
/**
 * clear_db.js
 *
 * Clear all data from the SQLite database.
 * This removes old mock data before using the new Google Trends library.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');

console.log('Database path:', DB_PATH);

try {
  const db = new Database(DB_PATH);

  // Get counts before clearing
  const keywordCount = db.prepare('SELECT COUNT(*) as count FROM keywords').get();
  const snapshotCount = db.prepare('SELECT COUNT(*) as count FROM analysis_snapshots').get();

  console.log(`\nBefore clearing:`);
  console.log(`  Keywords: ${keywordCount?.count || 0}`);
  console.log(`  Analysis snapshots: ${snapshotCount?.count || 0}`);

  // Clear tables
  console.log('\nClearing tables...');
  db.exec('DELETE FROM analysis_snapshots');
  db.exec('DELETE FROM keywords');

  // Verify
  const newKeywordCount = db.prepare('SELECT COUNT(*) as count FROM keywords').get();
  const newSnapshotCount = db.prepare('SELECT COUNT(*) as count FROM analysis_snapshots').get();

  console.log(`\nAfter clearing:`);
  console.log(`  Keywords: ${newKeywordCount?.count || 0}`);
  console.log(`  Analysis snapshots: ${newSnapshotCount?.count || 0}`);

  // Vacuum to reclaim space
  db.exec('VACUUM');
  console.log('\nDatabase vacuumed.');

  db.close();
  console.log('\nDone! Database cleared successfully.');
} catch (error) {
  if (error.code === 'SQLITE_CANTOPEN') {
    console.log('Database file does not exist yet. Nothing to clear.');
  } else {
    console.error('Error:', error.message);
    process.exit(1);
  }
}
