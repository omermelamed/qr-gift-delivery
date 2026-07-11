'use client'

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(callback: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot() {
  // SSR/hydration default: assume motion is fine. Matches this file's other
  // components, which always render the full (non-reduced) markup and only
  // pare it back once the browser's real preference is known.
  return false
}

// Render-safe way to read prefers-reduced-motion. Deliberately not a
// useState-set-from-an-effect or a ref read during render — both are
// disallowed by this project's lint rules for driving render output.
// useSyncExternalStore is the correct primitive for external, client-only
// state that render itself needs to branch on.
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
