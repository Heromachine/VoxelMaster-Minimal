// =====================================================
// Building Renderer
// A GZDoom-style structure placed in the voxel world.
//
// Self-contained module — remove both <script> tags
// for src/indoor/ in index.html to disable entirely.
// No existing files are modified except the two small
// hook lines in main.js and camera.js (guarded so they
// degrade gracefully if this file is absent).
// =====================================================
"use strict";

// Texture objects for wall and ceiling surfaces
var buildingTextures = {
    wall:    { data: null, width: 0, height: 0, loaded: false },
    ceiling: { data: null, width: 0, height: 0, loaded: false },
    floor:   { data: null, width: 0, height: 0, loaded: false }
};

// ---- Texture loading ----

function _loadBuildingTex(key, src) {
    var img = new Image();
    img.onload = function() {
        var c   = document.createElement('canvas');
        c.width  = img.width;
        c.height = img.height;
        var ctx  = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var id = ctx.getImageData(0, 0, img.width, img.height);
        buildingTextures[key].data   = id.data;
        buildingTextures[key].width  = img.width;
        buildingTextures[key].height = img.height;
        buildingTextures[key].loaded = true;
        console.log('[building] loaded', key, img.width + 'x' + img.height);
    };
    img.onerror = function() {
        console.warn('[building] failed to load texture:', src);
    };
    img.src = src;
}

// Called once from Init() in main.js
function initBuilding() {
    if (!buildingConfig || !buildingConfig.enabled) return;
    _loadBuildingTex('wall',    buildingConfig.wallTexture);
    _loadBuildingTex('ceiling', buildingConfig.ceilingTexture);
    _loadBuildingTex('floor',   buildingConfig.floorTexture);
    registerBuildingCollider(buildingConfig);
}

// ---- Texture sampling ----

function _sampleBuildingTex(tex, u, v) {
    if (!tex.loaded) return 0xFF888888;   // grey fallback while loading
    // Wrap to [0, 1)
    u = u - Math.floor(u);
    v = v - Math.floor(v);
    var tx = Math.min(tex.width  - 1, Math.floor(u * tex.width));
    var ty = Math.min(tex.height - 1, Math.floor(v * tex.height));
    var i  = (ty * tex.width + tx) * 4;
    var r = tex.data[i], g = tex.data[i+1], b = tex.data[i+2];
    // Return ABGR (little-endian Uint32 format used by the engine)
    return 0xFF000000 | (b << 16) | (g << 8) | r;
}

// ---- Triangle rasteriser ----
// Identical to drawTexturedTriangle in cubeRenderer.js but takes an
// explicit texture object so we can use different textures per face.

function _drawBuildingTri(p0, p1, p2, shade, tex) {
    var sw  = screendata.canvas.width,
        sh  = screendata.canvas.height,
        buf = screendata.buf32,
        dep = screendata.depthBuffer;

    var mnX = Math.max(0,    Math.floor(Math.min(p0.x, p1.x, p2.x)));
    var mxX = Math.min(sw-1, Math.ceil (Math.max(p0.x, p1.x, p2.x)));
    var mnY = Math.max(0,    Math.floor(Math.min(p0.y, p1.y, p2.y)));
    var mxY = Math.min(sh-1, Math.ceil (Math.max(p0.y, p1.y, p2.y)));
    if (mnX > mxX || mnY > mxY) return;

    // edgeFunction is global (defined in cubeRenderer.js)
    var area = edgeFunction(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y);
    if (Math.abs(area) < 0.001) return;
    var inv = 1.0 / area;

    var u0z = p0.u * p0.invZ, v0z = p0.v * p0.invZ;
    var u1z = p1.u * p1.invZ, v1z = p1.v * p1.invZ;
    var u2z = p2.u * p2.invZ, v2z = p2.v * p2.invZ;

    for (var py = mnY; py <= mxY; py++) {
        for (var px = mnX; px <= mxX; px++) {
            var cx = px + 0.5, cy = py + 0.5;
            var w0 = edgeFunction(p1.x, p1.y, p2.x, p2.y, cx, cy);
            var w1 = edgeFunction(p2.x, p2.y, p0.x, p0.y, cx, cy);
            var w2 = edgeFunction(p0.x, p0.y, p1.x, p1.y, cx, cy);
            var ok = (area > 0) ? (w0 >= 0 && w1 >= 0 && w2 >= 0)
                                : (w0 <= 0 && w1 <= 0 && w2 <= 0);
            if (!ok) continue;

            var b0 = w0 * inv, b1 = w1 * inv, b2 = w2 * inv;
            var iZ = b0 * p0.invZ + b1 * p1.invZ + b2 * p2.invZ;
            var pd = (1.0 / iZ) - 0.5;
            var bi = py * sw + px;
            if (pd >= dep[bi]) continue;   // depth test

            var u  = (b0 * u0z + b1 * u1z + b2 * u2z) / iZ;
            var v  = (b0 * v0z + b1 * v1z + b2 * v2z) / iZ;
            var tc = _sampleBuildingTex(tex, u, v);

            var r = Math.min(255, ((tc      ) & 0xFF) * shade | 0);
            var g = Math.min(255, ((tc >>  8) & 0xFF) * shade | 0);
            var b = Math.min(255, ((tc >> 16) & 0xFF) * shade | 0);
            buf[bi] = 0xFF000000 | (b << 16) | (g << 8) | r;
            dep[bi] = pd;
        }
    }
}

// ---- Near-plane clipper ----
// Clips a polygon (array of {x,y,z,u,v}) against the camera near plane
// using Sutherland-Hodgman, then projects and rasterises each triangle.
// This prevents walls from disappearing when close corners go behind
// the camera — instead we get a correctly clipped visible portion.

var _BUILDING_NEAR = 2.0;   // clip plane distance (world units)

function _clipAndDraw(verts, shade, tex) {
    var NEAR = _BUILDING_NEAR;
    var out  = [];
    var n    = verts.length;

    for (var i = 0; i < n; i++) {
        var a  = verts[i];
        var b  = verts[(i + 1) % n];
        // Forward (depth) of each vertex from the camera
        var fa = -(a.x - camera.x) * cubeSinYaw - (a.y - camera.y) * cubeCosYaw;
        var fb = -(b.x - camera.x) * cubeSinYaw - (b.y - camera.y) * cubeCosYaw;
        var aIn = fa >= NEAR;
        var bIn = fb >= NEAR;

        if (aIn) out.push(a);

        // Edge crosses the near plane — interpolate a new vertex
        if (aIn !== bIn) {
            var t = (NEAR - fa) / (fb - fa);
            out.push({
                x: a.x + t * (b.x - a.x),
                y: a.y + t * (b.y - a.y),
                z: a.z + t * (b.z - a.z),
                u: a.u + t * (b.u - a.u),
                v: a.v + t * (b.v - a.v)
            });
        }
    }

    if (out.length < 3) return;   // entirely behind near plane

    // Project the clipped polygon vertices (all are now in front of near plane)
    var proj = [];
    for (var i = 0; i < out.length; i++) {
        var p = projectPoint(out[i]);
        p.u = out[i].u;
        p.v = out[i].v;
        proj.push(p);
    }

    // Triangle fan from first vertex
    for (var i = 1; i < proj.length - 1; i++) {
        _drawBuildingTri(proj[0], proj[i], proj[i + 1], shade, tex);
    }
}

// ---- Quad helper ----
// v0=bottom-left, v1=bottom-right, v2=top-right, v3=top-left (world space).
// uRep / vRep control texture tiling counts.

function _drawBuildingQuad(v0, v1, v2, v3, shade, tex, uRep, vRep) {
    uRep = uRep || 1;
    vRep = vRep || 1;
    // Attach UV coordinates to world-space vertices before clipping
    // so they get correctly interpolated at the near-plane intersection.
    _clipAndDraw([
        {x: v0.x, y: v0.y, z: v0.z, u: 0,    v: vRep},
        {x: v1.x, y: v1.y, z: v1.z, u: uRep, v: vRep},
        {x: v2.x, y: v2.y, z: v2.z, u: uRep, v: 0   },
        {x: v3.x, y: v3.y, z: v3.z, u: 0,    v: 0   }
    ], shade, tex);
}

// =====================================================
// RenderBuilding — called each frame from main.js
// =====================================================
function RenderBuilding() {
    if (!buildingConfig || !buildingConfig.enabled) return;

    // Keep shared trig values current
    cubeSinYaw = Math.sin(camera.angle);
    cubeCosYaw = Math.cos(camera.angle);

    var cfg   = buildingConfig;
    var hw    = cfg.width  / 2;
    var hd    = cfg.depth  / 2;
    var wH    = cfg.wallHeight;
    var dH    = cfg.doorHeight;
    var dW    = cfg.doorWidth;
    var dOff  = cfg.doorOffsetX || 0;

    // Outer bounds
    var ox1 = cfg.x - hw,  ox2 = cfg.x + hw;   // west / east
    var oy1 = cfg.y - hd,  oy2 = cfg.y + hd;   // north / south

    var baseZ = getRawTerrainHeight(cfg.x, cfg.y) || 72;
    var topZ  = baseZ + wH;

    // Broad frustum reject
    var fdx = cfg.x - camera.x, fdy = cfg.y - camera.y;
    var fwd = -fdx * cubeSinYaw - fdy * cubeCosYaw;
    if (fwd < -(Math.max(hw, hd) + 300)) return;

    var wTex = buildingTextures.wall;
    var cTex = buildingTextures.ceiling;
    var fTex = buildingTextures.floor;

    // ------------------------------------------------------------------
    // Helpers: draw a solid horizontal or vertical wall segment, and a
    // header (partial-height quad above a door gap).
    // All walls are two-sided — the rasteriser's winding-order check
    // handles both interior and exterior views.
    // ------------------------------------------------------------------

    function hWall(wy, ax, bx, shade) {
        var len = bx - ax;
        if (len <= 0) return;
        _drawBuildingQuad(
            {x: ax, y: wy, z: baseZ}, {x: bx, y: wy, z: baseZ},
            {x: bx, y: wy, z: topZ }, {x: ax, y: wy, z: topZ },
            shade, wTex, len / wH, 1
        );
    }
    function hHeader(wy, ax, bx, fromZ, shade) {
        var len = bx - ax, hh = topZ - fromZ;
        if (len <= 0 || hh <= 0) return;
        _drawBuildingQuad(
            {x: ax, y: wy, z: fromZ}, {x: bx, y: wy, z: fromZ},
            {x: bx, y: wy, z: topZ }, {x: ax, y: wy, z: topZ },
            shade, wTex, len / wH, hh / wH
        );
    }
    function vWall(wx, ay, by, shade) {
        var len = by - ay;
        if (len <= 0) return;
        _drawBuildingQuad(
            {x: wx, y: ay, z: baseZ}, {x: wx, y: by, z: baseZ},
            {x: wx, y: by, z: topZ }, {x: wx, y: ay, z: topZ },
            shade, wTex, len / wH, 1
        );
    }
    function vHeader(wx, ay, by, fromZ, shade) {
        var len = by - ay, hh = topZ - fromZ;
        if (len <= 0 || hh <= 0) return;
        _drawBuildingQuad(
            {x: wx, y: ay, z: fromZ}, {x: wx, y: by, z: fromZ},
            {x: wx, y: by, z: topZ }, {x: wx, y: ay, z: topZ },
            shade, wTex, len / wH, hh / wH
        );
    }

    // ------------------------------------------------------------------
    // Outer walls
    // ------------------------------------------------------------------

    // North wall (no door)
    hWall(oy1, ox1, ox2, 0.65);

    // East wall (no door)
    vWall(ox2, oy1, oy2, 0.80);

    // West wall (no door)
    vWall(ox1, oy1, oy2, 0.80);

    // South wall — entry door offset from centre
    var dCX = cfg.x + dOff;
    var dl  = dCX - dW / 2,  dr = dCX + dW / 2;
    hWall  (oy2, ox1, dl, 1.0);
    hWall  (oy2, dr,  ox2, 1.0);
    hHeader(oy2, dl,  dr,  baseZ + dH, 1.0);

    // ------------------------------------------------------------------
    // Interior walls (from buildingConfig.interiorWalls array)
    // ------------------------------------------------------------------

    var iWalls = cfg.interiorWalls;
    if (iWalls) {
        for (var i = 0; i < iWalls.length; i++) {
            var w     = iWalls[i];
            var shade = 0.75;
            var cur, j, g, gH;

            if (w.type === 'h') {
                // Horizontal interior wall at w.y, spanning x = [w.x1 … w.x2]
                cur = w.x1;
                for (j = 0; j < w.gaps.length; j++) {
                    g  = w.gaps[j];
                    gH = g.height || dH;
                    hWall  (w.y, cur,  g.x1, shade);
                    hHeader(w.y, g.x1, g.x2, baseZ + gH, shade);
                    cur = g.x2;
                }
                hWall(w.y, cur, w.x2, shade);

            } else if (w.type === 'v') {
                // Vertical interior wall at w.x, spanning y = [w.y1 … w.y2]
                cur = w.y1;
                for (j = 0; j < w.gaps.length; j++) {
                    g  = w.gaps[j];
                    gH = g.height || dH;
                    vWall  (w.x, cur,  g.y1, shade);
                    vHeader(w.x, g.y1, g.y2, baseZ + gH, shade);
                    cur = g.y2;
                }
                vWall(w.x, cur, w.y2, shade);
            }
        }
    }

    // ------------------------------------------------------------------
    // Floor and ceiling / roof
    // ------------------------------------------------------------------

    var rU  = cfg.width  / 64;
    var rV2 = cfg.depth  / 64;

    // Floor at baseZ (winding: seen from above)
    _drawBuildingQuad(
        {x: ox1, y: oy1, z: baseZ}, {x: ox2, y: oy1, z: baseZ},
        {x: ox2, y: oy2, z: baseZ}, {x: ox1, y: oy2, z: baseZ},
        0.90, fTex, rU, rV2
    );

    // Roof at topZ (two-sided — near-plane clipper handles interior view)
    _drawBuildingQuad(
        {x: ox1, y: oy2, z: topZ}, {x: ox2, y: oy2, z: topZ},
        {x: ox2, y: oy1, z: topZ}, {x: ox1, y: oy1, z: topZ},
        0.85, cTex, rU, rV2
    );
}

// =====================================================
// General-purpose building collision registry
//
// Any building config can be registered with
// registerBuildingCollider(cfg).  initBuilding() does
// this automatically for buildingConfig.  Future
// buildings just call registerBuildingCollider() and
// get wall + ceiling collision for free.
//
// camera.js calls:
//   getBuildingCollision(x, y)  — wall/door check
//   getBuildingCeiling(x, y)    — ceiling height check
// Both are guarded with typeof so removing this module
// causes no errors.
// =====================================================

var buildingColliders = [];

function registerBuildingCollider(cfg) {
    buildingColliders.push(cfg);
}

// ---- Outer-shell wall check ----
function _checkColliderWall(cfg, x, y) {
    var hw = cfg.width  / 2;
    var hd = cfg.depth  / 2;
    var r  = PLAYER_RADIUS;

    // Broad reject
    if (x < cfg.x - hw - r || x > cfg.x + hw + r) return false;
    if (y < cfg.y - hd - r || y > cfg.y + hd + r) return false;

    // Height check: player's feet above wall top → can pass over
    var feetZ = camera.height - playerHeightOffset;
    var baseZ = getRawTerrainHeight(cfg.x, cfg.y) || 72;
    var topZ  = baseZ + cfg.wallHeight;
    if (feetZ >= topZ) return false;

    // Fully inside interior — no wall contact
    if (x > cfg.x - hw + r && x < cfg.x + hw - r &&
        y > cfg.y - hd + r && y < cfg.y + hd - r) return false;

    // South wall entry door gap (offset from centre by doorOffsetX)
    var dw = (cfg.doorWidth || 0) / 2;
    if (dw > 0 && y > cfg.y + hd - r) {
        var doorCX   = cfg.x + (cfg.doorOffsetX || 0);
        var inDoorX  = Math.abs(x - doorCX) < dw - r;
        var doorTopZ = baseZ + cfg.doorHeight;
        if (inDoorX && feetZ < doorTopZ) return false;
    }

    return true;
}

// ---- Interior wall segment check ----
// Returns true if moving from (camera.x, camera.y) to (nx, ny) is blocked
// by any interior wall defined in cfg.interiorWalls.
function _checkInteriorWalls(cfg, nx, ny) {
    if (!cfg.interiorWalls) return false;
    var baseZ = getRawTerrainHeight(cfg.x, cfg.y) || 72;
    var topZ  = baseZ + cfg.wallHeight;
    var feetZ = camera.height - playerHeightOffset;
    if (feetZ >= topZ) return false;   // can jump over all interior walls

    for (var i = 0; i < cfg.interiorWalls.length; i++) {
        var w = cfg.interiorWalls[i];

        if (w.type === 'h') {
            // Horizontal wall at w.y spanning x = [w.x1 … w.x2]
            var oldSide = camera.y - w.y;
            var newSide = ny       - w.y;
            if (oldSide * newSide >= 0) continue;   // not crossing
            if (nx < w.x1 || nx > w.x2) continue;  // outside wall extent

            // Check each gap
            var blocked = true;
            for (var j = 0; j < w.gaps.length; j++) {
                var g  = w.gaps[j];
                var gH = g.height || cfg.doorHeight;
                if (nx >= g.x1 && nx <= g.x2 && feetZ < baseZ + gH) {
                    blocked = false;
                    break;
                }
            }
            if (blocked) return true;

        } else if (w.type === 'v') {
            // Vertical wall at w.x spanning y = [w.y1 … w.y2]
            var oldSide = camera.x - w.x;
            var newSide = nx       - w.x;
            if (oldSide * newSide >= 0) continue;   // not crossing
            if (ny < w.y1 || ny > w.y2) continue;  // outside wall extent

            var blocked = true;
            for (var j = 0; j < w.gaps.length; j++) {
                var g  = w.gaps[j];
                var gH = g.height || cfg.doorHeight;
                if (ny >= g.y1 && ny <= g.y2 && feetZ < baseZ + gH) {
                    blocked = false;
                    break;
                }
            }
            if (blocked) return true;
        }
    }
    return false;
}

// Called from camera.js canMoveTo — returns true = blocked
function getBuildingCollision(x, y) {
    for (var i = 0; i < buildingColliders.length; i++) {
        var cfg = buildingColliders[i];
        if (_checkColliderWall(cfg, x, y))    return true;
        if (_checkInteriorWalls(cfg, x, y))   return true;
    }
    return false;
}

// Called from camera.js UpdateCamera — returns lowest ceiling height
// above the player, or Infinity if not inside any building.
// Only fires when the player is already BELOW the roof (inside the
// building).  If the player is above the roof (flew over it), the
// ceiling is not applied so they land on top rather than being
// teleported inside.
function getBuildingCeiling(x, y, prevHeight) {
    // prevHeight is the camera height from the PREVIOUS frame (before physics).
    // Using it instead of camera.height prevents tunneling: a fast upward jump
    // that moves the camera past topZ in one frame still reads as "inside"
    // because prevHeight was still below the roof.
    var checkH = (prevHeight !== undefined) ? prevHeight : camera.height;
    var lowest = Infinity;
    for (var i = 0; i < buildingColliders.length; i++) {
        var cfg   = buildingColliders[i];
        var hw    = cfg.width / 2;
        var hd    = cfg.depth / 2;
        if (x > cfg.x - hw && x < cfg.x + hw &&
            y > cfg.y - hd && y < cfg.y + hd) {
            var topZ  = (getRawTerrainHeight(cfg.x, cfg.y) || 72) + cfg.wallHeight;
            // Only clamp if player was inside last frame (eyes below roof level).
            // If checkH > topZ they were above the building — leave them alone.
            if (checkH <= topZ) {
                var ceilH = topZ - playerHeightOffset;
                if (ceilH < lowest) lowest = ceilH;
            }
        }
    }
    return lowest;
}

// Called from voxelEngine.js getGroundHeight — returns roof surface
// height when the player is standing on top of a building, so the
// roof acts as solid ground just like the cube top surface does.
function getBuildingRoofGround(x, y) {
    var highest = 0;
    for (var i = 0; i < buildingColliders.length; i++) {
        var cfg  = buildingColliders[i];
        var hw   = cfg.width  / 2;
        var hd   = cfg.depth  / 2;
        if (x > cfg.x - hw && x < cfg.x + hw &&
            y > cfg.y - hd && y < cfg.y + hd) {
            var topZ    = (getRawTerrainHeight(cfg.x, cfg.y) || 72) + cfg.wallHeight;
            var roofGnd = topZ + playerHeightOffset;
            // Only snap to roof if the player was above it last frame OR is
            // currently above it.  This prevents a player touching the ceiling
            // from inside (camera.height ≈ topZ - playerHeightOffset) from
            // accidentally triggering the roof-ground snap and getting launched
            // through the ceiling.
            var wasAbove = (_cameraHeightPrev >= topZ);
            var isAbove  = (camera.height    >= topZ);
            if ((wasAbove || isAbove) && roofGnd > highest) {
                highest = roofGnd;
            }
        }
    }
    return highest;
}

// Called from voxelEngine.js getGroundHeight — raises the ground to the
// building's floor quad height when the player is inside the footprint.
// The floor quad is drawn at baseZ (terrain height at building centre).
// Without this, terrain dips below the floor quad let the player sink through.
function getBuildingFloorGround(x, y) {
    var highest = 0;
    for (var i = 0; i < buildingColliders.length; i++) {
        var cfg = buildingColliders[i];
        var hw  = cfg.width  / 2;
        var hd  = cfg.depth  / 2;
        if (x > cfg.x - hw && x < cfg.x + hw &&
            y > cfg.y - hd && y < cfg.y + hd) {
            var baseZ    = getRawTerrainHeight(cfg.x, cfg.y) || 72;
            var floorGnd = baseZ + playerHeightOffset;
            if (floorGnd > highest) highest = floorGnd;
        }
    }
    return highest;
}
