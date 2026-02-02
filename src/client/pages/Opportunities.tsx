import { useEffect, useState } from 'react';
import type { AnalysisSnapshot, Keyword } from '../../shared/types';
import { getOpportunities } from '../api';
import LoadingSpinner from '../components/LoadingSpinner';
import OpportunityCard from '../components/OpportunityCard';

export default function Opportunities() {
  const [opportunities, setOpportunities] = useState<Array<{ keyword: Keyword; analysis: AnalysisSnapshot }>>([]);
  const [loading, setLoading] = useState(true);
  const [minScore, setMinScore] = useState(50);

  useEffect(() => {
    loadOpportunities();
  }, [minScore]);

  async function loadOpportunities() {
    try {
      setLoading(true);
      const response = await getOpportunities(minScore, 100);
      if (response.success && response.data) {
        setOpportunities(response.data);
      }
    } catch (error) {
      console.error('Error loading opportunities:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Opportunities</h1>
          <p className="text-gray-600 mt-1">
            Keywords with high search volume and low competition
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">
            Minimum Opportunity Score:
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-48"
          />
          <span className="text-sm font-medium text-gray-900 w-12">{minScore}</span>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <LoadingSpinner />
      ) : opportunities.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <svg
            className="w-12 h-12 text-gray-400 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          <p className="text-gray-500">No opportunities found with score &gt;= {minScore}</p>
          <p className="text-gray-400 text-sm mt-1">
            Try lowering the minimum score or run analysis on more keywords.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-500">
            Found {opportunities.length} opportunities
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {opportunities.map(({ keyword, analysis }) => (
              <OpportunityCard
                key={keyword.id}
                keyword={keyword}
                analysis={analysis}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
