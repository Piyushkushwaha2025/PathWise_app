import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useUserStore } from "../store/userStore";
import type { EnrollmentsResponse } from "../types";

const ENROLLMENTS_KEY = "@studyos_enrollments";

export function useEnrollments() {
  const setEnrolledRoadmapIds = useUserStore((s) => s.setEnrolledRoadmapIds);

  return useQuery<string[]>({
    queryKey: ["enrollments"],
    queryFn: async () => {
      try {
        const stored = await AsyncStorage.getItem(ENROLLMENTS_KEY);
        const ids = stored ? JSON.parse(stored) : [];
        setEnrolledRoadmapIds(ids);
        return ids;
      } catch (e) {
        return [];
      }
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useToggleEnrollment() {
  const queryClient = useQueryClient();

  return useMutation<
    EnrollmentsResponse,
    Error,
    { roadmapId: string; action: "enroll" | "unenroll" }
  >({
    mutationFn: async ({ roadmapId, action }) => {
      const stored = await AsyncStorage.getItem(ENROLLMENTS_KEY);
      let ids: string[] = stored ? JSON.parse(stored) : [];

      if (action === "enroll" && !ids.includes(roadmapId)) {
        ids.push(roadmapId);
      } else if (action === "unenroll") {
        ids = ids.filter((id) => id !== roadmapId);
      }

      await AsyncStorage.setItem(ENROLLMENTS_KEY, JSON.stringify(ids));
      return { enrolledRoadmaps: ids };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
    },
  });
}
