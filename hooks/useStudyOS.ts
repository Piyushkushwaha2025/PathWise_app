import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { createApiClient } from "../lib/apiClient";
import type { CustomRoadmap } from "../types";

export function useGenerateStudyOSRoadmap() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<
    { roadmap: CustomRoadmap }, 
    Error, 
    { subject: string, providedSyllabus: any[] }
  >({
    mutationFn: async ({ subject, providedSyllabus }) => {
      const api = createApiClient(getToken);
      const res = await api.post<{ roadmap: CustomRoadmap }>(
        "/studyos/generate-roadmap",
        { subject, providedSyllabus }
      );
      return res.data;
    },
  });
}
