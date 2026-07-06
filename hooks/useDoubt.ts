import { useMutation } from '@tanstack/react-query';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://pathwise-beige.vercel.app';

interface AskDoubtParams {
  question: string;
  subject: string;
  topic: string;
}

export function useDoubt() {
  return useMutation({
    mutationFn: async ({ question, subject, topic }: AskDoubtParams) => {
      // Note: Streaming requires specific fetch or axios handling depending on RN setup.
      // For simplicity in this mock, we assume the backend returns the full text.
      const response = await axios.post(`${API_URL}/api/studyos/doubt`, {
        question,
        subject,
        topic
      });
      return response.data;
    }
  });
}
