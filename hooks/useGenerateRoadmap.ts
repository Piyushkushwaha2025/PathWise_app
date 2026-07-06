import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getCachedData, setCachedData } from '../lib/cache';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://pathwise-beige.vercel.app';

export interface RoadmapModule {
  title: string;
  topics: {
    title: string;
    description: string;
    videos: any[];
  }[];
}

interface GenerateRoadmapParams {
  subjectName: string;
  subjectCode: string;
  credits: number;
}

export function useGenerateRoadmap() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ subjectName, subjectCode, credits }: GenerateRoadmapParams) => {
      const cacheKey = `roadmap_${subjectCode}`;
      
      // Check cache first (permanent cache basically)
      const cached = await getCachedData<RoadmapModule[]>(cacheKey, 24 * 30); // 30 days
      if (cached) return cached;

      // Make API Call
      const response = await axios.post(`${API_URL}/api/studyos/generate-roadmap`, {
        subjectName,
        subjectCode,
        credits,
        semester: 1 // hardcoded for now
      }, {
        // Headers would include Clerk JWT token here in a real app
        // headers: { Authorization: `Bearer ${token}` }
      });

      const roadmapData = response.data;
      
      // Save to cache
      await setCachedData(cacheKey, roadmapData);
      
      return roadmapData;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['roadmap', variables.subjectCode] });
    }
  });
}
