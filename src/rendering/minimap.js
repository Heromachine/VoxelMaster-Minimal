// ===============================
// Minimap Rendering
// ===============================
"use strict";

var minimap = {
    canvas: null,
    context: null,
    size: 400,  // Canvas resolution (higher = less pixelated)
    worldSize: 1200,  // How many world units to show (zoomed out to show more tiles)
    scale: 1,  // Will be calculated as canvas size / worldSize
    updateInterval: 10,  // Update minimap every N frames (increased for better performance)
    frameCount: 0
};

function InitMinimap() {
    try {
        minimap.canvas = document.getElementById('minimap');
        if (minimap.canvas && minimap.canvas.getContext) {
            minimap.context = minimap.canvas.getContext('2d');
            minimap.size = minimap.canvas.width;
            minimap.scale = minimap.size / minimap.worldSize;
        }
    } catch (e) {
        console.error("Minimap init error:", e);
    }
}

function RenderMinimap() {
    try {
        if (!minimap.context) return;

        // Toggle minimap visibility
        if (minimap.canvas) {
            minimap.canvas.style.display = renderOpts.minimapVisible ? 'block' : 'none';
        }
        if (!renderOpts.minimapVisible) return;

        // Only update terrain every N frames for performance
        minimap.frameCount++;
        var shouldUpdateTerrain = (minimap.frameCount % minimap.updateInterval) === 0;

        var ctx = minimap.context;
        var halfWorld = minimap.worldSize / 2;

        // Update terrain less frequently
        if (shouldUpdateTerrain) {
            // Clear with semi-transparent black
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(0, 0, minimap.size, minimap.size);

            // Calculate bounds in world space (centered on player)
            var minX = camera.x - halfWorld;
            var maxX = camera.x + halfWorld;
            var minY = camera.y - halfWorld;
            var maxY = camera.y + halfWorld;

            // Sample terrain colors and draw them (mode-specific sampling)
            var sampleStep = 16;  // Sample every 16 units for better performance
            for (var wy = minY; wy < maxY; wy += sampleStep) {
                for (var wx = minX; wx < maxX; wx += sampleStep) {
                    try {
                        var color;

                        // Sample terrain based on current render mode
                        if (renderOpts.renderMode === 'tiled' || renderOpts.renderMode === 'cached') {
                            // Use tile system for Tiled/Cached modes
                            var terrainData = getTerrainData(wx, wy);
                            if (terrainData) {
                                color = terrainData.color;
                            }
                        } else if (renderOpts.renderMode === 'subdivided') {
                            // Use subdivision logic for Subdivided mode (1024×1024 tiles)
                            var tileSize = 1024;
                            var tileAdvanceX = tileSize - tileSystem.overlapSize;  // 896
                            var tileAdvanceY = tileSize - tileSystem.overlapSize;  // 896
                            var tileX = Math.floor(wx / tileAdvanceX);
                            var tileY = Math.floor(wy / tileAdvanceY);

                            // Check if subdivided
                            var hash = ((tileX * 73856093) ^ (tileY * 19349663)) & 0x7FFFFFFF;
                            var isSubdivided = (hash % 3) === 0;

                            if (isSubdivided && window.subdividedTileCache) {
                                // Use cached subdivided tile data
                                var tileKey = tileX + ',' + tileY;
                                if(window.subdividedTileCache[tileKey]) {
                                    var tileStartX = tileX * tileAdvanceX;
                                    var tileStartY = tileY * tileAdvanceY;
                                    var localX = Math.floor(wx - tileStartX);
                                    var localY = Math.floor(wy - tileStartY);
                                    var tileIdx = (localY * tileSize) + localX;
                                    color = window.subdividedTileCache[tileKey].color[tileIdx];
                                } else {
                                    // Fallback to base map
                                    var mapoffset = ((Math.floor(wy) & (map.width - 1)) << map.shift) + (Math.floor(wx) & (map.height - 1));
                                    color = map.color[mapoffset];
                                }
                            } else {
                                // Non-subdivided - use base map (subdivided mode uses one map)
                                var mapoffset = ((Math.floor(wy) & (map.width - 1)) << map.shift) + (Math.floor(wx) & (map.height - 1));
                                color = map.color[mapoffset];
                            }
                        } else {
                            // Direct mode - direct map access
                            var mapoffset = ((Math.floor(wy) & (map.width - 1)) << map.shift) + (Math.floor(wx) & (map.height - 1));
                            color = map.color[mapoffset];
                        }

                        if (color !== undefined) {
                            // Convert world position to minimap pixel position
                            var mx = ((wx - minX) / minimap.worldSize) * minimap.size;
                            var my = ((wy - minY) / minimap.worldSize) * minimap.size;

                            // Extract RGB from color
                            var r = (color >> 16) & 0xFF;
                            var g = (color >> 8) & 0xFF;
                            var b = color & 0xFF;

                            // Draw pixel (scaled)
                            ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
                            var pixelSize = Math.ceil(minimap.scale * sampleStep);
                            ctx.fillRect(Math.floor(mx), Math.floor(my), pixelSize, pixelSize);
                        }
                    } catch (e) {
                        // Skip this sample if error
                    }
                }
            }

            // Draw cube position if visible
            if (cube.visible) {
                var cubeX = ((cube.x - camera.x + halfWorld) / minimap.worldSize) * minimap.size;
                var cubeY = ((cube.y - camera.y + halfWorld) / minimap.worldSize) * minimap.size;

                if (cubeX >= 0 && cubeX <= minimap.size && cubeY >= 0 && cubeY <= minimap.size) {
                    ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
                    var cubeSize = (cube.size / minimap.worldSize) * minimap.size;
                    ctx.fillRect(cubeX - cubeSize/2, cubeY - cubeSize/2, cubeSize, cubeSize);
                }
            }
        }

        // Draw grid lines based on render mode
        var minX = camera.x - halfWorld;
        var minY = camera.y - halfWorld;

        // Tiled/Cached modes: Show tile system grid (square tiles)
        if (renderOpts.renderMode === 'tiled' || renderOpts.renderMode === 'cached') {
            var tileAdvanceX = tileSystem.tileWidth - tileSystem.overlapSize;  // 896 (square)
            var tileAdvanceY = tileSystem.tileHeight - tileSystem.overlapSize;  // 896 (square)

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;

            // Find first tile line to the left/top of visible area
            var firstTileX = Math.floor(minX / tileAdvanceX) * tileAdvanceX;
            var firstTileY = Math.floor(minY / tileAdvanceY) * tileAdvanceY;

            // Draw vertical lines (X direction)
            for (var tx = firstTileX; tx < minX + minimap.worldSize; tx += tileAdvanceX) {
                var screenX = ((tx - minX) / minimap.worldSize) * minimap.size;
                if (screenX >= 0 && screenX <= minimap.size) {
                    ctx.beginPath();
                    ctx.moveTo(screenX, 0);
                    ctx.lineTo(screenX, minimap.size);
                    ctx.stroke();
                }
            }

            // Draw horizontal lines (Y direction)
            for (var ty = firstTileY; ty < minY + minimap.worldSize; ty += tileAdvanceY) {
                var screenY = ((ty - minY) / minimap.worldSize) * minimap.size;
                if (screenY >= 0 && screenY <= minimap.size) {
                    ctx.beginPath();
                    ctx.moveTo(0, screenY);
                    ctx.lineTo(minimap.size, screenY);
                    ctx.stroke();
                }
            }
        }

        // Draw subdivision grid (1024×1024 with 896 advance) in Subdivided mode - different color
        if (renderOpts.renderMode === 'subdivided') {
            var tileAdvanceX = tileSystem.tileWidth - tileSystem.overlapSize;  // 896
            var tileAdvanceY = tileSystem.tileHeight - tileSystem.overlapSize;  // 896

            // Draw all tile grid lines in cyan (baseline grid)
            ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';  // Cyan color for subdivision grid
            ctx.lineWidth = 1;

            // Find first subdivision line to the left/top of visible area
            var firstSubX = Math.floor(minX / tileAdvanceX) * tileAdvanceX;
            var firstSubY = Math.floor(minY / tileAdvanceY) * tileAdvanceY;

            // Draw vertical lines (X direction)
            for (var sx = firstSubX; sx < minX + minimap.worldSize; sx += tileAdvanceX) {
                var screenX = ((sx - minX) / minimap.worldSize) * minimap.size;
                if (screenX >= 0 && screenX <= minimap.size) {
                    ctx.beginPath();
                    ctx.moveTo(screenX, 0);
                    ctx.lineTo(screenX, minimap.size);
                    ctx.stroke();
                }
            }

            // Draw horizontal lines (Y direction)
            for (var sy = firstSubY; sy < minY + minimap.worldSize; sy += tileAdvanceY) {
                var screenY = ((sy - minY) / minimap.worldSize) * minimap.size;
                if (screenY >= 0 && screenY <= minimap.size) {
                    ctx.beginPath();
                    ctx.moveTo(0, screenY);
                    ctx.lineTo(minimap.size, screenY);
                    ctx.stroke();
                }
            }

            // Draw outlines around actually subdivided tiles (yellow/bright green)
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';  // Yellow for subdivided tiles
            ctx.lineWidth = 2;

            for (var sy = firstSubY; sy < minY + minimap.worldSize; sy += tileAdvanceY) {
                for (var sx = firstSubX; sx < minX + minimap.worldSize; sx += tileAdvanceX) {
                    // Calculate tile coordinates
                    var tileX = Math.floor(sx / tileAdvanceX);
                    var tileY = Math.floor(sy / tileAdvanceY);

                    // Use same hash function to determine if this tile is subdivided
                    var hash = ((tileX * 73856093) ^ (tileY * 19349663)) & 0x7FFFFFFF;
                    var isSubdivided = (hash % 3) === 0;

                    if (isSubdivided) {
                        // Draw rect outline for this subdivided tile
                        var screenX = ((sx - minX) / minimap.worldSize) * minimap.size;
                        var screenY = ((sy - minY) / minimap.worldSize) * minimap.size;
                        var screenSizeX = (tileSystem.tileWidth / minimap.worldSize) * minimap.size;
                        var screenSizeY = (tileSystem.tileHeight / minimap.worldSize) * minimap.size;

                        // Only draw if visible
                        if (screenX + screenSizeX >= 0 && screenX <= minimap.size &&
                            screenY + screenSizeY >= 0 && screenY <= minimap.size) {
                            ctx.strokeRect(screenX, screenY, screenSizeX, screenSizeY);
                        }
                    }
                }
            }
        }

        // Draw player position (center of minimap) - every frame
        var centerX = minimap.size / 2;
        var centerY = minimap.size / 2;

        // Draw view cone (FOV indicator)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();

        var fov = Math.PI / 3;  // ~60 degree FOV
        var coneLength = 60;  // Scaled up for larger canvas

        var leftAngle = camera.angle - fov / 2;
        var rightAngle = camera.angle + fov / 2;

        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
            centerX - Math.sin(leftAngle) * coneLength,
            centerY - Math.cos(leftAngle) * coneLength
        );
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
            centerX - Math.sin(rightAngle) * coneLength,
            centerY - Math.cos(rightAngle) * coneLength
        );
        ctx.stroke();

        // Draw player direction arrow
        ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.lineTo(
            centerX - Math.sin(camera.angle) * 30,
            centerY - Math.cos(camera.angle) * 30
        );
        ctx.stroke();

        // Draw player dot
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(centerX, centerY, 6, 0, Math.PI * 2);
        ctx.fill();

        // Draw border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, minimap.size - 4, minimap.size - 4);
    } catch (e) {
        console.error("Minimap render error:", e);
    }
}
