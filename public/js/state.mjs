// Shared UI state. The worker owns the listening history; the page only keeps the latest stats.
export const state = {
  view: 'overview',
  stats: null,
  isDemo: true,
  files: [],
  busy: false,
  filters: { year: 'all', minimum: 30000, utc: false },
  timelineMetric: 'ms',
  calendarYear: null,
  tracks: { search: '', sort: 'ms', page: 0 }
};

export const periodLabel = () => state.filters.year === 'all' ? 'all time' : String(state.filters.year);
