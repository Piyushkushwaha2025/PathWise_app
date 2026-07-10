import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { createApiClient } from "../lib/apiClient";
import type { UserProgress, ProgressResponse } from "../types";

export function useProgress() {
  const { getToken } = useAuth();

  return useQuery<UserProgress>({
    queryKey: ["progress"],
    queryFn: async () => {
      const api = createApiClient(getToken);
      try {
        const res = await api.get<any>("/progress");
        return res.data?.progress ?? res.data ?? {};
      } catch (e) {
        return {};
      }
    },
    staleTime: 0,
    gcTime: 0,
  });
}

export function useSaveProgress() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean },
    Error,
    { roadmapId: string; completedTopics: string[] },
    { previousProgress: UserProgress | undefined }
  >({
    mutationFn: async ({ roadmapId, completedTopics }) => {
      const api = createApiClient(getToken);
      const res = await api.post<{ success: boolean }>("/progress", {
        roadmapId,
        completedTopics,
      });
      return res.data;
    },
    onMutate: async ({ roadmapId, completedTopics }) => {
      await queryClient.cancelQueries({ queryKey: ["progress"] });
      const previousProgress = queryClient.getQueryData<UserProgress>(["progress"]);
      queryClient.setQueryData<UserProgress>(["progress"], (old) => {
        if (!old) return { [roadmapId]: completedTopics };
        return { ...old, [roadmapId]: completedTopics };
      });
      return { previousProgress };
    },
    onError: (err, variables, context) => {
      if (context?.previousProgress) {
        queryClient.setQueryData<UserProgress>(["progress"], context.previousProgress);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["progress"] });
    },
  });
}
