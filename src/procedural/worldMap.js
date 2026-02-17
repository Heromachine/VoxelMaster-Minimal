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
// `range` controls how many cells outward we check (1 = immediate neighbors).
function wm_checkConflicts(grid, gx, gy, range) {
    var centerType = grid[gy * WORLD_MAP_SIZE + gx];
    if (centerType === 0) return 0;   // undecided: no conflict

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

// Generate a 16x16 biome world map.
// Strategy:
//   1. Seed the grid with distance-based biome probabilities
//      (beach on the outer ring, mountains toward the center).
//   2. Run minimum-conflicts passes until no violations remain.
//   3. Force spawn-area cells to BEACH so the player starts on flat ground.
//
// Returns a Uint8Array of length WORLD_MAP_SIZE * WORLD_MAP_SIZE.
function generateWorldMap(seed) {
    var rng  = mulberry32((seed ^ 0xC0FFEE42) >>> 0);
    var size = WORLD_MAP_SIZE;
    var grid = new Uint8Array(size * size);

    // ---- Step 1: distance-based initial seeding ----
    var cx = (size - 1) * 0.5;
    var cy = (size - 1) * 0.5;

    for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
            var dx   = (x - cx) / (size * 0.5);
            var dy   = (y - cy) / (size * 0.5);
            var dist = Math.sqrt(dx * dx + dy * dy);   // ~0 center, ~1.4 corner
            var r    = rng();

            if (dist > 0.90) {
                grid[y * size + x] = (r < 0.85) ? BIOME_BEACH : BIOME_PLAINS;
            } else if (dist > 0.70) {
                grid[y * size + x] = (r < 0.55) ? BIOME_BEACH : BIOME_PLAINS;
            } else if (dist > 0.50) {
                grid[y * size + x] = (r < 0.55) ? BIOME_PLAINS : BIOME_HILLS;
            } else if (dist > 0.30) {
                grid[y * size + x] = (r < 0.50) ? BIOME_HILLS : BIOME_MOUNTAIN;
            } else {
                grid[y * size + x] = (r < 0.75) ? BIOME_MOUNTAIN : BIOME_HILLS;
            }
        }
    }

    // ---- Step 2: minimum-conflicts resolution ----
    var range    = 2;        // check 2 cells in each direction
    var maxPasses = 100;
    var total    = size * size;

    for (var pass = 0; pass < maxPasses; pass++) {
        var anyConflict = false;

        for (var iter = 0; iter < total; iter++) {
            var gx = Math.floor(rng() * size);
            var gy = Math.floor(rng() * size);
            var numConflicts = wm_checkConflicts(grid, gx, gy, range);

            if (numConflicts > 0) {
                anyConflict = true;

                // Try BIOME_COUNT * 2 random biome types; keep the best one
                var bestType      = grid[gy * size + gx];
                var leastConflicts = numConflicts;

                for (var tries = 0; tries < BIOME_COUNT * 2; tries++) {
                    var tryType = 1 + Math.floor(rng() * BIOME_COUNT);
                    grid[gy * size + gx] = tryType;
                    var c = wm_checkConflicts(grid, gx, gy, range);
                    if (c < leastConflicts) {
                        leastConflicts = c;
                        bestType = tryType;
                    }
                }
                grid[gy * size + gx] = bestType;
            }
        }

        if (!anyConflict) break;
    }

    // ---- Step 3: force spawn area to beach ----
    // Tile (0,0) → world map cell (8,8); tile (1,0) → (9,8).
    // Beach can be adjacent to plains, so this never introduces a violation.
    grid[8 * size + 8] = BIOME_BEACH;
    grid[8 * size + 9] = BIOME_BEACH;

    return grid;
}
