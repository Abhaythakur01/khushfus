"use client";

import { useState, useEffect, useCallback } from "react";

export interface ProjectKeyword {
  id: number;
  term: string;
  type: "brand" | "competitor" | "product" | "campaign" | "topic";
  status: "active" | "inactive";
}

export interface Project {
  id: number;
  name: string;
  client_name: string;
  description: string;
  status: "active" | "paused" | "archived";
  platforms: string[];
  keywords: ProjectKeyword[];
  mention_count: number;
  avg_sentiment: number;
  total_reach: number;
  created_at: string;
  updated_at: string;
}

const MOCK_PROJECTS: Project[] = [
  {
    id: 1,
    name: "NovaBrand Global Monitoring",
    client_name: "NovaBrand Inc.",
    description:
      "Comprehensive brand monitoring across all social platforms. Tracking brand mentions, sentiment trends, competitor activity, and emerging conversations around NovaBrand's product lines.",
    status: "active",
    platforms: ["twitter", "instagram", "facebook", "youtube", "tiktok", "reddit", "linkedin"],
    keywords: [
      { id: 1, term: "NovaBrand", type: "brand", status: "active" },
      { id: 2, term: "Nova skincare", type: "brand", status: "active" },
      { id: 3, term: "@NovaBrand", type: "brand", status: "active" },
      { id: 4, term: "GlowCo", type: "competitor", status: "active" },
      { id: 5, term: "SkinFirst", type: "competitor", status: "active" },
      { id: 6, term: "Nova Vitamin C serum", type: "product", status: "active" },
      { id: 7, term: "Nova SPF", type: "product", status: "active" },
      { id: 8, term: "#NovaSkin", type: "campaign", status: "active" },
    ],
    mention_count: 12450,
    avg_sentiment: 0.42,
    total_reach: 8500000,
    created_at: "2025-11-15T10:00:00Z",
    updated_at: "2026-03-07T08:00:00Z",
  },
  {
    id: 2,
    name: "Spring 2026 Campaign Tracker",
    client_name: "NovaBrand Inc.",
    description:
      "Tracking the performance of NovaBrand's Spring 2026 marketing campaign across digital channels. Focus on campaign hashtags, influencer partnerships, and conversion mentions.",
    status: "active",
    platforms: ["twitter", "instagram", "tiktok"],
    keywords: [
      { id: 9, term: "#SpringGlow2026", type: "campaign", status: "active" },
      { id: 10, term: "#NovaSpring", type: "campaign", status: "active" },
      { id: 11, term: "spring collection nova", type: "product", status: "active" },
    ],
    mention_count: 3200,
    avg_sentiment: 0.67,
    total_reach: 4200000,
    created_at: "2026-02-01T09:00:00Z",
    updated_at: "2026-03-07T07:30:00Z",
  },
  {
    id: 3,
    name: "Competitor Intelligence - GlowCo",
    client_name: "NovaBrand Inc.",
    description:
      "Dedicated monitoring of primary competitor GlowCo. Tracking their product launches, customer sentiment, PR coverage, and market positioning.",
    status: "active",
    platforms: ["twitter", "instagram", "youtube", "reddit", "news"],
    keywords: [
      { id: 12, term: "GlowCo", type: "competitor", status: "active" },
      { id: 13, term: "@GlowCoBeauty", type: "competitor", status: "active" },
      { id: 14, term: "GlowCo vs NovaBrand", type: "topic", status: "active" },
      { id: 15, term: "GlowCo review", type: "topic", status: "active" },
    ],
    mention_count: 5670,
    avg_sentiment: 0.38,
    total_reach: 3100000,
    created_at: "2025-12-01T14:00:00Z",
    updated_at: "2026-03-06T22:00:00Z",
  },
  {
    id: 4,
    name: "Crisis Monitor - Product Recall",
    client_name: "NovaBrand Inc.",
    description:
      "Emergency monitoring for the Q1 2026 eye cream recall (Batch #NB-2026-Q1). Tracking public reaction, media coverage, and customer complaints related to the contamination issue.",
    status: "active",
    platforms: ["twitter", "facebook", "reddit", "news"],
    keywords: [
      { id: 16, term: "NovaBrand recall", type: "brand", status: "active" },
      { id: 17, term: "NovaBrand contamination", type: "brand", status: "active" },
      { id: 18, term: "NB-2026-Q1", type: "product", status: "active" },
      { id: 19, term: "Nova eye cream", type: "product", status: "active" },
    ],
    mention_count: 890,
    avg_sentiment: -0.54,
    total_reach: 2300000,
    created_at: "2026-03-03T18:00:00Z",
    updated_at: "2026-03-07T09:00:00Z",
  },
  {
    id: 5,
    name: "Influencer Partnership Tracking",
    client_name: "NovaBrand Inc.",
    description:
      "Monitoring ROI and engagement from NovaBrand's influencer partnerships. Tracking sponsored content performance, audience sentiment, and brand lift across key influencer collaborations.",
    status: "paused",
    platforms: ["instagram", "tiktok", "youtube"],
    keywords: [
      { id: 20, term: "#NovaBrandPartner", type: "campaign", status: "active" },
      { id: 21, term: "#NovaBrandAmbassador", type: "campaign", status: "inactive" },
      { id: 22, term: "NovaBrand sponsored", type: "brand", status: "active" },
    ],
    mention_count: 1560,
    avg_sentiment: 0.71,
    total_reach: 12000000,
    created_at: "2025-09-20T11:00:00Z",
    updated_at: "2026-02-15T16:00:00Z",
  },
  {
    id: 6,
    name: "Holiday 2025 Campaign (Archived)",
    client_name: "NovaBrand Inc.",
    description:
      "Post-campaign analysis for the Holiday 2025 gift set promotion. Campaign ended Jan 2026. Data retained for reporting and year-over-year comparison.",
    status: "archived",
    platforms: ["twitter", "instagram", "facebook", "tiktok"],
    keywords: [
      { id: 23, term: "#NovaHoliday2025", type: "campaign", status: "inactive" },
      { id: 24, term: "NovaBrand gift set", type: "product", status: "inactive" },
      { id: 25, term: "#GiftNova", type: "campaign", status: "inactive" },
    ],
    mention_count: 8900,
    avg_sentiment: 0.58,
    total_reach: 6700000,
    created_at: "2025-10-15T09:00:00Z",
    updated_at: "2026-01-31T23:59:00Z",
  },
];

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setTimeout(() => {
      setProjects(MOCK_PROJECTS);
      setIsLoading(false);
    }, 500);
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const getProject = (id: number): Project | undefined => {
    return projects.find((p) => p.id === id);
  };

  return { projects, isLoading, error, refetch: fetchProjects, getProject };
}

export function useProject(id: number) {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setTimeout(() => {
      const found = MOCK_PROJECTS.find((p) => p.id === id);
      if (found) {
        setProject(found);
      } else {
        setError("Project not found");
      }
      setIsLoading(false);
    }, 500);
  }, [id]);

  const updateProject = (updates: Partial<Project>) => {
    if (project) {
      setProject({ ...project, ...updates });
    }
  };

  const addKeyword = (keyword: Omit<ProjectKeyword, "id">) => {
    if (project) {
      const newKeyword: ProjectKeyword = { ...keyword, id: Date.now() };
      setProject({
        ...project,
        keywords: [...project.keywords, newKeyword],
      });
    }
  };

  const removeKeyword = (keywordId: number) => {
    if (project) {
      setProject({
        ...project,
        keywords: project.keywords.filter((k) => k.id !== keywordId),
      });
    }
  };

  const toggleKeywordStatus = (keywordId: number) => {
    if (project) {
      setProject({
        ...project,
        keywords: project.keywords.map((k) =>
          k.id === keywordId
            ? { ...k, status: k.status === "active" ? "inactive" : "active" }
            : k
        ),
      });
    }
  };

  return {
    project,
    isLoading,
    error,
    updateProject,
    addKeyword,
    removeKeyword,
    toggleKeywordStatus,
  };
}
