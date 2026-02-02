import { Link } from 'react-router-dom';
import type { AnalysisSnapshot, Keyword } from '../../shared/types';
import ScoreBadge from './ScoreBadge';
import TrendIndicator from './TrendIndicator';

interface OpportunityCardProps {
  keyword: Keyword;
  analysis: AnalysisSnapshot;
}

export default function OpportunityCard({ keyword, analysis }: OpportunityCardProps) {
  return (
    <Link
      to={`/keywords/${keyword.id}`}
      className="block bg-white rounded-lg border border-gray-200 p-4 card-hover"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-gray-900 line-clamp-1">{keyword.keyword}</h3>
        <TrendIndicator trend={analysis.trend} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <p className="text-xs text-gray-500">Opportunity</p>
          <p className={`text-lg font-bold ${getScoreColor(analysis.opportunityScore)}`}>
            {analysis.opportunityScore}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Search Volume</p>
          <p className="text-lg font-bold text-gray-900">{analysis.searchVolume}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Competition</p>
          <p className={`text-lg font-bold ${getCompetitionColor(analysis.competitionScore)}`}>
            {analysis.competitionScore}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Results</p>
          <p className="text-lg font-bold text-gray-900">
            {formatNumber(analysis.resultCount)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <ScoreBadge label={keyword.source.replace('_', ' ')} variant="medium" />
        <span className="text-xs text-gray-500">
          {new Date(analysis.timestamp).toLocaleDateString()}
        </span>
      </div>
    </Link>
  );
}

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-green-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

function getCompetitionColor(score: number): string {
  if (score <= 40) return 'text-green-600';
  if (score <= 70) return 'text-yellow-600';
  return 'text-red-600';
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
