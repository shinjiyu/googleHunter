import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnalysisSnapshot, DashboardStats, Keyword } from '../../shared/types';
import { getOpportunities, getStats, startAnalysisAll, startDiscovery } from '../api';
import LoadingSpinner from '../components/LoadingSpinner';
import OpportunityCard from '../components/OpportunityCard';
import StatsCard from '../components/StatsCard';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [opportunities, setOpportunities] = useState<Array<{ keyword: Keyword; analysis: AnalysisSnapshot }>>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [statsRes, oppsRes] = await Promise.all([
        getStats(),
        getOpportunities(60, 5),
      ]);

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
      if (oppsRes.success && oppsRes.data) {
        setOpportunities(oppsRes.data);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDiscover() {
    try {
      setActionLoading('discover');
      await startDiscovery();
      // Show success message (in a real app, use toast)
      alert('Keyword discovery started! Check back in a few minutes.');
    } catch (error) {
      console.error('Error starting discovery:', error);
      alert('Failed to start discovery');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAnalyzeAll() {
    try {
      setActionLoading('analyze');
      await startAnalysisAll();
      alert('Analysis started! This may take a while.');
    } catch (error) {
      console.error('Error starting analysis:', error);
      alert('Failed to start analysis');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Monitor keyword opportunities and trends</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleDiscover}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading === 'discover' ? 'Starting...' : 'Discover Keywords'}
          </button>
          <button
            onClick={handleAnalyzeAll}
            disabled={actionLoading !== null}
            className="px-4 py-2 bg-primary-600 rounded-lg text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading === 'analyze' ? 'Starting...' : 'Run Analysis'}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatsCard
            title="Total Keywords"
            value={stats.totalKeywords}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            }
          />
          <StatsCard
            title="New Today"
            value={stats.newToday}
            trend={stats.newToday > 0 ? 'up' : undefined}
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            }
          />
          <StatsCard
            title="High Opportunity"
            value={stats.highOpportunity}
            trend="up"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            }
          />
          <StatsCard
            title="Avg. Opportunity Score"
            value={stats.averageOpportunityScore}
            suffix="/100"
            icon={
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          />
        </div>
      )}

      {/* Top Opportunities */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Top Opportunities</h2>
          <Link
            to="/opportunities"
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            View all
          </Link>
        </div>

        {opportunities.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No high-opportunity keywords found yet.</p>
            <p className="text-gray-400 text-sm mt-1">
              Run discovery and analysis to find opportunities.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {opportunities.slice(0, 6).map(({ keyword, analysis }) => (
              <OpportunityCard
                key={keyword.id}
                keyword={keyword}
                analysis={analysis}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
