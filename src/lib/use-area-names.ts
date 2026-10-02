'use client';

import { useEffect, useState } from 'react';
import { apiClient } from './apiClient';
import type { AorNodeRecord } from './contracts';

export interface AreaName {
  name: string;
  /** Full Area path from the top level, e.g. "North Area › CWA-1100 Pipe Rack". */
  path: string;
}

export function buildAreaNames(nodes: readonly AorNodeRecord[]): Map<string, AreaName> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const names = new Map<string, AreaName>();
  for (const node of nodes) {
    const trail: string[] = [];
    const seen = new Set<string>();
    let current: AorNodeRecord | undefined = node;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      trail.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    names.set(node.id, { name: node.name, path: trail.join(' › ') });
  }
  return names;
}

/**
 * Display-only Area labels for request lists. Uses the project Area tree that
 * every project member can already read; a failed lookup simply hides labels.
 */
export function useAreaNames(projectId: string): Map<string, AreaName> {
  const [names, setNames] = useState<Map<string, AreaName>>(() => new Map());
  useEffect(() => {
    let active = true;
    apiClient.listAorTree(projectId)
      .then((tree) => { if (active) setNames(buildAreaNames(tree.nodes)); })
      .catch(() => { if (active) setNames(new Map()); });
    return () => { active = false; };
  }, [projectId]);
  return names;
}
