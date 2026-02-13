// ===============================
// Map Loading - Minimal
// ===============================
"use strict";

function DownloadImagesAsync(urls, dimensions) {
    return new Promise(function(resolve) {
        var pending = urls.length, result = [];
        if (!pending) { resolve([]); return; }
        urls.forEach(function(url, i) {
            var img = new Image();
            img.onload = function() {
                var tcv = document.createElement("canvas"),
                    tcx = tcv.getContext("2d");
                var dim = dimensions[i];
                tcv.width = dim.width;
                tcv.height = dim.height;
                tcx.drawImage(img, 0, 0, dim.width, dim.height);
                result[i] = tcx.getImageData(0, 0, dim.width, dim.height).data;
                pending--;
                if (!pending) resolve(result);
            };
            img.src = url;
        });
    });
}

function LoadMap(files, files2, files3, files4) {
    var f = files.split(";");
    var f2 = files2.split(";");
    var f3 = files3.split(";");
    var f4 = files4.split(";");

    // Load all four map sets with their respective dimensions
    DownloadImagesAsync([
        "maps/" + f[0] + ".png",   // Map 1 color
        "maps/" + f[1] + ".png",   // Map 1 height
        "maps/" + f2[0] + ".png",  // Map 2 color
        "maps/" + f2[1] + ".png",  // Map 2 height
        "maps/" + f3[0] + ".png",  // Map 3 color
        "maps/" + f3[1] + ".png",  // Map 3 height
        "maps/" + f4[0] + ".png",  // Map 4 color (T1 - mountains/valleys)
        "maps/" + f4[1] + ".png"   // Map 4 height (H1 - mountains/valleys)
    ], [
        map,  // Map 1 color dimensions
        map,  // Map 1 height dimensions
        map2, // Map 2 color dimensions
        map2, // Map 2 height dimensions
        map3, // Map 3 color dimensions
        map3, // Map 3 height dimensions
        map4, // Map 4 color dimensions (4096x4096)
        map4  // Map 4 height dimensions (4096x4096)
    ]).then(OnLoadedImages);
}

function OnLoadedImages(result) {
    var datac1 = result[0], datah1 = result[1];
    var datac2 = result[2], datah2 = result[3];
    var datac3 = result[4], datah3 = result[5];
    var datac4 = result[6], datah4 = result[7];

    // Load first map
    for (var i = 0; i < map.width * map.height; i++) {
        map.color[i] = 0xFF000000 |
                       (datac1[(i << 2) + 2] << 16) |
                       (datac1[(i << 2) + 1] << 8) |
                        datac1[(i << 2) + 0];
        map.altitude[i] = datah1[i << 2];
    }

    // Load second map
    for (var i = 0; i < map2.width * map2.height; i++) {
        map2.color[i] = 0xFF000000 |
                        (datac2[(i << 2) + 2] << 16) |
                        (datac2[(i << 2) + 1] << 8) |
                         datac2[(i << 2) + 0];
        map2.altitude[i] = datah2[i << 2];
    }

    // Load third map
    for (var i = 0; i < map3.width * map3.height; i++) {
        map3.color[i] = 0xFF000000 |
                        (datac3[(i << 2) + 2] << 16) |
                        (datac3[(i << 2) + 1] << 8) |
                         datac3[(i << 2) + 0];
        map3.altitude[i] = datah3[i << 2];
    }

    // Load fourth map (T1/H1 - mountain and valley map)
    for (var i = 0; i < map4.width * map4.height; i++) {
        map4.color[i] = 0xFF000000 |
                        (datac4[(i << 2) + 2] << 16) |
                        (datac4[(i << 2) + 1] << 8) |
                         datac4[(i << 2) + 0];
        map4.altitude[i] = datah4[i << 2];
    }

    // Initialize tile system - assign random maps to tiles
    initializeTileSystem();

    // Flatten terrain under the cube
    flattenTerrainUnderCube();

    // Start draw loop
    Draw();
}

// Initialize the tile system with random map assignments (10x10 grid + mountain border)
function initializeTileSystem() {
    var gridSize = 10;
    var halfGrid = Math.floor(gridSize / 2);  // 5
    var tileCount = 0;

    // Create a 12x12 grid with mountain border around 10x10 regular terrain
    // Border extends from -6 to 5 in both X and Y
    for (var tileY = -halfGrid - 1; tileY <= halfGrid; tileY++) {
        for (var tileX = -halfGrid - 1; tileX <= halfGrid; tileX++) {
            var tileKey = tileX + ',' + tileY;

            // Check if this is a border tile (outer edge)
            var isBorder = (tileX === -halfGrid - 1) || (tileX === halfGrid) ||
                          (tileY === -halfGrid - 1) || (tileY === halfGrid);

            if (isBorder) {
                // Border tiles use map 2 (tall mountains with heightScale 25.0)
                tileSystem.tileMap[tileKey] = 2;
            }
            // Spawn tile (0,0) uses map 0
            else if (tileX === 0 && tileY === 0) {
                tileSystem.tileMap[tileKey] = 0;
            }
            // Tile (1,0) uses map 1
            else if (tileX === 1 && tileY === 0) {
                tileSystem.tileMap[tileKey] = 1;
            }
            // All other inner tiles use random maps (0 or 1 - regular terrain)
            else {
                tileSystem.tileMap[tileKey] = Math.floor(Math.random() * 2);  // Random 0 or 1
            }
            tileCount++;
        }
    }

    console.log("Tile system initialized with", tileCount, "tiles (" + gridSize + "x" + gridSize + " + mountain border)");
}

// Flatten terrain within the cube's footprint to prevent terrain poking through
function flattenTerrainUnderCube() {
    var s = cube.size;
    var minX = Math.floor(cube.x - s / 2);
    var maxX = Math.ceil(cube.x + s / 2);
    var minY = Math.floor(cube.y - s / 2);
    var maxY = Math.ceil(cube.y + s / 2);

    // Find the minimum height within the cube's footprint
    var minHeight = 255;
    for (var y = minY; y <= maxY; y++) {
        for (var x = minX; x <= maxX; x++) {
            var mx = x & (map.width - 1);
            var my = y & (map.height - 1);
            var idx = (my << map.shift) + mx;
            if (map.altitude[idx] < minHeight) {
                minHeight = map.altitude[idx];
            }
        }
    }

    // Set all terrain within cube footprint to that minimum height
    for (var y = minY; y <= maxY; y++) {
        for (var x = minX; x <= maxX; x++) {
            var mx = x & (map.width - 1);
            var my = y & (map.height - 1);
            var idx = (my << map.shift) + mx;
            map.altitude[idx] = minHeight;
        }
    }

    // Spawn random trees on green-ish terrain (DISABLED)
    // spawnRandomItems("tree", textures.tree, {
    //     step: 8,
    //     chance: 0.01,
    //     colorCheck: (col) => ((col & 0x00FF00) > 0x004000)
    // });
}
