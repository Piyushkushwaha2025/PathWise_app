import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { getCachedData, setCachedData } from '../lib/cache';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://pathwise-beige.vercel.app';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface GenerateQuizParams {
  subject: string;
  topic: string;
  topicId: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
}

export function useQuiz() {
  return useMutation({
    mutationFn: async ({ subject, topic, topicId, difficulty = 'medium', count = 5 }: GenerateQuizParams) => {
      const cacheKey = `quiz_${topicId}_${difficulty}`;
      
      const cached = await getCachedData<QuizQuestion[]>(cacheKey, 24 * 7); // 7 days cache
      if (cached) return cached;

      const response = await axios.post(`${API_URL}/api/studyos/quiz`, {
        subject,
        topic,
        difficulty,
        count
      });

      const quizData = response.data;
      
      await setCachedData(cacheKey, quizData);
      
      return quizData;
    }
  });
}
