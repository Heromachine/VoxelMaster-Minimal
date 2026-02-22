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

// Generate the world: biome layout via constraint satisfaction, then
// one dedicated tile per biome type via biomeGen.js.
function generateTerrain(seedStr) {
    var baseSeed = hashSeedStr(seedStr);
    currentSeed  = baseSeed;
    proceduralMode = true;

    // 1. Build 16x16 biome world map (constraint satisfaction)
    window.worldMapData = generateWorldMap(baseSeed);

    // 2. Generate one tile per biome type (beach, plains, hills, mountain)
    generateBiomeTiles(baseSeed);

    // 3. Generate one oriented tile per unique mountain ridge configuration.
    //    Adds entries to maps[] at indices 4+ and stores mountainRidgeMapIndex.
    generateMountainRidgeTiles(baseSeed);

    // 4. Generate beach↔plains transition tiles (one per unique orientation key).
    //    Always runs after mountain tiles so map indices don't collide.
    generateTransitionTiles(baseSeed);

    // 5. Generate wide straight ridge tiles (NS and/or EW only).
    //    Always runs after transition tiles so map indices don't collide.
    generateStraightRidgeTiles(baseSeed);

    // 6. Generate foothill ramp tiles (one per unique orientation key).
    //    Always runs last so map indices don't collide with earlier tiles.
    generateFoothillTiles(baseSeed);
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

            // Initialize tile system before sampling spawn height so the
            // correct biome map is used (not always the beach map).
            items = [];  // clear items from any previous world
            initializeTileSystem();
            spawnBiomeTrees();

            // Place camera on the spawn terrain surface using the tile-aware sampler
            camera.height = getRawTerrainHeight(camera.x, camera.y) + player.normalHeight;

            // Populate the tile legend with thumbnails of every generated map
            BuildTileLegend();

            // Hide menu and start the game
            var menuEl = document.getElementById('seed-menu');
            if (menuEl) menuEl.style.display = 'none';

            // Show in-game buttons (EDIT + SAVE)
            var gameBtns = document.getElementById('game-buttons');
            if (gameBtns) gameBtns.style.display = 'flex';

            flattenTerrainUnderCube();
            Draw();
        }, 50);
    });
}
