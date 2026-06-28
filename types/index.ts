// Shared TypeScript interfaces — mirror actual MongoDB models exactly

export interface RoadmapModule {
  id: string;
  title: string;
  description: string;
}

export interface CustomRoadmap {
  _id: string;
  id?: string;
  userId: string;
  topic: string;
  title: string;
  color: 'blue' | 'purple' | 'green' | 'pink' | 'yellow';
  modules: RoadmapModule[];
  createdAt: string;
  image?: string;
  author?: string;
  category?: string;
}

// progress: { [roadmapId]: [completedModuleId, ...] }
export type UserProgress = Record<string, string[]>;

export interface EnrollmentsResponse {
  enrolledRoadmaps: string[];
}

export interface ProgressResponse {
  progress: UserProgress;
}

export interface RoadmapsResponse {
  roadmaps: CustomRoadmap[];
}

export interface GenerateRoadmapResponse {
  roadmap: CustomRoadmap;
  isNew: boolean;
}

export type RoadmapColor = CustomRoadmap['color'];
