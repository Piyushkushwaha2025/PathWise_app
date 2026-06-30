/**
 * Type definitions for the app
 */

export interface CustomRoadmap {
  _id?: string;
  id?: string;
  title: string;
  description: string;
  image?: string;
  color: string;
  modules?: RoadmapModule[];
}

export interface RoadmapModule {
  title: string;
  description?: string;
  topics?: RoadmapTopic[];
}

export interface RoadmapTopic {
  title: string;
  objectives?: string[] | ObjectiveItem[];
  problems?: string[] | ProblemItem[];
  hindiVideo?: string;
  englishVideo?: string;
  practiceUrl?: string;
  article?: string;
}

export interface ObjectiveItem {
  title: string;
  description?: string;
}

export interface ProblemItem {
  title: string;
  difficulty?: string;
  url?: string;
}

export interface RoadmapsResponse {
  roadmaps: CustomRoadmap[];
}

export interface GenerateRoadmapResponse {
  roadmap: CustomRoadmap;
}

export interface EnrollmentsResponse {
  enrolledRoadmaps: string[];
}

export interface UserProgress {
  [roadmapId: string]: string[];
}

export interface ProgressResponse {
  progress: UserProgress;
}

export interface StatsData {
  signedIn: number;
  totalXP: number;
}
