/**
 * MovementSystem
 * A* pathfinding on the isometric grid + click-to-move logic.
 * Walkability is supplied by an external map-like object.
 */

export interface GridPoint {
  x: number;
  y: number;
}

export interface Walkable {
  isWalkable(x: number, y: number): boolean;
}

interface AStarNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: AStarNode | null;
}

export class MovementSystem {
  private _map: Walkable;

  /** Speed in grid cells per second */
  speed: number;

  /** Current path being walked (world grid coords) */
  private _path: GridPoint[] = [];
  /** Current position in grid coords (float) */
  private _posX = 0;
  private _posY = 0;
  /** Target cell index in _path */
  private _pathIndex = 0;

  /** Callback fired when position changes */
  onMove?: (x: number, y: number, moving: boolean) => void;

  constructor(map: Walkable, speed = 4) {
    this._map = map;
    this.speed = speed;
  }

  get posX(): number { return this._posX; }
  get posY(): number { return this._posY; }
  get isMoving(): boolean { return this._pathIndex < this._path.length; }

  setPosition(x: number, y: number): void {
    this._posX = x;
    this._posY = y;
    this._path = [];
    this._pathIndex = 0;
  }

  /** Request movement to target grid cell. Runs A* and starts walking. */
  moveTo(targetX: number, targetY: number): boolean {
    const startX = Math.round(this._posX);
    const startY = Math.round(this._posY);
    const endX = Math.round(targetX);
    const endY = Math.round(targetY);

    if (!this._isWalkable(endX, endY)) return false;

    const path = this._aStar(startX, startY, endX, endY);
    if (path.length === 0) return false;

    this._path = path;
    this._pathIndex = 0;
    return true;
  }

  /** Call every frame with delta time in seconds. */
  update(delta: number): void {
    if (this._pathIndex >= this._path.length) return;

    const target = this._path[this._pathIndex];
    const dx = target.x - this._posX;
    const dy = target.y - this._posY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = this.speed * delta;

    if (dist <= step) {
      this._posX = target.x;
      this._posY = target.y;
      this._pathIndex++;
      const moving = this._pathIndex < this._path.length;
      this.onMove?.(this._posX, this._posY, moving);
    } else {
      this._posX += (dx / dist) * step;
      this._posY += (dy / dist) * step;
      this.onMove?.(this._posX, this._posY, true);
    }
  }

  stopMovement(): void {
    this._path = [];
    this._pathIndex = 0;
    this.onMove?.(this._posX, this._posY, false);
  }

  // -----------------------------------------------------------------------
  // A* implementation
  // -----------------------------------------------------------------------

  private _aStar(sx: number, sy: number, ex: number, ey: number): GridPoint[] {
    if (sx === ex && sy === ey) return [];

    const open: AStarNode[] = [];
    const closed = new Set<string>();

    const key = (x: number, y: number) => `${x},${y}`;
    const heuristic = (x: number, y: number) =>
      Math.abs(x - ex) + Math.abs(y - ey);

    const startNode: AStarNode = {
      x: sx, y: sy, g: 0, h: heuristic(sx, sy), f: heuristic(sx, sy), parent: null,
    };
    open.push(startNode);

    const openMap = new Map<string, AStarNode>();
    openMap.set(key(sx, sy), startNode);

    // 4-directional movement (no diagonals to keep it clean on iso grid)
    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];

    while (open.length > 0) {
      // Pop node with lowest f
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open.splice(bestIdx, 1)[0];
      openMap.delete(key(current.x, current.y));
      closed.add(key(current.x, current.y));

      if (current.x === ex && current.y === ey) {
        return this._reconstructPath(current);
      }

      for (const dir of dirs) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        const nk = key(nx, ny);

        if (!this._isWalkable(nx, ny) || closed.has(nk)) continue;

        const g = current.g + 1;
        const h = heuristic(nx, ny);
        const f = g + h;

        const existing = openMap.get(nk);
        if (existing && existing.g <= g) continue;

        const node: AStarNode = { x: nx, y: ny, g, h, f, parent: current };
        if (existing) {
          const idx = open.indexOf(existing);
          if (idx !== -1) open.splice(idx, 1);
        }
        open.push(node);
        openMap.set(nk, node);
      }
    }

    return []; // no path found
  }

  private _reconstructPath(node: AStarNode): GridPoint[] {
    const path: GridPoint[] = [];
    let current: AStarNode | null = node;
    while (current !== null) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }
    // Remove start node (we're already there)
    path.shift();
    return path;
  }

  private _isWalkable(x: number, y: number): boolean {
    return this._map.isWalkable(x, y);
  }

  /** Replace the walkability source. */
  setMap(map: Walkable): void {
    this._map = map;
  }
}
