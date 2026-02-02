# Google Hunter

A tool for discovering app/tool opportunities by analyzing Google Trends and App Store competition.

## Features

- **Google Trends Integration**: Fetch trending keywords using Playwright-based browser automation (bypasses rate limiting)
- **App Store Competition Analysis**: Analyze iOS App Store competition via iTunes Search API
- **App Idea Discovery**: Discover app opportunities across 8 categories (Productivity, Health, Finance, etc.)
- **Opportunity Scoring**: Calculate opportunity scores based on search volume, trend direction, and competition

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS + Vite
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite (better-sqlite3)
- **Google Trends**: Custom Playwright-based library (Python)
- **App Store**: iTunes Search API

## Installation

### Prerequisites

- Node.js 18+
- Python 3.10+
- Playwright browsers

### Setup

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r requirements-trends.txt

# Install Playwright browsers
playwright install chromium
```

## Usage

### Development

```bash
# Start both frontend and backend
npm run dev

# Frontend only: http://localhost:5173
# Backend API: http://localhost:3000/api
```

### API Endpoints

#### Trends

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/trends/daily` | GET | Get daily trending searches |
| `/api/trends/related/:keyword` | GET | Get related queries for a keyword |
| `/api/trends/app-categories` | GET | Get app idea categories |
| `/api/trends/discover-apps/:category` | POST | Discover app ideas by category |
| `/api/trends/app-competition/:keyword` | GET | Analyze App Store competition |

#### Keywords

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/keywords` | GET | List all keywords |
| `/api/keywords/:id` | GET | Get keyword details |
| `/api/keywords/:id/analysis` | GET | Get keyword analysis history |

#### Analysis

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/analysis/opportunities` | GET | Get high-opportunity keywords |
| `/api/analysis/run/:id` | POST | Run analysis for a keyword |

### Example: Analyze App Store Competition

```bash
curl http://localhost:3000/api/trends/app-competition/habit%20tracker%20app
```

Response:
```json
{
  "success": true,
  "data": {
    "keyword": "habit tracker app",
    "totalApps": 48,
    "competitionScore": 92,
    "marketSaturation": "very_high",
    "opportunity": "very_difficult",
    "analysis": "48 competing apps found. Top apps have excellent ratings (4.8/5)..."
  }
}
```

## Project Structure

```
├── src/
│   ├── client/          # React frontend
│   │   ├── components/  # UI components
│   │   └── pages/       # Page components
│   ├── server/          # Express backend
│   │   ├── db/          # Database operations
│   │   ├── routes/      # API routes
│   │   ├── services/    # Business logic
│   │   └── jobs/        # Scheduled tasks
│   └── shared/          # Shared types
├── scripts/             # Python scripts for Google Trends
│   ├── playwright_fetcher.py   # Playwright-based trends fetcher
│   ├── trends_bridge.py        # Node.js ↔ Python bridge
│   └── trends_api.py           # Unified API wrapper
└── package.json
```

## App Categories

The system supports discovering app ideas in these categories:

- **Productivity**: Habit trackers, todo lists, time trackers
- **Health & Fitness**: Sleep trackers, workout apps, meditation
- **Finance**: Budget apps, expense trackers, investment tools
- **Lifestyle**: Recipe apps, meal planners, travel tools
- **Education**: Language learning, flashcards, study planners
- **Utilities**: Converters, calculators, file managers
- **Social**: Event planners, dating apps, family organizers
- **Creative**: Drawing apps, video editors, music makers

## License

MIT
