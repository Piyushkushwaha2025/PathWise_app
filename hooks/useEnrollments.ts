import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { createApiClient } from "../lib/apiClient";
import { useUserStore } from "../store/userStore";
import type { EnrollmentsResponse } from "../types";

export function useEnrollments() {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);
  const setEnrolledRoadmapIds = useUserStore((s) => s.setEnrolledRoadmapIds);

  return useQuery<string[]>({
    queryKey: ["enrollments"],
    queryFn: async () => {
      const res = await api.get<any>("/enrollments");
      const ids = res.data?.enrolledRoadmaps ?? (Array.isArray(res.data) ? res.data : []);
      setEnrolledRoadmapIds(ids);
      return ids;
    },
    staleTime: 10 * 60 * 1000, // 10 min
  });
}

export function useToggleEnrollment() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<
    EnrollmentsResponse,
    Error,
    { roadmapId: string; action: "enroll" | "unenroll" }
  >({
    mutationFn: async ({ roadmapId, action }) => {
      const api = createApiClient(getToken);
      const res = await api.post<EnrollmentsResponse>("/enrollments", {
        roadmapId,
        action,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
    },
  });
}
