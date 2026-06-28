import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import { createApiClient } from "../lib/apiClient";
import type {
  CustomRoadmap,
  GenerateRoadmapResponse,
  RoadmapsResponse,
} from "../types";

export function useRoadmaps() {
  const { getToken } = useAuth();
  const api = createApiClient(getToken);

  return useQuery<CustomRoadmap[]>({
    queryKey: ["roadmaps"],
    queryFn: async () => {
      const res = await api.get<RoadmapsResponse>("/roadmaps/custom");
      return res.data.roadmaps ?? [];
    },
    staleTime: 2 * 60 * 1000,
  });
}

// Hook to fetch the master catalog from the website
export function useRoadmapsCatalog() {
  // We don't necessarily need authentication for the catalog if it's public,
  // but we can use the same api client for consistency.
  const { getToken } = useAuth();
  const api = createApiClient(getToken);

  return useQuery<CustomRoadmap[]>({
    queryKey: ["roadmapsCatalog"],
    queryFn: async () => {
      const res = await api.get<RoadmapsResponse>("/roadmaps/catalog");
      return res.data.roadmaps ?? [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useGenerateRoadmap() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<GenerateRoadmapResponse, Error, { topic: string }>({
    mutationFn: async ({ topic }) => {
      const api = createApiClient(getToken);
      const res = await api.post<GenerateRoadmapResponse>(
        "/roadmaps/generate",
        { topic },
      );
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmaps"] });
    },
  });
}
