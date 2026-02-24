export const POINTER_TYPES = [
  "knowledge",
  "skill",
  "archetype",
  "breakthrough",
  "context",
] as const;

export type PointerType = (typeof POINTER_TYPES)[number];

export type Pointer = {
  id: string;
  type: PointerType;
  content: string;
  tags: string[];
  weight: number;
  accessCount: number;
  createdAt: number;
  lastAccessedAt: number;
  lineage?: PointerLineage;
};

export type PointerLineage = {
  parentId?: string;
  sourceSession?: string;
  extractedFrom?: string;
};

export type PointerGraphData = {
  version: number;
  pointers: Pointer[];
  lastDecayAt: number;
};

export type ScoredPointer = {
  pointer: Pointer;
  score: number;
};

export type GraphStatus = {
  totalPointers: number;
  byType: Record<PointerType, number>;
  averageWeight: number;
  oldestPointer: number | null;
  newestPointer: number | null;
};

export type SifConfig = {
  graphPath?: string;
  maxContextPointers: number;
  minContextWeight: number;
  decayHalfLifeDays: number;
};
