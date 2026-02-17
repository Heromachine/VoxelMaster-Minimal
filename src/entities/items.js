// ===============================
// Items Management (bullets, hearts, trees, ground weapons)
// ===============================
"use strict";

function spawnRandomItems(type, texture, options) {
    options = options || {};
    let step = options.step || 8;               // spacing (avoid too many)
    let chance = options.chance || 0.01;        // probability per tile
    let colorCheck = options.colorCheck || (()=>true); // which terrain allowed

    for (let y = 0; y < map.height; y += step) {
        for (let x = 0; x < map.width; x += step) {
            let idx = (y << map.shift) + x;
            let col = map.color[idx] & 0xFFFFFF;  // strip alpha

            if (colorCheck(col)) {
                if (Math.random() < chance) {
                    let wx = x;
                    let wy = y;
                    // Use raw terrain for static items so they sit on actual ground
                    let wz = getRawTerrainHeight(wx, wy);
                    items.push({
                        type: type,
                        x: wx, y: wy, z: wz,
                        dx: 0, dy: 0, dz: 0,
                        image: texture
                    });
                }
            }
        }
    }
}

// Spawn trees in dark-green areas of plains biome tiles.
// Dark green = low-altitude plains (altitude < 65): r≈70, g≈118, b≈44 in the
// stored ABGR format → detectable via g>100 && r<88 && b<58.
// Each biome tile's map is sampled directly (no tile-system overhead per pixel).
function spawnBiomeTrees() {
    if (!window.worldMapData || !tileSystem || !textures.tree) return;

    var tileAdvance = tileSystem.tileWidth - tileSystem.overlapSize; // 896
    var step   = 32;   // world units between candidate positions
    var chance = 0.09; // probability of a tree at each dark-green hit

    // Non-border tile range: tileX/tileY from -5 to 4
    for (var tileY = -5; tileY < 5; tileY++) {
        for (var tileX = -5; tileX < 5; tileX++) {
            var tileKey = tileX + ',' + tileY;
            if (!(tileKey in tileSystem.tileMap)) continue;

            // Only place trees on plains tiles
            var wmX = tileX + 8;
            var wmY = tileY + 8;
            if (wmX < 0 || wmX >= WORLD_MAP_SIZE || wmY < 0 || wmY >= WORLD_MAP_SIZE) continue;
            if (window.worldMapData[wmY * WORLD_MAP_SIZE + wmX] !== BIOME_PLAINS) continue;

            var m      = maps[tileSystem.tileMap[tileKey]];
            var mshift = m.shift;
            var margin = 64; // skip overlap fringe

            for (var ly = margin; ly < m.height - margin; ly += step) {
                for (var lx = margin; lx < m.width - margin; lx += step) {
                    // Plains altitude range is 50–100.
                    // The dark-green patches are exactly the low-altitude band (< 65).
                    // Sampling altitude directly is more reliable than reverse-engineering color.
                    var alt = m.altitude[(ly << mshift) + lx];
                    if (alt < 65) {
                        if (Math.random() < chance) {
                            var wx = tileX * tileAdvance + lx;
                            var wy = tileY * tileAdvance + ly;
                            items.push({
                                type: 'tree',
                                x: wx, y: wy, z: getRawTerrainHeight(wx, wy),
                                dx: 0, dy: 0, dz: 0,
                                image: textures.tree
                            });
                        }
                    }
                }
            }
        }
    }
    console.log('Trees spawned:', items.length);
}
