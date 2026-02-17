// ===============================
// Biome Tile Generators
// ===============================
// Each biome type gets its own 1024x1024 heightmap + color map.
// Key design rule: ALL tile edges fade to BIOME_TRANSITION_ALT over
// BIOME_BLEND_WIDTH pixels so the engine's existing 128px overlap
// blending produces seamless biome transitions.
"use strict";

// All biome tile edges converge to this altitude.
// At altitude 72, plains-green color is shown — a neutral "crossover" tone.
var BIOME_TRANSITION_ALT = 72;

// Pixels from edge over which we blend toward BIOME_TRANSITION_ALT.
// Slightly larger than the engine's overlapSize (128) for a smooth gradient.
var BIOME_BLEND_WIDTH = 170;

// All biome tiles use heightScale 1.0.
// Altitude 255 = height 255 units (≈ 3× camera eye level).
// This keeps edge heights compatible across all biome types.
var BIOME_HEIGHT_SCALE = 1.0;

// -----------------------------------------------------------------------
// Edge Fade
// -----------------------------------------------------------------------

// Returns a smooth [0,1] weight: 0 at the tile border, 1 at the interior.
// Used to blend biome altitude toward BIOME_TRANSITION_ALT at all edges.
function biomeEdgeFade(x, y, w, h) {
    var ex = Math.min(x, w - 1 - x) / BIOME_BLEND_WIDTH;
    var ey = Math.min(y, h - 1 - y) / BIOME_BLEND_WIDTH;
    var t  = Math.min(1.0, Math.min(ex, ey));
    return t * t * (3.0 - 2.0 * t);   // smoothstep
}

// -----------------------------------------------------------------------
// Per-biome color functions  (return 0xFFBBGGRR)
// -----------------------------------------------------------------------

function beachColor(altitude, wetFactor, pv) {
    var v  = (pv - 0.5) * 12;
    // Wet sand (wetFactor → 0): grey-tan, damp.  Dry sand (→ 1): bright sandy.
    var r = (148 + v * 0.4) * (1 - wetFactor) + (214 + v * 0.6) * wetFactor;
    var g = (128 + v * 0.3) * (1 - wetFactor) + (178 + v * 0.5) * wetFactor;
    var b = ( 98 + v * 0.2) * (1 - wetFactor) + (106 + v * 0.3) * wetFactor;
    r = Math.max(0, Math.min(255, r | 0));
    g = Math.max(0, Math.min(255, g | 0));
    b = Math.max(0, Math.min(255, b | 0));
    return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
}

function plainsColor(altitude, pv) {
    var v = (pv - 0.5) * 14;
    var r, g, b;
    if (altitude < 65) {
        r = 70 + v;  g = 118 + v;  b = 44 + v * 0.3;
    } else if (altitude < 82) {
        r = 82 + v;  g = 132 + v;  b = 50 + v * 0.3;
    } else {
        r = 100 + v; g = 145 + v * 0.7; b = 52 + v * 0.2;
    }
    r = Math.max(0, Math.min(255, r | 0));
    g = Math.max(0, Math.min(255, g | 0));
    b = Math.max(0, Math.min(255, b | 0));
    return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
}

function hillsColor(altitude, pv) {
    var v = (pv - 0.5) * 14;
    var r, g, b;
    if (altitude < 85) {
        r = 70 + v;  g = 112 + v;  b = 40 + v * 0.3;
    } else if (altitude < 120) {
        r = 60 + v;  g = 96  + v;  b = 36 + v * 0.3;
    } else if (altitude < 148) {
        r = 94 + v;  g = 82  + v * 0.5; b = 52 + v * 0.3;
    } else {
        r = 118 + v * 0.5; g = 106 + v * 0.4; b = 86 + v * 0.3;
    }
    r = Math.max(0, Math.min(255, r | 0));
    g = Math.max(0, Math.min(255, g | 0));
    b = Math.max(0, Math.min(255, b | 0));
    return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
}

function mountainColor(altitude, pv) {
    var v = (pv - 0.5) * 12;
    var r, g, b;
    if (altitude < 105) {
        r = 62 + v;  g = 96  + v;  b = 38 + v * 0.3;
    } else if (altitude < 148) {
        r = 92 + v * 0.6; g = 80 + v * 0.5; b = 58 + v * 0.3;
    } else if (altitude < 188) {
        r = 120 + v * 0.5; g = 110 + v * 0.4; b = 90 + v * 0.3;
    } else if (altitude < 218) {
        r = 122 + v * 0.4; g = 120 + v * 0.4; b = 124 + v * 0.4;
    } else if (altitude < 240) {
        r = 170 + v * 0.2; g = 170 + v * 0.2; b = 178 + v * 0.2;
    } else {
        r = 232; g = 238; b = 248;   // snow cap
    }
    r = Math.max(0, Math.min(255, r | 0));
    g = Math.max(0, Math.min(255, g | 0));
    b = Math.max(0, Math.min(255, b | 0));
    return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
}

// -----------------------------------------------------------------------
// Biome Tile Generators
// -----------------------------------------------------------------------

// BEACH — flat wet sand on the top half, rippled dry sand on the bottom half.
// The directional split simulates the wave-wash line.
function genBeachTile(mapObj, seed) {
    var detailFn = createPerlinNoise((seed ^ 0xBE4CA1) >>> 0);
    var w = mapObj.width, h = mapObj.height;
    mapObj.heightScale = BIOME_HEIGHT_SCALE;

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            // wetFactor: 0 = top of tile (water side), 1 = bottom (dry sand)
            var wetFactor = y / (h - 1);

            var nx = (x / w) * 10.0;
            var ny = (y / h) * 10.0;
            var detail = fbm(detailFn, nx, ny, 4, 2.0, 0.5);   // ~[-0.7, 0.7]

            var wetAlt = 28 + detail * 8;    // 20–36, very flat
            var dryAlt = 46 + detail * 24;   // 29–63, gentle ripples

            var baseAlt = wetAlt + (dryAlt - wetAlt) * wetFactor;

            var fade     = biomeEdgeFade(x, y, w, h);
            var altitude = Math.round(baseAlt * fade + BIOME_TRANSITION_ALT * (1 - fade));
            altitude = Math.max(18, Math.min(72, altitude));

            var idx = (y << mapObj.shift) + x;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx]    = beachColor(altitude, wetFactor, pixelVar(x, y));
        }
    }
}

// PLAINS — gently rolling meadow, low amplitude.
function genPlainsTile(mapObj, seed) {
    var noiseFn = createPerlinNoise((seed ^ 0x7A1B3C4D) >>> 0);
    var w = mapObj.width, h = mapObj.height;
    mapObj.heightScale = BIOME_HEIGHT_SCALE;

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var nx = (x / w) * 3.5;
            var ny = (y / h) * 3.5;
            var n  = fbm(noiseFn, nx, ny, 6, 2.0, 0.5);

            // Remap to [0,1], mostly occupying 52–97
            var t = Math.max(0, Math.min(1, (n + 0.55) / 1.10));
            var baseAlt = 52 + t * 45;

            var fade     = biomeEdgeFade(x, y, w, h);
            var altitude = Math.round(baseAlt * fade + BIOME_TRANSITION_ALT * (1 - fade));
            altitude = Math.max(50, Math.min(100, altitude));

            var idx = (y << mapObj.shift) + x;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx]    = plainsColor(altitude, pixelVar(x, y));
        }
    }
}

// HILLS — 2–3 distinct hill shapes via ridge noise mixed with FBM.
function genHillsTile(mapObj, seed) {
    var noiseFn = createPerlinNoise((seed ^ 0x4F5A6B7C) >>> 0);
    var ridgeFn = createPerlinNoise((seed ^ 0x9C8D7E6F) >>> 0);
    var w = mapObj.width, h = mapObj.height;
    mapObj.heightScale = BIOME_HEIGHT_SCALE;

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var nx = (x / w) * 4.0;
            var ny = (y / h) * 4.0;

            var n        = fbm(noiseFn, nx, ny, 6, 2.0, 0.5);
            var rawRidge = fbm(ridgeFn, nx * 0.8, ny * 0.8, 4, 2.0, 0.5);
            var ridge    = 1.0 - Math.abs(rawRidge);
            ridge = Math.max(0, ridge) * Math.max(0, ridge);   // sharpen peaks

            var combined = n * 0.55 + ridge * 0.45;
            var t = Math.max(0, Math.min(1, Math.pow(
                Math.max(0, (combined + 0.40) / 0.90), 0.85
            )));
            var baseAlt = 68 + t * 88;   // 68–156

            var fade     = biomeEdgeFade(x, y, w, h);
            var altitude = Math.round(baseAlt * fade + BIOME_TRANSITION_ALT * (1 - fade));
            altitude = Math.max(65, Math.min(158, altitude));

            var idx = (y << mapObj.shift) + x;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx]    = hillsColor(altitude, pixelVar(x, y));
        }
    }
}

// MOUNTAIN — one dominant ridged peak with snow cap.
function genMountainTile(mapObj, seed) {
    var noiseFn = createPerlinNoise((seed ^ 0xD1E2F3A4) >>> 0);
    var ridgeFn = createPerlinNoise((seed ^ 0x3C4D5E6F) >>> 0);
    var w = mapObj.width, h = mapObj.height;
    mapObj.heightScale = BIOME_HEIGHT_SCALE;

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var nx = (x / w) * 3.0;
            var ny = (y / h) * 3.0;

            var n        = fbm(noiseFn, nx, ny, 7, 2.0, 0.5);
            var rawRidge = fbm(ridgeFn, nx * 0.6, ny * 0.6, 5, 2.0, 0.5);
            var ridge    = 1.0 - Math.abs(rawRidge);
            ridge = Math.max(0, ridge);
            ridge = ridge * ridge * ridge;   // very sharp peaks

            var combined = n * 0.38 + ridge * 0.62;
            var t = Math.max(0, Math.min(1, Math.pow(
                Math.max(0, (combined + 0.35) / 1.00), 0.74
            )));
            var baseAlt = 88 + t * 167;   // 88–255, snow cap at top

            // Mountain edges blend to a slightly higher neutral (85) to
            // connect naturally with hills tiles.
            var fade     = biomeEdgeFade(x, y, w, h);
            var edgeAlt  = 85;
            var altitude = Math.round(baseAlt * fade + edgeAlt * (1 - fade));
            altitude = Math.max(80, Math.min(255, altitude));

            var idx = (y << mapObj.shift) + x;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx]    = mountainColor(altitude, pixelVar(x, y));
        }
    }
}

// -----------------------------------------------------------------------
// Entry point — generate all 4 biome tiles from one base seed.
// Map slots:
//   maps[0] = map              ← BEACH  (spawn tile uses this)
//   maps[1] = map2             ← PLAINS
//   maps[2] = map3             ← HILLS
//   maps[3] = biomeMapMountain ← MOUNTAIN
// -----------------------------------------------------------------------
function generateBiomeTiles(baseSeed) {
    genBeachTile   (map,              (baseSeed ^ 0x11223344) >>> 0);
    genPlainsTile  (map2,             (baseSeed ^ 0x55667788) >>> 0);
    genHillsTile   (map3,             (baseSeed ^ 0x99AABBCC) >>> 0);
    genMountainTile(biomeMapMountain, (baseSeed ^ 0xDDEEFF11) >>> 0);

    // Expose biomeMapMountain as maps[3] so the rendering system can index it.
    maps[3] = biomeMapMountain;
}
