import { useState } from 'react';

export type MutationOptions<TData, TVariables, TContext> = {
  onMutate?: (variables: TVariables) => Promise<TContext | void> | TContext | void;
  onSuccess?: (data: TData, variables: TVariables, context?: TContext) => void;
  onError?: (error: Error, variables: TVariables, context?: TContext) => void;
  onSettled?: (data?: TData, error?: Error, variables?: TVariables, context?: TContext) => void;
};

export function useGramoMutation<TData = any, TVariables = any, TContext = any>(
  endpoint: string | ((vars: TVariables) => string),
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST',
  options?: MutationOptions<TData, TVariables, TContext>
) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (variables: TVariables) => {
    setIsLoading(true);
    setError(null);

    let context: TContext | undefined;
    
    if (options?.onMutate) {
      try {
        context = (await options.onMutate(variables)) as TContext;
      } catch (err) {
        console.error('onMutate failed', err);
      }
    }

    try {
      const url = typeof endpoint === 'function' ? endpoint(variables) : endpoint;
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(method !== 'DELETE' ? { body: JSON.stringify(variables) } : {}),
      });

      let data: any = null;
      if (res.status !== 204) {
        const text = await res.text();
        if (text) {
          try {
            data = JSON.parse(text);
          } catch(e) {
            data = text;
          }
        }
      }

      if (!res.ok) {
        throw new Error(data?.error || `Request failed with status ${res.status}`);
      }

      if (options?.onSuccess) {
        options.onSuccess(data, variables, context);
      }
      
      if (options?.onSettled) {
        options.onSettled(data, undefined, variables, context);
      }
      
      return data;
    } catch (err: any) {
      setError(err);
      if (options?.onError) {
        options.onError(err, variables, context);
      }
      if (options?.onSettled) {
        options.onSettled(undefined, err, variables, context);
      }
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}
