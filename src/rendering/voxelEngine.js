// ===============================
// Voxel Terrain Rendering Engine
// ===============================
"use strict";

// Helper function to blend two values with linear interpolation
function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Helper function to clamp a value between min and max
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Helper function to blend two colors
function blendColors(color1, color2, t) {
    // Clamp blend factor to [0, 1]
    t = clamp(t, 0, 1);

    var r1 = (color1 >> 16) & 0xFF;
    var g1 = (color1 >> 8) & 0xFF;
    var b1 = color1 & 0xFF;

    var r2 = (color2 >> 16) & 0xFF;
    var g2 = (color2 >> 8) & 0xFF;
    var b2 = color2 & 0xFF;

    var r = clamp(Math.floor(lerp(r1, r2, t)), 0, 255);
    var g = clamp(Math.floor(lerp(g1, g2, t)), 0, 255);
    var b = clamp(Math.floor(lerp(b1, b2, t)), 0, 255);

    return 0xFF000000 | (r << 16) | (g << 8) | b;
}

// Helper function to get tile coordinates from world position
function getTileCoords(x, y) {
    var tileAdvanceX = tileSystem.tileWidth - tileSystem.overlapSize;  // 896
    var tileAdvanceY = tileSystem.tileHeight - tileSystem.overlapSize;  // 384
    return {
        tileX: Math.floor(x / tileAdvanceX),
        tileY: Math.floor(y / tileAdvanceY)
    };
}

// Helper function to get tile start position from tile coordinates
function getTileStartPos(tileX, tileY) {
    var tileAdvanceX = tileSystem.tileWidth - tileSystem.overlapSize;  // 896
    var tileAdvanceY = tileSystem.tileHeight - tileSystem.overlapSize;  // 384
    return {
        startX: tileX * tileAdvanceX,
        startY: tileY * tileAdvanceY
    };
}

// Helper function to get tile key for tileMap lookup
function getTileKey(tileX, tileY) {
    return tileX + ',' + tileY;
}

// Bilinear sampling helper - samples terrain with interpolation
function sampleBilinear(tileMap, x, y) {
    var x0 = Math.floor(x);
    var y0 = Math.floor(y);
    var x1 = x0 + 1;
    var y1 = y0 + 1;

    var fx = x - x0;  // Fractional part of X
    var fy = y - y0;  // Fractional part of Y

    // Wrap coordinates to map bounds
    var mapX0 = x0 & (tileMap.width - 1);
    var mapY0 = y0 & (tileMap.height - 1);
    var mapX1 = x1 & (tileMap.width - 1);
    var mapY1 = y1 & (tileMap.height - 1);

    // Get 4 corner samples
    var offset00 = (mapY0 << tileMap.shift) + mapX0;
    var offset10 = (mapY0 << tileMap.shift) + mapX1;
    var offset01 = (mapY1 << tileMap.shift) + mapX0;
    var offset11 = (mapY1 << tileMap.shift) + mapX1;

    var h00 = tileMap.altitude[offset00];
    var h10 = tileMap.altitude[offset10];
    var h01 = tileMap.altitude[offset01];
    var h11 = tileMap.altitude[offset11];

    var c00 = tileMap.color[offset00];
    var c10 = tileMap.color[offset10];
    var c01 = tileMap.color[offset01];
    var c11 = tileMap.color[offset11];

    // Interpolate height
    var h0 = lerp(h00, h10, fx);
    var h1 = lerp(h01, h11, fx);
    var height = lerp(h0, h1, fy);

    // Apply height scale multiplier
    height *= tileMap.heightScale;

    // Interpolate color (blend top row, then bottom row, then between rows)
    var colorTop = blendColors(c00, c10, fx);
    var colorBottom = blendColors(c01, c11, fx);
    var color = blendColors(colorTop, colorBottom, fy);

    return { height: height, color: color };
}

// Get terrain data (height and color) with blending in overlap zones
// z parameter determines filtering method: z < 600 uses bilinear, z >= 600 uses nearest neighbor
function getTerrainData(x, y, z) {
    var useBilinear = renderOpts.bilinearFilter && (z !== undefined && z < 600);  // Use bilinear for closest 20% (3000 * 0.20 = 600)

    // NORTHERN MOUNTAIN REGION - DISABLED
    // if (y >= tiles.mountainMinY && x >= tiles.mountainMinX && x < tiles.mountainMaxX) {
    //     var mountainMap = maps[3];  // map4
    //     var localX = x - tiles.mountainMinX;  // Adjust X to map coordinates
    //     var localY = y - tiles.mountainMinY;  // Adjust Y to map coordinates
    //
    //     if (useBilinear) {
    //         return sampleBilinear(mountainMap, localX, localY);
    //     } else {
    //         var mapX = Math.floor(localX) & (mountainMap.width - 1);
    //         var mapY = Math.floor(localY) & (mountainMap.height - 1);
    //         var offset = (mapY << mountainMap.shift) + mapX;
    //         return { height: mountainMap.altitude[offset] * mountainMap.heightScale, color: mountainMap.color[offset] };
    //     }
    // }

    // 2D TILE SYSTEM - Uses tile grid
    var coords = getTileCoords(x, y);
    var tilePos = getTileStartPos(coords.tileX, coords.tileY);
    var tileKey = getTileKey(coords.tileX, coords.tileY);

    // Check if tile exists
    if (!(tileKey in tileSystem.tileMap)) {
        return null;
    }

    // Distance-based tile culling - only render tiles within range of camera
    if (renderOpts.tileCulling) {
        var tileCenterX = tilePos.startX + tileSystem.tileWidth / 2;
        var tileCenterY = tilePos.startY + tileSystem.tileHeight / 2;
        var distToTile = Math.hypot(tileCenterX - camera.x, tileCenterY - camera.y);
        var maxTileDistance = 1000;  // Only render tiles within this distance (adjust for performance)

        if (distToTile > maxTileDistance) {
            return null;  // Tile too far away, don't render
        }
    }

    var localX = x - tilePos.startX;
    var localY = y - tilePos.startY;
    var overlapStartX = tileSystem.tileWidth - tileSystem.overlapSize;
    var overlapStartY = tileSystem.tileHeight - tileSystem.overlapSize;

    // Tile overlap blending (expensive - can be toggled off)
    if (renderOpts.tileBlending) {
        // Check if in LEFT overlap zone with previous tile (X direction)
    var leftKey = getTileKey(coords.tileX - 1, coords.tileY);
    if (localX >= 0 && localX < tileSystem.overlapSize && (leftKey in tileSystem.tileMap)) {
        // LEFT OVERLAP ZONE - blend with left neighbor tile
        var mapIndex1 = tileSystem.tileMap[leftKey];
        var mapIndex2 = tileSystem.tileMap[tileKey];

        var map1 = maps[mapIndex1];
        var map2 = maps[mapIndex2];

        // Position in left tile (its right overlap region)
        var prevLocalX = tileSystem.tileWidth - tileSystem.overlapSize + localX;

        var blendFactor = clamp(localX / tileSystem.overlapSize, 0, 1);

        var sample1, sample2;

        if (useBilinear) {
            // Bilinear sampling from both tiles
            sample1 = sampleBilinear(map1, prevLocalX, localY);
            sample2 = sampleBilinear(map2, localX, localY);
        } else {
            // Nearest neighbor sampling (original method)
            var mapX1 = Math.floor(prevLocalX) & (map1.width - 1);
            var mapY1 = Math.floor(localY) & (map1.height - 1);
            var mapX2 = Math.floor(localX) & (map2.width - 1);
            var mapY2 = Math.floor(localY) & (map2.height - 1);

            var offset1 = (mapY1 << map1.shift) + mapX1;
            var offset2 = (mapY2 << map2.shift) + mapX2;

            sample1 = { height: map1.altitude[offset1] * map1.heightScale, color: map1.color[offset1] };
            sample2 = { height: map2.altitude[offset2] * map2.heightScale, color: map2.color[offset2] };
        }

        var blendedHeight = lerp(sample1.height, sample2.height, blendFactor);
        var blendedColor = blendColors(sample1.color, sample2.color, blendFactor);

        return { height: blendedHeight, color: blendedColor };
    }

    // Check if in RIGHT overlap zone with next tile (X direction)
    var rightKey = getTileKey(coords.tileX + 1, coords.tileY);
    if (localX >= overlapStartX && localX < tileSystem.tileWidth && (rightKey in tileSystem.tileMap)) {
        // RIGHT OVERLAP ZONE - blend with right neighbor tile
        var mapIndex1 = tileSystem.tileMap[tileKey];
        var mapIndex2 = tileSystem.tileMap[rightKey];

        var map1 = maps[mapIndex1];
        var map2 = maps[mapIndex2];

        var localX2 = localX - overlapStartX;

        var blendFactor = clamp(localX2 / tileSystem.overlapSize, 0, 1);

        var sample1, sample2;

        if (useBilinear) {
            // Bilinear sampling from both tiles
            sample1 = sampleBilinear(map1, localX, localY);
            sample2 = sampleBilinear(map2, localX2, localY);
        } else {
            // Nearest neighbor sampling (original method)
            var mapX1 = Math.floor(localX) & (map1.width - 1);
            var mapY1 = Math.floor(localY) & (map1.height - 1);
            var mapX2 = Math.floor(localX2) & (map2.width - 1);
            var mapY2 = Math.floor(localY) & (map2.height - 1);

            var offset1 = (mapY1 << map1.shift) + mapX1;
            var offset2 = (mapY2 << map2.shift) + mapX2;

            sample1 = { height: map1.altitude[offset1] * map1.heightScale, color: map1.color[offset1] };
            sample2 = { height: map2.altitude[offset2] * map2.heightScale, color: map2.color[offset2] };
        }

        var blendedHeight = lerp(sample1.height, sample2.height, blendFactor);
        var blendedColor = blendColors(sample1.color, sample2.color, blendFactor);

        return { height: blendedHeight, color: blendedColor };
    }

    // Check if in TOP overlap zone with previous tile (Y direction)
    var topKey = getTileKey(coords.tileX, coords.tileY - 1);
    if (localY >= 0 && localY < tileSystem.overlapSize && (topKey in tileSystem.tileMap)) {
        // TOP OVERLAP ZONE - blend with top neighbor tile
        var mapIndex1 = tileSystem.tileMap[topKey];
        var mapIndex2 = tileSystem.tileMap[tileKey];

        var map1 = maps[mapIndex1];
        var map2 = maps[mapIndex2];

        // Position in top tile (its bottom overlap region)
        var prevLocalY = tileSystem.tileHeight - tileSystem.overlapSize + localY;

        var blendFactor = clamp(localY / tileSystem.overlapSize, 0, 1);

        var sample1, sample2;

        if (useBilinear) {
            // Bilinear sampling from both tiles
            sample1 = sampleBilinear(map1, localX, prevLocalY);
            sample2 = sampleBilinear(map2, localX, localY);
        } else {
            // Nearest neighbor sampling (original method)
            var mapX1 = Math.floor(localX) & (map1.width - 1);
            var mapY1 = Math.floor(prevLocalY) & (map1.height - 1);
            var mapX2 = Math.floor(localX) & (map2.width - 1);
            var mapY2 = Math.floor(localY) & (map2.height - 1);

            var offset1 = (mapY1 << map1.shift) + mapX1;
            var offset2 = (mapY2 << map2.shift) + mapX2;

            sample1 = { height: map1.altitude[offset1] * map1.heightScale, color: map1.color[offset1] };
            sample2 = { height: map2.altitude[offset2] * map2.heightScale, color: map2.color[offset2] };
        }

        var blendedHeight = lerp(sample1.height, sample2.height, blendFactor);
        var blendedColor = blendColors(sample1.color, sample2.color, blendFactor);

        return { height: blendedHeight, color: blendedColor };
    }

    // Check if in BOTTOM overlap zone with next tile (Y direction)
    var bottomKey = getTileKey(coords.tileX, coords.tileY + 1);
    if (localY >= overlapStartY && localY < tileSystem.tileHeight && (bottomKey in tileSystem.tileMap)) {
        // BOTTOM OVERLAP ZONE - blend with bottom neighbor tile
        var mapIndex1 = tileSystem.tileMap[tileKey];
        var mapIndex2 = tileSystem.tileMap[bottomKey];

        var map1 = maps[mapIndex1];
        var map2 = maps[mapIndex2];

        var localY2 = localY - overlapStartY;

        var blendFactor = clamp(localY2 / tileSystem.overlapSize, 0, 1);

        var sample1, sample2;

        if (useBilinear) {
            // Bilinear sampling from both tiles
            sample1 = sampleBilinear(map1, localX, localY);
            sample2 = sampleBilinear(map2, localX, localY2);
        } else {
            // Nearest neighbor sampling (original method)
            var mapX1 = Math.floor(localX) & (map1.width - 1);
            var mapY1 = Math.floor(localY) & (map1.height - 1);
            var mapX2 = Math.floor(localX) & (map2.width - 1);
            var mapY2 = Math.floor(localY2) & (map2.height - 1);

            var offset1 = (mapY1 << map1.shift) + mapX1;
            var offset2 = (mapY2 << map2.shift) + mapX2;

            sample1 = { height: map1.altitude[offset1] * map1.heightScale, color: map1.color[offset1] };
            sample2 = { height: map2.altitude[offset2] * map2.heightScale, color: map2.color[offset2] };
        }

        var blendedHeight = lerp(sample1.height, sample2.height, blendFactor);
        var blendedColor = blendColors(sample1.color, sample2.color, blendFactor);

        return { height: blendedHeight, color: blendedColor };
    }
    }  // End of tileBlending check

    // Regular tile (no overlap)
    if (localX >= 0 && localX < tileSystem.tileWidth && localY >= 0 && localY < tileSystem.tileHeight) {
        var mapIndex = tileSystem.tileMap[tileKey];
        var tileMap = maps[mapIndex];

        if (useBilinear) {
            // Bilinear sampling
            return sampleBilinear(tileMap, localX, localY);
        } else {
            // Nearest neighbor sampling (original method)
            var mapX = Math.floor(localX) & (tileMap.width - 1);
            var mapY = Math.floor(localY) & (tileMap.height - 1);
            var offset = (mapY << tileMap.shift) + mapX;
            return { height: tileMap.altitude[offset] * tileMap.heightScale, color: tileMap.color[offset] };
        }
    }

    return null;
}

// Terrain height functions
// Use appropriate terrain access based on current render mode
var getRawTerrainHeight = (x, y) => {
    // For tiled/cached modes: use tile system to respect different maps at different locations
    // For direct/subdivided modes: use direct map access for consistency with rendering
    if (renderOpts.renderMode === 'tiled' || renderOpts.renderMode === 'cached') {
        var data = getTerrainData(x, y);
        return data ? data.height : 0;
    } else if (renderOpts.renderMode === 'subdivided') {
        // Subdivided mode - use same 1024×1024 tile system with blending as rendering
        var tileSize = 1024;
        var tileAdvanceX = tileSize - tileSystem.overlapSize;  // 896
        var tileAdvanceY = tileSize - tileSystem.overlapSize;  // 896

        // Determine which tile we're in
        var tileX = Math.floor(x / tileAdvanceX);
        var tileY = Math.floor(y / tileAdvanceY);

        // Get position within tile
        var tileStartX = tileX * tileAdvanceX;
        var tileStartY = tileY * tileAdvanceY;
        var localX = x - tileStartX;
        var localY = y - tileStartY;

        // Helper to check if tile is subdivided
        var isSubdivided = function(tx, ty) {
            var hash = ((tx * 73856093) ^ (ty * 19349663)) & 0x7FFFFFFF;
            return (hash % 3) === 0;
        };

        // Helper to sample tile data
        var sampleTileHeight = function(tx, ty, lx, ly) {
            if(isSubdivided(tx, ty)) {
                // Sample from cached subdivided tile
                if(window.subdividedTileCache) {
                    var tileKey = tx + ',' + ty;
                    if(window.subdividedTileCache[tileKey]) {
                        var tileIdx = (Math.floor(ly) * tileSize) + Math.floor(lx);
                        return window.subdividedTileCache[tileKey].altitude[tileIdx] * map.heightScale;
                    }
                }
            }
            // Fallback: use local coordinates to sample base map (matches rendering)
            var mapX = Math.floor(lx) & (map.width - 1);
            var mapY = Math.floor(ly) & (map.height - 1);
            var mapoffset = (mapY << map.shift) + mapX;
            return map.altitude[mapoffset] * map.heightScale;
        };

        // Smoothstep for blending
        var smoothstep = function(t) {
            t = Math.max(0, Math.min(1, t));
            return t * t * (3 - 2 * t);
        };

        // Check for overlap zones and blend (same logic as rendering)
        var overlapSize = tileSystem.overlapSize;
        var overlapStartX = tileSize - overlapSize;
        var overlapStartY = tileSize - overlapSize;

        // LEFT overlap
        if(localX >= 0 && localX < overlapSize) {
            var prevLocalX = tileSize - overlapSize + localX;
            var blendFactor = smoothstep(localX / overlapSize);
            var h1 = sampleTileHeight(tileX - 1, tileY, prevLocalX, localY);
            var h2 = sampleTileHeight(tileX, tileY, localX, localY);
            return h1 + (h2 - h1) * blendFactor;  // lerp
        }
        // RIGHT overlap
        else if(localX >= overlapStartX && localX < tileSize) {
            var localX2 = localX - overlapStartX;
            var blendFactor = smoothstep(localX2 / overlapSize);
            var h1 = sampleTileHeight(tileX, tileY, localX, localY);
            var h2 = sampleTileHeight(tileX + 1, tileY, localX2, localY);
            return h1 + (h2 - h1) * blendFactor;  // lerp
        }
        // TOP overlap
        else if(localY >= 0 && localY < overlapSize) {
            var prevLocalY = tileSize - overlapSize + localY;
            var blendFactor = smoothstep(localY / overlapSize);
            var h1 = sampleTileHeight(tileX, tileY - 1, localX, prevLocalY);
            var h2 = sampleTileHeight(tileX, tileY, localX, localY);
            return h1 + (h2 - h1) * blendFactor;  // lerp
        }
        // BOTTOM overlap
        else if(localY >= overlapStartY && localY < tileSize) {
            var localY2 = localY - overlapStartY;
            var blendFactor = smoothstep(localY2 / overlapSize);
            var h1 = sampleTileHeight(tileX, tileY, localX, localY);
            var h2 = sampleTileHeight(tileX, tileY + 1, localX, localY2);
            return h1 + (h2 - h1) * blendFactor;  // lerp
        }
        // NO OVERLAP
        else {
            return sampleTileHeight(tileX, tileY, localX, localY);
        }
    } else {
        // Direct mode - direct map access
        var mapoffset = ((Math.floor(y) & (map.width - 1)) << map.shift) + (Math.floor(x) & (map.height - 1));
        return map.altitude[mapoffset] * map.heightScale;
    }
};

// Get ground height including cube top surface
function getGroundHeight(x, y) {
    var terrainHeight = getRawTerrainHeight(x, y) + playerHeightOffset;

    // Check if position is within cube's X/Y bounds
    var halfSize = cube.size / 2;
    if (x >= cube.x - halfSize && x <= cube.x + halfSize &&
        y >= cube.y - halfSize && y <= cube.y + halfSize) {
        // Player is above cube footprint - check cube top
        var cubeBaseZ = getRawTerrainHeight(cube.x, cube.y);
        var cubeTopZ = cubeBaseZ + cube.size + playerHeightOffset;

        // Return the higher of terrain or cube top
        return Math.max(terrainHeight, cubeTopZ);
    }

    return terrainHeight;
}

// ===============================
// RENDER MODE DISPATCHER
// ===============================
function Render(){
    // Dispatch to appropriate render implementation based on mode
    switch(renderOpts.renderMode) {
        case 'tiled':
            return Render_Tiled();
        case 'cached':
            return Render_Cached();
        case 'direct':
            return Render_Direct();
        case 'subdivided':
            return Render_Subdivided();
        default:
            return Render_Tiled();
    }
}

// ===============================
// MODE 1: TILED (Original - Slow)
// ===============================
function Render_Tiled(){
    var sw=screendata.canvas.width,sh=screendata.canvas.height,
        sinang=Math.sin(camera.angle),cosang=Math.cos(camera.angle),
        deltaz=1,depth=screendata.depthBuffer;

    hiddeny.fill(sh);

    // Arrays to store previous depth slice data for interpolation
    var prevHeights = null;
    var prevColors = null;
    var prevZ = 0;

    // Render flat terrain using voxel space with tile blending
    for(var z=1;z<camera.distance;z+=deltaz){
        var plx=-cosang*z-sinang*z,ply=sinang*z-cosang*z,prx=cosang*z-sinang*z,pry=-sinang*z-cosang*z,dx=(prx-plx)/sw,dy=(pry-ply)/sw;
        plx+=camera.x;ply+=camera.y;var invz = camera.focalLength / z;

        var useDepthInterp = renderOpts.depthInterp && (z < 600);  // Use depth interpolation for closest 20%
        var currentHeights = useDepthInterp ? new Float32Array(sw) : null;
        var currentColors = useDepthInterp ? new Uint32Array(sw) : null;

        for(var i=0;i<sw;i++){
            // Skip columns that are fully occluded (optimization)
            if(hiddeny[i] <= 0) {
                plx+=dx;ply+=dy;
                continue;
            }

            var currentX = plx, currentY = ply;

            // Sample terrain data directly
            var terrainData = getTerrainData(currentX, currentY, z);

            if(terrainData) {
                var finalHeight = terrainData.height;
                var finalColor = terrainData.color;

                // Depth interpolation for close range
                if(useDepthInterp && prevHeights && prevColors) {
                    // Interpolate between previous and current depth slice
                    var depthFactor = clamp((z - prevZ) / deltaz, 0, 1);
                    finalHeight = lerp(prevHeights[i], terrainData.height, depthFactor);
                    finalColor = blendColors(prevColors[i], terrainData.color, depthFactor);
                }

                // Store current data for next iteration
                if(useDepthInterp) {
                    currentHeights[i] = terrainData.height;
                    currentColors[i] = terrainData.color;
                }

                var heightonscreen=(camera.height-finalHeight)*invz+camera.horizon;
                if(heightonscreen<hiddeny[i]){
                    for(var k=heightonscreen|0;k<hiddeny[i];k++){
                        var idx=k*sw+i;
                        if(z<depth[idx]){
                            screendata.buf32[idx]=finalColor;
                            depth[idx]=z;
                        }
                    }
                    hiddeny[i]=heightonscreen;
                }
            }

            plx+=dx;ply+=dy;
        }

        // Update previous slice data
        if(useDepthInterp) {
            prevHeights = currentHeights;
            prevColors = currentColors;
            prevZ = z;
        }

        // Adaptive deltaz for level-of-detail
        if(z>1000)deltaz+=0.02;else deltaz+=0.005;
    }
}

// ===============================
// MODE 2: CACHED (Option 1 - Fast)
// Pre-cache tile lookups per depth slice to eliminate repeated calculations
// ===============================
function Render_Cached(){
    var sw=screendata.canvas.width,sh=screendata.canvas.height,
        sinang=Math.sin(camera.angle),cosang=Math.cos(camera.angle),
        deltaz=1,depth=screendata.depthBuffer;

    hiddeny.fill(sh);

    // Pre-allocate tile cache arrays (reused each z-slice)
    var tileCacheX = new Int32Array(sw);
    var tileCacheY = new Int32Array(sw);
    var tileCacheMapIndex = new Int32Array(sw);
    var tileCacheValid = new Uint8Array(sw);  // Boolean array

    // Arrays to store previous depth slice data for interpolation
    var prevHeights = null;
    var prevColors = null;
    var prevZ = 0;

    for(var z=1;z<camera.distance;z+=deltaz){
        var plx=-cosang*z-sinang*z,ply=sinang*z-cosang*z,prx=cosang*z-sinang*z,pry=-sinang*z-cosang*z,dx=(prx-plx)/sw,dy=(pry-ply)/sw;
        plx+=camera.x;ply+=camera.y;var invz = camera.focalLength / z;

        var useDepthInterp = renderOpts.depthInterp && (z < 600);
        var currentHeights = useDepthInterp ? new Float32Array(sw) : null;
        var currentColors = useDepthInterp ? new Uint32Array(sw) : null;

        // PRE-PASS: Cache tile lookups for all columns at this depth
        var tempX = plx, tempY = ply;
        var tileAdvanceX = tileSystem.tileWidth - tileSystem.overlapSize;
        var tileAdvanceY = tileSystem.tileHeight - tileSystem.overlapSize;

        for(var i=0;i<sw;i++){
            var coords_tileX = Math.floor(tempX / tileAdvanceX);
            var coords_tileY = Math.floor(tempY / tileAdvanceY);
            var tileKey = coords_tileX + ',' + coords_tileY;

            tileCacheX[i] = coords_tileX;
            tileCacheY[i] = coords_tileY;

            if(tileKey in tileSystem.tileMap) {
                // Tile exists - check distance culling
                if(renderOpts.tileCulling) {
                    var startX = coords_tileX * tileAdvanceX;
                    var startY = coords_tileY * tileAdvanceY;
                    var tileCenterX = startX + tileSystem.tileWidth / 2;
                    var tileCenterY = startY + tileSystem.tileHeight / 2;
                    var distToTile = Math.hypot(tileCenterX - camera.x, tileCenterY - camera.y);

                    if(distToTile > 1000) {
                        tileCacheValid[i] = 0;  // Too far
                    } else {
                        tileCacheMapIndex[i] = tileSystem.tileMap[tileKey];
                        tileCacheValid[i] = 1;  // Valid
                    }
                } else {
                    tileCacheMapIndex[i] = tileSystem.tileMap[tileKey];
                    tileCacheValid[i] = 1;  // Valid
                }
            } else {
                tileCacheValid[i] = 0;  // Tile doesn't exist
            }

            tempX += dx;
            tempY += dy;
        }

        // MAIN PASS: Render using cached tile data
        plx=-cosang*z-sinang*z+camera.x;
        ply=sinang*z-cosang*z+camera.y;

        for(var i=0;i<sw;i++){
            if(hiddeny[i] <= 0) {
                plx+=dx;ply+=dy;
                continue;
            }

            if(!tileCacheValid[i]) {
                plx+=dx;ply+=dy;
                continue;
            }

            // Use cached tile data to get terrain
            var tileX = tileCacheX[i];
            var tileY = tileCacheY[i];
            var mapIndex = tileCacheMapIndex[i];
            var tileMap = maps[mapIndex];

            // Calculate local position within tile
            var tileStartX = tileX * tileAdvanceX;
            var tileStartY = tileY * tileAdvanceY;
            var localX = plx - tileStartX;
            var localY = ply - tileStartY;

            // Sample terrain (simplified - no overlap blending in cached mode for performance)
            var useBilinear = renderOpts.bilinearFilter && (z < 600);
            var terrainData;

            if(useBilinear) {
                terrainData = sampleBilinear(tileMap, localX, localY);
            } else {
                var mapX = Math.floor(localX) & (tileMap.width - 1);
                var mapY = Math.floor(localY) & (tileMap.height - 1);
                var offset = (mapY << tileMap.shift) + mapX;
                terrainData = { height: tileMap.altitude[offset] * tileMap.heightScale, color: tileMap.color[offset] };
            }

            if(terrainData) {
                var finalHeight = terrainData.height;
                var finalColor = terrainData.color;

                // Depth interpolation
                if(useDepthInterp && prevHeights && prevColors) {
                    var depthFactor = clamp((z - prevZ) / deltaz, 0, 1);
                    finalHeight = lerp(prevHeights[i], terrainData.height, depthFactor);
                    finalColor = blendColors(prevColors[i], terrainData.color, depthFactor);
                }

                if(useDepthInterp) {
                    currentHeights[i] = terrainData.height;
                    currentColors[i] = terrainData.color;
                }

                var heightonscreen=(camera.height-finalHeight)*invz+camera.horizon;
                if(heightonscreen<hiddeny[i]){
                    for(var k=heightonscreen|0;k<hiddeny[i];k++){
                        var idx=k*sw+i;
                        if(z<depth[idx]){
                            screendata.buf32[idx]=finalColor;
                            depth[idx]=z;
                        }
                    }
                    hiddeny[i]=heightonscreen;
                }
            }

            plx+=dx;ply+=dy;
        }

        if(useDepthInterp) {
            prevHeights = currentHeights;
            prevColors = currentColors;
            prevZ = z;
        }

        if(z>1000)deltaz+=0.02;else deltaz+=0.005;
    }
}

// ===============================
// MODE 3: DIRECT (Option 2 - Fastest)
// Direct array access like VoxelSpace-Master - no tiles, just single map
// ===============================
function Render_Direct(){
    var sw=screendata.canvas.width,sh=screendata.canvas.height,
        sinang=Math.sin(camera.angle),cosang=Math.cos(camera.angle),
        deltaz=1,depth=screendata.depthBuffer;

    hiddeny.fill(sh);

    for(var z=1;z<camera.distance;z+=deltaz){
        var plx=-cosang*z-sinang*z,ply=sinang*z-cosang*z,prx=cosang*z-sinang*z,pry=-sinang*z-cosang*z,dx=(prx-plx)/sw,dy=(pry-ply)/sw;
        plx+=camera.x;ply+=camera.y;var invz = camera.focalLength / z;

        for(var i=0;i<sw;i++){
            if(hiddeny[i] <= 0) {
                plx+=dx;ply+=dy;
                continue;
            }

            // Direct array access - like VoxelSpace-Master
            var mapoffset=((Math.floor(ply)&(map.width-1))<<map.shift)+(Math.floor(plx)&(map.height-1));
            var heightonscreen=(camera.height-map.altitude[mapoffset]*map.heightScale)*invz+camera.horizon;

            if(heightonscreen<hiddeny[i]){
                for(var k=heightonscreen|0;k<hiddeny[i];k++){
                    var idx=k*sw+i;
                    if(z<depth[idx]){
                        screendata.buf32[idx]=map.color[mapoffset];
                        depth[idx]=z;
                    }
                }
                hiddeny[i]=heightonscreen;
            }
            plx+=dx;ply+=dy;
        }

        if(z>1000)deltaz+=0.02;else deltaz+=0.005;
    }
}

// ===============================
// MODE 4: SUBDIVIDED (Visual Effect)
// Some tiles are preprocessed: downsampled to 256×256, then replicated 4 times to create 1024×1024
// ===============================
function Render_Subdivided(){
    var sw=screendata.canvas.width,sh=screendata.canvas.height,
        sinang=Math.sin(camera.angle),cosang=Math.cos(camera.angle),
        deltaz=1,depth=screendata.depthBuffer;

    hiddeny.fill(sh);

    // Use same tile size as tiled mode: 1024×1024
    var tileSize = 1024;
    var quarterSize = 256;  // Downsampled size (1024 / 4)
    var tileAdvanceX = tileSize - tileSystem.overlapSize;  // 896
    var tileAdvanceY = tileSize - tileSystem.overlapSize;  // 896

    // Smoothstep function for smoother blending
    var smoothstep = function(t) {
        t = clamp(t, 0, 1);
        return t * t * (3 - 2 * t);  // Hermite interpolation
    };

    // Pre-compute which tiles are subdivided (deterministic based on tile coords)
    var isSubdivided = function(tileX, tileY) {
        // Use a simple hash to determine if tile is subdivided
        var hash = ((tileX * 73856093) ^ (tileY * 19349663)) & 0x7FFFFFFF;
        return (hash % 3) === 0;  // ~33% of tiles are subdivided
    };

    // Get or create preprocessed subdivided tile data
    var getSubdividedTileData = function(tileX, tileY) {
        var tileKey = tileX + ',' + tileY;

        // Check cache first
        if(!window.subdividedTileCache) {
            window.subdividedTileCache = {};
        }

        if(window.subdividedTileCache[tileKey]) {
            return window.subdividedTileCache[tileKey];
        }

        // Subdivided mode always uses the base map
        var sourceMap = map;

        // STEP 1: Downsample 1024×1024 to 256×256
        var downsampled = {
            altitude: new Uint8Array(quarterSize * quarterSize),
            color: new Uint32Array(quarterSize * quarterSize)
        };

        for(var dy = 0; dy < quarterSize; dy++) {
            for(var dx = 0; dx < quarterSize; dx++) {
                // Sample from source map with 4x downsampling
                var sampledX = dx * 4;
                var sampledY = dy * 4;

                var mapoffset = ((Math.floor(sampledY) & (sourceMap.width - 1)) << sourceMap.shift) + (Math.floor(sampledX) & (sourceMap.height - 1));
                var downIdx = dy * quarterSize + dx;

                downsampled.altitude[downIdx] = sourceMap.altitude[mapoffset];
                downsampled.color[downIdx] = sourceMap.color[mapoffset];
            }
        }

        // STEP 2: Replicate 256×256 into 1024×1024 (2×2 grid) with height scaling
        var tileData = {
            altitude: new Uint8Array(tileSize * tileSize),
            color: new Uint32Array(tileSize * tileSize)
        };

        // Scale factor for subdivided tiles (makes them shorter than normal tiles)
        var heightScale = 0.5;  // Subdivided tiles are half the height

        for(var ty = 0; ty < tileSize; ty++) {
            for(var tx = 0; tx < tileSize; tx++) {
                // Map to 256×256 downsampled tile (modulo wrapping)
                var srcX = Math.floor(tx / 4) % quarterSize;
                var srcY = Math.floor(ty / 4) % quarterSize;
                var srcIdx = srcY * quarterSize + srcX;
                var dstIdx = ty * tileSize + tx;

                // Scale down height (makes subdivided tiles shorter/lower)
                var scaledHeight = Math.floor(downsampled.altitude[srcIdx] * heightScale);

                tileData.altitude[dstIdx] = scaledHeight;
                tileData.color[dstIdx] = downsampled.color[srcIdx];
            }
        }

        // Cache it
        window.subdividedTileCache[tileKey] = tileData;
        return tileData;
    };

    // Helper to sample tile data (either subdivided or normal) with optional bilinear filtering
    var sampleTileData = function(tileX, tileY, localX, localY, useBilinear) {
        if(isSubdivided(tileX, tileY)) {
            // Sample from preprocessed subdivided tile
            var tileData = getSubdividedTileData(tileX, tileY);

            if(useBilinear) {
                // Bilinear filtering
                var x0 = Math.floor(localX);
                var y0 = Math.floor(localY);
                var x1 = x0 + 1;
                var y1 = y0 + 1;

                var fx = localX - x0;  // Fractional part
                var fy = localY - y0;

                // Clamp to tile bounds
                x0 = Math.max(0, Math.min(tileSize - 1, x0));
                y0 = Math.max(0, Math.min(tileSize - 1, y0));
                x1 = Math.max(0, Math.min(tileSize - 1, x1));
                y1 = Math.max(0, Math.min(tileSize - 1, y1));

                // Get 4 corner samples
                var idx00 = y0 * tileSize + x0;
                var idx10 = y0 * tileSize + x1;
                var idx01 = y1 * tileSize + x0;
                var idx11 = y1 * tileSize + x1;

                var h00 = tileData.altitude[idx00];
                var h10 = tileData.altitude[idx10];
                var h01 = tileData.altitude[idx01];
                var h11 = tileData.altitude[idx11];

                var c00 = tileData.color[idx00];
                var c10 = tileData.color[idx10];
                var c01 = tileData.color[idx01];
                var c11 = tileData.color[idx11];

                // Interpolate height
                var h0 = lerp(h00, h10, fx);
                var h1 = lerp(h01, h11, fx);
                var altitude = lerp(h0, h1, fy) * map.heightScale;

                // Interpolate color
                var colorTop = blendColors(c00, c10, fx);
                var colorBottom = blendColors(c01, c11, fx);
                var color = blendColors(colorTop, colorBottom, fy);

                return { altitude: altitude, color: color };
            } else {
                // Nearest neighbor
                var tileIdx = (Math.floor(localY) * tileSize) + Math.floor(localX);
                return {
                    altitude: tileData.altitude[tileIdx] * map.heightScale,
                    color: tileData.color[tileIdx]
                };
            }
        } else {
            // Non-subdivided tiles in subdivided mode also use the base map
            var sourceMap = map;

            if(useBilinear) {
                // Bilinear filtering
                var x0 = Math.floor(localX);
                var y0 = Math.floor(localY);
                var x1 = x0 + 1;
                var y1 = y0 + 1;

                var fx = localX - x0;
                var fy = localY - y0;

                // Wrap to map bounds
                var mapX0 = x0 & (sourceMap.width - 1);
                var mapY0 = y0 & (sourceMap.height - 1);
                var mapX1 = x1 & (sourceMap.width - 1);
                var mapY1 = y1 & (sourceMap.height - 1);

                var offset00 = (mapY0 << sourceMap.shift) + mapX0;
                var offset10 = (mapY0 << sourceMap.shift) + mapX1;
                var offset01 = (mapY1 << sourceMap.shift) + mapX0;
                var offset11 = (mapY1 << sourceMap.shift) + mapX1;

                var h00 = sourceMap.altitude[offset00];
                var h10 = sourceMap.altitude[offset10];
                var h01 = sourceMap.altitude[offset01];
                var h11 = sourceMap.altitude[offset11];

                var c00 = sourceMap.color[offset00];
                var c10 = sourceMap.color[offset10];
                var c01 = sourceMap.color[offset01];
                var c11 = sourceMap.color[offset11];

                // Interpolate height
                var h0 = lerp(h00, h10, fx);
                var h1 = lerp(h01, h11, fx);
                var altitude = lerp(h0, h1, fy) * sourceMap.heightScale;

                // Interpolate color
                var colorTop = blendColors(c00, c10, fx);
                var colorBottom = blendColors(c01, c11, fx);
                var color = blendColors(colorTop, colorBottom, fy);

                return { altitude: altitude, color: color };
            } else {
                // Nearest neighbor
                var mapX = Math.floor(localX) & (sourceMap.width - 1);
                var mapY = Math.floor(localY) & (sourceMap.height - 1);
                var mapoffset = (mapY << sourceMap.shift) + mapX;
                return {
                    altitude: sourceMap.altitude[mapoffset] * sourceMap.heightScale,
                    color: sourceMap.color[mapoffset]
                };
            }
        }
    };

    for(var z=1;z<camera.distance;z+=deltaz){
        var plx=-cosang*z-sinang*z,ply=sinang*z-cosang*z,prx=cosang*z-sinang*z,pry=-sinang*z-cosang*z,dx=(prx-plx)/sw,dy=(pry-ply)/sw;
        plx+=camera.x;ply+=camera.y;var invz = camera.focalLength / z;

        // Enable bilinear filtering for closest 20% of view distance
        var useBilinear = renderOpts.bilinearFilter && (z < 600);

        for(var i=0;i<sw;i++){
            if(hiddeny[i] <= 0) {
                plx+=dx;ply+=dy;
                continue;
            }

            var worldX = plx;
            var worldY = ply;

            // Determine which tile we're in (same as tiled mode)
            var tileX = Math.floor(worldX / tileAdvanceX);
            var tileY = Math.floor(worldY / tileAdvanceY);

            // Get position within tile (0 to tileSize)
            var tileStartX = tileX * tileAdvanceX;
            var tileStartY = tileY * tileAdvanceY;
            var localX = worldX - tileStartX;
            var localY = worldY - tileStartY;

            var finalAltitude, finalColor;

            // Tile blending at boundaries (same logic as tiled mode)
            if(renderOpts.tileBlending) {
                var overlapSize = tileSystem.overlapSize;
                var overlapStartX = tileSize - overlapSize;
                var overlapStartY = tileSize - overlapSize;

                // Check if in LEFT overlap zone
                if(localX >= 0 && localX < overlapSize) {
                    // LEFT OVERLAP - blend with left neighbor
                    var prevLocalX = tileSize - overlapSize + localX;
                    var blendFactor = smoothstep(localX / overlapSize);

                    var sample1 = sampleTileData(tileX - 1, tileY, prevLocalX, localY, useBilinear);
                    var sample2 = sampleTileData(tileX, tileY, localX, localY, useBilinear);

                    finalAltitude = lerp(sample1.altitude, sample2.altitude, blendFactor);
                    finalColor = blendColors(sample1.color, sample2.color, blendFactor);
                }
                // Check if in RIGHT overlap zone
                else if(localX >= overlapStartX && localX < tileSize) {
                    // RIGHT OVERLAP - blend with right neighbor
                    var localX2 = localX - overlapStartX;
                    var blendFactor = smoothstep(localX2 / overlapSize);

                    var sample1 = sampleTileData(tileX, tileY, localX, localY, useBilinear);
                    var sample2 = sampleTileData(tileX + 1, tileY, localX2, localY, useBilinear);

                    finalAltitude = lerp(sample1.altitude, sample2.altitude, blendFactor);
                    finalColor = blendColors(sample1.color, sample2.color, blendFactor);
                }
                // Check if in TOP overlap zone
                else if(localY >= 0 && localY < overlapSize) {
                    // TOP OVERLAP - blend with top neighbor
                    var prevLocalY = tileSize - overlapSize + localY;
                    var blendFactor = smoothstep(localY / overlapSize);

                    var sample1 = sampleTileData(tileX, tileY - 1, localX, prevLocalY, useBilinear);
                    var sample2 = sampleTileData(tileX, tileY, localX, localY, useBilinear);

                    finalAltitude = lerp(sample1.altitude, sample2.altitude, blendFactor);
                    finalColor = blendColors(sample1.color, sample2.color, blendFactor);
                }
                // Check if in BOTTOM overlap zone
                else if(localY >= overlapStartY && localY < tileSize) {
                    // BOTTOM OVERLAP - blend with bottom neighbor
                    var localY2 = localY - overlapStartY;
                    var blendFactor = smoothstep(localY2 / overlapSize);

                    var sample1 = sampleTileData(tileX, tileY, localX, localY, useBilinear);
                    var sample2 = sampleTileData(tileX, tileY + 1, localX, localY2, useBilinear);

                    finalAltitude = lerp(sample1.altitude, sample2.altitude, blendFactor);
                    finalColor = blendColors(sample1.color, sample2.color, blendFactor);
                }
                else {
                    // NO OVERLAP - regular sample
                    var sample = sampleTileData(tileX, tileY, localX, localY, useBilinear);
                    finalAltitude = sample.altitude;
                    finalColor = sample.color;
                }
            } else {
                // Blending disabled - regular sample
                var sample = sampleTileData(tileX, tileY, localX, localY, useBilinear);
                finalAltitude = sample.altitude;
                finalColor = sample.color;
            }

            var heightonscreen=(camera.height-finalAltitude)*invz+camera.horizon;

            if(heightonscreen<hiddeny[i]){
                for(var k=heightonscreen|0;k<hiddeny[i];k++){
                    var idx=k*sw+i;
                    if(z<depth[idx]){
                        screendata.buf32[idx]=finalColor;
                        depth[idx]=z;
                    }
                }
                hiddeny[i]=heightonscreen;
            }
            plx+=dx;ply+=dy;
        }

        if(z>1000)deltaz+=0.02;else deltaz+=0.005;
    }
}


function horizonToPitchRad(h){return h*90/500*Math.PI/180;}
