// chaosnexus-forge/src/lib/pathfinder.ts

/** Represents a rectangular area that the pathfinder should avoid. */
export interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}

/** Binary min-heap keyed by f-score for A* open set. */
class MinHeap {
  private readonly items: Point[] = [];
  private readonly score: (p: Point) => number;

  constructor(score: (p: Point) => number) {
    this.score = score;
  }

  get size(): number {
    return this.items.length;
  }

  push(item: Point): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): Point | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.score(this.items[index]) >= this.score(this.items[parent])) break;
      [this.items[index], this.items[parent]] = [this.items[parent], this.items[index]];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.items.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < length && this.score(this.items[left]) < this.score(this.items[smallest])) {
        smallest = left;
      }
      if (right < length && this.score(this.items[right]) < this.score(this.items[smallest])) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
      index = smallest;
    }
  }
}

function iterationBudget(startG: Point, endG: Point): number {
  const span = Math.abs(endG.x - startG.x) + Math.abs(endG.y - startG.y);
  return Math.min(8000, Math.max(400, span * 80));
}

/**
 * Custom A* pathfinder on a grid of size 20px to find a path from start to end
 * avoiding obstacle rectangles (nodes). Returns list of waypoints.
 */
export function findSmartPath(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  obstacles: Obstacle[]
): Point[] {
  const S = 20; // grid step size
  const margin = 10; // extra margin around nodes

  const toGrid = (val: number) => Math.round(val / S);
  const fromGrid = (val: number) => val * S;

  const startG = { x: toGrid(startX), y: toGrid(startY) };
  const endG = { x: toGrid(endX), y: toGrid(endY) };

  if (startG.x === endG.x && startG.y === endG.y) {
    return [
      { x: startX, y: startY },
      { x: endX, y: endY },
    ];
  }

  const inflated = obstacles.map((obs) => ({
    minX: obs.x - margin,
    maxX: obs.x + obs.width + margin,
    minY: obs.y - margin,
    maxY: obs.y + obs.height + margin,
  }));

  const isBlocked = (gx: number, gy: number) => {
    if ((gx === startG.x && gy === startG.y) || (gx === endG.x && gy === endG.y)) {
      return false;
    }
    const px = fromGrid(gx);
    const py = fromGrid(gy);
    for (const box of inflated) {
      if (px >= box.minX && px <= box.maxX && py >= box.minY && py <= box.maxY) {
        return true;
      }
    }
    return false;
  };

  const keyOf = (p: Point) => `${p.x},${p.y}`;

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const cameFrom = new Map<string, Point>();

  gScore.set(keyOf(startG), 0);
  fScore.set(keyOf(startG), Math.abs(startG.x - endG.x) + Math.abs(startG.y - endG.y));

  const openSet = new MinHeap((p) => fScore.get(keyOf(p)) ?? Infinity);
  openSet.push(startG);

  let iterations = 0;
  const maxIterations = iterationBudget(startG, endG);

  while (openSet.size > 0 && iterations < maxIterations) {
    iterations++;

    const current = openSet.pop()!;

    if (current.x === endG.x && current.y === endG.y) {
      const pathG: Point[] = [current];
      let curr = current;
      while (cameFrom.has(keyOf(curr))) {
        curr = cameFrom.get(keyOf(curr))!;
        pathG.unshift(curr);
      }

      const canvasPath = pathG.map((p) => ({ x: fromGrid(p.x), y: fromGrid(p.y) }));
      canvasPath[0] = { x: startX, y: startY };
      canvasPath[canvasPath.length - 1] = { x: endX, y: endY };

      return smoothPath(canvasPath);
    }

    const neighbors: Point[] = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const neighbor of neighbors) {
      if (isBlocked(neighbor.x, neighbor.y)) continue;

      const tentativeG = (gScore.get(keyOf(current)) ?? Infinity) + 1;
      const neighborG = gScore.get(keyOf(neighbor)) ?? Infinity;

      if (tentativeG < neighborG) {
        cameFrom.set(keyOf(neighbor), current);
        gScore.set(keyOf(neighbor), tentativeG);
        fScore.set(
          keyOf(neighbor),
          tentativeG + Math.abs(neighbor.x - endG.x) + Math.abs(neighbor.y - endG.y)
        );
        openSet.push(neighbor);
      }
    }
  }

  return [
    { x: startX, y: startY },
    { x: endX, y: endY },
  ];
}

/** Simplifies collinear segments to clean up SVG lines. */
function smoothPath(path: Point[]): Point[] {
  if (path.length <= 2) return path;
  const smoothed: Point[] = [path[0]];

  for (let i = 1; i < path.length - 1; i++) {
    const prev = smoothed[smoothed.length - 1];
    const curr = path[i];
    const next = path[i + 1];

    const isCollinear =
      (prev.x === curr.x && curr.x === next.x) || (prev.y === curr.y && curr.y === next.y);

    if (!isCollinear) {
      smoothed.push(curr);
    }
  }

  smoothed.push(path[path.length - 1]);
  return smoothed;
}
