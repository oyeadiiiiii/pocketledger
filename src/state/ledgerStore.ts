import { useSyncExternalStore } from 'react';

let version = 0;
const listeners = new Set<() => void>();

/** Call after any database change so every visible screen re-reads its data. */
export function bumpLedger(): void {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLedgerVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}