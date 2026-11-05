import type { Extension } from '@codemirror/state';
import { useEffect, useMemo, useState } from 'react';

// Vim mode is off by default, and its library is about 120 KB. It is loaded
// the first time an editor asks for it, not with the app.

type VimModule = typeof import('@replit/codemirror-vim');

let loaded: VimModule | null = null;
let loading: Promise<VimModule> | null = null;

function loadVim(): Promise<VimModule> {
  loading ??= import('@replit/codemirror-vim').then(m => (loaded = m));
  return loading;
}

/**
 * Vim's editor extension while `enabled`, or null. The first time, it is
 * null until the library has loaded, and the editor gets it a moment later.
 */
export function useVimExtension(enabled: boolean): Extension | null {
  const [vimModule, setVimModule] = useState<VimModule | null>(loaded);
  useEffect(() => {
    if (!enabled || vimModule) return;
    let cancelled = false;
    loadVim()
      .then(m => !cancelled && setVimModule(m))
      .catch(e => console.warn('Could not load Vim mode', e));
    return () => {
      cancelled = true;
    };
  }, [enabled, vimModule]);
  return useMemo(() => (enabled && vimModule ? vimModule.vim() : null), [enabled, vimModule]);
}
