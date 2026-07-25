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
      } catch (err) {
        // Fallback to cache if API fails (even if session expired)
        const cached = await getCachedData<AttendanceData[]>(ATTENDANCE_CACHE_KEY, 24 * 365); // 1 year fallback
        if (cached) return cached;
        throw err;
      }
    },
    // Show cached data instantly, refresh silently in background every 15 mins
    staleTime: 15 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}
