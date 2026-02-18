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
    InitWorldMinimap();
}

// -----------------------------------------------------------------------
// World Map Minimap — shows the 16x16 biome grid + player position
// -----------------------------------------------------------------------

var worldMinimap = {
    canvas: null,
    context: null,
    cellSize: 10   // pixels per biome cell (160px canvas / 16 cells)
};

// Biome fill colors for the world map display
var BIOME_COLORS = [
    'rgb(20,20,30)',           // 0: empty/undecided — dark
    'rgb(212,176,106)',        // 1: BEACH  — sandy tan
    'rgb(78,126,46)',          // 2: PLAINS — meadow green
    'rgb(58,88,36)',           // 3: HILLS  — dark forest green
    'rgb(112,108,118)',        // 4: MOUNTAIN — cool grey
    'rgb(145,151,76)'          // 5: TRANSITION — sandy-green blend
];
var BIOME_BORDER_COLOR = 'rgb(70,68,80)';  // outer mountain wall (darker grey)

function InitWorldMinimap() {
    try {
        var canvas = document.getElementById('worldmap-canvas');
        if (canvas && canvas.getContext) {
            worldMinimap.canvas  = canvas;
            worldMinimap.context = canvas.getContext('2d');
            worldMinimap.cellSize = canvas.width / WORLD_MAP_SIZE;  // 160 / 16 = 10
        }
    } catch (e) {
        console.error("World minimap init error:", e);
    }
}

function RenderWorldMinimap() {
    try {
        if (!worldMinimap.canvas || !worldMinimap.context) return;

        // Hide/show with main minimap toggle
        worldMinimap.canvas.style.display = renderOpts.minimapVisible ? 'block' : 'none';
        if (!renderOpts.minimapVisible) return;

        // Only show when world map data exists (biome/procedural mode)
        if (!proceduralMode || !window.worldMapData) {
            worldMinimap.canvas.style.display = 'none';
            return;
        }

        var ctx  = worldMinimap.context;
        var cs   = worldMinimap.cellSize;   // pixels per cell
        var size = WORLD_MAP_SIZE;
        var tileAdvanceX = tileSystem.tileWidth  - tileSystem.overlapSize;  // 896
        var tileAdvanceY = tileSystem.tileHeight - tileSystem.overlapSize;  // 896

        // ---- Redraw biome grid every frame (256 fillRects — trivially cheap) ----
        ctx.clearRect(0, 0, worldMinimap.canvas.width, worldMinimap.canvas.height);

        var halfGrid  = 5;   // inner tile half-extent
        var borderMin = -halfGrid - 1;
        var borderMax =  halfGrid;

        for (var cellY = 0; cellY < size; cellY++) {
            for (var cellX = 0; cellX < size; cellX++) {
                var biome = window.worldMapData[cellY * size + cellX];

                // Map cell → tile coordinates (tile 0,0 is at cell 8,8)
                var tileX = cellX - 8;
                var tileY = cellY - 8;
                var isBorder = (tileX === borderMin) || (tileX === borderMax) ||
                               (tileY === borderMin) || (tileY === borderMax);

                if (isBorder) {
                    ctx.fillStyle = BIOME_BORDER_COLOR;
                } else {
                    ctx.fillStyle = BIOME_COLORS[biome] || BIOME_COLORS[0];
                }
                ctx.fillRect(cellX * cs, cellY * cs, cs, cs);
            }
        }

        // Faint cell grid lines
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.lineWidth = 0.5;
        for (var i = 0; i <= size; i++) {
            ctx.beginPath();
            ctx.moveTo(i * cs, 0);
            ctx.lineTo(i * cs, worldMinimap.canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * cs);
            ctx.lineTo(worldMinimap.canvas.width, i * cs);
            ctx.stroke();
        }

        // ---- Mountain ridge lines (WFC pipe-style, drawn over cell fills) ----
        // Each mountain cell checks its 4 cardinal neighbors to determine which
        // "pipe" segments to draw.  Straight segments use lines; two-way corners
        // use smooth arcs (rounded, not 90°).  T-junctions and crosses draw
        // lines from the cell center to each connected edge.  Border cells are
        // skipped — they are a solid wall, not individual ridge tiles.
        ctx.lineCap  = 'round';
        ctx.lineJoin = 'round';

        for (var ry = 0; ry < size; ry++) {
            for (var rx = 0; rx < size; rx++) {
                if (window.worldMapData[ry * size + rx] !== BIOME_MOUNTAIN) continue;

                // Skip border ring cells (they are solid wall, not ridge tiles)
                var rtX = rx - 8, rtY = ry - 8;
                if (rtX <= borderMin || rtX >= borderMax ||
                    rtY <= borderMin || rtY >= borderMax) continue;

                var N = ry > 0      && window.worldMapData[(ry - 1) * size + rx] === BIOME_MOUNTAIN;
                var S = ry < size-1 && window.worldMapData[(ry + 1) * size + rx] === BIOME_MOUNTAIN;
                var E = rx < size-1 && window.worldMapData[ry * size + (rx + 1)] === BIOME_MOUNTAIN;
                var W = rx > 0      && window.worldMapData[ry * size + (rx - 1)] === BIOME_MOUNTAIN;

                var px  = rx * cs,       py  = ry * cs;        // cell top-left
                var pcx = px + cs * 0.5, pcy = py + cs * 0.5;  // cell center
                var r   = cs * 0.5;                             // arc radius

                ctx.strokeStyle = 'rgba(210,205,225,0.92)';
                ctx.lineWidth   = cs * 0.38;
                ctx.beginPath();

                var conn = (N ? 1 : 0) + (S ? 1 : 0) + (E ? 1 : 0) + (W ? 1 : 0);

                if      (N && S && !E && !W)  { ctx.moveTo(pcx, py);      ctx.lineTo(pcx, py + cs); }
                else if (E && W && !N && !S)  { ctx.moveTo(px, pcy);      ctx.lineTo(px + cs, pcy); }
                // Rounded corners — arc center is at the cell corner "inside" the bend
                else if (N && E && !S && !W)  { ctx.arc(px + cs, py,      r, Math.PI,       Math.PI * 0.5, true);  }
                else if (N && W && !S && !E)  { ctx.arc(px,      py,      r, 0,              Math.PI * 0.5, false); }
                else if (S && E && !N && !W)  { ctx.arc(px + cs, py + cs, r, Math.PI,       Math.PI * 1.5, false); }
                else if (S && W && !N && !E)  { ctx.arc(px,      py + cs, r, 0,              Math.PI * 1.5, true);  }
                else {
                    // T-junction, cross, end-cap, or isolated: spoke from center
                    if (N) { ctx.moveTo(pcx, pcy); ctx.lineTo(pcx, py); }
                    if (S) { ctx.moveTo(pcx, pcy); ctx.lineTo(pcx, py + cs); }
                    if (E) { ctx.moveTo(pcx, pcy); ctx.lineTo(px + cs, pcy); }
                    if (W) { ctx.moveTo(pcx, pcy); ctx.lineTo(px, pcy); }
                    if (conn === 0) { ctx.arc(pcx, pcy, cs * 0.18, 0, Math.PI * 2); }
                }

                ctx.stroke();
            }
        }

        // ---- Player dot (drawn on top of freshly redrawn grid) ----
        // Convert world coordinates to world-map fraction
        var playerTileX = camera.x / tileAdvanceX;
        var playerTileY = camera.y / tileAdvanceY;

        // Add offset: tile (0,0) maps to cell (8,8)
        var wmFracX = (playerTileX + 8) / size;
        var wmFracY = (playerTileY + 8) / size;

        var dotX = wmFracX * worldMinimap.canvas.width;
        var dotY = wmFracY * worldMinimap.canvas.height;

        // Player direction arrow
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(dotX, dotY);
        ctx.lineTo(
            dotX - Math.sin(camera.angle) * cs * 1.2,
            dotY - Math.cos(camera.angle) * cs * 1.2
        );
        ctx.stroke();

        // Player dot
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Outer border
        ctx.strokeStyle = 'rgba(0, 255, 136, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(1, 1, worldMinimap.canvas.width - 2, worldMinimap.canvas.height - 2);

    } catch (e) {
        console.error("World minimap render error:", e);
    }
}

function RenderMinimap() {
    try {
        if (!minimap.context) return;

        if (minimap.canvas) {
            minimap.canvas.style.display = renderOpts.minimapVisible ? 'block' : 'none';
        }
        if (!renderOpts.minimapVisible) {
            RenderWorldMinimap();
            return;
        }

        var ctx = minimap.context;
        var S   = minimap.size;         // canvas resolution (400)
        var cx  = S / 2, cy = S / 2;   // center
        var R   = S / 2 - 18;          // circle radius for terrain + border

        // Full clear every frame — map rotates constantly, partial updates would smear
        ctx.clearRect(0, 0, S, S);

        // ---- Terrain inside circular clip, rotated so player always faces UP ----
        ctx.save();

        // Fill and clip to circle
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 5, 15, 0.85)';
        ctx.fill();
        ctx.clip();

        // Rotate map so forward direction is always UP.
        // camera.angle decreases when turning right (mouse.js subtracts movementX),
        // so rotating by +camera.angle makes the terrain rotate correctly: CCW when
        // turning right, CW when turning left.
        ctx.translate(cx, cy);
        ctx.rotate(camera.angle);

        var halfWorld  = minimap.worldSize / 2;
        var sampleStep = 24;
        var scale      = S / minimap.worldSize;
        var pixSize    = Math.ceil(scale * sampleStep) + 1;

        for (var wy = -halfWorld; wy <= halfWorld; wy += sampleStep) {
            for (var wx = -halfWorld; wx <= halfWorld; wx += sampleStep) {
                var terrainData = getTerrainData(camera.x + wx, camera.y + wy);
                if (!terrainData) continue;

                // Color is stored as 0xFF_BB_GG_RR (ABGR little-endian)
                var col = terrainData.color;
                var r   = col & 0xFF;
                var g   = (col >> 8)  & 0xFF;
                var b   = (col >> 16) & 0xFF;

                ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
                ctx.fillRect(
                    Math.floor(wx * scale - pixSize / 2),
                    Math.floor(wy * scale - pixSize / 2),
                    pixSize, pixSize
                );
            }
        }

        ctx.restore(); // removes clip + undoes translate/rotate

        // ---- Player icon: triangle always pointing UP ----
        ctx.fillStyle = 'rgba(255,255,255,1)';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx,      cy - 14);   // tip (north)
        ctx.lineTo(cx - 8,  cy + 7);    // bottom-left
        ctx.lineTo(cx + 8,  cy + 7);    // bottom-right
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // ---- Circular border ----
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.stroke();

        // ---- N label: orbits the edge to show where north is ----
        // At camera.angle=0 (facing north), N sits at top (-π/2).
        // Formula: camera.angle - π/2 keeps N correctly positioned as player rotates.
        // (e.g. facing east/angle=-π/2 → N appears left = angle -π, which is correct)
        var nAngle = camera.angle - Math.PI / 2;
        var nR     = R + 14;
        var nX     = cx + nR * Math.cos(nAngle);
        var nY     = cy + nR * Math.sin(nAngle);

        ctx.font         = 'bold 13px monospace';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = 'rgba(255,210,80,0.95)';
        ctx.fillText('N', nX, nY);

    } catch (e) {
        console.error("Minimap render error:", e);
    }

    RenderWorldMinimap();
}
