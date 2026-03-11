"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useFetch } from "@/hooks/useFetch";
import toast from "react-hot-toast";

export interface ProjectKeyword {
  id: number;
  term: string;
  keyword_type: string;
  is_active: boolean;
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

function normalizeProject(raw: any): Project {
  return {
    id: raw.id,
    name: raw.name || "",
    client_name: raw.client_name || "",
    description: raw.description || "",
    status: raw.status || "active",
    platforms: typeof raw.platforms === "string"
      ? raw.platforms.split(",").map((p: string) => p.trim()).filter(Boolean)
      : raw.platforms || [],
    keywords: (raw.keywords || []).map((k: any) => ({
      id: k.id,
      term: k.term,
      keyword_type: k.keyword_type || k.type || "brand",
      is_active: k.is_active ?? true,
    })),
    mention_count: raw.mention_count ?? 0,
    avg_sentiment: raw.avg_sentiment ?? 0,
    total_reach: raw.total_reach ?? 0,
    created_at: raw.created_at || "",
    updated_at: raw.updated_at || "",
  };
}

export function useProjects() {
  const {
    data: rawProjects,
    error: fetchError,
    isLoading,
    mutate,
  } = useFetch<any[]>(
    "projects:list",
    () => api.getProjects(),
    { ttl: 60_000, revalidateOnFocus: true },
  );

  const projects = (rawProjects || []).map(normalizeProject);
  const error = fetchError?.message ?? null;

  const refetch = useCallback(() => {
    mutate(null); // clear cache and re-fetch
  }, [mutate]);

  const getProject = (id: number): Project | undefined => {
    return projects.find((p) => p.id === id);
  };

  // ---------- 6.32 Optimistic create ----------
  const createProject = async (payload: Record<string, any>): Promise<Project> => {
    const tempId = -(Date.now());
    const optimistic: Project = {
      id: tempId,
      name: payload.name || "",
      client_name: payload.client_name || "",
      description: payload.description || "",
      status: "active",
      platforms: typeof payload.platforms === "string"
        ? payload.platforms.split(",").map((p: string) => p.trim()).filter(Boolean)
        : payload.platforms || [],
      keywords: (payload.keywords || []).map((k: any, i: number) => ({
        id: -(i + 1),
        term: k.term,
        keyword_type: k.keyword_type || "brand",
        is_active: true,
      })),
      mention_count: 0,
      avg_sentiment: 0,
      total_reach: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Optimistically update the cache
    const prev = rawProjects || [];
    mutate([optimistic, ...prev] as any);

    try {
      const created = await api.createProject(payload);
      // Replace temp entry with real one
      const updated = [created, ...prev];
      mutate(updated as any);
      return normalizeProject(created);
    } catch (err: any) {
      // Roll back
      mutate(prev as any);
      throw err;
    }
  };

  // ---------- 6.32 Optimistic delete ----------
  const deleteProject = async (id: number): Promise<void> => {
    const prev = rawProjects || [];
    // Optimistically remove
    mutate(prev.filter((p: any) => p.id !== id) as any);

    try {
      await api.deleteProject(id);
    } catch (err: any) {
      // Roll back
      mutate(prev as any);
      toast.error("Failed to delete project");
      throw err;
    }
  };

  return { projects, isLoading, error, refetch, getProject, createProject, deleteProject };
}

export function useProject(id: number) {
  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProject = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getProject(id, signal);
      setProject(normalizeProject(data));
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      console.error("Failed to load project:", err);
      setError(err?.message || "Project not found");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    fetchProject(controller.signal);
    return () => controller.abort();
  }, [fetchProject]);

  const updateProject = async (updates: Record<string, any>) => {
    const payload: Record<string, any> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.platforms !== undefined) {
      payload.platforms = Array.isArray(updates.platforms)
        ? updates.platforms.join(",")
        : updates.platforms;
    }
    const data = await api.updateProject(id, payload);
    setProject(normalizeProject(data));
    return data;
  };

  const addKeyword = async (term: string, keywordType: string = "brand") => {
    const kw = await api.addKeyword(id, term, keywordType);
    // Re-fetch project to get updated keywords list
    await fetchProject();
    return kw;
  };

  const triggerCollection = async (hoursBack: number = 24) => {
    return api.triggerCollection(id, hoursBack);
  };

  return {
    project,
    isLoading,
    error,
    updateProject,
    addKeyword,
    triggerCollection,
    refetch: fetchProject,
  };
}
