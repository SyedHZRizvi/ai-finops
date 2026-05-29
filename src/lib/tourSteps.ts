// Step definitions for the interactive product tour.
//
// Each step describes a single panel of the guided walkthrough: the route
// to be on, an optional CSS selector to highlight, a popover anchor side,
// and the copy that appears inside the popover. The Tour component reads
// this list and drives navigation, spotlight rendering, and copy in order.
//
// Keep selectors stable and conservative — they target structural classes
// that already exist on the corresponding pages, so adding/removing a step
// here is the only place tour copy or coverage should ever change.

export interface TourStep {
  /** Stable identifier for analytics / testing. */
  id: string;
  /** Route the tour should navigate to before rendering this step. */
  path: string;
  /**
   * CSS selector for the element to spotlight. Omit for a centered modal.
   * If the selector matches nothing within ~2s of arriving on `path`,
   * the step falls back to a centered modal automatically.
   */
  selector?: string;
  /** Popover headline. */
  title: string;
  /** 1-3 sentence explanation of what the user is looking at. */
  body: string;
  /** Side of the target the popover prefers to render on. */
  anchor?: 'top' | 'bottom' | 'left' | 'right';
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    path: '/',
    title: 'Welcome to AI FinOps',
    body: 'AI FinOps tracks every LLM call, classifies it, and tells you exactly how to spend less. Take the 90-second tour?',
  },
  {
    id: 'dashboard-hero',
    path: '/',
    // .hero is rendered by SavingsHighlight on the dashboard once data is
    // present. When the dashboard is empty (no data yet) the selector won't
    // match and the step renders as a centered modal — that's intentional.
    selector: '.hero',
    anchor: 'bottom',
    title: 'Top-line savings',
    body: 'Here it is at a glance: how much you spent and how much we think you can save. Every page in the tour is in service of moving this number down.',
  },
  {
    id: 'insights',
    path: '/insights',
    title: 'Insights — why the bill is what it is',
    body: 'Root causes for your spend plus ranked actions to reduce it. Read this before opening Slack — model mismatches, output bloat, redundancy clusters, all surfaced with dollar impact.',
  },
  {
    id: 'optimizer',
    path: '/optimizer',
    // OptimizerForm renders its input panel as a <form class="card card-pad">.
    selector: 'form.card.card-pad',
    anchor: 'right',
    title: 'Optimizer — leaner prompts on demand',
    body: 'Paste any prompt and get a tighter rewrite with token-count and dollar-savings estimates. No data, no setup — works on its own.',
  },
  {
    id: 'studio',
    path: '/studio',
    title: 'Studio — build prompts from scratch',
    body: 'Generate optimized prompts tuned per LLM. Pick a model, describe the goal, get a ready-to-paste prompt designed to be cheap and effective.',
  },
  {
    id: 'prompts',
    path: '/prompts',
    title: 'Prompts — every logged call',
    body: 'A searchable, filterable log of every AI call you have routed through AI FinOps. Click any row to drill in: full prompt, response, tokens, cost, suggestions.',
  },
  {
    id: 'budget',
    path: '/budget',
    title: 'Budget — caps and alerts',
    body: 'Set monthly caps per app, model, or globally. Get webhook alerts at 75%, 90%, and 100% so the bill never blindsides you.',
  },
  {
    id: 'anomaly',
    path: '/anomaly',
    title: 'Alerts — real-time anomaly detection',
    body: 'When spend spikes, a model gets stuck in a loop, or output sizes balloon — you hear about it here, immediately.',
  },
  {
    id: 'connectors',
    path: '/import',
    title: 'Connectors — import historical usage',
    body: 'Connect Anthropic, OpenAI, and others to import past usage. Skip this if you only want to track new calls via the SDK.',
  },
  {
    id: 'done',
    path: '/',
    title: 'That is the tour',
    body: 'You have seen the whole product. Try demo mode in /settings to see the dashboard fully populated with synthetic data — then come back and connect your real provider when you are ready.',
  },
];
