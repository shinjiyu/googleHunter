import { useEffect, useState } from 'react';
import type { DailyTrendItem } from '../../shared/types';
import { createKeyword, getDailyTrends, getRealTimeTrends } from '../api';
import LoadingSpinner from '../components/LoadingSpinner';

type Tab = 'daily' | 'realtime' | 'niche';

interface NicheCategory {
  id: string;
  name: string;
  count: number;
}

export default function Trends() {
  const [activeTab, setActiveTab] = useState<Tab>('niche');
  const [dailyTrends, setDailyTrends] = useState<DailyTrendItem[]>([]);
  const [realtimeTrends, setRealtimeTrends] = useState<string[]>([]);
  const [categories, setCategories] = useState<NicheCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [geo, setGeo] = useState('US');
  const [addingKeyword, setAddingKeyword] = useState<string | null>(null);
  const [discoveringCategory, setDiscoveringCategory] = useState<string | null>(null);

  useEffect(() => {
    loadTrends();
  }, [activeTab, geo]);

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      const response = await fetch('/api/trends/categories');
      const data = await response.json();
      if (data.success && data.data) {
        setCategories(data.data);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  }

  async function loadTrends() {
    try {
      setLoading(true);
      if (activeTab === 'daily') {
        const response = await getDailyTrends(geo);
        if (response.success && response.data) {
          setDailyTrends(response.data);
        }
      } else if (activeTab === 'realtime') {
        const response = await getRealTimeTrends(geo);
        if (response.success && response.data) {
          setRealtimeTrends(response.data);
        }
      }
    } catch (error) {
      console.error('Error loading trends:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddToTrack(keyword: string) {
    try {
      setAddingKeyword(keyword);
      await createKeyword(keyword);
      alert(`Added "${keyword}" to tracking!`);
    } catch (error) {
      console.error('Error adding keyword:', error);
      alert('Failed to add keyword');
    } finally {
      setAddingKeyword(null);
    }
  }

  async function handleDiscoverCategory(categoryId: string) {
    try {
      setDiscoveringCategory(categoryId);
      const response = await fetch(`/api/trends/discover/${categoryId}`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        alert(`Discovered ${data.count} keywords in this category!`);
      } else {
        alert('Failed to discover keywords');
      }
    } catch (error) {
      console.error('Error discovering keywords:', error);
      alert('Failed to discover keywords');
    } finally {
      setDiscoveringCategory(null);
    }
  }

  const regions = [
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'JP', name: 'Japan' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Trends & Niche Discovery</h1>
        <p className="text-gray-600 mt-1">Discover trending topics and niche long-tail keywords</p>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Tabs */}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setActiveTab('niche')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'niche'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Niche Categories
          </button>
          <button
            onClick={() => setActiveTab('daily')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'daily'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Daily Trends
          </button>
          <button
            onClick={() => setActiveTab('realtime')}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'realtime'
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            Real-time Trends
          </button>
        </div>

        {/* Region selector - only show for non-niche tabs */}
        {activeTab !== 'niche' && (
          <select
            value={geo}
            onChange={(e) => setGeo(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            {regions.map((region) => (
              <option key={region.code} value={region.code}>
                {region.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content */}
      {activeTab === 'niche' ? (
        <NicheCategoriesView
          categories={categories}
          onDiscover={handleDiscoverCategory}
          discoveringCategory={discoveringCategory}
        />
      ) : loading ? (
        <LoadingSpinner />
      ) : activeTab === 'daily' ? (
        <DailyTrendsView
          trends={dailyTrends}
          onAddToTrack={handleAddToTrack}
          addingKeyword={addingKeyword}
        />
      ) : (
        <RealtimeTrendsView
          trends={realtimeTrends}
          onAddToTrack={handleAddToTrack}
          addingKeyword={addingKeyword}
        />
      )}
    </div>
  );
}

function NicheCategoriesView({
  categories,
  onDiscover,
  discoveringCategory,
}: {
  categories: NicheCategory[];
  onDiscover: (categoryId: string) => void;
  discoveringCategory: string | null;
}) {
  const categoryIcons: Record<string, string> = {
    lifestyle: '🌿',
    health: '💪',
    home: '🏠',
    hobby: '🎨',
    finance: '💰',
    education: '📚',
    travel: '✈️',
    pets: '🐾',
    tech: '💻',
  };

  const categoryDescriptions: Record<string, string> = {
    lifestyle: 'Minimalism, slow living, sustainable choices',
    health: 'Wellness, sleep, posture, nutrition',
    home: 'Organization, cleaning, DIY fixes',
    hobby: 'Crafts, photography, journaling, gardening',
    finance: 'Budgeting, saving, side hustles',
    education: 'Learning techniques, courses, studying',
    travel: 'Solo travel, packing, remote work',
    pets: 'Pet care, training, behavior issues',
    tech: 'Device issues, smart home, troubleshooting',
  };

  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h3 className="font-semibold text-green-800">Find Niche Long-tail Keywords</h3>
        <p className="text-sm text-green-700 mt-1">
          These categories contain specific user problems and needs with lower competition.
          Click "Discover" to add all keywords from a category to your tracking list.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((category) => (
          <div
            key={category.id}
            className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{categoryIcons[category.id] || '📌'}</span>
                <div>
                  <h3 className="font-semibold text-gray-900">{category.name}</h3>
                  <p className="text-sm text-gray-500">{category.count} keywords</p>
                </div>
              </div>
            </div>
            
            <p className="text-sm text-gray-600 mt-3">
              {categoryDescriptions[category.id] || 'Niche keywords in this category'}
            </p>
            
            <button
              onClick={() => onDiscover(category.id)}
              disabled={discoveringCategory !== null}
              className="mt-4 w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {discoveringCategory === category.id ? 'Discovering...' : 'Discover Keywords'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyTrendsView({
  trends,
  onAddToTrack,
  addingKeyword,
}: {
  trends: DailyTrendItem[];
  onAddToTrack: (keyword: string) => void;
  addingKeyword: string | null;
}) {
  if (trends.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <p className="text-gray-500">No daily trends available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {trends.map((trend, index) => (
        <div
          key={index}
          className="bg-white rounded-lg border border-gray-200 p-4 card-hover"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="flex-shrink-0 w-8 h-8 bg-primary-100 text-primary-700 rounded-full flex items-center justify-center font-medium">
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold text-gray-900">{trend.title}</h3>
                  <p className="text-sm text-gray-500">{trend.formattedTraffic} searches</p>
                </div>
              </div>

              {/* Related queries */}
              {trend.relatedQueries.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {trend.relatedQueries.slice(0, 5).map((query, i) => (
                    <button
                      key={i}
                      onClick={() => onAddToTrack(query)}
                      disabled={addingKeyword === query}
                      className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 disabled:opacity-50"
                    >
                      {query}
                    </button>
                  ))}
                </div>
              )}

              {/* Articles */}
              {trend.articles.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 mb-1">Related articles:</p>
                  <div className="space-y-1">
                    {trend.articles.slice(0, 2).map((article, i) => (
                      <a
                        key={i}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-sm text-primary-600 hover:text-primary-700 truncate"
                      >
                        {article.title}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => onAddToTrack(trend.title)}
              disabled={addingKeyword === trend.title}
              className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {addingKeyword === trend.title ? 'Adding...' : 'Track'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RealtimeTrendsView({
  trends,
  onAddToTrack,
  addingKeyword,
}: {
  trends: string[];
  onAddToTrack: (keyword: string) => void;
  addingKeyword: string | null;
}) {
  if (trends.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <p className="text-gray-500">No real-time trends available.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
      {trends.map((topic, index) => (
        <div
          key={index}
          className="flex items-center justify-between p-4 hover:bg-gray-50"
        >
          <div className="flex items-center gap-3">
            <span className="flex-shrink-0 w-8 h-8 bg-red-100 text-red-700 rounded-full flex items-center justify-center text-sm font-medium">
              {index + 1}
            </span>
            <span className="font-medium text-gray-900">{topic}</span>
          </div>
          <button
            onClick={() => onAddToTrack(topic)}
            disabled={addingKeyword === topic}
            className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {addingKeyword === topic ? 'Adding...' : 'Track'}
          </button>
        </div>
      ))}
    </div>
  );
}
