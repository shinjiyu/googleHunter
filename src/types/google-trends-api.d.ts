declare module 'google-trends-api' {
  interface TrendsOptions {
    keyword?: string;
    keywords?: string[];
    geo?: string;
    startTime?: Date;
    endTime?: Date;
    category?: number | string;
  }

  interface DailyTrendsOptions {
    geo?: string;
    trendDate?: Date;
  }

  interface RealTimeTrendsOptions {
    geo?: string;
    category?: string;
  }

  const googleTrends: {
    interestOverTime(options: TrendsOptions): Promise<string>;
    interestByRegion(options: TrendsOptions): Promise<string>;
    relatedQueries(options: TrendsOptions): Promise<string>;
    relatedTopics(options: TrendsOptions): Promise<string>;
    dailyTrends(options: DailyTrendsOptions): Promise<string>;
    realTimeTrends(options: RealTimeTrendsOptions): Promise<string>;
  };

  export default googleTrends;
}
