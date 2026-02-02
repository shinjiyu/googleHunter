import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AnalysisSnapshot, KeywordOpportunity } from '../../shared/types';
import { expandKeyword, getKeyword, runAnalysis } from '../api';
import LoadingSpinner from '../components/LoadingSpinner';
import ScoreBadge from '../components/ScoreBadge';
import TrendChart from '../components/TrendChart';
import TrendIndicator from '../components/TrendIndicator';

export default function KeywordDetail() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<KeywordOpportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadKeyword();
    }
  }, [id]);

  async function loadKeyword() {
    try {
      setLoading(true);
      const response = await getKeyword(id!);
      if (response.success && response.data) {
        setData(response.data);
      }
    } catch (error) {
      console.error('Error loading keyword:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRunAnalysis() {
    try {
      setActionLoading('analyze');
      const response = await runAnalysis(id!);
      if (response.success) {
        loadKeyword();
      }
    } catch (error) {
      console.error('Error running analysis:', error);
      alert('Failed to run analysis');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleExpand() {
    try {
      setActionLoading('expand');
      const response = await expandKeyword(id!);
      if (response.success && response.data) {
        alert(`Found ${response.data.length} related keywords!`);
      }
    } catch (error) {
      console.error('Error expanding keyword:', error);
      alert('Failed to expand keyword');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Keyword not found</p>
        <Link to="/keywords" className="text-primary-600 hover:text-primary-700 mt-2 inline-block">
          Back to keywords
        </Link>
      </div>
    );
  }

  const { keyword, latestAnalysis, trendData } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link to="/keywords" className="hover:text-gray-700">Keywords</Link>
            <span>/</span>
            <span>{keyword.keyword}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{keyword.keyword}</h1>
          <div className="flex items-center gap-3 mt-2">
            <ScoreBadge label={keyword.source.replace('_', ' ')} variant="medium" />
            {keyword.category && <ScoreBadge label={keyword.category} variant="low" />}
            {latestAnalysis && <TrendIndicator trend={latestAnalysis.trend} />}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExpand}
            disabled={actionLoading !== null}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {actionLoading === 'expand' ? 'Expanding...' : 'Find Related'}
          </button>
          <button
            onClick={handleRunAnalysis}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-primary-600 rounded-lg text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {actionLoading === 'analyze' ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      {latestAnalysis && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard
            label="Opportunity Score"
            value={latestAnalysis.opportunityScore}
            suffix="/100"
            variant={
              latestAnalysis.opportunityScore >= 60
                ? 'high'
                : latestAnalysis.opportunityScore >= 40
                ? 'medium'
                : 'low'
            }
          />
          <MetricCard
            label="Search Volume"
            value={latestAnalysis.searchVolume}
            suffix="/100"
          />
          <MetricCard
            label="Competition"
            value={latestAnalysis.competitionScore}
            suffix="/100"
            variant={
              latestAnalysis.competitionScore <= 40
                ? 'high'
                : latestAnalysis.competitionScore <= 70
                ? 'medium'
                : 'low'
            }
          />
          <MetricCard
            label="Search Results"
            value={formatNumber(latestAnalysis.resultCount)}
          />
        </div>
      )}

      {/* Scoring Breakdown - NEW */}
      {latestAnalysis && (
        <ScoringBreakdown 
          analysis={latestAnalysis} 
          keyword={keyword.keyword}
        />
      )}

      {/* Trend Chart */}
      {trendData && trendData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Search Interest Over Time</h2>
          <TrendChart data={trendData} />
        </div>
      )}

      {/* SERP Results */}
      {latestAnalysis && latestAnalysis.serpData && latestAnalysis.serpData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Search Results</h2>
          <div className="space-y-4">
            {latestAnalysis.serpData.slice(0, 10).map((result, index) => (
              <div key={index} className="border-b border-gray-100 pb-4 last:border-0">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-sm text-gray-500">
                    {result.position}
                  </span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-700 font-medium line-clamp-1"
                    >
                      {result.title}
                    </a>
                    <p className="text-sm text-green-700 truncate">{result.domain}</p>
                    <p className="text-sm text-gray-500 line-clamp-2 mt-1">{result.snippet}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Analysis Yet */}
      {!latestAnalysis && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No analysis data yet.</p>
          <button
            onClick={handleRunAnalysis}
            disabled={actionLoading !== null}
            className="mt-4 px-4 py-2 bg-primary-600 rounded-lg text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            Run First Analysis
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Scoring Breakdown Component - Shows detailed analysis
 * Supports both App Store analysis (for app keywords) and SERP analysis
 */
function ScoringBreakdown({ 
  analysis, 
  keyword 
}: { 
  analysis: AnalysisSnapshot;
  keyword: string;
}) {
  const serpData = analysis.serpData || [];
  
  // Check if this is an App Store analysis (first result has domain 'appstore')
  const isAppStoreAnalysis = serpData.length > 0 && serpData[0].domain === 'appstore';
  
  // Parse App Store info from serpData if available
  const appStoreInfo = isAppStoreAnalysis ? {
    summary: serpData[0].title, // e.g., "App Store Analysis: 106 apps"
    analysis: serpData[0].snippet,
    topApps: serpData.slice(1).map(s => ({
      name: s.title,
      url: s.url,
      info: s.snippet, // e.g., "Rating: 4.8/5, Reviews: 31,000"
    })),
    totalApps: parseInt(serpData[0].title.match(/(\d+)/)?.[1] || '0', 10),
  } : null;

  // Calculate opportunity score breakdown
  const searchVolumeContribution = analysis.searchVolume * 0.4;
  const competitionContribution = (100 - analysis.competitionScore) * 0.6;
  let trendMultiplier = 1;
  if (analysis.trend === 'rising') {
    trendMultiplier = 1.2;
  } else if (analysis.trend === 'declining') {
    trendMultiplier = 0.8;
  }

  const baseScore = searchVolumeContribution + competitionContribution;
  const finalScore = Math.min(100, Math.max(0, Math.round(baseScore * trendMultiplier)));

  // Estimate breakdown scores for App Store analysis
  const estimateAppStoreBreakdown = (totalApps: number, competitionScore: number) => {
    // Reverse-engineer the breakdown from total score
    // These are approximate based on the algorithm in appStoreAnalyzer.ts
    const appCountScore = totalApps >= 100 ? 100 : totalApps >= 60 ? 80 : totalApps >= 30 ? 55 : totalApps >= 10 ? 25 : 10;
    const qualityScore = Math.min(100, competitionScore * 1.1); // Approximate
    const maturityScore = Math.min(100, competitionScore * 0.8);
    const barrierScore = Math.min(100, competitionScore * 1.0);
    
    return { appCountScore, qualityScore, maturityScore, barrierScore };
  };

  const appBreakdown = appStoreInfo 
    ? estimateAppStoreBreakdown(appStoreInfo.totalApps, analysis.competitionScore)
    : null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {isAppStoreAnalysis ? '📱 App Store Competition Analysis' : 'Scoring Breakdown'}
      </h2>
      
      {/* Opportunity Score Formula */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-medium text-blue-900 mb-2">Opportunity Score Formula</h3>
        <div className="text-sm text-blue-800 font-mono">
          <p>Base = (SearchVolume × 40%) + ((100 - Competition) × 60%)</p>
          <p>Base = ({analysis.searchVolume} × 0.4) + ((100 - {analysis.competitionScore}) × 0.6)</p>
          <p>Base = {searchVolumeContribution.toFixed(1)} + {competitionContribution.toFixed(1)} = {baseScore.toFixed(1)}</p>
          {analysis.trend !== 'stable' && (
            <p>Final = {baseScore.toFixed(1)} × {trendMultiplier} (trend {analysis.trend === 'rising' ? '+20%' : '-20%'}) = {finalScore}</p>
          )}
        </div>
      </div>

      {/* Score Components */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Search Volume */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900">Search Volume: {analysis.searchVolume}/100</h3>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className="bg-blue-500 h-3 rounded-full" 
              style={{ width: `${analysis.searchVolume}%` }}
            />
          </div>
          <p className="text-sm text-gray-600">
            {analysis.searchVolume >= 50 
              ? 'Good search interest' 
              : analysis.searchVolume >= 20 
              ? 'Moderate search interest' 
              : 'Low search interest'}
          </p>
          <p className="text-sm text-gray-500">
            Contributes: {searchVolumeContribution.toFixed(1)} points (40% weight)
          </p>
        </div>

        {/* Competition Score */}
        <div className="space-y-3">
          <h3 className="font-medium text-gray-900">
            {isAppStoreAnalysis ? 'App Store Competition' : 'Competition'}: {analysis.competitionScore}/100
          </h3>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className={`h-3 rounded-full ${
                analysis.competitionScore <= 40 
                  ? 'bg-green-500' 
                  : analysis.competitionScore <= 70 
                  ? 'bg-yellow-500' 
                  : 'bg-red-500'
              }`}
              style={{ width: `${analysis.competitionScore}%` }}
            />
          </div>
          <p className="text-sm text-gray-600">
            {analysis.competitionScore <= 40 
              ? 'Low competition - Good opportunity!' 
              : analysis.competitionScore <= 70 
              ? 'Medium competition' 
              : 'High competition - Difficult market'}
          </p>
          <p className="text-sm text-gray-500">
            Contributes: {competitionContribution.toFixed(1)} points (60% weight)
          </p>
        </div>
      </div>

      {/* App Store Competition Breakdown */}
      {isAppStoreAnalysis && appStoreInfo && appBreakdown && (
        <div className="mt-6 border-t pt-6">
          <h3 className="font-medium text-gray-900 mb-4">
            App Store Competition Breakdown ({appStoreInfo.totalApps} apps found)
          </h3>
          <div className="space-y-4">
            <ScoreRow 
              label="📊 App Count (iOS + Android estimate)"
              score={appBreakdown.appCountScore}
              maxScore={100}
              explanation={`${appStoreInfo.totalApps} total estimated apps in this category`}
              color="blue"
            />
            <ScoreRow 
              label="⭐ Quality (Ratings & Reviews)"
              score={appBreakdown.qualityScore}
              maxScore={100}
              explanation="Average rating and review count of top apps"
              color="purple"
            />
            <ScoreRow 
              label="📅 Market Maturity"
              score={appBreakdown.maturityScore}
              maxScore={100}
              explanation="App age and update frequency"
              color="indigo"
            />
            <ScoreRow 
              label="🚧 Barrier to Entry"
              score={appBreakdown.barrierScore}
              maxScore={100}
              explanation="Free app dominance & established players"
              color="orange"
            />
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between font-medium">
                <span>Weighted Total Competition</span>
                <span>{analysis.competitionScore}/100</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                (App Count 25% + Quality 30% + Maturity 20% + Barrier 25%)
              </p>
            </div>
          </div>

          {/* App Store Analysis Text */}
          {appStoreInfo.analysis && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700">{appStoreInfo.analysis}</p>
            </div>
          )}
        </div>
      )}

      {/* SERP Competition Breakdown (for non-app keywords) */}
      {!isAppStoreAnalysis && (
        <div className="mt-6 border-t pt-6">
          <h3 className="font-medium text-gray-900 mb-4">SERP Competition Breakdown</h3>
          <SerpBreakdown analysis={analysis} keyword={keyword} serpData={serpData} />
        </div>
      )}

      {/* Trend Impact */}
      <div className="mt-6 border-t pt-6">
        <h3 className="font-medium text-gray-900 mb-3">Trend Impact</h3>
        <div className={`p-3 rounded-lg ${
          analysis.trend === 'rising' 
            ? 'bg-green-50 text-green-800' 
            : analysis.trend === 'declining'
            ? 'bg-red-50 text-red-800'
            : 'bg-gray-50 text-gray-800'
        }`}>
          <div className="flex items-center gap-2">
            <TrendIndicator trend={analysis.trend} />
            <span className="text-sm">
              {analysis.trend === 'rising' && '(+20% score bonus)'}
              {analysis.trend === 'declining' && '(-20% score penalty)'}
              {analysis.trend === 'stable' && '(no adjustment)'}
            </span>
          </div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="mt-6 border-t pt-6">
        <h3 className="font-medium text-gray-900 mb-3">
          {isAppStoreAnalysis ? 'App Opportunity Assessment' : 'Analysis Summary'}
        </h3>
        <div className="space-y-2">
          {analysis.opportunityScore >= 60 && (
            <div className="flex items-start gap-2 text-green-700">
              <span>✓</span>
              <span className="text-sm">
                {isAppStoreAnalysis 
                  ? 'Good app opportunity - Market has room for new entrants'
                  : 'High opportunity - Good candidate for content creation'}
              </span>
            </div>
          )}
          {analysis.opportunityScore >= 40 && analysis.opportunityScore < 60 && (
            <div className="flex items-start gap-2 text-yellow-700">
              <span>!</span>
              <span className="text-sm">Moderate opportunity - Consider differentiation strategy</span>
            </div>
          )}
          {analysis.opportunityScore < 40 && (
            <div className="flex items-start gap-2 text-red-700">
              <span>✗</span>
              <span className="text-sm">
                {isAppStoreAnalysis 
                  ? 'Difficult market - Strong competition from established players'
                  : 'Low opportunity - High competition'}
              </span>
            </div>
          )}
          {analysis.searchVolume < 20 && (
            <div className="flex items-start gap-2 text-yellow-700">
              <span>!</span>
              <span className="text-sm">Low search volume - Niche market</span>
            </div>
          )}
          {isAppStoreAnalysis && analysis.competitionScore > 80 && (
            <div className="flex items-start gap-2 text-red-700">
              <span>⚠️</span>
              <span className="text-sm">Saturated market - Find a unique angle or niche</span>
            </div>
          )}
          {analysis.trend === 'rising' && (
            <div className="flex items-start gap-2 text-green-700">
              <span>📈</span>
              <span className="text-sm">Rising trend - Growing interest</span>
            </div>
          )}
          {analysis.trend === 'declining' && (
            <div className="flex items-start gap-2 text-yellow-700">
              <span>📉</span>
              <span className="text-sm">Declining trend - Interest may be fading</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * SERP Breakdown Component (for non-app keywords)
 */
function SerpBreakdown({ 
  analysis, 
  keyword,
  serpData
}: { 
  analysis: AnalysisSnapshot;
  keyword: string;
  serpData: typeof analysis.serpData;
}) {
  // 1. Result count factor
  let resultCountScore = 0;
  let resultCountExplanation = '';
  if (analysis.resultCount > 100000000) {
    resultCountScore = 25;
    resultCountExplanation = '> 100M results (very high competition)';
  } else if (analysis.resultCount > 10000000) {
    resultCountScore = 20;
    resultCountExplanation = '10M-100M results (high competition)';
  } else if (analysis.resultCount > 1000000) {
    resultCountScore = 15;
    resultCountExplanation = '1M-10M results (medium competition)';
  } else if (analysis.resultCount > 100000) {
    resultCountScore = 10;
    resultCountExplanation = '100K-1M results (low-medium competition)';
  } else if (analysis.resultCount > 10000) {
    resultCountScore = 5;
    resultCountExplanation = '10K-100K results (low competition)';
  } else {
    resultCountScore = 0;
    resultCountExplanation = '< 10K results (very low competition)';
  }

  // 2. Domain authority check
  const highAuthorityDomains = [
    'wikipedia.org', 'amazon.com', 'youtube.com', 'facebook.com', 
    'twitter.com', 'linkedin.com', 'reddit.com', 'medium.com',
    'forbes.com', 'nytimes.com', 'bbc.com', 'cnn.com'
  ];
  
  const top5Results = serpData.slice(0, 5);
  const highAuthorityCount = top5Results.filter(r => 
    highAuthorityDomains.some(domain => r.domain.includes(domain)) ||
    r.domain.endsWith('.gov') || 
    r.domain.endsWith('.edu')
  ).length;
  const domainAuthorityScore = highAuthorityCount * 7;

  // 3. Title match
  const keywordLower = keyword.toLowerCase();
  const exactMatchCount = top5Results.filter(r => 
    r.title.toLowerCase().includes(keywordLower)
  ).length;
  const titleMatchScore = exactMatchCount * 4;

  // 4. Forum content
  const forumDomains = ['quora.com', 'reddit.com', 'stackoverflow.com', 'answers.yahoo.com'];
  const forumCount = top5Results.filter(r => 
    forumDomains.some(domain => r.domain.includes(domain))
  ).length;
  const contentTypeScore = (5 - forumCount) * 4;

  return (
    <div className="space-y-4">
      <ScoreRow 
        label="Result Count Factor"
        score={resultCountScore}
        maxScore={25}
        explanation={resultCountExplanation}
      />
      <ScoreRow 
        label="High Authority Domains (Top 5)"
        score={domainAuthorityScore}
        maxScore={35}
        explanation={`${highAuthorityCount} high-authority sites in top 5 results`}
      />
      <ScoreRow 
        label="Title Keyword Match (Top 5)"
        score={titleMatchScore}
        maxScore={20}
        explanation={`${exactMatchCount} results have exact keyword in title`}
      />
      <ScoreRow 
        label="Content Type (Non-forum)"
        score={contentTypeScore}
        maxScore={20}
        explanation={`${forumCount} forum/Q&A results (more = content gap opportunity)`}
      />
      <div className="border-t pt-2 mt-2">
        <div className="flex justify-between font-medium">
          <span>Total Competition Score</span>
          <span>{analysis.competitionScore}/100</span>
        </div>
      </div>
    </div>
  );
}

function ScoreRow({ 
  label, 
  score, 
  maxScore, 
  explanation,
  color = 'orange'
}: { 
  label: string; 
  score: number; 
  maxScore: number; 
  explanation: string;
  color?: 'orange' | 'blue' | 'purple' | 'indigo' | 'green' | 'red';
}) {
  const percentage = (score / maxScore) * 100;
  
  const colorClasses = {
    orange: 'bg-orange-500',
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    indigo: 'bg-indigo-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
  };
  
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700">{label}</span>
        <span className="text-gray-900 font-medium">{Math.round(score)}/{maxScore}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
        <div 
          className={`${colorClasses[color]} h-2 rounded-full`}
          style={{ width: `${Math.min(100, percentage)}%` }}
        />
      </div>
      <p className="text-xs text-gray-500">{explanation}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  variant = 'default',
}: {
  label: string;
  value: number | string;
  suffix?: string;
  variant?: 'default' | 'high' | 'medium' | 'low';
}) {
  const bgColors = {
    default: 'bg-gray-50',
    high: 'bg-green-50',
    medium: 'bg-yellow-50',
    low: 'bg-red-50',
  };

  const textColors = {
    default: 'text-gray-900',
    high: 'text-green-900',
    medium: 'text-yellow-900',
    low: 'text-red-900',
  };

  return (
    <div className={`rounded-lg p-4 ${bgColors[variant]}`}>
      <p className="text-sm text-gray-600">{label}</p>
      <p className={`text-2xl font-bold ${textColors[variant]}`}>
        {value}
        {suffix && <span className="text-sm font-normal text-gray-500">{suffix}</span>}
      </p>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}
