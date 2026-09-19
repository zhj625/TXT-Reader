import { useEffect, useRef, useState } from 'react';
import type { UpdateState } from '../../shared/contracts';

export function UpdateStatus() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef(false);
  const requestId = useRef(0);

  useEffect(() => {
    active.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const id = ++requestId.current;
      try {
        const next = await window.readerApi.getUpdateState();
        if (active.current && id === requestId.current) { setState(next); setError(false); }
      } catch {
        if (active.current && id === requestId.current) setError(true);
      }
      if (!cancelled) timer = setTimeout(() => void refresh(), 5000);
    };
    void refresh();
    return () => { cancelled = true; active.current = false; requestId.current += 1; clearTimeout(timer); };
  }, []);

  const check = async () => {
    const id = ++requestId.current;
    setRequesting(true);
    try {
      const next = await window.readerApi.checkForUpdates();
      if (active.current && id === requestId.current) { setState(next); setError(false); }
    } catch {
      if (active.current) setError(true);
    } finally {
      if (active.current) setRequesting(false);
    }
  };

  const busy = requesting || (state && ['checking', 'downloading', 'downloaded'].includes(state.status));
  return (
    <div className="update-status" data-testid="update-status">
      {state ? <span>v{state.version}</span> : null}
      <span aria-live="polite">{error ? '更新状态暂时无法读取' : state?.message ?? '正在读取版本信息…'}</span>
      {state && state.status !== 'disabled' ? (
        <button type="button" onClick={() => void check()} disabled={Boolean(busy)}>
          检查更新
        </button>
      ) : null}
    </div>
  );
}
