export type CpmEstimate = {
  low: number;
  high: number;
  label: string;
};

export const getCpmEstimate = (categoryId: string):CpmEstimate => {
  const cpmMap: Record<string, CpmEstimate> = {
    '20': { low: 3, high: 9, label: 'Gaming' },
    '27': { low: 2, high: 6, label: 'Education' },
    '24': { low: 1, high: 4, label: 'Entertainment' },
    '28': { low: 8, high: 20, label: 'Tech/Science' },
    '22': { low: 2, high: 5, label: 'People & Blogs' },
    'default': { low: 2, high: 5, label: 'General' }
  };
  const estimate = cpmMap[categoryId];
  return estimate ?? cpmMap['default']!;
};

// Convert YouTube duration (PT15M33S) to minutes
export const parseDurationToMinutes = (duration: string): number => {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;
  const hours = parseInt((match[1] || '').replace('H', '')) || 0;
  const minutes = parseInt((match[2] || '').replace('M', '')) || 0;
  const seconds = parseInt((match[3] || '').replace('S', '')) || 0;
  return (hours * 60) + minutes + (seconds / 60);
};

// Calculate frequency of words in titles for SEO insights
export const extractCommonWords = (titles: string[], excludeWord: string): string[] => {
  const stopWords = ['the', 'and', 'for', 'with', 'how', 'what', 'you', 'this', 'that', 'video', 'from', 'your', 'guide', '2024', '2025'];
  const allWords = titles
    .join(' ')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/);

  const wordFreq: Record<string, number> = {};
  allWords.forEach(w => {
    if (w.length > 3 && !stopWords.includes(w) && w !== excludeWord.toLowerCase()) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  });

  return Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(x => x[0]);
};