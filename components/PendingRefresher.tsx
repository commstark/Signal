'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// /today is a server component. When an entry is still parsing we poll the
// server so its dot flips orange -> green on its own. Mounts (and polls)
// only while something is pending.
export function PendingRefresher({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
