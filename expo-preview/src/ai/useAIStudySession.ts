import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, getSetting, setSetting } from '../storage';
import { LocalAIDraft, validateBridgeDraft } from './contracts';

export const AI_STUDY_SESSION_KEY = 'aiStudySession.v1';
export type AISourceNote = { id: string; createdAt: number; updatedAt: number };
export type AIStudySession = {
  version: 1; sourceText: string; sourceTitle: string; sourceNote: AISourceNote | null;
  result: LocalAIDraft | null;
};
type Status = 'idle' | 'saving' | 'saved' | 'error';
export type AISessionController = {
  value: AIStudySession | null; loading: boolean; status: Status; hasPending: boolean;
  /** False after a failed recovery read: never overwrite an unread recovery slot. */
  editable: boolean;
  getCurrent: () => AIStudySession | null;
  update: (next: AIStudySession) => Promise<boolean>;
  clear: () => Promise<boolean>;
  retry: () => Promise<boolean>;
};

function validate(value: unknown): AIStudySession | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid AI session');
  const s = value as AIStudySession;
  if (s.version !== 1 || typeof s.sourceText !== 'string' || s.sourceText.length > 1_000_000 || typeof s.sourceTitle !== 'string' || s.sourceTitle.length > 300) throw new Error('Invalid AI source');
  if (s.sourceNote !== null && (!s.sourceNote || typeof s.sourceNote.id !== 'string' || !s.sourceNote.id || s.sourceNote.id.length > 200 || ![s.sourceNote.createdAt, s.sourceNote.updatedAt].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0))) throw new Error('Invalid AI source reference');
  let result: LocalAIDraft | null = null;
  if (s.result !== null) {
    if (!s.result || typeof s.result.modelName !== 'string' || s.result.modelName.length > 160 || typeof s.result.createdAt !== 'string' || s.result.createdAt.length > 100) throw new Error('Invalid AI draft');
    const checked = validateBridgeDraft(s.result, s.sourceText);
    result = { kind: checked.kind, questions: checked.questions, sourceText: checked.sourceText, modelName: checked.modelName, engine: checked.engine, createdAt: checked.createdAt, evidenceValidation: checked.evidenceValidation };
  }
  return { version: 1, sourceText: s.sourceText, sourceTitle: s.sourceTitle, sourceNote: s.sourceNote ? { id: s.sourceNote.id, createdAt: s.sourceNote.createdAt, updatedAt: s.sourceNote.updatedAt } : null, result };
}

export function parseAIStudySession(raw: string | null): AIStudySession | null {
  if (raw === null) return null;
  if (raw.length > 6_100_000) throw new Error('Oversized AI session');
  return validate(JSON.parse(raw));
}

/** Mount once above tab navigation. Only text/validated drafts persist; never model bytes. */
export function useAIStudySession(db: Database | null, memoryOnly = false): AISessionController {
  const [value, setValue] = useState<AIStudySession | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [loading, setLoading] = useState(!memoryOnly);
  const [editable, setEditable] = useState(memoryOnly);
  const current = useRef<AIStudySession | null>(null);
  const mounted = useRef(false), canEdit = useRef(memoryOnly), readFailed = useRef(false);
  const generation = useRef(0), revision = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const recover = useCallback((): Promise<boolean> => {
    const owner = generation.current;
    canEdit.current = false;
    if (mounted.current) { setLoading(true); setEditable(false); }
    const operation = queue.current.then(async () => {
      if (owner !== generation.current || !db) return false;
      try {
        const recovered = parseAIStudySession(await getSetting(db, AI_STUDY_SESSION_KEY));
        if (owner !== generation.current) return false;
        current.current = recovered; canEdit.current = true; readFailed.current = false;
        if (mounted.current) { setValue(recovered); setStatus(recovered ? 'saved' : 'idle'); setEditable(true); }
        return true;
      } catch {
        if (owner === generation.current) { readFailed.current = true; if (mounted.current) setStatus('error'); }
        return false;
      } finally { if (mounted.current && owner === generation.current) setLoading(false); }
    });
    queue.current = operation.catch(() => undefined);
    return operation;
  }, [db]);
  useEffect(() => {
    mounted.current = true; generation.current++; revision.current++;
    current.current = null; canEdit.current = memoryOnly; readFailed.current = false;
    setValue(null); setStatus('idle'); setEditable(memoryOnly); setLoading(!memoryOnly);
    if (db && !memoryOnly) void recover();
    return () => { mounted.current = false; };
  }, [db, memoryOnly, recover]);

  const write = useCallback((input: AIStudySession | null): Promise<boolean> => {
    if (!canEdit.current || (!db && !memoryOnly)) return Promise.resolve(false);
    let snapshot: AIStudySession | null;
    try { snapshot = validate(input); } catch { if (mounted.current) setStatus('error'); return Promise.resolve(false); }
    if (snapshot && !snapshot.sourceText && !snapshot.result) snapshot = null;
    const encoded = JSON.stringify(snapshot), owner = generation.current, edit = ++revision.current;
    current.current = snapshot;
    if (mounted.current) { setValue(snapshot); setStatus(memoryOnly ? (snapshot ? 'saved' : 'idle') : 'saving'); }
    if (memoryOnly) return Promise.resolve(true);
    const operation = queue.current.then(async () => {
      if (owner !== generation.current) return false;
      try {
        await setSetting(db!, AI_STUDY_SESSION_KEY, encoded);
        if (mounted.current && owner === generation.current && edit === revision.current) setStatus(snapshot ? 'saved' : 'idle');
        return true;
      } catch {
        // The newest source/result stays in memory even when the disk is full.
        if (mounted.current && owner === generation.current && edit === revision.current) setStatus('error');
        return false;
      }
    });
    queue.current = operation.catch(() => undefined);
    return operation;
  }, [db, memoryOnly]);
  const getCurrent = useCallback(() => current.current, []);
  const clear = useCallback(() => write(null), [write]);
  const retry = useCallback(() => readFailed.current ? recover() : write(current.current), [recover, write]);
  return { value, loading, status, editable, hasPending: !!value && (!!value.sourceText || !!value.result), getCurrent, update: write, clear, retry };
}
