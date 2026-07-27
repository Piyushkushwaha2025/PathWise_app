import { useState, useEffect } from 'react';

export function useDownloadCount() {
  const [downloadCount, setDownloadCount] = useState<number | null>(null);

  useEffect(() => {
    async function fetchCount() {
      try {
        const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'https://pathwise-beige.vercel.app';
        const res = await fetch(`${apiUrl}/api/users/count`);
        if (!res.ok) return;
        const data = await res.json();
        setDownloadCount(data.count || 0);
      } catch (err) {
        if (__DEV__) {
          console.warn('Failed to fetch user count:', err);
        }
      }
    }
    fetchCount();
  }, []);

  return downloadCount;
}
