// ===============================
// Distance LOD
// ===============================
// Reduces color quality for the farthest 10% of draw distance by replacing
// per-pixel texture colors with a single flat altitude-based color.
//
// TO DISABLE: remove (or comment out) the script tag in index.html.
// No other files need to change — voxelEngine.js checks typeof lodApply.
//
// Colors are in ABGR little-endian format matching the map color arrays:
//   bits 0-7  = Red, bits 8-15 = Green, bits 16-23 = Blue, bits 24-31 = 0xFF
"use strict";

var distanceLOD = {
    enabled:   true,
    threshold: 0.9   // LOD zone starts at 90% of camera.distance
};

// Flat altitude-based colors (no per-pixel noise) — muted to read as distance.
// Heights are in world units (altitude * heightScale).
function _lodFlatColor(height) {
    var r, g, b;
    if (height < 100) {
        r = 88;  g = 102; b = 54;   // Low flat ground — muted green-brown
    } else if (height < 200) {
        r = 98;  g = 86;  b = 57;   // Mid terrain — muted brown
    } else if (height < 350) {
        r = 118; g = 110; b = 90;   // Rocky heights — muted grey-brown
    } else {
        r = 178; g = 183; b = 192;  // Peaks / snow — light desaturated grey
    }
    // Store as ABGR (B at bit 16, G at bit 8, R at bit 0)
    return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
}

// Returns the LOD-adjusted color for a pixel at depth z.
// Smoothly blends from full-texture color at the LOD threshold to the flat
// color at maximum draw distance, so there is no hard seam.
function lodApply(color, height, z) {
    if (!distanceLOD.enabled) return color;

    var lodStart = camera.distance * distanceLOD.threshold;
    if (z <= lodStart) return color;

    // t: 0 at start of LOD zone, 1 at maximum draw distance
    var lodRange = camera.distance - lodStart;
    var t = (z - lodStart) / lodRange;
    t = t * t * (3.0 - 2.0 * t);  // smoothstep — avoids hard edge at threshold

    var flat = _lodFlatColor(height);

    // Blend full-texture color toward flat color (ABGR channels)
    var rFull = (color >> 0)  & 0xFF,  rFlat = (flat >> 0)  & 0xFF;
    var gFull = (color >> 8)  & 0xFF,  gFlat = (flat >> 8)  & 0xFF;
    var bFull = (color >> 16) & 0xFF,  bFlat = (flat >> 16) & 0xFF;

    var r = (rFull + (rFlat - rFull) * t + 0.5) | 0;
    var g = (gFull + (gFlat - gFull) * t + 0.5) | 0;
    var b = (bFull + (bFlat - bFull) * t + 0.5) | 0;

    return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
}
