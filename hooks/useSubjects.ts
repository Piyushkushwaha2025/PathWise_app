import { useQuery } from '@tanstack/react-query';
import { fetchUserCourses, MoodleCourse } from '../lib/moodleApi';
import { getCachedData, setCachedData } from '../lib/cache';

const SUBJECTS_CACHE_KEY = 'subjects_cache';
const CACHE_EXPIRY_HOURS = 24;

export function useSubjects() {
  return useQuery<MoodleCourse[]>({
    queryKey: ['subjects'],
    queryFn: async () => {
      // 1. Try Cache
      const cached = await getCachedData<MoodleCourse[]>(SUBJECTS_CACHE_KEY, CACHE_EXPIRY_HOURS);
      if (cached) return cached;

      // 2. Fetch from API
      const courses = await fetchUserCourses();
      
      // 3. Update Cache
      await setCachedData(SUBJECTS_CACHE_KEY, courses);
      return courses;
    },
    staleTime: CACHE_EXPIRY_HOURS * 60 * 60 * 1000,
  });
}
