import { useState, useEffect } from 'react';

export function useDownloadCount() {
  const [downloadCount, setDownloadCount] = useState<number | null>(null);

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch('https://api.github.com/repos/Piyushkushwaha2025/PathWise_app/releases');
        if (!res.ok) return;
        const releases = await res.json();
        let total = 0;
        releases.forEach((release: any) => {
          release.assets?.forEach((asset: any) => {
            if (asset.name?.endsWith('.apk')) {
              total += asset.download_count;
            }
          });
        });
        setDownloadCount(total);
      } catch (err) {
        if (__DEV__) {
          console.warn('Failed to fetch download count:', err);
        }
      }
    }
    fetchCount();
  }, []);

  return downloadCount;
}
