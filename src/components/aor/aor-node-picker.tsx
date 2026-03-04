import type { AorLevelRecord, AorNodeRecord } from '@/lib/contracts';
import { Select } from '@/components/ui';

interface AorNodePickerProps {
  levels: AorLevelRecord[];
  nodes: AorNodeRecord[];
  value: string;
  onChange: (next: string) => void;
}

function flattenTree(levels: AorLevelRecord[], nodes: AorNodeRecord[]): Array<{ id: string; label: string }> {
  const levelById = new Map(levels.map((level) => [level.id, level]));
  const byParent = new Map<string | null, AorNodeRecord[]>();

  for (const node of nodes) {
    const key = node.parentId;
    const bucket = byParent.get(key) ?? [];
    bucket.push(node);
    byParent.set(key, bucket);
  }

  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => a.name.localeCompare(b.name));
  }

  const rows: Array<{ id: string; label: string }> = [];

  function walk(parentId: string | null, depth: number) {
    const children = byParent.get(parentId);
    if (!children) return;

    for (const node of children) {
      const level = levelById.get(node.levelId);
      const prefix = depth > 0 ? `${'-- '.repeat(depth)}` : '';
      rows.push({
        id: node.id,
        label: `${prefix}${level ? `${level.label}: ` : ''}${node.name} (${node.code})`,
      });
      walk(node.id, depth + 1);
    }
  }

  walk(null, 0);
  return rows;
}

export function AorNodePicker({ levels, nodes, value, onChange }: AorNodePickerProps) {
  const items = flattenTree(levels, nodes);

  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select an AOR node</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.label}
        </option>
      ))}
    </Select>
  );
}
