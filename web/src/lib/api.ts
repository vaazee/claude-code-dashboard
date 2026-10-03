import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type {
  Analytics,
  ConfigBundle,
  HistoryEntry,
  Inventory,
  Overview,
  ProjectInfo,
  ServerEvent,
  SessionDetail,
  SessionSummary,
  Transcript,
} from '@shared/types.ts';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json() as Promise<T>;
}

export async function post<T = { ok: boolean; error?: string }>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-ccdash': '1' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${res.status} ${res.statusText}`);
  return data;
}

export const useOverview = () => useQuery({ queryKey: ['overview'], queryFn: () => get<Overview>('/overview') });
export const useSessions = () => useQuery({ queryKey: ['sessions'], queryFn: () => get<SessionSummary[]>('/sessions') });
export const useSession = (id: string) =>
  useQuery({ queryKey: ['session', id], queryFn: () => get<SessionDetail>(`/sessions/${id}`) });
export const useTranscript = (id: string, agent?: string | null) =>
  useQuery({
    queryKey: ['transcript', id, agent ?? null],
    queryFn: () => get<Transcript>(`/sessions/${id}/transcript${agent ? `?agent=${agent}` : ''}`),
  });
export const useAnalytics = (days: string) =>
  useQuery({ queryKey: ['analytics', days], queryFn: () => get<Analytics>(`/analytics?days=${days}`) });
export const useProjects = () => useQuery({ queryKey: ['projects'], queryFn: () => get<ProjectInfo[]>('/projects') });
export const useInventory = () => useQuery({ queryKey: ['inventory'], queryFn: () => get<Inventory>('/inventory') });
export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: () => get<ConfigBundle>('/config') });
export const useHistory = (q: string) =>
  useQuery({
    queryKey: ['history', q],
    queryFn: () => get<{ entries: HistoryEntry[]; total: number }>(`/history?q=${encodeURIComponent(q)}&limit=400`),
    placeholderData: (prev) => prev,
  });

/** Subscribe to server pushes and invalidate exactly the queries that changed. */
export function useLiveEvents(): boolean {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout>;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const touched = new Set<string>();
    const flush = () => {
      timer = undefined;
      for (const key of touched) qc.invalidateQueries({ queryKey: key.split('|').filter(Boolean) });
      touched.clear();
    };
    const touch = (...keys: string[][]) => {
      keys.forEach((k) => touched.add(k.join('|')));
      timer ??= setTimeout(flush, 400);
    };
    const connect = () => {
      es = new EventSource('/api/events');
      es.onopen = () => setConnected(true);
      es.onerror = () => {
        setConnected(false);
        es?.close();
        retry = setTimeout(connect, 3000);
      };
      es.onmessage = (m) => {
        const e = JSON.parse(m.data) as ServerEvent;
        if (e.type === 'live') touch(['overview'], ['live'], ['sessions'], ['projects']);
        if (e.type === 'sessions') {
          touch(['overview'], ['sessions'], ['analytics'], ['projects']);
          e.ids.forEach((id) => touch(['session', id], ['transcript', id]));
        }
        if (e.type === 'inventory') touch(['inventory'], ['config']);
      };
    };
    connect();
    return () => {
      es?.close();
      clearTimeout(retry);
      clearTimeout(timer);
    };
  }, [qc]);
  return connected;
}
