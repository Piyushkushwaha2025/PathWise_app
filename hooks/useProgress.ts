import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { UserProgress, ProgressResponse } from "../types";

const PROGRESS_KEY = "@studyos_progress";

export function useProgress() {
  return useQuery<UserProgress>({
    queryKey: ["progress"],
    queryFn: async () => {
      try {
        const stored = await AsyncStorage.getItem(PROGRESS_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
        return {};
      } catch (e) {
        return {};
      }
    },
    staleTime: 0,
    gcTime: 0,
  });
}

export function useSaveProgress() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean },
    Error,
    { roadmapId: string; completedTopics: string[] },
    { previousProgress: UserProgress | undefined }
  >({
    mutationFn: async ({ roadmapId, completedTopics }) => {
      const stored = await AsyncStorage.getItem(PROGRESS_KEY);
      let progressObj: UserProgress = stored ? JSON.parse(stored) : {};
      
      progressObj[roadmapId] = completedTopics;
      
      await AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(progressObj));
      return { success: true };
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
