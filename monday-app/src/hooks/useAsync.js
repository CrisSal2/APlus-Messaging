import { useState, useCallback } from 'react';

/**
 * Custom hook for managing async operations with loading/error states
 * Usage: const { data, loading, error, execute } = useAsync(fetchFn)
 */
export function useAsync(asyncFn) {
  const [state, setState] = useState({ data: null, loading: false, error: null });

  const execute = useCallback(
    async (...args) => {
      setState({ data: null, loading: true, error: null });
      try {
        const result = await asyncFn(...args);
        setState({ data: result, loading: false, error: null });
        return result;
      } catch (err) {
        setState({ data: null, loading: false, error: err.message });
        throw err;
      }
    },
    [asyncFn]
  );

  return { ...state, execute };
}
