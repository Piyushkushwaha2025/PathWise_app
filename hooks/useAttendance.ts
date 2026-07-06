import { useQuery } from '@tanstack/react-query';
import { fetchAttendance, AttendanceData } from '../lib/uimsApi';
import { getCachedData, setCachedData } from '../lib/cache';

const ATTENDANCE_CACHE_KEY = 'attendance_cache';
const CACHE_EXPIRY_HOURS = 24;

export function useAttendance() {
  return useQuery<AttendanceData[]>({
    queryKey: ['attendance'],
    queryFn: async () => {
      // 1. Try Cache
      const cached = await getCachedData<AttendanceData[]>(ATTENDANCE_CACHE_KEY, CACHE_EXPIRY_HOURS);
      if (cached) return cached;

      // 2. Fetch from API
      const attendance = await fetchAttendance();
      
      // 3. Update Cache
      await setCachedData(ATTENDANCE_CACHE_KEY, attendance);
      return attendance;
    },
    staleTime: CACHE_EXPIRY_HOURS * 60 * 60 * 1000,
  });
}
