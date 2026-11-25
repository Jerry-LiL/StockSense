import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const emptyPage = (limit) => ({
  page: 1,
  limit,
  total: 0,
  totalPages: 0,
});

export function usePagedList(path, params = {}, limit = 20) {
  const extraKey = JSON.stringify(params);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({
    data: [],
    pagination: emptyPage(limit),
    loading: true,
    error: '',
  });

  useEffect(() => {
    const controller = new AbortController();
    const extra = JSON.parse(extraKey);
    const search = new URLSearchParams();
    search.set('page', String(page));
    search.set('limit', String(limit));
    if (query) search.set('q', query);
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
    });

    setState((current) => ({ ...current, loading: true, error: '' }));
    api(`${path}?${search.toString()}`, { signal: controller.signal })
      .then((body) => {
        setState({
          data: body.data,
          pagination: body.pagination,
          loading: false,
          error: '',
        });
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState((current) => ({ ...current, loading: false, error: err.message }));
      });

    return () => controller.abort();
  }, [path, page, query, limit, extraKey, reloadKey]);

  const applySearch = useCallback((value) => {
    setPage(1);
    setQuery(value);
  }, []);

  const reload = useCallback(() => {
    setReloadKey((value) => value + 1);
  }, []);

  return {
    ...state,
    page,
    setPage,
    query,
    applySearch,
    reload,
  };
}
