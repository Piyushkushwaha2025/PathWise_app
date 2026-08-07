import { useQuery } from '@tanstack/react-query';
import { fetchAttendance, AttendanceData } from '../lib/uimsApi';
import { getCachedData, setCachedData } from '../lib/cache';

const ATTENDANCE_CACHE_KEY = 'attendance_cache';
const CACHE_EXPIRY_HOURS = 24;

export function useAttendance() {
  return useQuery<AttendanceData[]>({
    queryKey: ['attendance'],
    queryFn: async () => {
      try {
        const attendance = await fetchAttendance();
        await setCachedData(ATTENDANCE_CACHE_KEY, attendance);
        return attendance;
      } catch (err: any) {
        // Do not suppress session expired errors so UI can prompt reconnection instead of serving dead cache
        if (err?.name === 'SessionExpiredError' || err?.message?.toLowerCase()?.includes('expired') || err?.message?.toLowerCase()?.includes('login')) {
          throw err;
        }
        // Fallback to cache only for ordinary network connectivity issues
        const cached = await getCachedData<AttendanceData[]>(ATTENDANCE_CACHE_KEY, 24 * 365);
        if (cached) return cached;
        throw err;
      }
    },
    // Keep data fresh for 1 minute, ensuring manual pull-to-refresh gets live numbers
    staleTime: 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}
