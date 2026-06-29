import { useEffect, useState } from 'react';

/** يطابق استعلام CSS media (مثل (min-width: 1024px)) */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export const useIsLgUp = () => useMediaQuery('(min-width: 1024px)');
export const useIsMdUp = () => useMediaQuery('(min-width: 768px)');
