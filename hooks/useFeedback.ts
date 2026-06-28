import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { createApiClient } from "../lib/apiClient";

export interface FeedbackData {
  name: string;
  role?: string;
  content: string;
  rating: number;
}

export function useFeedback() {
  const { getToken } = useAuth();

  return useMutation<any, Error, FeedbackData>({
    mutationFn: async (feedback) => {
      const api = createApiClient(getToken);
      const res = await api.post("/feedback", feedback);
      return res.data;
    },
  });
}
