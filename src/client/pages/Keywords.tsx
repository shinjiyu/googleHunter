import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Keyword } from '../../shared/types';
import { createKeyword, getKeywords } from '../api';
import LoadingSpinner from '../components/LoadingSpinner';
import ScoreBadge from '../components/ScoreBadge';

export default function Keywords() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [newKeyword, setNewKeyword] = useState('');
  const [adding, setAdding] = useState(false);

  const pageSize = 20;

  useEffect(() => {
    loadKeywords();
  }, [page, search]);

  async function loadKeywords() {
    try {
      setLoading(true);
      const response = await getKeywords(page, pageSize, search || undefined);
      if (response.success && response.data) {
        setKeywords(response.data);
        setTotal(response.total);
      }
    } catch (error) {
      console.error('Error loading keywords:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddKeyword(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyword.trim()) return;

    try {
      setAdding(true);
      const response = await createKeyword(newKeyword.trim());
      if (response.success && response.data) {
        setNewKeyword('');
        loadKeywords();
      }
    } catch (error) {
      console.error('Error adding keyword:', error);
      alert('Failed to add keyword');
    } finally {
      setAdding(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Keywords</h1>
        <p className="text-gray-600 mt-1">Manage and track keywords</p>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search keywords..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        {/* Add keyword form */}
        <form onSubmit={handleAddKeyword} className="flex gap-2">
          <input
            type="text"
            placeholder="Add new keyword..."
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={adding || !newKeyword.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding ? 'Adding...' : 'Add'}
          </button>
        </form>
      </div>

      {/* Keywords Table */}
      {loading ? (
        <LoadingSpinner />
      ) : keywords.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No keywords found.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Keyword
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  First Seen
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Updated
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {keywords.map((keyword) => (
                <tr key={keyword.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      to={`/keywords/${keyword.id}`}
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      {keyword.keyword}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <ScoreBadge
                      label={keyword.source.replace('_', ' ')}
                      variant={
                        keyword.source === 'daily_trend'
                          ? 'high'
                          : keyword.source === 'realtime'
                          ? 'medium'
                          : 'low'
                      }
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(keyword.firstSeen).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(keyword.lastUpdated).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <Link
                      to={`/keywords/${keyword.id}`}
                      className="text-primary-600 hover:text-primary-700"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} keywords
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
