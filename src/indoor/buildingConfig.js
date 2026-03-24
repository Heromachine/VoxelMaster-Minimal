// =====================================================
// Building Config — edit this file to redesign the
// building layout.  To disable entirely: set
// enabled:false OR remove both <script> tags for
// indoor/ in index.html.
// =====================================================
"use strict";

var buildingConfig = {
    enabled: true,

    // ---- Outer shell (center + half-extents) ----
    // Spawn is at approx (512, 400) facing -Y.
    // South wall is at y = 60 — about 340 units ahead.
    x:      512,     // world center X
    y:     -100,     // world center Y
    width:  380,     // East-West  (outer x: 322 → 702)
    depth:  320,     // North-South (outer y: −260 → 60)
    wallHeight: 100, // wall + interior height (world units)
    doorHeight:  82, // doorway opening height (header = wallHeight − doorHeight)
    doorWidth:   80, // entry door width

    // Entry door is on the south outer wall, offset from center.
    // doorOffsetX > 0 → east of centre.  The entry opens into the East Room.
    doorOffsetX: 95,   // door centre = x + 95 = 607

    // ---- Interior wall segments ----
    // type 'h': horizontal wall running E-W at constant y
    //           x1/x2 = extent, gaps = [{x1,x2}] openings
    // type 'v': vertical wall running N-S at constant x
    //           y1/y2 = extent, gaps = [{y1,y2}] openings
    //
    // Floor plan (top-down, N = up):
    //
    //   322                  702
    //    |<---  North Room  --->|   y = -260
    //    |                     |
    //    |   (380 × 150)       |
    //    |                     |
    //    +----[door:x=512]-----+   y = -110  ← interior H-wall
    //    |         |           |
    //    | W Room  |  E Room   |
    //    | 190×170 | 190×170   |
    //    |         |           |   ← interior V-wall at x=512
    //    |    [door:y=−25]     |
    //    |         |           |
    //    +----+----+--[D]--+---+   y =   60  (entry door in east half)
    //
    interiorWalls: [
        // Horizontal wall — separates North Room from West + East rooms
        {
            type: 'h',
            y:   -110,
            x1:   322, x2: 702,
            gaps: [{ x1: 472, x2: 552 }]   // 80-unit door centred at x=512
        },
        // Vertical wall — separates West Room from East Room (south half)
        {
            type: 'v',
            x:    512,
            y1:  -110, y2: 60,
            gaps: [{ y1: -65, y2: 15 }]    // 80-unit door centred at y=−25
        }
    ],

    // ---- Textures ----
    wallTexture:    'images/textures/wall-305.png',
    ceilingTexture: 'images/textures/ceiling-100.png',
    floorTexture:   'images/textures/floor-082.png'
};
