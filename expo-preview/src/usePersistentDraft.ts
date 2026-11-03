import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Database, getSetting, setSetting } from './storage';

const MAX_DRAFT_JSON_CHARS=20_000_000;

/** One validated recovery slot. State lives above routes; writes are ordered, never fire-and-forget clears. */
export function usePersistentDraft<T>(db: Database | null, key: string, valid: (v: unknown) => v is T) {
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!db);
  const [status, setStatus] = useState<'idle'|'saving'|'saved'|'error'>('idle');
  const [attempt, retryRead] = useState(0);
  const ref = useRef<T | null>(null);
  const ready = useRef(false), alive = useRef(false), revision = useRef(0), generation = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const clearing = useRef<{revision:number;promise:Promise<boolean>}|null>(null);
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const write = useCallback((snapshot: T | null, rev: number) => {
    if (!db) return Promise.resolve(false);
    const gen = generation.current, encoded = JSON.stringify(snapshot);
    if(encoded.length>MAX_DRAFT_JSON_CHARS){if(alive.current)setStatus('error');return Promise.resolve(false);}
    const task = queue.current.then(async () => {
      if (generation.current !== gen) return false;
      try {
        await setSetting(db,key,encoded);
        if (generation.current === gen && revision.current === rev) {
          pending.current = false;
          if (alive.current) setStatus(snapshot === null ? 'idle' : 'saved');
        }
        return true;
      } catch { if (alive.current && generation.current === gen && revision.current === rev) setStatus('error'); return false; }
    });
    queue.current = task.catch(() => undefined);
    return task;
  },[db,key]);
  const flush = useCallback(() => {
    stop();
    if(clearing.current?.revision===revision.current)return clearing.current.promise;
    if (!ready.current || !pending.current) return Promise.resolve(ready.current);
    return write(ref.current,revision.current);
  },[write]);
  useEffect(() => {
    alive.current = true; ready.current = false; stop(); pending.current = false;
    const gen = ++generation.current; ++revision.current;
    ref.current=null;setValue(null);setStatus('idle');setLoading(!!db);
    if (db) {
      const read = queue.current.then(async () => {
        try {
          const raw=await getSetting(db,key);
          if (raw && raw.length>MAX_DRAFT_JSON_CHARS) throw new Error('Oversized recovery slot');
          const parsed:unknown=raw===null?null:JSON.parse(raw);
          if(parsed!==null&&!valid(parsed))throw new Error('Invalid recovery slot');
          if(alive.current&&generation.current===gen){ref.current=parsed;ready.current=true;setValue(parsed);setStatus(parsed?'saved':'idle');}
        }catch {if(alive.current&&generation.current===gen)setStatus('error');}
        finally {if(alive.current&&generation.current===gen)setLoading(false);}
      });queue.current=read.catch(()=>undefined);
    }
    return()=>{stop();if(ready.current&&pending.current&&clearing.current?.revision!==revision.current)void write(ref.current,revision.current);alive.current=false;};
  },[db,key,attempt,valid,write]);
  useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state!=='active')void flush();});return()=>sub.remove();},[flush]);
  const update=useCallback((next:T|null)=>{
    if(!ready.current || (next!==null&&!valid(next)) || JSON.stringify(next).length>MAX_DRAFT_JSON_CHARS){setStatus('error');return false;}
    ref.current=next; ++revision.current; pending.current=true;setValue(next);setStatus('saving');stop();
    timer.current=setTimeout(()=>{void flush();},350);return true;
  },[valid,flush]);
  const clear=useCallback(async()=>{
    stop(); if(!db)return false;
    const rev=++revision.current;const task=write(null,rev);clearing.current={revision:rev,promise:task};
    const ok=await task;
    if(clearing.current?.revision===rev)clearing.current=null;
    if(revision.current===rev){
      if(ok){ref.current=null;ready.current=true;pending.current=false;setValue(null);setStatus('idle');}
      else pending.current=true;
    }
    return ok;
  },[db,write]);
  return {value,loading,status,update,flush,clear,getCurrent:()=>ref.current,retry:()=>{if(ready.current)void flush();else retryRead(v=>v+1);}};
}
