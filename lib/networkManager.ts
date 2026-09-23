import { useState, useEffect } from 'react';

export interface NetworkState {
  isOnline: boolean;
  isSlow: boolean;
  latencyMs: number;
  lastChecked: number;
}

let currentState: NetworkState = {
  isOnline: true,
  isSlow: false,
  latencyMs: 0,
  lastChecked: Date.now(),
};

const listeners = new Set<(state: NetworkState) => void>();

function notify() {
  listeners.forEach(cb => cb(currentState));
}

/**
 * Fast ping to test internet connectivity and latency
 */
export async function checkConnectivity(timeoutMs: number = 3000): Promise<NetworkState> {
  const startTime = Date.now();
  const endpoints = [
    'https://connectivitycheck.gstatic.com/generate_204',
    'https://www.google.com/generate_204',
    'https://backend-zeta-two-93.vercel.app/api/health',
  ];

  let success = false;
  let latency = 0;

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        headers: { 'Cache-Control': 'no-cache, no-store' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok || res.status === 204 || res.status === 200) {
        latency = Date.now() - startTime;
        success = true;
        break;
      }
    } catch {
      // Try next endpoint
    }
  }

  const isOnline = success;
  const isSlow = isOnline && latency > 2200;

  currentState = {
    isOnline,
    isSlow,
    latencyMs: latency,
    lastChecked: Date.now(),
  };

  notify();
  return currentState;
}

/**
 * Call when an app-level API fetch fails with network error
 */
export function reportNetworkError() {
  currentState = {
    ...currentState,
    isOnline: false,
    lastChecked: Date.now(),
  };
  notify();
  // Trigger re-check in background after 3 seconds
  setTimeout(() => checkConnectivity(2500), 3000);
}

/**
 * Call when an app-level API fetch succeeds
 */
export function reportNetworkSuccess(durationMs?: number) {
  const isSlow = typeof durationMs === 'number' ? durationMs > 2500 : false;
  if (!currentState.isOnline || currentState.isSlow !== isSlow) {
    currentState = {
      isOnline: true,
      isSlow,
      latencyMs: durationMs || currentState.latencyMs,
      lastChecked: Date.now(),
    };
    notify();
  }
}

/**
 * React hook to listen for online / offline / slow network state
 */
export function useNetworkStatus(): NetworkState {
  const [state, setState] = useState<NetworkState>(currentState);

  useEffect(() => {
    setState(currentState);
    const cb = (s: NetworkState) => setState({ ...s });
    listeners.add(cb);

    // Initial check
    checkConnectivity();

    // Periodic heartbeat every 20 seconds
    const interval = setInterval(() => {
      checkConnectivity();
    }, 20000);

    return () => {
      listeners.delete(cb);
      clearInterval(interval);
    };
  }, []);

  return state;
}

export function getNetworkState(): NetworkState {
  return currentState;
}
