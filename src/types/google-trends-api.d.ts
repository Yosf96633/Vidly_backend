// google-trends-api.d.ts
declare module 'google-trends-api' {
  interface InterestOverTimeOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
    granularTimeResolution?: boolean;
  }

  interface RelatedQueriesOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
  }

  interface InterestByRegionOptions {
    keyword: string | string[];
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    hl?: string;
    timezone?: number;
    category?: number;
    resolution?: string;
  }

  const googleTrends: {
    interestOverTime: (options: InterestOverTimeOptions) => Promise<string>;
    relatedQueries: (options: RelatedQueriesOptions) => Promise<string>;
    interestByRegion: (options: InterestByRegionOptions) => Promise<string>;
  };

  export default googleTrends;
}