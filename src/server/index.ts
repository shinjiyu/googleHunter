import cors from 'cors';
import express from 'express';
import path from 'path';
import { closeDatabase, initDatabase } from './db';
import { startScheduler, stopScheduler } from './jobs/scheduler';
import alertsRouter from './routes/alerts';
import analysisRouter from './routes/analysis';
import keywordsRouter from './routes/keywords';
import trendsRouter from './routes/trends';
import { closeBrowser } from './services/serpAnalyzer';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/keywords', keywordsRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/alerts', alertsRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '../client');
  app.use(express.static(clientPath));

  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

// Initialize and start server
async function start() {
  try {
    // Initialize database
    initDatabase();
    console.log('Database initialized');

    // Start scheduler
    startScheduler();
    console.log('Scheduler started');

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function shutdown() {
  console.log('Shutting down...');

  stopScheduler();
  await closeBrowser();
  closeDatabase();

  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the server
start();
