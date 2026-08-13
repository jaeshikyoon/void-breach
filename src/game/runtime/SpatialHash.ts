export interface SpatialItem {
  readonly id: string;
  readonly position: { x: number; y: number };
  readonly radius: number;
  readonly alive: boolean;
}

/** Small allocation-conscious broad phase for dense enemy and projectile queries. */
export class SpatialHash<T extends SpatialItem> {
  private readonly cells = new Map<string, T[]>();
  private readonly seen = new Set<string>();

  constructor(readonly cellSize = 128) {}

  rebuild(items: readonly T[]): void {
    for (const bucket of this.cells.values()) bucket.length = 0;
    for (const item of items) {
      if (!item.alive) continue;
      const minX = Math.floor((item.position.x - item.radius) / this.cellSize);
      const maxX = Math.floor((item.position.x + item.radius) / this.cellSize);
      const minY = Math.floor((item.position.y - item.radius) / this.cellSize);
      const maxY = Math.floor((item.position.y + item.radius) / this.cellSize);
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const key = `${x}:${y}`;
          let bucket = this.cells.get(key);
          if (!bucket) {
            bucket = [];
            this.cells.set(key, bucket);
          }
          bucket.push(item);
        }
      }
    }
  }

  queryCircle(x: number, y: number, radius: number, output: T[] = []): T[] {
    output.length = 0;
    this.seen.clear();
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);
    for (let cellY = minY; cellY <= maxY; cellY += 1) {
      for (let cellX = minX; cellX <= maxX; cellX += 1) {
        const bucket = this.cells.get(`${cellX}:${cellY}`);
        if (!bucket) continue;
        for (const item of bucket) {
          if (this.seen.has(item.id)) continue;
          this.seen.add(item.id);
          const dx = item.position.x - x;
          const dy = item.position.y - y;
          const reach = radius + item.radius;
          if (dx * dx + dy * dy <= reach * reach) output.push(item);
        }
      }
    }
    return output;
  }

  nearest(x: number, y: number, radius: number, predicate?: (item: T) => boolean): T | null {
    const candidates = this.queryCircle(x, y, radius);
    let best: T | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      if (predicate && !predicate(candidate)) continue;
      const dx = candidate.position.x - x;
      const dy = candidate.position.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    return best;
  }
}

