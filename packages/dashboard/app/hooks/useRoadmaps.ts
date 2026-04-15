import { useState, useEffect, useCallback, useRef } from "react";
import type {
  Roadmap,
  RoadmapMilestone,
  RoadmapFeature,
  RoadmapCreateInput,
  RoadmapUpdateInput,
  RoadmapMilestoneCreateInput,
  RoadmapMilestoneUpdateInput,
  RoadmapFeatureCreateInput,
  RoadmapFeatureUpdateInput,
  RoadmapWithHierarchy,
} from "@fusion/core";
import * as api from "../api";

/** A suggested milestone from AI generation */
export interface MilestoneSuggestion {
  title: string;
  description?: string;
}

export interface UseRoadmapsOptions {
  /** When provided, fetches roadmaps for this project */
  projectId?: string;
}

export interface UseRoadmapsResult {
  /** All roadmaps for the current project */
  roadmaps: Roadmap[];
  /** Currently selected roadmap ID */
  selectedRoadmapId: string | null;
  /** Selected roadmap with full hierarchy (milestones and features) */
  selectedRoadmap: RoadmapWithHierarchy | null;
  /** Milestones for the selected roadmap */
  milestones: RoadmapMilestone[];
  /** Features by milestone ID */
  featuresByMilestoneId: Record<string, RoadmapFeature[]>;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;

  // Roadmap CRUD callbacks
  /** Create a new roadmap */
  createRoadmap: (input: RoadmapCreateInput, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;
  /** Update a roadmap */
  updateRoadmap: (roadmapId: string, updates: RoadmapUpdateInput, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;
  /** Delete a roadmap */
  deleteRoadmap: (roadmapId: string, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;
  /** Select a roadmap to view its details */
  selectRoadmap: (roadmapId: string | null) => void;

  // Milestone CRUD callbacks
  /** Create a milestone in the selected roadmap */
  createMilestone: (input: RoadmapMilestoneCreateInput, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;
  /** Update a milestone */
  updateMilestone: (milestoneId: string, updates: RoadmapMilestoneUpdateInput, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;
  /** Delete a milestone */
  deleteMilestone: (milestoneId: string, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;

  // Milestone ordering callbacks
  /** Reorder milestones within a roadmap */
  reorderMilestones: (roadmapId: string, orderedMilestoneIds: string[], opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;

  // Feature CRUD callbacks
  /** Create a feature in a milestone */
  createFeature: (milestoneId: string, input: RoadmapFeatureCreateInput, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;
  /** Update a feature */
  updateFeature: (featureId: string, updates: RoadmapFeatureUpdateInput, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;
  /** Delete a feature */
  deleteFeature: (featureId: string, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;

  // Feature ordering callbacks
  /** Reorder features within a milestone */
  reorderFeatures: (milestoneId: string, orderedFeatureIds: string[], opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;
  /** Move a feature to a different milestone or position */
  moveFeature: (featureId: string, targetMilestoneId: string, targetIndex: number, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;

  // Milestone suggestion callbacks
  /** Current pending milestone suggestions (ephemeral, in-memory only) */
  milestoneSuggestions: MilestoneSuggestion[];
  /** Whether suggestions are currently being generated */
  isGeneratingSuggestions: boolean;
  /** Generate milestone suggestions from a goal prompt */
  generateMilestoneSuggestions: (goalPrompt: string, count?: number, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;
  /** Accept a single milestone suggestion and create it as a milestone */
  acceptMilestoneSuggestion: (index: number, opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;
  /** Accept all milestone suggestions and create them as milestones (sequentially) */
  acceptAllMilestoneSuggestions: (opts?: { onSuccess?: () => void; onError?: (err: Error) => void }) => Promise<void>;
  /** Clear all pending milestone suggestions */
  clearMilestoneSuggestions: () => void;

  /** Refresh all roadmaps */
  refresh: () => Promise<void>;
}

export function useRoadmaps(options?: UseRoadmapsOptions): UseRoadmapsResult {
  const projectId = options?.projectId;
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string | null>(null);
  const [selectedRoadmap, setSelectedRoadmap] = useState<RoadmapWithHierarchy | null>(null);
  const [milestones, setMilestones] = useState<RoadmapMilestone[]>([]);
  const [featuresByMilestoneId, setFeaturesByMilestoneId] = useState<Record<string, RoadmapFeature[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Ephemeral milestone suggestion state (in-memory only, not persisted)
  const [milestoneSuggestions, setMilestoneSuggestions] = useState<MilestoneSuggestion[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);

  // Track previous projectId to detect changes
  const previousProjectIdRef = useRef<string | undefined>(projectId);
  // Project context version for stale-response protection
  const projectContextVersionRef = useRef(0);
  // Refs to access latest state in callbacks
  const roadmapsRef = useRef(roadmaps);
  const selectedRoadmapIdRef = useRef(selectedRoadmapId);
  const milestonesRef = useRef(milestones);
  const featuresByMilestoneIdRef = useRef(featuresByMilestoneId);
  const projectIdRef = useRef(projectId);

  roadmapsRef.current = roadmaps;
  selectedRoadmapIdRef.current = selectedRoadmapId;
  milestonesRef.current = milestones;
  featuresByMilestoneIdRef.current = featuresByMilestoneId;
  projectIdRef.current = projectId;

  // Clear selection and suggestions when project changes
  useEffect(() => {
    if (previousProjectIdRef.current !== projectId) {
      previousProjectIdRef.current = projectId;
      projectContextVersionRef.current++;
      setSelectedRoadmapId(null);
      setSelectedRoadmap(null);
      setMilestones([]);
      setFeaturesByMilestoneId({});
      // Clear ephemeral suggestion state
      setMilestoneSuggestions([]);
      setIsGeneratingSuggestions(false);
    }
  }, [projectId]);

  // Fetch roadmaps on mount and when projectId changes
  const fetchRoadmaps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedRoadmaps = await api.fetchRoadmaps(projectId);
      setRoadmaps(fetchedRoadmaps);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch roadmaps"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Fetch selected roadmap with full hierarchy
  const fetchSelectedRoadmap = useCallback(async (roadmapId: string) => {
    try {
      const roadmap = await api.fetchRoadmap(roadmapId, projectId);
      setSelectedRoadmap(roadmap);
      setMilestones(roadmap.milestones || []);

      // Build features by milestone ID
      const featuresMap: Record<string, RoadmapFeature[]> = {};
      for (const milestone of roadmap.milestones || []) {
        featuresMap[milestone.id] = milestone.features || [];
      }
      setFeaturesByMilestoneId(featuresMap);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch roadmap"));
    }
  }, [projectId]);

  // Initial fetch
  useEffect(() => {
    void fetchRoadmaps();
  }, [fetchRoadmaps]);

  // Fetch selected roadmap when selection changes
  useEffect(() => {
    if (selectedRoadmapId) {
      void fetchSelectedRoadmap(selectedRoadmapId);
    } else {
      setSelectedRoadmap(null);
      setMilestones([]);
      setFeaturesByMilestoneId({});
    }
  }, [selectedRoadmapId, fetchSelectedRoadmap]);

  // Roadmap CRUD
  const createRoadmap = useCallback(async (
    input: RoadmapCreateInput,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    try {
      const newRoadmap = await api.createRoadmap(input, projectId);
      setRoadmaps((prev) => [...prev, newRoadmap]);
      opts?.onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to create roadmap");
      opts?.onError?.(error);
      throw error;
    }
  }, [projectId]);

  const updateRoadmap = useCallback(async (
    roadmapId: string,
    updates: RoadmapUpdateInput,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    try {
      const updated = await api.updateRoadmap(roadmapId, updates, projectId);
      setRoadmaps((prev) => prev.map((r) => (r.id === roadmapId ? updated : r)));
      if (selectedRoadmapIdRef.current === roadmapId) {
        setSelectedRoadmap((prev) => prev ? { ...prev, ...updated } : null);
      }
      opts?.onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to update roadmap");
      opts?.onError?.(error);
      throw error;
    }
  }, [projectId]);

  const deleteRoadmap = useCallback(async (
    roadmapId: string,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    try {
      await api.deleteRoadmap(roadmapId, projectId);
      setRoadmaps((prev) => prev.filter((r) => r.id !== roadmapId));
      if (selectedRoadmapIdRef.current === roadmapId) {
        setSelectedRoadmapId(null);
        setSelectedRoadmap(null);
        setMilestones([]);
        setFeaturesByMilestoneId({});
      }
      opts?.onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to delete roadmap");
      opts?.onError?.(error);
      throw error;
    }
  }, [projectId]);

  const selectRoadmap = useCallback((roadmapId: string | null) => {
    setSelectedRoadmapId(roadmapId);
  }, []);

  // Milestone CRUD
  const createMilestone = useCallback(async (
    input: RoadmapMilestoneCreateInput,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    const currentRoadmapId = selectedRoadmapIdRef.current;
    if (!currentRoadmapId) {
      const error = new Error("No roadmap selected");
      opts?.onError?.(error);
      throw error;
    }
    try {
      const newMilestone = await api.createRoadmapMilestone(currentRoadmapId, input, projectIdRef.current);
      setMilestones((prev) => [...prev, newMilestone]);
      setFeaturesByMilestoneId((prev) => ({ ...prev, [newMilestone.id]: [] }));
      // Refresh the full roadmap to get updated hierarchy
      if (selectedRoadmapIdRef.current) {
        void fetchSelectedRoadmap(selectedRoadmapIdRef.current);
      }
      opts?.onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to create milestone");
      opts?.onError?.(error);
      throw error;
    }
  }, [fetchSelectedRoadmap]);

  const updateMilestone = useCallback(async (
    milestoneId: string,
    updates: RoadmapMilestoneUpdateInput,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    try {
      const updated = await api.updateRoadmapMilestone(milestoneId, updates, projectId);
      setMilestones((prev) => prev.map((m) => (m.id === milestoneId ? updated : m)));
      if (selectedRoadmapIdRef.current) {
        void fetchSelectedRoadmap(selectedRoadmapIdRef.current);
      }
      opts?.onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to update milestone");
      opts?.onError?.(error);
      throw error;
    }
  }, [fetchSelectedRoadmap, projectId]);

  const deleteMilestone = useCallback(async (
    milestoneId: string,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    try {
      await api.deleteRoadmapMilestone(milestoneId, projectId);
      setMilestones((prev) => prev.filter((m) => m.id !== milestoneId));
      setFeaturesByMilestoneId((prev) => {
        const updated = { ...prev };
        delete updated[milestoneId];
        return updated;
      });
      if (selectedRoadmapIdRef.current) {
        void fetchSelectedRoadmap(selectedRoadmapIdRef.current);
      }
      opts?.onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to delete milestone");
      opts?.onError?.(error);
      throw error;
    }
  }, [fetchSelectedRoadmap, projectId]);

  // Feature CRUD
  const createFeature = useCallback(async (
    milestoneId: string,
    input: RoadmapFeatureCreateInput,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    try {
      const newFeature = await api.createRoadmapFeature(milestoneId, input, projectId);
      setFeaturesByMilestoneId((prev) => ({
        ...prev,
        [milestoneId]: [...(prev[milestoneId] || []), newFeature],
      }));
      if (selectedRoadmapIdRef.current) {
        void fetchSelectedRoadmap(selectedRoadmapIdRef.current);
      }
      opts?.onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to create feature");
      opts?.onError?.(error);
      throw error;
    }
  }, [fetchSelectedRoadmap, projectId]);

  const updateFeature = useCallback(async (
    featureId: string,
    updates: RoadmapFeatureUpdateInput,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    try {
      const updated = await api.updateRoadmapFeature(featureId, updates, projectId);
      setFeaturesByMilestoneId((prev) => {
        const updatedMap: Record<string, RoadmapFeature[]> = {};
        for (const [milestoneId, features] of Object.entries(prev)) {
          updatedMap[milestoneId] = features.map((f) => (f.id === featureId ? updated : f));
        }
        return updatedMap;
      });
      if (selectedRoadmapIdRef.current) {
        void fetchSelectedRoadmap(selectedRoadmapIdRef.current);
      }
      opts?.onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to update feature");
      opts?.onError?.(error);
      throw error;
    }
  }, [fetchSelectedRoadmap, projectId]);

  const deleteFeature = useCallback(async (
    featureId: string,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    try {
      await api.deleteRoadmapFeature(featureId, projectId);
      setFeaturesByMilestoneId((prev) => {
        const updatedMap: Record<string, RoadmapFeature[]> = {};
        for (const [milestoneId, features] of Object.entries(prev)) {
          updatedMap[milestoneId] = features.filter((f) => f.id !== featureId);
        }
        return updatedMap;
      });
      if (selectedRoadmapIdRef.current) {
        void fetchSelectedRoadmap(selectedRoadmapIdRef.current);
      }
      opts?.onSuccess?.();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to delete feature");
      opts?.onError?.(error);
      throw error;
    }
  }, [fetchSelectedRoadmap, projectId]);

  // Milestone ordering
  const reorderMilestones = useCallback(async (
    roadmapId: string,
    orderedMilestoneIds: string[],
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    // Save snapshot for rollback
    const snapshot = milestonesRef.current;

    // Optimistic update
    const reordered = orderedMilestoneIds
      .map((id) => snapshot.find((m) => m.id === id))
      .filter((m): m is RoadmapMilestone => m !== undefined)
      .map((m, index) => ({ ...m, orderIndex: index }));

    setMilestones(reordered);

    try {
      await api.reorderRoadmapMilestones(roadmapId, orderedMilestoneIds, projectId);
      // Refresh to get server state
      if (selectedRoadmapIdRef.current) {
        void fetchSelectedRoadmap(selectedRoadmapIdRef.current);
      }
      opts?.onSuccess?.();
    } catch (err) {
      // Rollback to snapshot
      setMilestones(snapshot);
      const error = err instanceof Error ? err : new Error("Failed to reorder milestones");
      opts?.onError?.(error);
      throw error;
    }
  }, [fetchSelectedRoadmap, projectId]);

  // Feature ordering
  const reorderFeatures = useCallback(async (
    milestoneId: string,
    orderedFeatureIds: string[],
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    // Save snapshot for rollback
    const snapshot = featuresByMilestoneIdRef.current;
    const currentFeatures = snapshot[milestoneId] || [];

    // Optimistic update
    const reordered = orderedFeatureIds
      .map((id) => currentFeatures.find((f) => f.id === id))
      .filter((f): f is RoadmapFeature => f !== undefined)
      .map((f, index) => ({ ...f, orderIndex: index }));

    setFeaturesByMilestoneId((prev) => ({
      ...prev,
      [milestoneId]: reordered,
    }));

    try {
      await api.reorderRoadmapFeatures(milestoneId, orderedFeatureIds, projectId);
      // Refresh to get server state
      if (selectedRoadmapIdRef.current) {
        void fetchSelectedRoadmap(selectedRoadmapIdRef.current);
      }
      opts?.onSuccess?.();
    } catch (err) {
      // Rollback to snapshot
      setFeaturesByMilestoneId(snapshot);
      const error = err instanceof Error ? err : new Error("Failed to reorder features");
      opts?.onError?.(error);
      throw error;
    }
  }, [fetchSelectedRoadmap, projectId]);

  const moveFeature = useCallback(async (
    featureId: string,
    targetMilestoneId: string,
    targetIndex: number,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    // Save snapshot for rollback
    const snapshot = featuresByMilestoneIdRef.current;

    // Find which milestone the feature is currently in
    let sourceMilestoneId: string | null = null;
    for (const [milestoneId, features] of Object.entries(snapshot)) {
      if (features.some((f) => f.id === featureId)) {
        sourceMilestoneId = milestoneId;
        break;
      }
    }

    if (!sourceMilestoneId) {
      const error = new Error("Feature not found");
      opts?.onError?.(error);
      throw error;
    }

    // Optimistic update
    const sourceFeatures = snapshot[sourceMilestoneId] || [];
    const targetFeatures = snapshot[targetMilestoneId] || [];
    const feature = sourceFeatures.find((f) => f.id === featureId);

    if (!feature) {
      const error = new Error("Feature not found");
      opts?.onError?.(error);
      throw error;
    }

    // Remove from source
    const newSourceFeatures = sourceFeatures
      .filter((f) => f.id !== featureId)
      .map((f, index) => ({ ...f, orderIndex: index }));

    // Add to target at correct position
    const updatedFeature = { ...feature, milestoneId: targetMilestoneId, orderIndex: targetIndex };
    const newTargetFeatures = [...targetFeatures];
    newTargetFeatures.splice(targetIndex, 0, updatedFeature);
    // Renormalize target
    const normalizedTargetFeatures = newTargetFeatures.map((f, index) => ({ ...f, orderIndex: index }));

    // If moving within same milestone, update source with the new order
    if (sourceMilestoneId === targetMilestoneId) {
      setFeaturesByMilestoneId((prev) => ({
        ...prev,
        [sourceMilestoneId]: normalizedTargetFeatures,
      }));
    } else {
      // Renormalize source after removal
      setFeaturesByMilestoneId((prev) => ({
        ...prev,
        [sourceMilestoneId]: newSourceFeatures,
        [targetMilestoneId]: normalizedTargetFeatures,
      }));
    }

    try {
      await api.moveRoadmapFeature(featureId, targetMilestoneId, targetIndex, projectId);
      // Refresh to get server state
      if (selectedRoadmapIdRef.current) {
        void fetchSelectedRoadmap(selectedRoadmapIdRef.current);
      }
      opts?.onSuccess?.();
    } catch (err) {
      // Rollback to snapshot
      setFeaturesByMilestoneId(snapshot);
      const error = err instanceof Error ? err : new Error("Failed to move feature");
      opts?.onError?.(error);
      throw error;
    }
  }, [fetchSelectedRoadmap, projectId]);

  // ── Milestone Suggestion Actions (Ephemeral) ───────────────────────────────────

  const generateMilestoneSuggestions = useCallback(async (
    goalPrompt: string,
    count: number = 5,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    const currentRoadmapId = selectedRoadmapIdRef.current;
    if (!currentRoadmapId) {
      const error = new Error("No roadmap selected");
      opts?.onError?.(error);
      throw error;
    }

    // Capture project context version for stale-response protection
    const contextVersionAtStart = projectContextVersionRef.current;
    const requestProjectId = projectIdRef.current;

    setIsGeneratingSuggestions(true);

    try {
      const response = await api.generateMilestoneSuggestions(
        currentRoadmapId,
        goalPrompt,
        count,
        requestProjectId
      );

      // Check for stale response
      if (projectContextVersionRef.current !== contextVersionAtStart) {
        // Project context changed during fetch - discard response
        return;
      }

      setMilestoneSuggestions(response.suggestions);
      opts?.onSuccess?.();
    } catch (err) {
      // Check for stale response
      if (projectContextVersionRef.current !== contextVersionAtStart) {
        // Project context changed during fetch - discard error
        return;
      }

      const error = err instanceof Error ? err : new Error("Failed to generate suggestions");
      opts?.onError?.(error);
      throw error;
    } finally {
      // Only clear loading state if context hasn't changed
      if (projectContextVersionRef.current === contextVersionAtStart) {
        setIsGeneratingSuggestions(false);
      }
    }
  }, []);

  const acceptMilestoneSuggestion = useCallback(async (
    index: number,
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    const currentRoadmapId = selectedRoadmapIdRef.current;
    if (!currentRoadmapId) {
      const error = new Error("No roadmap selected");
      opts?.onError?.(error);
      throw error;
    }

    // Capture state for stale-response protection
    const contextVersionAtStart = projectContextVersionRef.current;
    const currentSuggestions = milestoneSuggestions;

    if (index < 0 || index >= currentSuggestions.length) {
      const error = new Error("Invalid suggestion index");
      opts?.onError?.(error);
      throw error;
    }

    const suggestion = currentSuggestions[index];

    // Optimistic update: remove from suggestions immediately
    setMilestoneSuggestions((prev) => prev.filter((_, i) => i !== index));

    try {
      await api.createRoadmapMilestone(
        currentRoadmapId,
        { title: suggestion.title, description: suggestion.description },
        projectIdRef.current
      );

      // Check for stale response
      if (projectContextVersionRef.current !== contextVersionAtStart) {
        // Project context changed - re-add to suggestions (optimistic rollback)
        setMilestoneSuggestions((prev) => {
          const updated = [...prev];
          updated.splice(index, 0, suggestion);
          return updated;
        });
        return;
      }

      // Refresh the roadmap to get the new milestone
      if (selectedRoadmapIdRef.current) {
        void fetchSelectedRoadmap(selectedRoadmapIdRef.current);
      }

      opts?.onSuccess?.();
    } catch (err) {
      // Rollback: re-add to suggestions
      setMilestoneSuggestions((prev) => {
        const updated = [...prev];
        updated.splice(index, 0, suggestion);
        return updated;
      });

      const error = err instanceof Error ? err : new Error("Failed to accept suggestion");
      opts?.onError?.(error);
      throw error;
    }
  }, [milestoneSuggestions, fetchSelectedRoadmap]);

  const acceptAllMilestoneSuggestions = useCallback(async (
    opts?: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    const currentRoadmapId = selectedRoadmapIdRef.current;
    if (!currentRoadmapId) {
      const error = new Error("No roadmap selected");
      opts?.onError?.(error);
      throw error;
    }

    // Capture current suggestions (they will be cleared sequentially)
    const suggestionsToAccept = [...milestoneSuggestions];
    if (suggestionsToAccept.length === 0) {
      return;
    }

    // Clear suggestions immediately (optimistic)
    setMilestoneSuggestions([]);

    // Capture state for stale-response protection
    const contextVersionAtStart = projectContextVersionRef.current;

    // Accept sequentially to preserve order
    for (let i = 0; i < suggestionsToAccept.length; i++) {
      // Check for stale response
      if (projectContextVersionRef.current !== contextVersionAtStart) {
        // Project context changed - stop accepting
        break;
      }

      const suggestion = suggestionsToAccept[i];

      try {
        await api.createRoadmapMilestone(
          currentRoadmapId,
          { title: suggestion.title, description: suggestion.description },
          projectIdRef.current
        );
      } catch (err) {
        // On error, stop accepting and report
        const error = err instanceof Error ? err : new Error("Failed to accept all suggestions");
        opts?.onError?.(error);
        throw error;
      }
    }

    // Check for stale response
    if (projectContextVersionRef.current !== contextVersionAtStart) {
      return;
    }

    // Refresh the roadmap to get all new milestones
    if (selectedRoadmapIdRef.current) {
      void fetchSelectedRoadmap(selectedRoadmapIdRef.current);
    }

    opts?.onSuccess?.();
  }, [milestoneSuggestions, fetchSelectedRoadmap]);

  const clearMilestoneSuggestions = useCallback(() => {
    setMilestoneSuggestions([]);
    setIsGeneratingSuggestions(false);
  }, []);

  const refresh = useCallback(async () => {
    await fetchRoadmaps();
    if (selectedRoadmapIdRef.current) {
      await fetchSelectedRoadmap(selectedRoadmapIdRef.current);
    }
  }, [fetchRoadmaps, fetchSelectedRoadmap]);

  return {
    roadmaps,
    selectedRoadmapId,
    selectedRoadmap,
    milestones,
    featuresByMilestoneId,
    loading,
    error,
    createRoadmap,
    updateRoadmap,
    deleteRoadmap,
    selectRoadmap,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    reorderMilestones,
    createFeature,
    updateFeature,
    deleteFeature,
    reorderFeatures,
    moveFeature,
    milestoneSuggestions,
    isGeneratingSuggestions,
    generateMilestoneSuggestions,
    acceptMilestoneSuggestion,
    acceptAllMilestoneSuggestions,
    clearMilestoneSuggestions,
    refresh,
  };
}
