'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { TOUR_STEPS, type TourStep } from '@/lib/tourSteps';
import { TOUR_COMPLETED_KEY, TOUR_START_EVENT } from '@/lib/useTour';

// Interactive product tour engine.
//
// Mounting model:
//   - Mounted once at the root layout level.
//   - On first paint, decides whether to auto-launch (first visit, on `/`,
//     no `?notour=1`) or wait for a `finops:start-tour` custom event.
//
// State persistence:
//   - Completion flag in localStorage (`finops:tour-completed-v1`) — so a
//     finished/skipped tour never re-auto-launches.
//   - Active step + active flag in sessionStorage so a navigation between
//     steps doesn't reset the tour when this component remounts.
//
// Rendering:
//   - Inactive => returns null. No DOM cost when nothing is happening.
//   - Active with selector => fullscreen overlay + spotlight + popover
//     placed against the target rect.
//   - Active without selector (or selector not found) => centered modal.
//   - Mobile narrow viewports (< 640px) always render as a bottom-sheet.
//
// Spotlight is implemented with a single positioned `<div>` carrying a
// huge outward `box-shadow` — everything outside the rect is dimmed by
// the shadow, no SVG mask required.

const SESSION_STEP_KEY = 'finops:tour-step';
const SESSION_ACTIVE_KEY = 'finops:tour-active';
const AUTOLAUNCH_DELAY_MS = 1500;
const TARGET_WAIT_MS = 2000;
const TARGET_POLL_MS = 80;
const MOBILE_BREAKPOINT_PX = 640;
const POPOVER_WIDTH_PX = 360;
const POPOVER_GAP_PX = 16;
const VIEWPORT_PADDING_PX = 16;

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readSessionStep(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.sessionStorage.getItem(SESSION_STEP_KEY);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 && n < TOUR_STEPS.length ? n : 0;
  } catch {
    return 0;
  }
}

function readSessionActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(SESSION_ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSession(active: boolean, step: number): void {
  if (typeof window === 'undefined') return;
  try {
    if (active) {
      window.sessionStorage.setItem(SESSION_ACTIVE_KEY, '1');
      window.sessionStorage.setItem(SESSION_STEP_KEY, String(step));
    } else {
      window.sessionStorage.removeItem(SESSION_ACTIVE_KEY);
      window.sessionStorage.removeItem(SESSION_STEP_KEY);
    }
  } catch {
    // sessionStorage can be unavailable — silently ignore.
  }
}

function isCompletedSync(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TOUR_COMPLETED_KEY) === '1';
  } catch {
    return false;
  }
}

function markCompletedSync(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TOUR_COMPLETED_KEY, '1');
  } catch {
    // ignore
  }
}

/** Compute popover position from a target rect, clamping to the viewport. */
function placePopover(
  rect: TargetRect,
  anchor: TourStep['anchor'],
  popoverHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { top: number; left: number } {
  const prefer = anchor ?? 'bottom';
  let top = 0;
  let left = 0;

  switch (prefer) {
    case 'top':
      top = rect.top - popoverHeight - POPOVER_GAP_PX;
      left = rect.left + rect.width / 2 - POPOVER_WIDTH_PX / 2;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      left = rect.left - POPOVER_WIDTH_PX - POPOVER_GAP_PX;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - popoverHeight / 2;
      left = rect.left + rect.width + POPOVER_GAP_PX;
      break;
    case 'bottom':
    default:
      top = rect.top + rect.height + POPOVER_GAP_PX;
      left = rect.left + rect.width / 2 - POPOVER_WIDTH_PX / 2;
      break;
  }

  // If the preferred side would push the popover off-screen, flip vertically.
  if (top + popoverHeight > viewportHeight - VIEWPORT_PADDING_PX) {
    top = Math.max(VIEWPORT_PADDING_PX, rect.top - popoverHeight - POPOVER_GAP_PX);
  }
  if (top < VIEWPORT_PADDING_PX) {
    top = Math.min(
      viewportHeight - popoverHeight - VIEWPORT_PADDING_PX,
      rect.top + rect.height + POPOVER_GAP_PX,
    );
  }

  // Clamp horizontally.
  left = Math.max(
    VIEWPORT_PADDING_PX,
    Math.min(left, viewportWidth - POPOVER_WIDTH_PX - VIEWPORT_PADDING_PX),
  );
  top = Math.max(VIEWPORT_PADDING_PX, top);

  return { top, left };
}

export function Tour() {
  const router = useRouter();
  const pathname = usePathname();

  // Active state + current step. Initialized in an effect to avoid SSR/
  // hydration mismatch — both sessionStorage and localStorage are
  // client-only.
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Target rect of the currently-spotlighted element, in viewport coords.
  // `null` means we're falling back to a centered modal (either the step
  // has no selector, or the selector didn't resolve in time).
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Refs for layout measurement of the popover (used to keep it on-screen).
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  const step: TourStep | undefined = active ? TOUR_STEPS[stepIndex] : undefined;
  const totalSteps = TOUR_STEPS.length;

  // -- Lifecycle: hydrate from session, decide whether to auto-launch. --

  useEffect(() => {
    setHydrated(true);

    const wasActive = readSessionActive();
    const persistedStep = readSessionStep();

    if (wasActive) {
      // We're in the middle of a tour — resume.
      setActive(true);
      setStepIndex(persistedStep);
      return;
    }

    // First-visit auto-launch: only on `/`, only if not completed, and
    // not when the visitor opted out with ?notour=1.
    if (typeof window === 'undefined') return;
    if (isCompletedSync()) return;
    if (window.location.pathname !== '/') return;
    if (new URLSearchParams(window.location.search).get('notour') === '1') return;

    const t = window.setTimeout(() => {
      setActive(true);
      setStepIndex(0);
      writeSession(true, 0);
    }, AUTOLAUNCH_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  // -- Mobile detection. --

  useEffect(() => {
    function check() {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT_PX);
    }
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // -- External triggers: start + close events. --

  useEffect(() => {
    function onStart() {
      setActive(true);
      setStepIndex(0);
      writeSession(true, 0);
    }
    function onClose() {
      setActive(false);
      writeSession(false, 0);
    }
    window.addEventListener(TOUR_START_EVENT, onStart);
    window.addEventListener('finops:close-tour', onClose);
    return () => {
      window.removeEventListener(TOUR_START_EVENT, onStart);
      window.removeEventListener('finops:close-tour', onClose);
    };
  }, []);

  // -- Persist current step whenever it changes (so navigation resumes). --

  useEffect(() => {
    if (!hydrated) return;
    writeSession(active, stepIndex);
  }, [hydrated, active, stepIndex]);

  // -- On step change: navigate to the step's path if not already there. --

  useEffect(() => {
    if (!active || !step) return;
    if (pathname !== step.path) {
      router.push(step.path);
    }
  }, [active, step, pathname, router]);

  // -- Resolve the target element after navigation completes. --
  //
  // We poll briefly because the destination page's elements may not be in
  // the DOM yet on first paint. If the selector doesn't resolve within
  // TARGET_WAIT_MS we fall back to a centered modal. We also re-measure
  // on resize and scroll to keep the spotlight + popover aligned.

  useEffect(() => {
    if (!active || !step) {
      setTargetRect(null);
      return;
    }
    if (!step.selector || pathname !== step.path) {
      setTargetRect(null);
      return;
    }

    let cancelled = false;
    let resolved: HTMLElement | null = null;
    let pollHandle: number | null = null;
    const start = Date.now();

    function measure(el: HTMLElement) {
      const r = el.getBoundingClientRect();
      setTargetRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    }

    function tryResolve() {
      if (cancelled) return;
      const sel = step?.selector;
      if (!sel) return;
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) {
        resolved = el;
        // Scroll the element into view before measuring, so the rect is
        // valid in the new scroll position.
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Wait one frame so the smooth-scroll has started and getBoundingClientRect
        // returns something reasonable.
        requestAnimationFrame(() => {
          if (cancelled) return;
          measure(el);
        });
        return;
      }
      if (Date.now() - start > TARGET_WAIT_MS) {
        // Couldn't find the element — fall back to centered modal.
        setTargetRect(null);
        return;
      }
      pollHandle = window.setTimeout(tryResolve, TARGET_POLL_MS);
    }

    tryResolve();

    function onViewportChange() {
      if (resolved) measure(resolved);
    }
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);

    return () => {
      cancelled = true;
      if (pollHandle !== null) window.clearTimeout(pollHandle);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [active, step, pathname]);

  // -- Compute popover position from the resolved target rect. --

  useLayoutEffect(() => {
    if (!active || !step) {
      setPopoverPos(null);
      return;
    }
    if (isMobile) {
      // Mobile bottom-sheet — popover position is irrelevant.
      setPopoverPos(null);
      return;
    }
    if (!targetRect) {
      // Centered modal — popover position is irrelevant.
      setPopoverPos(null);
      return;
    }
    const popoverHeight = popoverRef.current?.offsetHeight ?? 200;
    setPopoverPos(
      placePopover(
        targetRect,
        step.anchor,
        popoverHeight,
        window.innerWidth,
        window.innerHeight,
      ),
    );
  }, [active, step, targetRect, isMobile]);

  // -- Imperative controls. --

  const finish = useCallback(() => {
    markCompletedSync();
    setActive(false);
    writeSession(false, 0);
  }, []);

  const next = useCallback(() => {
    if (stepIndex >= totalSteps - 1) {
      finish();
      return;
    }
    setStepIndex(stepIndex + 1);
  }, [stepIndex, totalSteps, finish]);

  const back = useCallback(() => {
    if (stepIndex <= 0) return;
    setStepIndex(stepIndex - 1);
  }, [stepIndex]);

  // -- Keyboard shortcuts. --

  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, finish, next, back]);

  // -- Render. --

  if (!hydrated || !active || !step) return null;

  const showSpotlight = !isMobile && targetRect !== null;
  const isLastStep = stepIndex === totalSteps - 1;

  return (
    <div
      aria-hidden={false}
      role="dialog"
      aria-label={`Product tour: ${step.title}`}
      aria-modal="true"
      className="fixed inset-0 z-[100] pointer-events-none"
    >
      {/* Backdrop / spotlight layer. */}
      {showSpotlight && targetRect ? (
        <div
          className="absolute pointer-events-auto transition-all duration-300 ease-out"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            borderRadius: 18,
            boxShadow:
              '0 0 0 9999px rgba(7, 8, 16, 0.85), 0 0 0 2px rgba(167, 139, 250, 0.6), 0 0 40px -5px rgba(139, 92, 246, 0.6)',
          }}
          onClick={finish}
        />
      ) : (
        // No spotlight => simple full backdrop.
        <div
          className="absolute inset-0 bg-bg/85 backdrop-blur-sm pointer-events-auto transition-opacity duration-300"
          onClick={finish}
        />
      )}

      {/* Popover / modal. */}
      {isMobile ? (
        <div
          ref={popoverRef}
          className="absolute left-0 right-0 bottom-0 pointer-events-auto"
        >
          <PopoverContent
            step={step}
            stepIndex={stepIndex}
            totalSteps={totalSteps}
            isLast={isLastStep}
            onNext={next}
            onBack={back}
            onSkip={finish}
            variant="sheet"
          />
        </div>
      ) : targetRect && popoverPos ? (
        <div
          ref={popoverRef}
          className="absolute pointer-events-auto"
          style={{
            top: popoverPos.top,
            left: popoverPos.left,
            width: POPOVER_WIDTH_PX,
            transition: 'top 200ms ease-out, left 200ms ease-out, opacity 200ms ease-out',
          }}
        >
          <PopoverContent
            step={step}
            stepIndex={stepIndex}
            totalSteps={totalSteps}
            isLast={isLastStep}
            onNext={next}
            onBack={back}
            onSkip={finish}
            variant="popover"
          />
        </div>
      ) : (
        <div
          ref={popoverRef}
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
        >
          <div
            className="pointer-events-auto"
            style={{ width: Math.min(POPOVER_WIDTH_PX + 40, window.innerWidth - 32) }}
          >
            <PopoverContent
              step={step}
              stepIndex={stepIndex}
              totalSteps={totalSteps}
              isLast={isLastStep}
              onNext={next}
              onBack={back}
              onSkip={finish}
              variant="modal"
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface PopoverContentProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  variant: 'popover' | 'modal' | 'sheet';
}

function PopoverContent({
  step,
  stepIndex,
  totalSteps,
  isLast,
  onNext,
  onBack,
  onSkip,
  variant,
}: PopoverContentProps) {
  const isFirst = stepIndex === 0;

  // Use the same brand-gradient border + glassmorphism background as the
  // rest of the app for visual consistency.
  const containerBase =
    'relative bg-panel/95 backdrop-blur-xl border border-borderBright shadow-card-hover';
  const containerByVariant: Record<typeof variant, string> = {
    popover: `${containerBase} rounded-2xl p-5 fade-up`,
    modal: `${containerBase} rounded-2xl p-6 fade-up`,
    sheet: `${containerBase} rounded-t-3xl rounded-b-none p-5 pb-7 border-b-0 fade-up`,
  };

  return (
    <div className={containerByVariant[variant]}>
      {/* Gradient accent strip along the top edge for the brand feel. */}
      <div
        className="absolute top-0 left-4 right-4 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.6) 30%, rgba(34,211,238,0.6) 70%, transparent 100%)',
        }}
        aria-hidden
      />

      <div className="flex items-center justify-between mb-3">
        <span className="chip chip-brand">
          <span className="w-1.5 h-1.5 rounded-full bg-brand pulse-glow" aria-hidden />
          Tour
        </span>
        <span className="text-[11px] uppercase tracking-wider text-muted font-semibold tabular-nums">
          Step {stepIndex + 1} of {totalSteps}
        </span>
      </div>

      <h3 className="text-base font-semibold tracking-tight gradient-text mb-2">
        {step.title}
      </h3>
      <p className="text-sm text-inkDim leading-relaxed">{step.body}</p>

      {/* Progress bar. */}
      <div className="mt-4 mb-4 w-full h-1 bg-panel2 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-gradient transition-all duration-300 ease-out"
          style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onSkip}
          className="btn-ghost text-xs"
          aria-label="Skip the tour"
        >
          Skip tour
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            disabled={isFirst}
            className="btn text-xs disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Previous step"
          >
            <span aria-hidden>←</span> Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="btn-primary text-xs"
            aria-label={isLast ? 'Finish the tour' : 'Next step'}
          >
            {isLast ? 'Done' : 'Next'} <span aria-hidden>{isLast ? '' : '→'}</span>
          </button>
        </div>
      </div>

      <div className="mt-3 text-[10px] text-muted text-center tracking-wide">
        Esc to skip · ← → to navigate
      </div>
    </div>
  );
}
