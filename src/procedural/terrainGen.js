// ===============================
// Procedural Terrain Generator
// ===============================
"use strict";

var proceduralMode = false;
var currentSeed = 0;

// Hash a seed string to a 32-bit unsigned integer
function hashSeedStr(str) {
    if (!str || !str.trim()) return (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
    var n = parseInt(str, 10);
    if (!isNaN(n)) return n >>> 0;
    // FNV-1a hash for string seeds
    var hash = 2166136261;
    for (var i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash;
}

// Fast per-pixel color variation — deterministic, no extra noise object needed.
// Returns [0, 1]
function pixelVar(x, y) {
    var h = (Math.imul(x, 374761393) + Math.imul(y, 1013904223)) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) | 0;
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

// Map altitude (0–255) to a 32-bit color (0xFFBBGGRR).
// Color zones match common real-world elevation biomes.
// `pv` is pixelVar output [0,1] for subtle per-pixel variation.
function heightToColor(altitude, pv) {
    var v = (pv - 0.5) * 14;   // ±7 color jitter
    var r, g, b;

    if (altitude < 22) {
        // --- Deep water ---
        r = 22  + v * 0.3;
        g = 62  + v * 0.3;
        b = 138 + v * 0.3;
    } else if (altitude < 52) {
        // --- Beach / sand ---
        r = 204 + v;
        g = 167 + v * 0.6;
        b = 88  + v * 0.3;
    } else if (altitude < 98) {
        // --- Lowland grass ---
        r = 74  + v;
        g = 122 + v;
        b = 44  + v * 0.3;
    } else if (altitude < 138) {
        // --- Forest / dense hills ---
        r = 52  + v;
        g = 92  + v;
        b = 36  + v * 0.3;
    } else if (altitude < 170) {
        // --- Transition to bare earth / shrub ---
        var t = (altitude - 138) / 32;
        r = 52  + t * 80  + v;
        g = 92  - t * 32  + v * 0.5;
        b = 36  + v * 0.3;
    } else if (altitude < 200) {
        // --- Rocky / stone ---
        r = 132 + v * 0.6;
        g = 114 + v * 0.5;
        b = 92  + v * 0.4;
    } else if (altitude < 226) {
        // --- Alpine grey ---
        r = 116 + v * 0.4;
        g = 116 + v * 0.4;
        b = 120 + v * 0.4;
    } else if (altitude < 243) {
        // --- Near-peak pale grey ---
        r = 172 + v * 0.2;
        g = 172 + v * 0.2;
        b = 180 + v * 0.2;
    } else {
        // --- Snow cap ---
        r = 232 + v * 0.05;
        g = 236 + v * 0.05;
        b = 246 + v * 0.05;
    }

    r = Math.max(0, Math.min(255, r | 0));
    g = Math.max(0, Math.min(255, g | 0));
    b = Math.max(0, Math.min(255, b | 0));

    return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
}

// Generate a single map object with seeded Perlin FBM.
// `scale`      — frequency scale (higher = more zoomed-out features)
// `octaves`    — detail levels
// `hScale`     — heightScale to assign to the map object
function generateMap(mapObj, seed, scale, octaves, hScale) {
    var noiseFn = createPerlinNoise(seed >>> 0);
    var ridgeFn = createPerlinNoise((seed ^ 0x7F3A1C9E) >>> 0);

    var w = mapObj.width;
    var h = mapObj.height;
    mapObj.heightScale = hScale;

    for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
            var nx = (x / w) * scale;
            var ny = (y / h) * scale;

            // Main continent-shape FBM
            var n = fbm(noiseFn, nx, ny, octaves, 2.0, 0.5);

            // Ridged noise for dramatic mountain peaks
            var rawRidge = fbm(ridgeFn, nx * 0.7, ny * 0.7, Math.min(octaves, 5), 2.0, 0.5);
            var r = 1.0 - Math.abs(rawRidge);
            r = Math.max(0, r);
            r = r * r * r;  // Sharpen peaks

            // Mix terrain and ridge, then remap to [0, 1]
            // n is ~[-0.7, 0.7], ridge r is [0, 1]
            var combined = n * 0.65 + r * 0.35 - 0.10;
            var t = (combined + 0.65) / 1.30;
            t = Math.max(0, Math.min(1, t));

            // Power curve: keeps mid terrain varied, lets peaks hit snow
            t = Math.pow(t, 0.82);

            var altitude = Math.floor(t * 255);
            var idx = (y << mapObj.shift) + x;
            mapObj.altitude[idx] = altitude;
            mapObj.color[idx] = heightToColor(altitude, pixelVar(x, y));
        }
    }
}

// Generate all required maps from a seed string.
// map  (index 0) — main terrain used by subdivided mode and tiled mode
// map2 (index 1) — terrain variation for tiled mode
// map3 (index 2) — high-amplitude mountain tiles for border rings
function generateTerrain(seedStr) {
    var baseSeed = hashSeedStr(seedStr);
    currentSeed = baseSeed;
    proceduralMode = true;

    // Main terrain — high quality
    generateMap(map,  baseSeed,                           5.0, 8, 1.5);
    // Variation tile — different offset
    generateMap(map2, (baseSeed ^ 0x5A3C7F1B) >>> 0,     4.5, 6, 1.5);
    // Mountain border — steep, high amplitude
    generateMap(map3, (baseSeed ^ 0xA1B2C3D4) >>> 0,     3.0, 5, 20.0);
}

// -----------------------------------------------------------------------
// Seed Menu
// -----------------------------------------------------------------------

function showSeedMenu() {
    var menu = document.getElementById('seed-menu');
    if (menu) menu.style.display = 'flex';

    var seedInput    = document.getElementById('seed-input');
    var randomBtn    = document.getElementById('random-seed-btn');
    var generateBtn  = document.getElementById('generate-btn');
    var progressEl   = document.getElementById('gen-progress');

    // Fill a random seed on load
    seedInput.value = Math.floor(Math.random() * 999999999).toString();

    randomBtn.addEventListener('click', function() {
        seedInput.value = Math.floor(Math.random() * 999999999).toString();
    });

    generateBtn.addEventListener('click', function() {
        var seedVal = seedInput.value.trim();
        if (!seedVal) seedVal = Math.floor(Math.random() * 999999999).toString();
        seedInput.value = seedVal;

        generateBtn.disabled = true;
        randomBtn.disabled   = true;
        if (progressEl) progressEl.textContent = 'GENERATING WORLD...';

        // Yield to let the DOM update before the heavy computation
        setTimeout(function() {
            generateTerrain(seedVal);

            // Place camera on the spawn terrain surface
            var spawnIdx = (Math.floor(camera.y) << map.shift) + Math.floor(camera.x);
            camera.height = map.altitude[spawnIdx] * map.heightScale + player.normalHeight;

            // Hide menu and start the game
            var menuEl = document.getElementById('seed-menu');
            if (menuEl) menuEl.style.display = 'none';

            initializeTileSystem();
            flattenTerrainUnderCube();
            Draw();
        }, 50);
    });
}
