// =====================================================
// Building Config — edit this file to move, resize,
// or retexture the building.
// To disable entirely: set enabled:false  OR  remove
// both <script> tags for indoor/ in index.html.
// =====================================================
"use strict";

var buildingConfig = {
    enabled: true,

    // ---- World position of building center ----
    // Spawn is at approx (512, 400) facing -Y.
    // This puts the building ~400 units straight ahead.
    x: 512,
    y: -100,

    // ---- Dimensions (world units) ----
    width:      280,    // East-West extent
    depth:      280,    // North-South extent
    wallHeight: 75,     // Wall height above terrain base (low enough to jump onto roof)

    // ---- Door opening (centered on south wall, facing spawn) ----
    doorWidth:  80,     // Width of door gap
    doorHeight: 110,    // Height of door opening (player fits at ~90 units)

    // ---- Textures ----
    // Swap paths here to change the look.
    wallTexture:    'images/textures/wall-305.png',
    ceilingTexture: 'images/textures/ceiling-100.png'
};
