// ===============================
// World Map — Biome Layout via Constraint Satisfaction
// ===============================
// Generates a low-resolution biome grid using the minimum-conflicts
// local search algorithm (as described by Terry Soul / Programming Chaos).
// Each cell in this 16x16 grid maps to one tile in the game world.
"use strict";

// Biome type constants (used by worldMap, biomeGen, mapLoader)
var BIOME_BEACH    = 1;
var BIOME_PLAINS   = 2;
var BIOME_HILLS    = 3;
var BIOME_MOUNTAIN = 4;
var BIOME_COUNT    = 4;   // number of defined biome types

// World map grid dimension
var WORLD_MAP_SIZE = 16;

// Adjacency constraint table: NOT_ALLOWED[a][b] = 1 means biome a cannot be
// directly adjacent to biome b.
//
//              0  B  P  H  M
var BIOME_NOT_ALLOWED = [
    [0, 0, 0, 0, 0],  // 0: empty/undecided — no restrictions
    [0, 0, 0, 1, 1],  // 1: BEACH  — ok with beach & plains; NOT hills or mountain
    [0, 0, 0, 0, 0],  // 2: PLAINS — ok with everything
    [0, 1, 0, 0, 0],  // 3: HILLS  — NOT beach
    [0, 1, 0, 0, 0],  // 4: MOUNTAIN — NOT beach
];

// Count how many adjacency constraint violations exist for cell (gx, gy).
function wm_checkConflicts(grid, gx, gy, range) {
    var centerType = grid[gy * WORLD_MAP_SIZE + gx];
    if (centerType === 0) return 0;

    var conflicts = 0;
    for (var dy = -range; dy <= range; dy++) {
        for (var dx = -range; dx <= range; dx++) {
            if (dx === 0 && dy === 0) continue;
            var nx = (gx + dx + WORLD_MAP_SIZE) % WORLD_MAP_SIZE;
            var ny = (gy + dy + WORLD_MAP_SIZE) % WORLD_MAP_SIZE;
            var neighborType = grid[ny * WORLD_MAP_SIZE + nx];
            if (neighborType === 0) continue;
            if (BIOME_NOT_ALLOWED[centerType][neighborType]) {
                conflicts++;
            }
        }
    }
    return conflicts;
}

// -----------------------------------------------------------------------
// Mountain ridge generator
// -----------------------------------------------------------------------
// Mountains are placed as connected fault-line walks, NOT via Voronoi.
// This guarantees all mountain cells are connected to at least one neighbor.
// Walks are bounded to the inner playable area (cells 3–12) so they never
// land on spawn tiles (8,8)/(9,8) or the border ring (cells 2 and 13).
//
// The walk is cardinal-direction only (N/E/S/W).  A branch is optionally
// grown from a cell already on the ridge, giving a T or L junction.
function generateMountainRidges(rng, size, grid) {
    var DX = [0, 1, 0, -1];
    var DY = [-1, 0, 1, 0];

    function isSpawn(x, y) { return (x === 8 && y === 8) || (x === 9 && y === 8); }
    // Restrict mountains to inner playable tiles only (3..12 in cell space)
    function inPlayable(x, y) { return x >= 3 && x <= 12 && y >= 3 && y <= 12; }

    function walk(startX, startY, length) {
        var x = startX, y = startY;
        var dir = Math.floor(rng() * 4);
        for (var step = 0; step < length; step++) {
            if (inPlayable(x, y) && !isSpawn(x, y)) {
                grid[y * size + x] = BIOME_MOUNTAIN;
            }
            // 30 % chance to turn left or right
            if (rng() < 0.30) dir = (dir + (rng() < 0.5 ? 1 : 3)) % 4;

            var nx = x + DX[dir];
            var ny = y + DY[dir];
            if (!inPlayable(nx, ny)) {
                // Bounce: try a perpendicular, then reverse
                dir = (dir + (rng() < 0.5 ? 1 : 3)) % 4;
                nx = x + DX[dir]; ny = y + DY[dir];
                if (!inPlayable(nx, ny)) { dir = (dir + 2) % 4; nx = x + DX[dir]; ny = y + DY[dir]; }
            }
            if (inPlayable(nx, ny)) { x = nx; y = ny; }
        }
    }

    // Primary ridge: 6–11 cells long, starts at a random inner position
    var sx, sy, att = 0;
    do {
        sx = 3 + Math.floor(rng() * 10);
        sy = 3 + Math.floor(rng() * 10);
    } while (isSpawn(sx, sy) && ++att < 20);

    walk(sx, sy, 6 + Math.floor(rng() * 6));

    // Optional branch (65 % chance): grows from a random existing mountain cell
    if (rng() < 0.65) {
        var mc = [];
        for (var cy = 3; cy <= 12; cy++) {
            for (var cx = 3; cx <= 12; cx++) {
                if (grid[cy * size + cx] === BIOME_MOUNTAIN) mc.push({ x: cx, y: cy });
            }
        }
        if (mc.length > 0) {
            var sc = mc[Math.floor(rng() * mc.length)];
            walk(sc.x, sc.y, 2 + Math.floor(rng() * 5));
        }
    }
}

// -----------------------------------------------------------------------
// World map generator
// -----------------------------------------------------------------------
// Strategy:
//   1. Voronoi seeding for non-mountain biomes (beach, plains, hills).
//   2. Overlay connected mountain ridges via random walks.
//   3. Constraint satisfaction to fix beach-adjacent-to-mountain violations
//      (mountain cells are locked; only non-mountain cells are adjusted).
//   4. Force spawn-area cells to BEACH.
//
// Returns a Uint8Array of length WORLD_MAP_SIZE * WORLD_MAP_SIZE.
function generateWorldMap(seed) {
    var rng  = mulberry32((seed ^ 0xC0FFEE42) >>> 0);
    var size = WORLD_MAP_SIZE;
    var grid = new Uint8Array(size * size);

    // ---- Step 1: Voronoi seeding (no mountains — those come from ridges) ----
    var numSeeds = 8 + Math.floor(rng() * 8);
    var voronoi  = [];
    for (var s = 0; s < numSeeds; s++) {
        var bp = rng();
        var biome = bp < 0.30 ? BIOME_BEACH : (bp < 0.65 ? BIOME_PLAINS : BIOME_HILLS);
        voronoi.push({ x: rng() * size, y: rng() * size, biome: biome });
    }

    for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
            var nearestDist  = Infinity;
            var nearestBiome = BIOME_PLAINS;
            for (var s = 0; s < voronoi.length; s++) {
                var ddx = x - voronoi[s].x;
                var ddy = y - voronoi[s].y;
                var dd  = ddx * ddx + ddy * ddy;
                if (dd < nearestDist) { nearestDist = dd; nearestBiome = voronoi[s].biome; }
            }
            grid[y * size + x] = nearestBiome;
        }
    }

    // ---- Step 2: Overlay mountain ridges ----
    generateMountainRidges(rng, size, grid);

    // ---- Step 3: minimum-conflicts (mountain cells are locked) ----
    // Any non-mountain cell adjacent to a mountain must become plains or hills —
    // the constraint table already encodes this; the resolver picks the best type.
    var range    = 1;
    var maxPasses = 100;
    var total    = size * size;

    for (var pass = 0; pass < maxPasses; pass++) {
        var anyConflict = false;
        for (var iter = 0; iter < total; iter++) {
            var gx = Math.floor(rng() * size);
            var gy = Math.floor(rng() * size);
            if (grid[gy * size + gx] === BIOME_MOUNTAIN) continue; // locked

            var numConflicts = wm_checkConflicts(grid, gx, gy, range);
            if (numConflicts > 0) {
                anyConflict = true;
                var bestType       = grid[gy * size + gx];
                var leastConflicts = numConflicts;
                for (var tries = 0; tries < 8; tries++) {
                    var tr = rng();
                    var tryType = tr < 0.40 ? BIOME_PLAINS : (tr < 0.70 ? BIOME_HILLS : BIOME_BEACH);
                    grid[gy * size + gx] = tryType;
                    var c = wm_checkConflicts(grid, gx, gy, range);
                    if (c < leastConflicts) { leastConflicts = c; bestType = tryType; }
                }
                grid[gy * size + gx] = bestType;
            }
        }
        if (!anyConflict) break;
    }

    // ---- Step 4: force spawn area to beach ----
    grid[8 * size + 8] = BIOME_BEACH;
    grid[8 * size + 9] = BIOME_BEACH;

    return grid;
}
