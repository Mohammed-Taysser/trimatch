import { useSearchParams } from 'react-router-dom';

// Back list filters/sort/pagination with the URL query so a view is
// shareable, bookmarkable and survives refresh. Empty values drop the key.
export function useUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const get = (key: string, fallback = '') => searchParams.get(key) ?? fallback;
  const set = (changes: Record<string, string>) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value) next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  return { get, set };
}
