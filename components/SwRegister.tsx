'use client';

import { useEffect } from 'react';

export function SwRegister() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.warn('sw register failed', e);
    });
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'flush-queue') {
        import('@/lib/offline-queue').then(({ flushAll }) => flushAll().catch(() => {}));
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);
  return null;
}
