import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnalysisSnapshot, Keyword } from '../../shared/types';

interface Notification {
  keyword: Keyword;
  analysis: AnalysisSnapshot;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadNotifications();
    // Poll for new notifications every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadNotifications() {
    try {
      const response = await fetch('/api/alerts');
      const data = await response.json();
      if (data.success && data.data) {
        setNotifications(data.data);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  async function clearNotifications() {
    try {
      setLoading(true);
      await fetch('/api/alerts/clear', { method: 'POST' });
      setNotifications([]);
      setIsOpen(false);
    } catch (error) {
      console.error('Error clearing notifications:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {notifications.length > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Notifications</h3>
              {notifications.length > 0 && (
                <button
                  onClick={clearNotifications}
                  disabled={loading}
                  className="text-sm text-primary-600 hover:text-primary-700 disabled:opacity-50"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No new notifications
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.slice(0, 10).map(({ keyword, analysis }) => (
                    <Link
                      key={keyword.id}
                      to={`/keywords/${keyword.id}`}
                      onClick={() => setIsOpen(false)}
                      className="block p-4 hover:bg-gray-50"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {keyword.keyword}
                          </p>
                          <p className="text-xs text-gray-500">
                            Opportunity score: {analysis.opportunityScore}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="p-3 border-t border-gray-200">
                <Link
                  to="/opportunities"
                  onClick={() => setIsOpen(false)}
                  className="block text-center text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  View all opportunities
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
