import { useCallback, useEffect, useRef, useState } from 'react'
import { describeError } from '../api/client'

export interface Remote<T> { data: T | null; loading: boolean; error: string | null; reload: () => void }

/** Minimal data hook: loading / error / data with stale-response protection. */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[]): Remote<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null })
  const seq = useRef(0)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])
  useEffect(() => {
    const id = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    fetcher()
      .then((data) => { if (id === seq.current) setState({ data, loading: false, error: null }) })
      .catch((e) => { if (id === seq.current) setState({ data: null, loading: false, error: describeError(e) }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { ...state, reload }
}
