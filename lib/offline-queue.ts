'use client';

import { openDB, type IDBPDatabase } from 'idb';

interface QueuedItem {
  id: string;
  blob: Blob;
  mimeType: string;
  occurredAt: string;
  createdAt: number;
}

const DB_NAME = 'signal';
const STORE = 'capture-queue';

async function db(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      if (!d.objectStoreNames.contains(STORE)) {
        d.createObjectStore(STORE, { keyPath: 'id' });
      }
    },
  });
}

export async function enqueueCapture(item: Omit<QueuedItem, 'createdAt'>) {
  const d = await db();
  await d.put(STORE, { ...item, createdAt: Date.now() });
}

export async function listQueued(): Promise<QueuedItem[]> {
  const d = await db();
  return (await d.getAll(STORE)) as QueuedItem[];
}

export async function removeQueued(id: string) {
  const d = await db();
  await d.delete(STORE, id);
}

// Upload a queued item: POST to /api/transcribe, then /api/parse.
export async function flushQueuedItem(item: QueuedItem) {
  const form = new FormData();
  form.append('audio', new File([item.blob], `queued.${extFor(item.mimeType)}`, { type: item.mimeType }));
  const tx = await fetch('/api/transcribe', { method: 'POST', body: form });
  if (!tx.ok) throw new Error(`transcribe failed: ${tx.status}`);
  const t = (await tx.json()) as { transcript: string; audio_url: string | null; audio_duration_s: number | null };

  const px = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript: t.transcript,
      audio_url: t.audio_url,
      audio_duration_s: t.audio_duration_s,
      occurred_at: item.occurredAt,
    }),
  });
  if (!px.ok) throw new Error(`parse failed: ${px.status}`);
  return await px.json();
}

function extFor(mime: string) {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('mpeg')) return 'mp3';
  return 'webm';
}

export async function flushAll() {
  const items = await listQueued();
  for (const item of items) {
    try {
      await flushQueuedItem(item);
      await removeQueued(item.id);
    } catch (e) {
      console.error('flush failed for', item.id, e);
      // Stop on first failure so we keep ordering and retry next time.
      break;
    }
  }
}
