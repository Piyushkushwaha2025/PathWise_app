import { useQuery } from '@tanstack/react-query';
import { fetchCourseGrades, MoodleGradeComponent } from '../lib/moodleApi';
import { getCachedData, setCachedData } from '../lib/cache';

const CACHE_EXPIRY_HOURS = 2; // Marks cache should expire sooner

export function useMarks(courseId: number | undefined) {
  return useQuery<MoodleGradeComponent[]>({
    queryKey: ['marks', courseId],
    queryFn: async () => {
      if (!courseId) return [];

      const cacheKey = `marks_cache_${courseId}`;

      // 1. Try Cache
      const cached = await getCachedData<MoodleGradeComponent[]>(cacheKey, CACHE_EXPIRY_HOURS);
      if (cached) return cached;

      // 2. Fetch from API
      const grades = await fetchCourseGrades(courseId);
      
      // 3. Update Cache
      await setCachedData(cacheKey, grades);
      return grades;
    },
    enabled: !!courseId,
    staleTime: CACHE_EXPIRY_HOURS * 60 * 60 * 1000,
  });
}
