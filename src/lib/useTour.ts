'use client';
import { useCallback } from 'react';

// Lightweight imperative bridge for the guided tour.
//
// The Tour component is mounted once at the root layout level and listens
// for two things: a custom `finops:start-tour` event (re-launch from
// anywhere) and a localStorage flag `finops:tour-completed-v1` (so a
// fresh visitor sees the tour exactly once, on `/`).
//
// This hook exposes the same primitives to any client component that
// wants to drive the tour without importing Tour itself — avoiding a
// circular dependency and keeping the contract narrow.

export const TOUR_COMPLETED_KEY = 'finops:tour-completed-v1';
export const TOUR_START_EVENT = 'finops:start-tour';

function safeReadCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(TOUR_COMPLETED_KEY) === '1';
  } catch {
    return false;
  }
}

function safeWriteCompleted(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(TOUR_COMPLETED_KEY, '1');
    else window.localStorage.removeItem(TOUR_COMPLETED_KEY);
  } catch {
    // localStorage can be unavailable in sandboxed contexts — ignore.
  }
}

export interface UseTour {
  /** Open the tour from step 0, regardless of completion state. */
  startTour: () => void;
  /** Close the tour and mark it complete so it never auto-launches again. */
  skipTour: () => void;
  /** Mark the tour as completed without changing visibility. */
  markCompleted: () => void;
  /** Read the persisted completion flag. */
  isCompleted: () => boolean;
}

export function useTour(): UseTour {
  const startTour = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(TOUR_START_EVENT));
  }, []);

  const skipTour = useCallback(() => {
    safeWriteCompleted(true);
    if (typeof window === 'undefined') return;
    // Tell the active tour instance (if any) to close. The Tour component
    // owns its own close logic; we just persist the completion flag here.
    window.dispatchEvent(new CustomEvent('finops:close-tour'));
  }, []);

  const markCompleted = useCallback(() => {
    safeWriteCompleted(true);
  }, []);

  const isCompleted = useCallback(() => safeReadCompleted(), []);

  return { startTour, skipTour, markCompleted, isCompleted };
}
