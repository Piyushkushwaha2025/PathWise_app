import { useQuery } from '@tanstack/react-query';
import { fetchTimetable, TimetableSlot } from '../lib/uimsApi';
import { getCachedData, setCachedData } from '../lib/cache';

const TIMETABLE_CACHE_KEY = 'timetable_cache';
const CACHE_EXPIRY_HOURS = 24;

export function useTimetable() {
  return useQuery<TimetableSlot[]>({
    queryKey: ['timetable'],
    queryFn: async () => {
      // 1. Try Cache
      const cached = await getCachedData<TimetableSlot[]>(TIMETABLE_CACHE_KEY, CACHE_EXPIRY_HOURS);
      if (cached) return cached;

      // 2. Fetch from API
      const timetable = await fetchTimetable();
      
      // 3. Update Cache
      await setCachedData(TIMETABLE_CACHE_KEY, timetable);
      return timetable;
    },
    staleTime: CACHE_EXPIRY_HOURS * 60 * 60 * 1000,
  });
}
