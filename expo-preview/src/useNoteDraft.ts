import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, getSetting, setSetting } from './storage';

export const NOTE_DRAFT_KEY = 'noteDraft.v1';
export type NoteDraft = {
  version: 1;
  editingId: string | null;
  title: string;
  body: string;
  updatedAt: number;
};
export type NoteDraftInput = Omit<NoteDraft, 'version'>;
type DraftStatus = 'idle' | 'saving' | 'saved' | 'error';

function isDraft(value: unknown): value is NoteDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  return draft.version === 1
    && (draft.editingId === null || (typeof draft.editingId === 'string' && draft.editingId.length > 0 && draft.editingId.length <= 200))
    && typeof draft.title === 'string' && draft.title.length <= 160
    && typeof draft.body === 'string' && draft.body.length <= 1_000_000
    && typeof draft.updatedAt === 'number' && Number.isFinite(draft.updatedAt) && draft.updatedAt >= 0;
}

/** One recovery slot. It is separate from saved notes and never creates study content. */
export function useNoteDraft(db: Database | null) {
  const [recoveredDraft, setRecoveredDraft] = useState<NoteDraft | null>(null);
  const [status, setStatus] = useState<DraftStatus>('idle');
  const [loading, setLoading] = useState(!!db);
  const mounted = useRef(false);
  const generation = useRef(0);
  const revision = useRef(0);
  // Serialize initial recovery, edits and tombstones: a slow old save cannot undo clear().
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    mounted.current = true;
    const currentGeneration = ++generation.current;
    const currentRevision = ++revision.current;
    setRecoveredDraft(null);
    setStatus('idle');
    setLoading(!!db);
    if (db) {
      const read = queue.current.then(async () => {
        try {
          const raw = await getSetting(db, NOTE_DRAFT_KEY);
          const parsed: unknown = raw === null ? null : JSON.parse(raw);
          if (parsed !== null && !isDraft(parsed)) throw new Error('Invalid note draft');
          if (mounted.current && generation.current === currentGeneration) {
            setRecoveredDraft(parsed);
            if (revision.current === currentRevision) setStatus(parsed === null ? 'idle' : 'saved');
          }
        } catch {
          // Leave the original storage entry intact; loading failure must never erase it.
          if (mounted.current && generation.current === currentGeneration && revision.current === currentRevision) setStatus('error');
        } finally {
          if (mounted.current && generation.current === currentGeneration) setLoading(false);
        }
      });
      queue.current = read.catch(() => undefined);
    }
    return () => { mounted.current = false; };
  }, [db]);

  const write = useCallback((draft: NoteDraft | null): Promise<boolean> => {
    const currentGeneration = generation.current;
    const currentRevision = ++revision.current;
    if (!db || (draft !== null && !isDraft(draft))) {
      if (mounted.current) setStatus('error');
      return Promise.resolve(false);
    }
    // Capture immutable JSON now, before the caller can change its input object.
    const encoded = JSON.stringify(draft);
    const snapshot: NoteDraft | null = draft === null ? null : { ...draft };
    if (mounted.current) setStatus('saving');
    const operation = queue.current.then(async () => {
      // A changed database must not receive work intended for the previous connection.
      if (generation.current !== currentGeneration) return false;
      try {
        await setSetting(db, NOTE_DRAFT_KEY, encoded);
        if (mounted.current && generation.current === currentGeneration) {
          setRecoveredDraft(snapshot);
          if (revision.current === currentRevision) setStatus(draft === null ? 'idle' : 'saved');
        }
        return true;
      } catch {
        if (mounted.current && generation.current === currentGeneration && revision.current === currentRevision) setStatus('error');
        return false;
      }
    });
    queue.current = operation.catch(() => undefined);
    return operation;
  }, [db]);

  const persist = useCallback((input: NoteDraftInput) => write({ ...input, version: 1 }), [write]);
  const clear = useCallback(() => write(null), [write]);
  return { recoveredDraft, status, loading, persist, clear };
}
