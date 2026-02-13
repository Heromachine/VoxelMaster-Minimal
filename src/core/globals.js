// ===============================
// Global State Variables - Minimal
// ===============================
"use strict";

// Camera state
var camera = {
    x: 512,
    y: 400,  // Positioned to see both flat terrain and vertical wall
    height: 78,
    angle: 0,
    horizon: 100,
    distance: 1000,
    velocityY: 0,
    focalLength: 300
};

// Player state (movement only)
var player = {
    isCrouching: false,
    moveSpeed: 1.5,
    sprintMultiplier: 2,
    jumpMinStrength: 3,
    jumpMaxStrength: 12,
    jumpChargeTime: 0,
    jumpMaxChargeTime: 1000,
    isChargingJump: false,
    crouchHeight: 40,
    normalHeight: 78,
    flyMode: false,
    flySpeed: 3.0
};

// Input state
var input = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    crouch: false,
    flyUp: false,      // Q key - fly up
    flyDown: false,    // E key - fly down
    lookX: 0,
    lookY: 0
};

// Map data
var map = {
    width: 1024,
    height: 1024,
    shift: 10,
    altitude: new Uint8Array(1024 * 1024),
    color: new Uint32Array(1024 * 1024),
    heightScale: 1.0  // Multiply height values by this (1.0 = ~84m max, 20.0 = ~1680m max)
};

// Second map data (for side tile)
var map2 = {
    width: 1024,
    height: 1024,
    shift: 10,
    altitude: new Uint8Array(1024 * 1024),
    color: new Uint32Array(1024 * 1024),
    heightScale: 1.0
};

// Third map data (mountain map)
var map3 = {
    width: 1024,
    height: 1024,
    shift: 10,
    altitude: new Uint8Array(1024 * 1024),
    color: new Uint32Array(1024 * 1024),
    heightScale: 25.0  // Medium mountains (~2,100m max)
};

// Fourth map data (T1/H1 - mountain and valley map for northern region)
var map4 = {
    width: 4096,
    height: 4096,
    shift: 12,  // 2^12 = 4096
    altitude: new Uint8Array(4096 * 4096),
    color: new Uint32Array(4096 * 4096),
    heightScale: 10.0  // Medium-height mountains and valleys (~850m max)
};

// Array of all map data for easy access
var maps = [map, map2, map3, map4];

// Tile system - stores which map each tile uses
var tileSystem = {
    tileWidth: 1024,
    tileHeight: 1024,  // SQUARE TILES (was 512 for rectangular) - Change back to 512 if issues
    overlapSize: 128,
    tileMap: {}  // Maps tile coordinates to map index
};

// Tile configuration - defines flat and vertical zones
var tiles = {
    flatBoundary: 512,     // Y coordinate where flat terrain ends (south boundary)
    flatBoundaryMin: 0,    // Y coordinate where flat terrain starts (south)
    wallHeight: 150,       // Height of the vertical wall
    wallDistance: 512,     // How far the wall extends from the boundary

    // Tile blending/overlap configuration
    overlapSize: 128,      // Size of overlap region between tiles

    // Bounds for the first flat tile (west)
    flatMinX: 0,
    flatMaxX: 1024,
    flatMinY: 0,
    flatMaxY: 4608,        // Extended to include northern mountain region (512 + 4096)
    // Bounds for the second flat tile (east, different map) - overlaps with first
    flat2MinX: 896,        // Starts 128 pixels before end of first tile (1024 - 128)
    flat2MaxX: 1920,       // 896 + 1024
    flat2MinY: 0,
    flat2MaxY: 4608,       // Extended to include northern mountain region
    // Mountain region (north of Y=512) - square 4096x4096 area
    mountainMinX: 0,
    mountainMaxX: 4096,
    mountainMinY: 512,
    mountainMaxY: 4608,    // 512 + 4096
    // Downward slope bounds
    downSlopeMinY: -512,
    downSlopeMaxY: 0
};

// Cube object
var cube = {
    x: 450,
    y: 300,  // Positioned on the flat terrain
    size: 50,
    texture: null,
    visible: true
};

// Screen data
var screendata = {
    canvas: null,
    context: null,
    imagedata: null,
    bufarray: null,
    buf8: null,
    buf32: null,
    depthBuffer: null,
    backgroundcolor: 0xFFE09090
};

// Items (trees, decorations)
var items = [];
var textures = {};

// Timing
var time = Date.now();
var lastFrameTime = 0;
var targetFPS = 144;  // Increased for high refresh rate displays
var frameDuration = 1000 / targetFPS;
var updaterunning = false;
var frames = 0;
var fpsFrames = 0;
var fpsLastTime = Date.now();
var currentFPS = 0;

// Player height offset (eye level for a 7-foot tall character)
var playerHeightOffset = 6.5;

// Rendering optimization toggles
var renderOpts = {
    tileCulling: true,      // 1 key - Distance-based tile culling
    bilinearFilter: true,   // 2 key - Bilinear texture filtering
    depthInterp: true,      // 3 key - Depth interpolation
    tileBlending: true,     // 4 key - Tile overlap blending
    minimapVisible: true,   // M key - Minimap visibility
    renderMode: 'subdivided'  // 6 key - Cycle render modes: 'subdivided', 'tiled', 'cached', 'direct'
};

// Hidden Y buffer for terrain rendering
var hiddeny;
