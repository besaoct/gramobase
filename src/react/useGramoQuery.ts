import { useState, useEffect, useCallback } from 'react';

export type QueryOptions<T> = {
  initialData?: T;
};

export function useGramoQuery<T = any>(endpoint: string, options?: QueryOptions<T>) {
  const [data, setData] = useState<T | null>(options?.initialData ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(!options?.initialData);
  const [error, setError] = useState<Error | null>(null);

  const fetcher = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(endpoint);
      const json = await res.json() as any;
      
      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch data');
      }
      
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    fetcher();
  }, [fetcher]);

  const mutate = useCallback((newData: T | ((prev: T | null) => T)) => {
    setData((prev: T | null) => {
      if (typeof newData === 'function') {
        return (newData as Function)(prev);
      }
      return newData;
    });
  }, []);

  return { data, isLoading, error, mutate, refetch: fetcher };
}
