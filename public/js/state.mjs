// Shared UI state. The worker owns the listening history; the page only keeps the latest stats.
export const state = {
  ready: false,      // the worker has opened storage
  page: 'home',      // 'home' or 'app'
  mode: null,        // which library the dashboard shows: 'demo' or 'library'
  isDemo: true,
  library: null,     // summary of the imported library, if there is one
  teaser: null,      // a few facts about the sample, for the homepage
  view: 'overview',
  stats: null,
  busy: false,
  filters: { year: 'all', minimum: 30000, utc: false },
  timelineMetric: 'ms',
  calendarYear: null,
  tracks: { search: '', sort: 'ms', page: 0 }
};

export const periodLabel = () => state.filters.year === 'all' ? 'all time' : String(state.filters.year);
// Links inside the dashboard stay in whichever library you're looking at.
export const viewHref = view => `#/${state.isDemo ? 'demo/' : ''}${view}`;
