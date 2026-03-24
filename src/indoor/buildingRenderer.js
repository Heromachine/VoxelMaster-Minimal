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
    ceiling: { data: null, width: 0, height: 0, loaded: false }
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

    // Keep shared trig values current (cubeRenderer sets these too;
    // we set them here so RenderBuilding is order-independent)
    cubeSinYaw = Math.sin(camera.angle);
    cubeCosYaw = Math.cos(camera.angle);

    var cfg = buildingConfig;
    var hw  = cfg.width      / 2;   // half width  (X)
    var hd  = cfg.depth      / 2;   // half depth  (Y)
    var dw  = cfg.doorWidth  / 2;   // half door width
    var dh  = cfg.doorHeight;       // door height above base

    // Terrain height at building centre — base of all walls
    var baseZ = getRawTerrainHeight(cfg.x, cfg.y) || 72;
    var topZ  = baseZ + cfg.wallHeight;

    // Broad frustum reject: building is clearly behind the camera
    var fdx = cfg.x - camera.x, fdy = cfg.y - camera.y;
    var fwd = -fdx * cubeSinYaw - fdy * cubeCosYaw;
    if (fwd < -(Math.max(hw, hd) + 300)) return;

    var wTex = buildingTextures.wall;
    var cTex = buildingTextures.ceiling;

    // Corner world positions (Y convention: -Y is forward from spawn)
    var nwX = cfg.x - hw,  nwY = cfg.y - hd;   // north-west
    var neX = cfg.x + hw,  neY = cfg.y - hd;   // north-east
    var seX = cfg.x + hw,  seY = cfg.y + hd;   // south-east
    var swX = cfg.x - hw,  swY = cfg.y + hd;   // south-west

    // Texture tiling: number of horizontal repeats = wall length / wall height
    var rH = cfg.width  / cfg.wallHeight;   // repeat for N/S walls
    var rV = cfg.depth  / cfg.wallHeight;   // repeat for E/W walls

    // Walls are two-sided: the rasteriser handles both winding orientations
    // via the (area > 0) sign check, so each quad is visible from either
    // side.  The depth buffer keeps exterior/interior correctly sorted.
    // _bfaceVis is intentionally not used here.

    // ---- North wall ----
    _drawBuildingQuad(
        {x: nwX, y: nwY, z: baseZ},
        {x: neX, y: neY, z: baseZ},
        {x: neX, y: neY, z: topZ },
        {x: nwX, y: nwY, z: topZ },
        0.65, wTex, rH, 1
    );

    // ---- East wall ----
    _drawBuildingQuad(
        {x: neX, y: neY, z: baseZ},
        {x: seX, y: seY, z: baseZ},
        {x: seX, y: seY, z: topZ },
        {x: neX, y: neY, z: topZ },
        0.80, wTex, rV, 1
    );

    // ---- West wall ----
    _drawBuildingQuad(
        {x: swX, y: swY, z: baseZ},
        {x: nwX, y: nwY, z: baseZ},
        {x: nwX, y: nwY, z: topZ },
        {x: swX, y: swY, z: topZ },
        0.80, wTex, rV, 1
    );

    // ---- South wall with door ----
    var lW = (hw - dw) / cfg.wallHeight;

    // Left section (west side of door)
    _drawBuildingQuad(
        {x: swX,         y: seY, z: baseZ},
        {x: cfg.x - dw,  y: seY, z: baseZ},
        {x: cfg.x - dw,  y: seY, z: topZ },
        {x: swX,         y: seY, z: topZ },
        1.0, wTex, lW, 1
    );

    // Right section (east side of door)
    _drawBuildingQuad(
        {x: cfg.x + dw,  y: seY, z: baseZ},
        {x: seX,         y: seY, z: baseZ},
        {x: seX,         y: seY, z: topZ },
        {x: cfg.x + dw,  y: seY, z: topZ },
        1.0, wTex, lW, 1
    );

    // Header above door
    var headerH = cfg.wallHeight - dh;
    _drawBuildingQuad(
        {x: swX + (hw - dw),  y: seY, z: baseZ + dh},
        {x: swX + (hw + dw),  y: seY, z: baseZ + dh},
        {x: swX + (hw + dw),  y: seY, z: topZ       },
        {x: swX + (hw - dw),  y: seY, z: topZ       },
        1.0, wTex,
        cfg.doorWidth  / cfg.wallHeight,
        headerH        / cfg.wallHeight
    );

    // ---- Roof (two-sided — near-plane clipper decides visibility) ----
    var rU = cfg.width / 64, rV2 = cfg.depth / 64;
    _drawBuildingQuad(
        {x: swX, y: swY, z: topZ},
        {x: seX, y: seY, z: topZ},
        {x: neX, y: neY, z: topZ},
        {x: nwX, y: nwY, z: topZ},
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

// ---- Per-collider wall check ----
function _checkColliderWall(cfg, x, y) {
    var hw = cfg.width      / 2;
    var hd = cfg.depth      / 2;
    var dw = (cfg.doorWidth || 0) / 2;
    var r  = PLAYER_RADIUS;

    // Broad reject
    if (x < cfg.x - hw - r || x > cfg.x + hw + r) return false;
    if (y < cfg.y - hd - r || y > cfg.y + hd + r) return false;

    // Fully inside interior — no wall contact
    if (x > cfg.x - hw + r && x < cfg.x + hw - r &&
        y > cfg.y - hd + r && y < cfg.y + hd - r) return false;

    // South wall door gap (only if config defines a door)
    if (dw > 0 && y > cfg.y + hd - r) {
        var inDoorX  = Math.abs(x - cfg.x) < dw - r;
        var feetZ    = camera.height - playerHeightOffset;
        var doorTopZ = (getRawTerrainHeight(cfg.x, cfg.y) || 72) + cfg.doorHeight;
        if (inDoorX && feetZ < doorTopZ) return false;
    }

    return true;
}

// Called from camera.js canMoveTo — returns true = blocked
function getBuildingCollision(x, y) {
    for (var i = 0; i < buildingColliders.length; i++) {
        if (_checkColliderWall(buildingColliders[i], x, y)) return true;
    }
    return false;
}

// Called from camera.js UpdateCamera — returns lowest ceiling height
// above the player, or Infinity if not inside any building.
// Only fires when the player is already BELOW the roof (inside the
// building).  If the player is above the roof (flew over it), the
// ceiling is not applied so they land on top rather than being
// teleported inside.
function getBuildingCeiling(x, y) {
    var lowest = Infinity;
    for (var i = 0; i < buildingColliders.length; i++) {
        var cfg   = buildingColliders[i];
        var hw    = cfg.width / 2;
        var hd    = cfg.depth / 2;
        if (x > cfg.x - hw && x < cfg.x + hw &&
            y > cfg.y - hd && y < cfg.y + hd) {
            var topZ  = (getRawTerrainHeight(cfg.x, cfg.y) || 72) + cfg.wallHeight;
            // Only clamp if player is inside (eyes below roof level).
            // If camera.height > topZ they are above the building — leave them alone.
            if (camera.height <= topZ) {
                var ceilH = topZ - playerHeightOffset;
                if (ceilH < lowest) lowest = ceilH;
            }
        }
    }
    return lowest;
}
