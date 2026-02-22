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

            // Remap altitude → color range [120, 158] to skip the green/mossy zones
            // (hillsColor gives moss at < 120, rocky/brown at 120+).
            var colorAlt = Math.round(120 + (altitude - 65) / (158 - 65) * (158 - 120));
            colorAlt = Math.max(120, Math.min(158, colorAlt));

            var idx = (y << mapObj.shift) + x;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx]    = hillsColor(colorAlt, pixelVar(x, y));
        }
    }
}

// Hills end-cap: same hills terrain but tapers from full hills height at the
// open/connected end down to BIOME_TRANSITION_ALT at the cap end, so the mossy
// green appears naturally where the hills descend to ground level.
// Key: 'N_HCAP' = cap at north (enters from south), 'S_HCAP', 'E_HCAP', 'W_HCAP'.
function genHillsEndCapTile(mapObj, seed, key) {
    var noiseFn = createPerlinNoise((seed ^ 0x4F5A6B7C) >>> 0);
    var ridgeFn = createPerlinNoise((seed ^ 0x9C8D7E6F) >>> 0);
    var w = mapObj.width, h = mapObj.height;
    mapObj.heightScale = BIOME_HEIGHT_SCALE;

    var isNS = (key === 'N_HCAP' || key === 'S_HCAP');

    // ridgeEdgeFade handles perpendicular edges only; capTaper handles the axis
    var hasN = isNS, hasS = isNS, hasE = !isNS, hasW = !isNS;

    for (var y = 0; y < h; y++) {
        var ly = y / (h - 1);
        for (var x = 0; x < w; x++) {
            var lx = x / (w - 1);

            // capTaper: 1 at open/connected end, 0 at cap end (mossy)
            var axisT;
            if      (key === 'N_HCAP') axisT = ly;        // cap at north (y=0), open at south
            else if (key === 'S_HCAP') axisT = 1.0 - ly;  // cap at south, open at north
            else if (key === 'E_HCAP') axisT = 1.0 - lx;  // cap at east,  open at west
            else                       axisT = lx;          // W_HCAP: cap at west, open at east
            var capTaper = axisT * axisT * (3.0 - 2.0 * axisT);  // smoothstep

            var nx = lx * 4.0, ny = ly * 4.0;

            var n        = fbm(noiseFn, nx, ny, 6, 2.0, 0.5);
            var rawRidge = fbm(ridgeFn, nx * 0.8, ny * 0.8, 4, 2.0, 0.5);
            var ridge    = 1.0 - Math.abs(rawRidge);
            ridge = Math.max(0, ridge) * Math.max(0, ridge);

            var combined = n * 0.55 + ridge * 0.45;
            var t = Math.max(0, Math.min(1, Math.pow(
                Math.max(0, (combined + 0.40) / 0.90), 0.85
            )));
            var rawBaseAlt = 68 + t * 88;   // 68–156 — same as plain hills

            // Taper the full height down to the mossy ground level at the cap end
            var baseAlt = BIOME_TRANSITION_ALT + (rawBaseAlt - BIOME_TRANSITION_ALT) * capTaper;

            // Fade perpendicular edges; capTaper handles the along-axis slope
            var fade     = ridgeEdgeFade(x, y, w, h, hasN, hasS, hasE, hasW);
            var altitude = Math.round(baseAlt * fade + BIOME_TRANSITION_ALT * (1 - fade));
            altitude = Math.max(65, Math.min(158, altitude));

            // Use hillsColor directly — moss (green) will appear at low altitudes near the cap
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
// Directed mountain tile generation
// -----------------------------------------------------------------------

// Distance from point (px, py) to line segment (ax, ay)→(bx, by).
function distToSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    if (len2 < 1e-10) return Math.sqrt((px-ax)*(px-ax) + (py-ay)*(py-ay));
    var t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / len2));
    var qx = ax + t*dx, qy = ay + t*dy;
    return Math.sqrt((px-qx)*(px-qx) + (py-qy)*(py-qy));
}

// Directional edge fade: only fade toward edges NOT connected to another mountain tile.
// Connected edges stay at full height so adjacent tiles can continue the ridge.
function ridgeEdgeFade(x, y, w, h, hasN, hasS, hasE, hasW) {
    var INF = 1e9;
    var fx = INF, fy = INF;
    if (!hasW) fx = Math.min(fx, x / BIOME_BLEND_WIDTH);
    if (!hasE) fx = Math.min(fx, (w - 1 - x) / BIOME_BLEND_WIDTH);
    if (!hasN) fy = Math.min(fy, y / BIOME_BLEND_WIDTH);
    if (!hasS) fy = Math.min(fy, (h - 1 - y) / BIOME_BLEND_WIDTH);
    var t = Math.min(1.0, Math.min(fx, fy));
    if (t >= INF) t = 1.0;
    return t * t * (3.0 - 2.0 * t);   // smoothstep
}

// Generate a 1024x1024 mountain tile whose ridge runs in the direction
// indicated by ridgeKey (e.g. "NS", "NE", "SEW", "NSEW", "ISO", …).
//
// Height profile: high along the ridge path, falls off to ~85 on the sides.
// The sides that connect to adjacent mountain tiles are NOT edge-blended —
// the ridge extends all the way to those edges so neighboring tiles continue it.
function genDirectionalMountainTile(mapObj, seed, ridgeKey) {
    var detailFn = createPerlinNoise((seed ^ 0xF00DCAFE) >>> 0);
    var warpFn   = createPerlinNoise((seed ^ 0xA1B2C3D4) >>> 0);  // domain warp
    var elevFn   = createPerlinNoise((seed ^ 0x9E8D7C6B) >>> 0);  // along-ridge elevation
    var w = mapObj.width, h = mapObj.height;
    mapObj.heightScale = BIOME_HEIGHT_SCALE;

    var hasN = ridgeKey.indexOf('N') >= 0;
    var hasS = ridgeKey.indexOf('S') >= 0;
    var hasE = ridgeKey.indexOf('E') >= 0;
    var hasW = ridgeKey.indexOf('W') >= 0;
    var connCount = (hasN?1:0) + (hasS?1:0) + (hasE?1:0) + (hasW?1:0);

    var RIDGE_HW   = 0.28;  // half-width of ridge in normalised [0,1] coords
    var BASE_ALT   = 82;    // altitude far from ridge
    var PEAK_MAX   = 248;   // maximum ridge crest altitude (snow cap)
    var PEAK_MIN   = 148;   // minimum ridge crest altitude (mountain pass)
    var NOISE_AMP  = 22;    // ±detail noise amplitude
    var WARP_AMP   = 0.14;  // domain warp amplitude (fraction of tile width)
    var WARP_FREQ  = 3.2;   // warp spatial frequency

    for (var py = 0; py < h; py++) {
        var ly = py / (h - 1);   // 0 = north edge, 1 = south edge
        for (var px = 0; px < w; px++) {
            var lx = px / (w - 1);   // 0 = west edge, 1 = east edge

            // ---- Domain warp: perturb sample coords before computing ridge dist ----
            // Uses two independent noise passes with offset seeds to get dx, dy.
            // This bends the ridge organically rather than leaving it geometric.
            var wx  = fbm(warpFn, lx * WARP_FREQ,       ly * WARP_FREQ,       3, 2.0, 0.5) * WARP_AMP;
            var wy  = fbm(warpFn, lx * WARP_FREQ + 4.7, ly * WARP_FREQ + 1.9, 3, 2.0, 0.5) * WARP_AMP;
            var wlx = lx + wx;
            var wly = ly + wy;

            // ---- Compute distance to the ridge path (using warped coords) ----
            var ridgeDist;

            if      (hasN && hasS && !hasE && !hasW) {
                ridgeDist = Math.abs(wlx - 0.5);

            } else if (hasE && hasW && !hasN && !hasS) {
                ridgeDist = Math.abs(wly - 0.5);

            } else if (hasN && hasE && !hasS && !hasW) {
                ridgeDist = Math.abs(Math.sqrt((wlx-1)*(wlx-1) + wly*wly) - 0.5);

            } else if (hasN && hasW && !hasS && !hasE) {
                ridgeDist = Math.abs(Math.sqrt(wlx*wlx + wly*wly) - 0.5);

            } else if (hasS && hasE && !hasN && !hasW) {
                ridgeDist = Math.abs(Math.sqrt((wlx-1)*(wlx-1) + (wly-1)*(wly-1)) - 0.5);

            } else if (hasS && hasW && !hasN && !hasE) {
                ridgeDist = Math.abs(Math.sqrt(wlx*wlx + (wly-1)*(wly-1)) - 0.5);

            } else {
                var minD = 1e9;
                if (hasN) minD = Math.min(minD, distToSeg(wlx, wly, 0.5, 0.5, 0.5, 0.0));
                if (hasS) minD = Math.min(minD, distToSeg(wlx, wly, 0.5, 0.5, 0.5, 1.0));
                if (hasE) minD = Math.min(minD, distToSeg(wlx, wly, 0.5, 0.5, 1.0, 0.5));
                if (hasW) minD = Math.min(minD, distToSeg(wlx, wly, 0.5, 0.5, 0.0, 0.5));
                if (connCount === 0) {
                    minD = Math.sqrt((wlx-0.5)*(wlx-0.5) + (wly-0.5)*(wly-0.5));
                }
                ridgeDist = minD;
            }

            // ---- Ridge height profile: quadratic falloff from crest ----
            var profile = Math.max(0, 1.0 - ridgeDist / RIDGE_HW);
            profile = profile * profile;

            // ---- Along-ridge elevation variation (peaks and saddles) ----
            // Low-frequency noise that moves the effective peak altitude up and down.
            // At profile=1 (crest) the altitude can range from PEAK_MIN to PEAK_MAX.
            // At profile=0 (far from ridge) it converges to BASE_ALT regardless.
            var elevRaw = fbm(elevFn, lx * 1.4, ly * 1.4, 4, 2.0, 0.5);
            var elevT   = Math.max(0, Math.min(1, (elevRaw + 0.60) / 1.20));
            var dynamicPeak = PEAK_MIN + elevT * (PEAK_MAX - PEAK_MIN);

            // ---- Detail noise ----
            var nx = (px / w) * 5.0;
            var ny = (py / h) * 5.0;
            var noise = fbm(detailFn, nx, ny, 5, 2.0, 0.5) * NOISE_AMP;

            var baseAlt = BASE_ALT + (dynamicPeak - BASE_ALT) * profile + noise;

            // ---- Directional edge fade ----
            var fade    = ridgeEdgeFade(px, py, w, h, hasN, hasS, hasE, hasW);
            var edgeAlt = 85;
            var altitude = Math.round(baseAlt * fade + edgeAlt * (1 - fade));
            altitude = Math.max(80, Math.min(255, altitude));

            var idx = (py << mapObj.shift) + px;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx]    = mountainColor(altitude, pixelVar(px, py));
        }
    }
}

// -----------------------------------------------------------------------
// Multi-peak mountain tile  (key: 'PEAK')
// -----------------------------------------------------------------------
// Places 2–4 peaks of randomised heights and positions across the tile.
// Each peak is a quadratic cone; the tile altitude at any point is the
// maximum contribution from all peaks, so peaks merge into a range rather
// than a single dome.  heightScale = 2.0 for Ridge-comparable height.
// Color is remapped to [188, 255] (grey → snow only) — no brown, no green.
function genPeakMountainTile(mapObj, seed) {
    var detailFn  = createPerlinNoise((seed ^ 0xB5C6D7E8) >>> 0);
    var warpFn    = createPerlinNoise((seed ^ 0x3F2E1D0C) >>> 0);
    var speckleFn = createPerlinNoise((seed ^ 0x7C8D9EAF) >>> 0);  // color-only speckle
    var rng       = mulberry32((seed ^ 0x5E6F7A8B) >>> 0);
    var w = mapObj.width, h = mapObj.height;

    var PEAK_HS     = 2.0;   // height scale — same as Ridge tile
    mapObj.heightScale = PEAK_HS;

    var BASE_ALT    = 82;    // world-space edge altitude (matches scale-1.0 neighbours)
    var NOISE_AMP   = 14;
    var WARP_AMP    = 0.09;
    var WARP_FREQ   = 2.6;

    var edgeFadeAlt = Math.round(BASE_ALT / PEAK_HS);  // = 41 (data-space)

    // Place 2–4 peaks with seeded positions, heights, and radii.
    // cx/cy are in [0.2, 0.8] — never right at the tile corner.
    // peakMax in [185, 252] gives world heights from 370 to 504 units.
    // radius in [0.30, 0.55] — narrower peaks look sharper, wider ones form ridges.
    var numPeaks = 2 + Math.floor(rng() * 3);   // 2, 3, or 4
    var peaks = [];
    for (var p = 0; p < numPeaks; p++) {
        peaks.push({
            cx:      0.20 + rng() * 0.60,
            cy:      0.20 + rng() * 0.60,
            peakMax: 185  + Math.floor(rng() * 68),   // 185–252
            radius:  0.30 + rng() * 0.25              // 0.30–0.55
        });
    }

    for (var py = 0; py < h; py++) {
        var ly = py / (h - 1);
        for (var px = 0; px < w; px++) {
            var lx = px / (w - 1);

            // Domain warp — breaks perfect circular symmetry
            var wx  = fbm(warpFn, lx * WARP_FREQ,       ly * WARP_FREQ,       3, 2.0, 0.5) * WARP_AMP;
            var wy  = fbm(warpFn, lx * WARP_FREQ + 5.3, ly * WARP_FREQ + 2.1, 3, 2.0, 0.5) * WARP_AMP;
            var wlx = lx + wx, wly = ly + wy;

            // Maximum contribution across all peaks — peaks merge where they overlap.
            var peakAlt = edgeFadeAlt;
            for (var p = 0; p < numPeaks; p++) {
                var pk   = peaks[p];
                var ddx  = wlx - pk.cx, ddy = wly - pk.cy;
                var dist = Math.sqrt(ddx * ddx + ddy * ddy);
                var t    = Math.max(0, 1.0 - dist / pk.radius);
                var contrib = edgeFadeAlt + (pk.peakMax - edgeFadeAlt) * (t * t);
                if (contrib > peakAlt) peakAlt = contrib;
            }

            var noise   = fbm(detailFn, (px / w) * 5.0, (py / h) * 5.0, 5, 2.0, 0.5) * NOISE_AMP;
            var baseAlt = peakAlt + noise;

            // Fade all four edges to edgeFadeAlt → world-space BASE_ALT at seams.
            var fade     = biomeEdgeFade(px, py, w, h);
            var altitude = Math.round(baseAlt * fade + edgeFadeAlt * (1 - fade));
            altitude     = Math.max(38, Math.min(255, altitude));

            // Remap to [188, 255] base range (grey-rock → snow), then add a
            // high-frequency speckle that can pull individual pixels down into the
            // mid-grey (148–188) or dark-grey range for surface texture variation.
            var speckle  = fbm(speckleFn, (px / w) * 18.0, (py / h) * 18.0, 3, 2.0, 0.5) * 42;
            var colorAlt = Math.round(188 + (altitude - edgeFadeAlt) / (255 - edgeFadeAlt) * (255 - 188) + speckle);
            colorAlt = Math.max(148, Math.min(255, colorAlt));  // allow down to dark-grey band

            var idx = (py << mapObj.shift) + px;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx]    = mountainColor(colorAlt, pixelVar(px, py));
        }
    }
}

// -----------------------------------------------------------------------
// Single-peak mountain tile  (key: 'PEAK1')
// -----------------------------------------------------------------------
// One centered cone at heightScale 2.0.  Uses a cubic falloff (sharper than
// the multi-peak quadratic) and the same grey/white speckle coloring.
function genSinglePeakMountainTile(mapObj, seed) {
    var detailFn  = createPerlinNoise((seed ^ 0xD4E5F6A7) >>> 0);
    var warpFn    = createPerlinNoise((seed ^ 0x1A2B3C4D) >>> 0);
    var speckleFn = createPerlinNoise((seed ^ 0x9F0E1D2C) >>> 0);
    var w = mapObj.width, h = mapObj.height;

    var PEAK_HS     = 2.0;
    mapObj.heightScale = PEAK_HS;

    var BASE_ALT    = 82;
    var PEAK_MAX    = 252;   // data-space → 504 world units
    var NOISE_AMP   = 14;
    var FALLOFF_R   = 0.82;  // wide enough to fill most of the tile
    var WARP_AMP    = 0.11;
    var WARP_FREQ   = 2.5;

    var edgeFadeAlt = Math.round(BASE_ALT / PEAK_HS);  // = 41

    for (var py = 0; py < h; py++) {
        var ly = py / (h - 1);
        for (var px = 0; px < w; px++) {
            var lx = px / (w - 1);

            var wx  = fbm(warpFn, lx * WARP_FREQ,       ly * WARP_FREQ,       3, 2.0, 0.5) * WARP_AMP;
            var wy  = fbm(warpFn, lx * WARP_FREQ + 5.3, ly * WARP_FREQ + 2.1, 3, 2.0, 0.5) * WARP_AMP;
            var wlx = lx + wx, wly = ly + wy;

            // Single centered cone — cubic falloff for a sharp, defined summit.
            var dist    = Math.sqrt((wlx - 0.5) * (wlx - 0.5) + (wly - 0.5) * (wly - 0.5));
            var t       = Math.max(0, 1.0 - dist / FALLOFF_R);
            var profile = t * t * t;

            var noise   = fbm(detailFn, (px / w) * 5.0, (py / h) * 5.0, 5, 2.0, 0.5) * NOISE_AMP;
            var baseAlt = edgeFadeAlt + (PEAK_MAX - edgeFadeAlt) * profile + noise;

            var fade     = biomeEdgeFade(px, py, w, h);
            var altitude = Math.round(baseAlt * fade + edgeFadeAlt * (1 - fade));
            altitude     = Math.max(38, Math.min(255, altitude));

            var speckle  = fbm(speckleFn, (px / w) * 18.0, (py / h) * 18.0, 3, 2.0, 0.5) * 42;
            var colorAlt = Math.round(188 + (altitude - edgeFadeAlt) / (255 - edgeFadeAlt) * (255 - 188) + speckle);
            colorAlt = Math.max(148, Math.min(255, colorAlt));

            var idx = (py << mapObj.shift) + px;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx]    = mountainColor(colorAlt, pixelVar(px, py));
        }
    }
}

// Scan the world map, find every unique mountain ridge configuration, allocate
// one 1024x1024 map per configuration, and extend the global maps[] array.
// Stores window.mountainRidgeMapIndex = { ridgeKey → mapIndex }.
function generateMountainRidgeTiles(baseSeed) {
    if (!window.worldMapData) return;

    var grid = window.worldMapData;
    var s    = WORLD_MAP_SIZE;

    // Collect unique ridge keys from the playable inner area (cells 3–12)
    var keyToMap = {};   // ridgeKey → newly allocated map object

    for (var gy = 3; gy <= 12; gy++) {
        for (var gx = 3; gx <= 12; gx++) {
            if (grid[gy * s + gx] !== BIOME_MOUNTAIN) continue;
            var key = getMountainRidgeKey(grid, gx, gy);
            if (keyToMap[key]) continue;   // already created

            var mMap = {
                width:       1024,
                height:      1024,
                shift:       10,
                altitude:    new Uint8Array(1024 * 1024),
                color:       new Uint32Array(1024 * 1024),
                heightScale: BIOME_HEIGHT_SCALE
            };
            genDirectionalMountainTile(mMap, (baseSeed ^ (key.length * 0xDEAD + key.charCodeAt(0) * 0xBEEF)) >>> 0, key);
            keyToMap[key] = mMap;
        }
    }

    // Add new maps to the global maps[] array (starting after the 4 base biomes)
    var nextIdx = 4;
    window.mountainRidgeMapIndex = {};
    for (var k in keyToMap) {
        maps[nextIdx] = keyToMap[k];
        window.mountainRidgeMapIndex[k] = nextIdx;
        nextIdx++;
    }

    // Always generate the peak tile so it is available in the editor
    // for any world, even if no isolated mountain cell exists naturally.
    var peakMap = {
        width:    1024, height:   1024, shift: 10,
        altitude: new Uint8Array(1024 * 1024),
        color:    new Uint32Array(1024 * 1024),
        heightScale: BIOME_HEIGHT_SCALE
    };
    genPeakMountainTile(peakMap, (baseSeed ^ 0xCAFEBABE) >>> 0);
    maps[nextIdx] = peakMap;
    window.mountainRidgeMapIndex['PEAK'] = nextIdx;
    nextIdx++;

    // Single-peak variant
    var peak1Map = {
        width:    1024, height:   1024, shift: 10,
        altitude: new Uint8Array(1024 * 1024),
        color:    new Uint32Array(1024 * 1024),
        heightScale: BIOME_HEIGHT_SCALE
    };
    genSinglePeakMountainTile(peak1Map, (baseSeed ^ 0xDEADF00D) >>> 0);
    maps[nextIdx] = peak1Map;
    window.mountainRidgeMapIndex['PEAK1'] = nextIdx;

    console.log('Mountain ridge tiles generated:', Object.keys(window.mountainRidgeMapIndex));
}

// -----------------------------------------------------------------------
// Transition tile generation (BEACH ↔ PLAINS blend belt)
// -----------------------------------------------------------------------
// Generates a 1024×1024 tile whose terrain smoothly blends from beach
// (sand) on the "beach side" to plains (grass) on the "plains side".
// The orientation is encoded in a key built from which cardinal directions
// have plains neighbors: "N", "S", "E", "W", "NE", "NW", "SE", "SW",
// "NS", "EW" (or combinations thereof).  All edges fade to
// BIOME_TRANSITION_ALT so the adjacent beach and plains tiles connect
// seamlessly through the engine's existing 128px overlap blending.
function genTransitionTile(mapObj, seed, key) {
    var noiseFn = createPerlinNoise((seed ^ 0xAB5C3D2F) >>> 0);
    var w = mapObj.width, h = mapObj.height;
    mapObj.heightScale = BIOME_HEIGHT_SCALE;

    var ss = function(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

    var hasN = key.indexOf('N') >= 0;
    var hasS = key.indexOf('S') >= 0;
    var hasE = key.indexOf('E') >= 0;
    var hasW = key.indexOf('W') >= 0;
    var dirCount = (hasN?1:0) + (hasS?1:0) + (hasE?1:0) + (hasW?1:0);

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var nx = x / (w - 1);   // 0 = left/west, 1 = right/east
            var ny = y / (h - 1);   // 0 = top/north, 1 = bottom/south

            // Grass weight (0 = full sand, 1 = full grass) from orientation key.
            // Each direction contributes how "grassy" that direction is.
            // Average of all active directions gives the blend factor at this pixel.
            var grassW = 0.5;
            if (dirCount > 0) {
                var sum = 0;
                if (hasN) sum += (1 - ny);   // grass is north  → grassy near top
                if (hasS) sum += ny;          // grass is south  → grassy near bottom
                if (hasE) sum += nx;          // grass is east   → grassy near right
                if (hasW) sum += (1 - nx);   // grass is west   → grassy near left
                grassW = sum / dirCount;
            }

            // Noise perturbation breaks up the straight blend boundary
            var noiseV = fbm(noiseFn, nx * 4.5, ny * 4.5, 3, 2.0, 0.5);
            grassW = Math.max(0, Math.min(1, grassW + noiseV * 0.13));
            var t = ss(grassW);

            // Per-pixel variation (same hash as other biomes)
            var pv = pixelVar(x, y);

            // Altitude: fixed at BIOME_TRANSITION_ALT so all four edges seamlessly
            // meet every neighboring tile.  Beach and plains tiles both fade to 72
            // at their edges; a transition tile at a different altitude creates a
            // height mismatch moat on the sand side.  Color provides all visual
            // distinction; height variation here only causes visible grid lines.
            var altitude = BIOME_TRANSITION_ALT;

            // Keep pv-based altitude values for color sampling only
            var beachA  = 45 + (pv - 0.5) * 12;
            var plainsA = 68 + (pv - 0.5) * 14;

            // Color: pure sand↔grass lerp based on t — no green edge override.
            // The tile blending system handles seam color mixing; forcing a green
            // neutral at edges just produces visible green borders around the tile.
            var wetFactor = 0.4 + (pv - 0.5) * 0.3;
            var bCol = beachColor(beachA, wetFactor, pv);
            var pCol = plainsColor(plainsA, pv);
            var bR = bCol & 0xFF, bG = (bCol >> 8) & 0xFF, bB = (bCol >> 16) & 0xFF;
            var pR = pCol & 0xFF, pG = (pCol >> 8) & 0xFF, pB = (pCol >> 16) & 0xFF;

            var r = Math.round(bR + (pR - bR) * t);
            var g = Math.round(bG + (pG - bG) * t);
            var b = Math.round(bB + (pB - bB) * t);
            r = Math.max(0, Math.min(255, r));
            g = Math.max(0, Math.min(255, g));
            b = Math.max(0, Math.min(255, b));

            var idx = (y << mapObj.shift) + x;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx]    = (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
        }
    }
}

// Scan worldMapData for all BIOME_TRANSITION cells, generate one map per
// unique orientation key, and register them in window.transitionMapIndex.
// Always runs AFTER generateMountainRidgeTiles so indices don't collide.
function generateTransitionTiles(baseSeed) {
    if (!window.worldMapData) return;

    var grid = window.worldMapData;
    var s    = WORLD_MAP_SIZE;
    var keyToMap = {};

    for (var gy = 0; gy < s; gy++) {
        for (var gx = 0; gx < s; gx++) {
            if (grid[gy * s + gx] !== BIOME_TRANSITION) continue;
            var key = getTransitionKey(grid, gx, gy);
            if (keyToMap[key]) continue;

            var tMap = {
                width:       1024,
                height:      1024,
                shift:       10,
                altitude:    new Uint8Array(1024 * 1024),
                color:       new Uint32Array(1024 * 1024),
                heightScale: BIOME_HEIGHT_SCALE
            };
            var tileSeed = (baseSeed ^ (key.length * 0x1337 + (key.charCodeAt(0) || 0) * 0xF00D)) >>> 0;
            genTransitionTile(tMap, tileSeed, key);
            keyToMap[key] = tMap;
        }
    }

    // Append after whatever mountain ridge tiles were added (maps.length is the next free slot)
    window.transitionMapIndex = {};
    for (var k in keyToMap) {
        window.transitionMapIndex[k] = maps.length;
        maps.push(keyToMap[k]);
    }
    console.log('Transition tile keys generated:', Object.keys(window.transitionMapIndex));
}

// -----------------------------------------------------------------------
// Wide straight ridge tile (BIOME_RIDGE)
// -----------------------------------------------------------------------
// A much wider and taller ridge than the regular mountain ridge tiles.
// Only two orientations exist: 'NS' (vertical) and 'EW' (horizontal).
// The ridge runs straight across the full tile with no curves or corners.
// Sides perpendicular to the ridge direction fade to BASE_ALT; ends
// (along the ridge axis) stay at full height so adjacent tiles continue
// the ridge seamlessly.
function genStraightRidgeTile(mapObj, seed, key) {
    var detailFn  = createPerlinNoise((seed ^ 0xF1D9A3E7) >>> 0);
    var warpFn    = createPerlinNoise((seed ^ 0x2B4C6D8E) >>> 0);
    var speckleFn = createPerlinNoise((seed ^ 0xE3F4A5B6) >>> 0);
    var w = mapObj.width, h = mapObj.height;

    // heightScale = 2.0 — each altitude unit counts as 2 world units.
    // The renderer and physics both multiply altitude by heightScale, so the
    // ridge appears and behaves as twice as tall as the byte limit alone allows.
    var RIDGE_HS = 2.0;
    mapObj.heightScale = RIDGE_HS;

    var isNS = (key === 'NS');  // true = N-S ridge; false = E-W ridge

    var RIDGE_HW  = 0.60;   // wide half-width (regular is 0.28)
    var BASE_ALT  = 82;     // world-space edge altitude (= edgeFadeAlt * RIDGE_HS)
    var PEAK_MIN  = 230;    // minimum crest altitude (→ 460 world units)
    var PEAK_MAX  = 255;    // maximum crest altitude (→ 510 world units)
    var NOISE_AMP = 6;      // subtle surface detail
    var WARP_AMP  = 0.07;   // organic warp
    var WARP_FREQ = 2.2;

    // The perpendicular edges fade to this data-space value so that:
    //   edgeFadeAlt * RIDGE_HS = BASE_ALT  →  matches neighboring tiles at scale 1.0
    var edgeFadeAlt = Math.round(BASE_ALT / RIDGE_HS);  // = 41

    // Connected ends: for NS, north & south edges continue to next tile (no fade there).
    // For EW, east & west edges continue. The perpendicular edges always fade.
    var hasN = isNS, hasS = isNS, hasE = !isNS, hasW = !isNS;

    for (var py = 0; py < h; py++) {
        var ly = py / (h - 1);
        for (var px = 0; px < w; px++) {
            var lx = px / (w - 1);

            // Domain warp for organic-looking ridge edges
            var wx  = fbm(warpFn, lx * WARP_FREQ,       ly * WARP_FREQ,       3, 2.0, 0.5) * WARP_AMP;
            var wy  = fbm(warpFn, lx * WARP_FREQ + 5.1, ly * WARP_FREQ + 2.9, 3, 2.0, 0.5) * WARP_AMP;
            var wlx = lx + wx, wly = ly + wy;

            // Distance from the ridge centreline
            var ridgeDist = isNS ? Math.abs(wlx - 0.5) : Math.abs(wly - 0.5);

            // Wide profile — quadratic falloff gives broader, more gradual sides
            var normDist = ridgeDist / RIDGE_HW;
            var profile  = Math.max(0, 1.0 - normDist * normDist);
            profile = profile * profile;  // softer than cubic → wider feeling flanks

            // Along-ridge elevation stays consistently high (no saddles)
            var elevRaw = fbm(detailFn, lx * 0.8, ly * 0.8, 3, 2.0, 0.5);
            var elevT   = Math.max(0, Math.min(1, (elevRaw + 0.6) / 1.2));
            var crestAlt = PEAK_MIN + elevT * (PEAK_MAX - PEAK_MIN);

            // Surface detail noise
            var dnx   = (px / w) * 7.0, dny = (py / h) * 7.0;
            var noise = fbm(detailFn, dnx, dny, 5, 2.0, 0.5) * NOISE_AMP;

            // High-frequency spikes concentrated at the crest (fade to 0 at flanks)
            var spikeRaw = fbm(speckleFn, (px / w) * 14.0, (py / h) * 14.0, 4, 2.0, 0.55);
            var spike    = spikeRaw * 32 * profile;

            var baseAlt = edgeFadeAlt + (crestAlt - edgeFadeAlt) * profile + noise + spike;

            // Fade the PERPENDICULAR edges to edgeFadeAlt so that
            //   edgeFadeAlt * RIDGE_HS = 82 world units, matching all scale-1.0 neighbors.
            var fade    = ridgeEdgeFade(px, py, w, h, hasN, hasS, hasE, hasW);
            var altitude = Math.round(baseAlt * fade + edgeFadeAlt * (1 - fade));
            altitude = Math.max(38, Math.min(255, altitude));

            // Remap altitude [edgeFadeAlt, 255] → [148, 255] for color lookup so
            // the ridge is always rocky/grey/snow — never the green-forest base
            // that mountainColor would assign to low world-space altitudes.
            var speckle  = fbm(speckleFn, (px / w) * 18.0, (py / h) * 18.0, 3, 2.0, 0.5) * 42;
            var colorAlt = Math.round(148 + (altitude - edgeFadeAlt) / (255 - edgeFadeAlt) * (255 - 148) + speckle);
            colorAlt = Math.max(148, Math.min(255, colorAlt));

            var idx = (py << mapObj.shift) + px;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx]    = mountainColor(colorAlt, pixelVar(px, py));
        }
    }
}

// End-cap tile for the wide ridge: the ridge enters from one side and tapers
// smoothly to flat terrain on the opposite (cap) end.
//
// Key convention: 'N_CAP' = cap at north end (ridge enters from south),
// 'S_CAP' = cap at south, 'E_CAP' = cap at east, 'W_CAP' = cap at west.
function genRidgeEndCapTile(mapObj, seed, key) {
    var detailFn  = createPerlinNoise((seed ^ 0xF1D9A3E7) >>> 0);
    var warpFn    = createPerlinNoise((seed ^ 0x2B4C6D8E) >>> 0);
    var speckleFn = createPerlinNoise((seed ^ 0xE3F4A5B6) >>> 0);
    var w = mapObj.width, h = mapObj.height;

    var RIDGE_HS  = 2.0;
    mapObj.heightScale = RIDGE_HS;

    var RIDGE_HW  = 0.60;
    var BASE_ALT  = 82;
    var PEAK_MIN  = 230;
    var PEAK_MAX  = 255;
    var NOISE_AMP = 6;
    var WARP_AMP  = 0.07;
    var WARP_FREQ = 2.2;
    var edgeFadeAlt = Math.round(BASE_ALT / RIDGE_HS);  // = 41

    var isNS = (key === 'N_CAP' || key === 'S_CAP');

    // ridgeEdgeFade only handles the perpendicular edges (not the cap axis —
    // capTaper handles that across the full tile length).
    // NS caps: E/W perpendicular edges fade; N/S both marked open so no axial fade.
    // EW caps: N/S perpendicular edges fade; E/W both marked open.
    var hasN = isNS;
    var hasS = isNS;
    var hasE = !isNS;
    var hasW = !isNS;

    for (var py = 0; py < h; py++) {
        var ly = py / (h - 1);
        for (var px = 0; px < w; px++) {
            var lx = px / (w - 1);

            // capTaper: 1 at the open/connected end, 0 at the cap (terminating) end.
            // Smoothstep curve so it starts high and drops off toward the cap tip.
            var axisT;
            if      (key === 'N_CAP') axisT = ly;        // cap at north (py=0), open at south
            else if (key === 'S_CAP') axisT = 1.0 - ly;  // cap at south, open at north
            else if (key === 'E_CAP') axisT = 1.0 - lx;  // cap at east,  open at west
            else                      axisT = lx;         // W_CAP: cap at west, open at east
            var capTaper = axisT * axisT * (3.0 - 2.0 * axisT);  // smoothstep

            // Domain warp for organic-looking ridge edges
            var wx  = fbm(warpFn, lx * WARP_FREQ,       ly * WARP_FREQ,       3, 2.0, 0.5) * WARP_AMP;
            var wy  = fbm(warpFn, lx * WARP_FREQ + 5.1, ly * WARP_FREQ + 2.9, 3, 2.0, 0.5) * WARP_AMP;
            var wlx = lx + wx, wly = ly + wy;

            var ridgeDist = isNS ? Math.abs(wlx - 0.5) : Math.abs(wly - 0.5);

            var normDist = ridgeDist / RIDGE_HW;
            var profile  = Math.max(0, 1.0 - normDist * normDist);
            profile = profile * profile;

            var elevRaw  = fbm(detailFn, lx * 0.8, ly * 0.8, 3, 2.0, 0.5);
            var elevT    = Math.max(0, Math.min(1, (elevRaw + 0.6) / 1.2));
            var crestAlt = PEAK_MIN + elevT * (PEAK_MAX - PEAK_MIN);

            var dnx   = (px / w) * 7.0, dny = (py / h) * 7.0;
            var noise = fbm(detailFn, dnx, dny, 5, 2.0, 0.5) * NOISE_AMP;

            var spikeRaw = fbm(speckleFn, (px / w) * 14.0, (py / h) * 14.0, 4, 2.0, 0.55);
            var spike    = spikeRaw * 32 * profile;

            // capTaper drives the whole height above edgeFadeAlt to zero at the cap end
            var baseAlt = edgeFadeAlt + ((crestAlt - edgeFadeAlt) * profile + noise + spike) * capTaper;

            // ridgeEdgeFade only blends the perpendicular (E/W or N/S) edges
            var fade     = ridgeEdgeFade(px, py, w, h, hasN, hasS, hasE, hasW);
            var altitude = Math.round(baseAlt * fade + edgeFadeAlt * (1 - fade));
            altitude = Math.max(38, Math.min(255, altitude));

            var speckle  = fbm(speckleFn, (px / w) * 18.0, (py / h) * 18.0, 3, 2.0, 0.5) * 42;
            var colorAlt = Math.round(148 + (altitude - edgeFadeAlt) / (255 - edgeFadeAlt) * (255 - 148) + speckle);
            colorAlt = Math.max(148, Math.min(255, colorAlt));

            var idx = (py << mapObj.shift) + px;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx]    = mountainColor(colorAlt, pixelVar(px, py));
        }
    }
}

// Scan worldMapData for BIOME_RIDGE cells, generate one 1024×1024 map per
// unique orientation key ('NS' and/or 'EW'), and register them in
// window.wideRidgeMapIndex.  Always runs AFTER generateTransitionTiles.
function generateStraightRidgeTiles(baseSeed) {
    if (!window.worldMapData) return;

    var grid = window.worldMapData;
    var s    = WORLD_MAP_SIZE;
    var keyToMap = {};

    for (var gy = 0; gy < s; gy++) {
        for (var gx = 0; gx < s; gx++) {
            if (grid[gy * s + gx] !== BIOME_RIDGE) continue;
            var key = getRidgeOrientationKey(grid, gx, gy);
            if (keyToMap[key]) continue;

            var rMap = {
                width:       1024,
                height:      1024,
                shift:       10,
                altitude:    new Uint8Array(1024 * 1024),
                color:       new Uint32Array(1024 * 1024),
                heightScale: BIOME_HEIGHT_SCALE
            };
            var tileSeed = (baseSeed ^ (key === 'NS' ? 0xAB12CD34 : 0xEF56AB78)) >>> 0;
            genStraightRidgeTile(rMap, tileSeed, key);
            keyToMap[key] = rMap;
        }
    }

    window.wideRidgeMapIndex = {};
    for (var k in keyToMap) {
        window.wideRidgeMapIndex[k] = maps.length;
        maps.push(keyToMap[k]);
    }

    // Always generate all 4 end-cap orientations so they're available in the editor.
    var capKeys  = ['N_CAP', 'S_CAP', 'E_CAP', 'W_CAP'];
    var capXOR   = { 'N_CAP': 0x1A2B3C4D, 'S_CAP': 0x5E6F7A8B, 'E_CAP': 0x9C0D1E2F, 'W_CAP': 0x3F4A5B6C };
    for (var ci = 0; ci < capKeys.length; ci++) {
        var ck   = capKeys[ci];
        var cMap = {
            width:       1024,
            height:      1024,
            shift:       10,
            altitude:    new Uint8Array(1024 * 1024),
            color:       new Uint32Array(1024 * 1024),
            heightScale: 2.0
        };
        genRidgeEndCapTile(cMap, (baseSeed ^ capXOR[ck]) >>> 0, ck);
        window.wideRidgeMapIndex[ck] = maps.length;
        maps.push(cMap);
    }

    console.log('Wide ridge tiles generated:', Object.keys(window.wideRidgeMapIndex));
}

// -----------------------------------------------------------------------
// Foothill tile generation (BIOME_FOOTHILL)
// -----------------------------------------------------------------------
// A rocky slope that rises from plains altitude on the plains side to a
// higher rocky terrace on the ridge side, giving the player a climbable
// approach to the otherwise impassable RIDGE wall.
//
// Altitude range: BIOME_TRANSITION_ALT (72) → ~120 (gradual ramp).
// The ridge-adjacent edges stay near 120 to meet the RIDGE tile's edge
// (world-space 82, then rising steeply inside the ridge).
// The plains-adjacent edges fade to BIOME_TRANSITION_ALT (72).

function foothillColor(altitude, pv) {
    var v = (pv - 0.5) * 14;
    var r, g, b;
    if (altitude < 85) {
        // Low: earthy green-brown (mossy ground)
        r = 78 + v;  g = 88 + v;  b = 42 + v * 0.3;
    } else if (altitude < 115) {
        // Mid: brown rock
        r = 108 + v * 0.7;  g = 92 + v * 0.5;  b = 58 + v * 0.3;
    } else {
        // High: grey-tan scree
        r = 128 + v * 0.5;  g = 118 + v * 0.4;  b = 88 + v * 0.3;
    }
    r = Math.max(0, Math.min(255, r | 0));
    g = Math.max(0, Math.min(255, g | 0));
    b = Math.max(0, Math.min(255, b | 0));
    return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
}

function genFoothillTile(mapObj, seed, key) {
    var noiseFn   = createPerlinNoise((seed ^ 0xC3D4E5F6) >>> 0);
    var speckleFn = createPerlinNoise((seed ^ 0xB7C8D9EA) >>> 0);
    var w = mapObj.width, h = mapObj.height;
    mapObj.heightScale = BIOME_HEIGHT_SCALE;

    var ss = function(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

    // Ridge direction flags — which cardinal sides face the ridge
    var hasN = key.indexOf('N') >= 0;
    var hasS = key.indexOf('S') >= 0;
    var hasE = key.indexOf('E') >= 0;
    var hasW = key.indexOf('W') >= 0;
    var dirCount = (hasN?1:0) + (hasS?1:0) + (hasE?1:0) + (hasW?1:0);

    var ALT_PLAINS = BIOME_TRANSITION_ALT;  // 72 — plains-facing edge
    var ALT_RIDGE  = 155;                   // ridge-facing edge (world 155, taller approach)

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var nx = x / (w - 1);   // 0=west, 1=east
            var ny = y / (h - 1);   // 0=north, 1=south

            // ridgeWeight: 0 = plains side, 1 = ridge side
            var ridgeW = 0.5;
            if (dirCount > 0) {
                var sum = 0;
                if (hasN) sum += (1 - ny);   // ridge is north → high near top
                if (hasS) sum += ny;          // ridge is south → high near bottom
                if (hasE) sum += nx;          // ridge is east  → high near right
                if (hasW) sum += (1 - nx);   // ridge is west  → high near left
                ridgeW = sum / dirCount;
            }
            // Noise warps the blend boundary for organic look
            var noiseV = fbm(noiseFn, nx * 3.5, ny * 3.5, 4, 2.0, 0.5);
            ridgeW = Math.max(0, Math.min(1, ridgeW + noiseV * 0.12));
            var t = ss(ridgeW);

            var baseAlt = ALT_PLAINS + (ALT_RIDGE - ALT_PLAINS) * t;

            // Subtle rocky detail
            var detail = fbm(noiseFn, nx * 8.0, ny * 8.0, 3, 2.0, 0.5) * 7;
            baseAlt += detail;

            // Edge blending: only fade the plains-facing edge (to ALT_PLAINS, green).
            // Side edges (perpendicular to ridge axis) are treated as connected so that
            // adjacent foothills share a seamless border with no moat.
            var fadeHasN = hasN, fadeHasS = hasS, fadeHasE = hasE, fadeHasW = hasW;
            if (dirCount === 1) {
                if (hasN || hasS) { fadeHasE = true; fadeHasW = true; }
                if (hasE || hasW) { fadeHasN = true; fadeHasS = true; }
            }
            var fade     = ridgeEdgeFade(x, y, w, h, fadeHasN, fadeHasS, fadeHasE, fadeHasW);
            var altitude = Math.round(baseAlt * fade + ALT_PLAINS * (1 - fade));
            altitude = Math.max(65, Math.min(165, altitude));

            var speckle  = fbm(speckleFn, (x / w) * 18.0, (y / h) * 18.0, 3, 2.0, 0.5) * 20;
            var colorAlt = Math.max(65, Math.min(165, altitude + Math.round(speckle)));

            var idx = (y << mapObj.shift) + x;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx]    = foothillColor(colorAlt, pixelVar(x, y));
        }
    }
}

// Steeper foothill variant: higher ALT_RIDGE and a sharper profile curve so the
// terrain stays low on the plains side then rises sharply toward the ridge.
// Keys: 'N2', 'S2', 'E2', 'W2' (direction the ridge faces, '2' = steep variant).
function genSteepFoothillTile(mapObj, seed, key) {
    var noiseFn   = createPerlinNoise((seed ^ 0xC3D4E5F6) >>> 0);
    var speckleFn = createPerlinNoise((seed ^ 0xB7C8D9EA) >>> 0);
    var w = mapObj.width, h = mapObj.height;
    mapObj.heightScale = BIOME_HEIGHT_SCALE;

    var ss = function(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

    var hasN = key.indexOf('N') >= 0;
    var hasS = key.indexOf('S') >= 0;
    var hasE = key.indexOf('E') >= 0;
    var hasW = key.indexOf('W') >= 0;
    var dirCount = (hasN?1:0) + (hasS?1:0) + (hasE?1:0) + (hasW?1:0);

    var ALT_PLAINS = BIOME_TRANSITION_ALT;  // 72
    var ALT_RIDGE  = 210;  // taller than standard (155) for a steeper ramp

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var nx = x / (w - 1);
            var ny = y / (h - 1);

            var ridgeW = 0.5;
            if (dirCount > 0) {
                var sum = 0;
                if (hasN) sum += (1 - ny);
                if (hasS) sum += ny;
                if (hasE) sum += nx;
                if (hasW) sum += (1 - nx);
                ridgeW = sum / dirCount;
            }
            var noiseV = fbm(noiseFn, nx * 3.5, ny * 3.5, 4, 2.0, 0.5);
            ridgeW = Math.max(0, Math.min(1, ridgeW + noiseV * 0.12));

            // Sharper profile: smoothstep then squared — stays low, rises abruptly
            var t = ss(ridgeW);
            t = t * t;

            var baseAlt = ALT_PLAINS + (ALT_RIDGE - ALT_PLAINS) * t;

            var detail = fbm(noiseFn, nx * 8.0, ny * 8.0, 3, 2.0, 0.5) * 7;
            baseAlt += detail;

            var fadeHasN = hasN, fadeHasS = hasS, fadeHasE = hasE, fadeHasW = hasW;
            if (dirCount === 1) {
                if (hasN || hasS) { fadeHasE = true; fadeHasW = true; }
                if (hasE || hasW) { fadeHasN = true; fadeHasS = true; }
            }
            var fade     = ridgeEdgeFade(x, y, w, h, fadeHasN, fadeHasS, fadeHasE, fadeHasW);
            var altitude = Math.round(baseAlt * fade + ALT_PLAINS * (1 - fade));
            altitude = Math.max(65, Math.min(215, altitude));

            var speckle  = fbm(speckleFn, (x / w) * 18.0, (y / h) * 18.0, 3, 2.0, 0.5) * 20;
            var colorAlt = Math.max(65, Math.min(215, altitude + Math.round(speckle)));

            var idx = (y << mapObj.shift) + x;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx]    = foothillColor(colorAlt, pixelVar(x, y));
        }
    }
}

// Scan worldMapData for BIOME_FOOTHILL cells, generate one tile per unique
// orientation key, and register them in window.foothillMapIndex.
// Always runs AFTER generateStraightRidgeTiles so map indices don't collide.
function generateFoothillTiles(baseSeed) {
    if (!window.worldMapData) return;

    var grid = window.worldMapData;
    var s    = WORLD_MAP_SIZE;
    var keyToMap = {};

    for (var gy = 0; gy < s; gy++) {
        for (var gx = 0; gx < s; gx++) {
            if (grid[gy * s + gx] !== BIOME_FOOTHILL) continue;
            var key = getFoothillKey(grid, gx, gy);
            if (keyToMap[key]) continue;

            var fMap = {
                width:       1024,
                height:      1024,
                shift:       10,
                altitude:    new Uint8Array(1024 * 1024),
                color:       new Uint32Array(1024 * 1024),
                heightScale: BIOME_HEIGHT_SCALE
            };
            var tileSeed = (baseSeed ^ (key.length * 0x7F3A + (key.charCodeAt(0) || 0) * 0xC9B1)) >>> 0;
            genFoothillTile(fMap, tileSeed, key);
            keyToMap[key] = fMap;
        }
    }

    window.foothillMapIndex = {};
    for (var k in keyToMap) {
        window.foothillMapIndex[k] = maps.length;
        maps.push(keyToMap[k]);
    }
    console.log('Foothill tiles generated:', Object.keys(window.foothillMapIndex));

    // Always generate 4 steep foothill orientations for the editor palette.
    window.steepFoothillMapIndex = {};
    var sfKeys = ['N2', 'S2', 'E2', 'W2'];
    var sfXOR  = { 'N2': 0xF1A2B3C4, 'S2': 0xD5E6F7A8, 'E2': 0xB9C0D1E2, 'W2': 0x73849506 };
    for (var si = 0; si < sfKeys.length; si++) {
        var sk   = sfKeys[si];
        var sMap = {
            width:       1024,
            height:      1024,
            shift:       10,
            altitude:    new Uint8Array(1024 * 1024),
            color:       new Uint32Array(1024 * 1024),
            heightScale: BIOME_HEIGHT_SCALE
        };
        genSteepFoothillTile(sMap, (baseSeed ^ sfXOR[sk]) >>> 0, sk);
        window.steepFoothillMapIndex[sk] = maps.length;
        maps.push(sMap);
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

    // Hills end caps — 4 orientations, always available in the editor palette.
    window.hillsCapMapIndex = {};
    var hcapKeys = ['N_HCAP', 'S_HCAP', 'E_HCAP', 'W_HCAP'];
    var hcapXOR  = { 'N_HCAP': 0xA1B2C3D4, 'S_HCAP': 0xE5F6A7B8, 'E_HCAP': 0xC9D0E1F2, 'W_HCAP': 0x13243546 };
    for (var hi = 0; hi < hcapKeys.length; hi++) {
        var hk   = hcapKeys[hi];
        var hMap = {
            width:       1024,
            height:      1024,
            shift:       10,
            altitude:    new Uint8Array(1024 * 1024),
            color:       new Uint32Array(1024 * 1024),
            heightScale: BIOME_HEIGHT_SCALE
        };
        genHillsEndCapTile(hMap, (baseSeed ^ hcapXOR[hk]) >>> 0, hk);
        window.hillsCapMapIndex[hk] = maps.length;
        maps.push(hMap);
    }
}
