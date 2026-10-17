/**
 * Dashboard card layout: one reading order plus a column per card. Two snapping
 * columns on wide screens, one on narrow screens (reading order only), so a card
 * can never overlap another or sit off-screen.
 */
export type Column = 0 | 1;
export interface HomeLayout { order: string[]; column: Record<string, Column> }

/** Default: the first half in the left column, the rest on the right (the former flow). */
export function defaultLayout(ids: string[]): HomeLayout {
  const half = Math.ceil(ids.length / 2);
  return { order: [...ids], column: Object.fromEntries(ids.map((id, index) => [id, index < half ? 0 : 1])) };
}

/**
 * Reads a saved layout (v2 object, or the former v1 order array) and reconciles it
 * with the cards currently available: unknown ids are dropped, new cards appended.
 */
export function restoreLayout(saved: unknown, ids: string[]): HomeLayout {
  const fallback = defaultLayout(ids);
  if (Array.isArray(saved)) {
    const order = [...new Set(saved.filter((id): id is string => typeof id === 'string' && ids.includes(id)))];
    return restoreLayout({ order, column: defaultLayout(order).column }, ids);
  }
  if (!saved || typeof saved !== 'object') return fallback;
  const value = saved as { order?: unknown; column?: unknown };
  const order = Array.isArray(value.order) ? [...new Set(value.order.filter((id): id is string => typeof id === 'string' && ids.includes(id)))] : [];
  const column: Record<string, Column> = {};
  const savedColumns = value.column && typeof value.column === 'object' ? value.column as Record<string, unknown> : {};
  for (const id of order) column[id] = savedColumns[id] === 1 ? 1 : 0;
  for (const id of ids) if (!order.includes(id)) { order.push(id); column[id] = fallback.column[id] ?? 0; }
  return { order, column };
}

export function columnsOf(layout: HomeLayout, count: 1 | 2): string[][] {
  if (count === 1) return [[...layout.order]];
  return [0, 1].map(column => layout.order.filter(id => layout.column[id] === column));
}

/** Places `id` at `index` within `column` (index counted without `id` itself). */
export function moveCard(layout: HomeLayout, id: string, column: Column, index: number, count: 1 | 2): HomeLayout {
  if (!layout.order.includes(id)) return layout;
  const rest = layout.order.filter(item => item !== id);
  const nextColumn = { ...layout.column, [id]: count === 2 ? column : layout.column[id] ?? 0 };
  const peers = count === 2 ? rest.filter(item => nextColumn[item] === column) : rest;
  const bounded = Math.max(0, Math.min(index, peers.length));
  let insertAt: number;
  if (bounded < peers.length) insertAt = rest.indexOf(peers[bounded]!);
  else if (peers.length) insertAt = rest.indexOf(peers[peers.length - 1]!) + 1;
  else insertAt = rest.length;
  rest.splice(insertAt, 0, id);
  return { order: rest, column: nextColumn };
}

/** Where a card is now: its column and its index within that column. */
export function positionOf(layout: HomeLayout, id: string, count: 1 | 2): { column: Column; index: number } {
  const columns = columnsOf(layout, count);
  const column = (count === 2 ? layout.column[id] ?? 0 : 0) as Column;
  return { column, index: columns[column]!.indexOf(id) };
}

/** One keyboard step. Up/Down move within a column; Left/Right change column on wide screens. */
export function stepCard(layout: HomeLayout, id: string, key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight', count: 1 | 2): HomeLayout {
  const { column, index } = positionOf(layout, id, count);
  if (key === 'ArrowUp') return index > 0 ? moveCard(layout, id, column, index - 1, count) : layout;
  if (key === 'ArrowDown') return moveCard(layout, id, column, index + 1, count);
  if (count === 1) return layout;
  const target: Column = key === 'ArrowLeft' ? 0 : 1;
  return target === column ? layout : moveCard(layout, id, target, index, count);
}

export function sameLayout(a: HomeLayout, b: HomeLayout): boolean {
  return a.order.join('|') === b.order.join('|') && a.order.every(id => a.column[id] === b.column[id]);
}
