// ===============================
// 3D Cube Rendering
// ===============================
"use strict";

// Cube texture
var cubeTexture = {
    image: null,
    canvas: null,
    ctx: null,
    data: null,
    width: 0,
    height: 0,
    loaded: false
};

// Load the cube texture
function loadCubeTexture() {
    cubeTexture.image = new Image();
    cubeTexture.image.onload = function() {
        cubeTexture.canvas = document.createElement('canvas');
        cubeTexture.width = cubeTexture.image.width;
        cubeTexture.height = cubeTexture.image.height;
        cubeTexture.canvas.width = cubeTexture.width;
        cubeTexture.canvas.height = cubeTexture.height;
        cubeTexture.ctx = cubeTexture.canvas.getContext('2d');
        cubeTexture.ctx.drawImage(cubeTexture.image, 0, 0);
        cubeTexture.data = cubeTexture.ctx.getImageData(0, 0, cubeTexture.width, cubeTexture.height).data;
        cubeTexture.loaded = true;
        console.log('Cube texture loaded:', cubeTexture.width, 'x', cubeTexture.height);
    };
    cubeTexture.image.src = 'images/box.jpg';
}

// Sample texture at UV coordinates (0-1 range)
function sampleTexture(u, v) {
    if (!cubeTexture.loaded) return 0xFF808080;  // Gray fallback

    // Wrap UV coordinates
    u = u - Math.floor(u);
    v = v - Math.floor(v);

    var tx = Math.floor(u * (cubeTexture.width - 1));
    var ty = Math.floor(v * (cubeTexture.height - 1));
    var idx = (ty * cubeTexture.width + tx) * 4;

    var r = cubeTexture.data[idx];
    var g = cubeTexture.data[idx + 1];
    var b = cubeTexture.data[idx + 2];

    // Return as ABGR for the buffer
    return 0xFF000000 | (b << 16) | (g << 8) | r;
}

// Get cube vertices in world space (8 corners of a cube)
function getCubeVertices() {
    var s = cube.size;
    var baseZ = getRawTerrainHeight(cube.x, cube.y);  // Sit on terrain
    return [
        // Bottom face (z = baseZ)
        {x: cube.x - s/2, y: cube.y - s/2, z: baseZ},       // 0: back-left-bottom
        {x: cube.x + s/2, y: cube.y - s/2, z: baseZ},       // 1: back-right-bottom
        {x: cube.x + s/2, y: cube.y + s/2, z: baseZ},       // 2: front-right-bottom
        {x: cube.x - s/2, y: cube.y + s/2, z: baseZ},       // 3: front-left-bottom
        // Top face (z = baseZ + size)
        {x: cube.x - s/2, y: cube.y - s/2, z: baseZ + s},   // 4: back-left-top
        {x: cube.x + s/2, y: cube.y - s/2, z: baseZ + s},   // 5: back-right-top
        {x: cube.x + s/2, y: cube.y + s/2, z: baseZ + s},   // 6: front-right-top
        {x: cube.x - s/2, y: cube.y + s/2, z: baseZ + s}    // 7: front-left-top
    ];
}

// Near plane distance - minimum distance for rendering
var CUBE_NEAR_PLANE = 0.5;

// Project a 3D point to screen coordinates
// Must match RenderItems projection exactly to avoid shifting
// Clamps to near plane but marks if originally behind camera
function projectPoint(p) {
    var dx = p.x - camera.x;
    var dy = p.y - camera.y;

    // Use precomputed trig values from RenderCube
    var sinYaw = cubeSinYaw;
    var cosYaw = cubeCosYaw;

    // Ground-plane distance (same as RenderItems uses)
    var groundForward = -dx * sinYaw - dy * cosYaw;

    // Right offset (same as RenderItems)
    var right = dx * cosYaw - dy * sinYaw;

    // Track if this point was behind camera
    var wasBehind = groundForward < CUBE_NEAR_PLANE;

    // Clamp to near plane to prevent division issues
    if (groundForward < CUBE_NEAR_PLANE) {
        groundForward = CUBE_NEAR_PLANE;
    }

    var sw = screendata.canvas.width;

    // Use same projection formula as RenderItems
    // Store 1/z for perspective-correct interpolation
    var invZ = 1.0 / groundForward;
    return {
        x: right * (sw / 2) * invZ + sw / 2,
        y: (camera.height - p.z) * camera.focalLength * invZ + camera.horizon,
        depth: groundForward,
        invZ: invZ,
        wasBehind: wasBehind
    };
}

// Edge function: returns which side of edge A->B point P is on
function edgeFunction(ax, ay, bx, by, px, py) {
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

// Draw a filled triangle with perspective-correct texture mapping
function drawTexturedTriangle(p0, p1, p2, shade) {
    var sw = screendata.canvas.width;
    var sh = screendata.canvas.height;
    var buf32 = screendata.buf32;
    var depth = screendata.depthBuffer;

    // Get bounding box
    var minX = Math.max(0, Math.floor(Math.min(p0.x, p1.x, p2.x)));
    var maxX = Math.min(sw - 1, Math.ceil(Math.max(p0.x, p1.x, p2.x)));
    var minY = Math.max(0, Math.floor(Math.min(p0.y, p1.y, p2.y)));
    var maxY = Math.min(sh - 1, Math.ceil(Math.max(p0.y, p1.y, p2.y)));

    if (minX > maxX || minY > maxY) return;

    // Compute area of full triangle (for barycentric coords)
    var area = edgeFunction(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y);
    if (Math.abs(area) < 0.001) return; // Degenerate triangle

    var invArea = 1.0 / area;

    // Precompute UV/z for perspective-correct interpolation
    var u0z = p0.u * p0.invZ, v0z = p0.v * p0.invZ;
    var u1z = p1.u * p1.invZ, v1z = p1.v * p1.invZ;
    var u2z = p2.u * p2.invZ, v2z = p2.v * p2.invZ;

    // Rasterize the triangle
    for (var py = minY; py <= maxY; py++) {
        for (var px = minX; px <= maxX; px++) {
            var pxc = px + 0.5;
            var pyc = py + 0.5;

            // Compute edge functions for point
            var w0 = edgeFunction(p1.x, p1.y, p2.x, p2.y, pxc, pyc);
            var w1 = edgeFunction(p2.x, p2.y, p0.x, p0.y, pxc, pyc);
            var w2 = edgeFunction(p0.x, p0.y, p1.x, p1.y, pxc, pyc);

            // Check if inside (all same sign or zero)
            var inside = (area > 0) ? (w0 >= 0 && w1 >= 0 && w2 >= 0) : (w0 <= 0 && w1 <= 0 && w2 <= 0);
            if (!inside) continue;

            // Barycentric coordinates
            var b0 = w0 * invArea;
            var b1 = w1 * invArea;
            var b2 = w2 * invArea;

            // Perspective-correct interpolation
            var interpInvZ = b0 * p0.invZ + b1 * p1.invZ + b2 * p2.invZ;
            var pixelDepth = (1.0 / interpInvZ) - 0.5;

            var bufIdx = py * sw + px;

            // Depth test - only draw if in front of existing pixel
            if (pixelDepth < depth[bufIdx]) {
                // Perspective-correct UV interpolation
                var u = (b0 * u0z + b1 * u1z + b2 * u2z) / interpInvZ;
                var v = (b0 * v0z + b1 * v1z + b2 * v2z) / interpInvZ;

                // Sample texture and apply shading
                var texColor = sampleTexture(u, v);
                var r = (texColor & 0xFF);
                var g = ((texColor >> 8) & 0xFF);
                var b = ((texColor >> 16) & 0xFF);

                r = Math.floor(r * shade);
                g = Math.floor(g * shade);
                b = Math.floor(b * shade);

                buf32[bufIdx] = 0xFF000000 | (b << 16) | (g << 8) | r;
                depth[bufIdx] = pixelDepth;
            }
        }
    }
}

// Draw a textured quad (4 vertices) by splitting into two triangles
function drawTexturedQuad(v0, v1, v2, v3) {
    // Project all vertices
    var p0 = projectPoint(v0);
    var p1 = projectPoint(v1);
    var p2 = projectPoint(v2);
    var p3 = projectPoint(v3);

    // Skip if MORE than 2 vertices are behind camera (prevents giant distorted polygons)
    var behindCount = (p0.wasBehind ? 1 : 0) + (p1.wasBehind ? 1 : 0) + (p2.wasBehind ? 1 : 0) + (p3.wasBehind ? 1 : 0);
    if (behindCount >= 2) return;

    // Add UV coordinates (standard quad mapping)
    // v0=bottom-left, v1=bottom-right, v2=top-right, v3=top-left
    p0.u = 0; p0.v = 1;
    p1.u = 1; p1.v = 1;
    p2.u = 1; p2.v = 0;
    p3.u = 0; p3.v = 0;

    // Apply simple shading based on average depth
    var avgDepth = (p0.depth + p1.depth + p2.depth + p3.depth) / 4;
    var shade = Math.max(0.3, Math.min(1.0, 1.0 - avgDepth / 1000));

    // Split quad into two triangles: (0,1,2) and (0,2,3)
    drawTexturedTriangle(p0, p1, p2, shade);
    drawTexturedTriangle(p0, p2, p3, shade);
}

// Check if a face is visible (back-face culling)
// Returns true if the camera is in front of the face (face normal points toward camera)
function isFaceVisible(faceCenter, normal, cubeHalfSize) {
    // Vector from face center to camera
    var toCamX = camera.x - faceCenter.x;
    var toCamY = camera.y - faceCenter.y;
    var toCamZ = camera.height - faceCenter.z;

    // Distance from camera to face center
    var dist = Math.sqrt(toCamX*toCamX + toCamY*toCamY + toCamZ*toCamZ);

    // If camera is very close to the cube, disable back-face culling
    // to prevent faces from disappearing at close range
    if (dist < cubeHalfSize * 1.5) {
        return true;  // Always visible when close
    }

    // Dot product: if positive, camera is in front of face
    return (toCamX * normal.x + toCamY * normal.y + toCamZ * normal.z) > 0;
}

// Render the 3D cube
function RenderCube() {
    // Precompute trig values once per frame
    cubeSinYaw = Math.sin(camera.angle);
    cubeCosYaw = Math.cos(camera.angle);

    var cubeDx = cube.x - camera.x;
    var cubeDy = cube.y - camera.y;
    var halfSize = cube.size / 2;

    // Frustum culling: check if cube is within camera's horizontal FOV
    // Get horizontal FOV (add margin for cube size)
    var hFov = (DisplayConfig.fov.current || 90) * Math.PI / 180;
    var maxAngle = hFov / 2 + Math.PI / 6;  // FOV half-angle + 30 degree margin for cube corners

    // Calculate angle from camera look direction to cube center
    var distToCube = Math.sqrt(cubeDx * cubeDx + cubeDy * cubeDy);
    if (distToCube > 1) {  // Only check if cube is not at camera position
        // Forward component (along look direction)
        var forward = -cubeDx * cubeSinYaw - cubeDy * cubeCosYaw;
        // Right component (perpendicular to look direction)
        var right = cubeDx * cubeCosYaw - cubeDy * cubeSinYaw;

        // Angle from look direction to cube
        var angleToCenter = Math.abs(Math.atan2(right, forward));

        // If cube center is way outside FOV, skip rendering
        if (angleToCenter > maxAngle && forward < halfSize) {
            return;  // Cube is outside view frustum
        }
    }

    // Find closest point on cube to camera
    var closestX = Math.max(-halfSize, Math.min(halfSize, -cubeDx)) + cube.x;
    var closestY = Math.max(-halfSize, Math.min(halfSize, -cubeDy)) + cube.y;

    // Check if closest point is in front of camera
    var closestDx = closestX - camera.x;
    var closestDy = closestY - camera.y;
    var closestDist = -closestDx * cubeSinYaw - closestDy * cubeCosYaw;

    // Skip if even the closest point on cube is behind camera
    if (closestDist < CUBE_NEAR_PLANE) {
        return;  // Cube is entirely behind camera
    }

    var v = getCubeVertices();
    var halfSize = cube.size / 2;
    var cubeBaseZ = getRawTerrainHeight(cube.x, cube.y);
    var cubeCenterZ = cubeBaseZ + cube.size / 2;

    // Define the 6 faces with normals for back-face culling
    var faces = [
        {verts: [v[0], v[1], v[5], v[4]], // Back face (y- side)
         center: {x: cube.x, y: cube.y - halfSize, z: cubeCenterZ}, normal: {x: 0, y: -1, z: 0}},
        {verts: [v[2], v[3], v[7], v[6]], // Front face (y+ side)
         center: {x: cube.x, y: cube.y + halfSize, z: cubeCenterZ}, normal: {x: 0, y: 1, z: 0}},
        {verts: [v[3], v[0], v[4], v[7]], // Left face (x- side)
         center: {x: cube.x - halfSize, y: cube.y, z: cubeCenterZ}, normal: {x: -1, y: 0, z: 0}},
        {verts: [v[1], v[2], v[6], v[5]], // Right face (x+ side)
         center: {x: cube.x + halfSize, y: cube.y, z: cubeCenterZ}, normal: {x: 1, y: 0, z: 0}},
        {verts: [v[4], v[5], v[6], v[7]], // Top face (z+ side)
         center: {x: cube.x, y: cube.y, z: cubeBaseZ + cube.size}, normal: {x: 0, y: 0, z: 1}},
        {verts: [v[3], v[2], v[1], v[0]], // Bottom face (z- side)
         center: {x: cube.x, y: cube.y, z: cubeBaseZ}, normal: {x: 0, y: 0, z: -1}}
    ];

    // Filter to only visible faces (back-face culling) and calculate depth
    var visibleFaces = [];
    faces.forEach(function(face) {
        if (!isFaceVisible(face.center, face.normal, halfSize)) return; // Skip back-facing

        var totalDepth = 0;
        face.verts.forEach(function(vert) {
            var dx = vert.x - camera.x;
            var dy = vert.y - camera.y;
            totalDepth += -dx * cubeSinYaw - dy * cubeCosYaw;
        });
        face.avgDepth = totalDepth / 4;
        visibleFaces.push(face);
    });

    // Sort by depth (painter's algorithm - draw far faces first)
    visibleFaces.sort(function(a, b) { return b.avgDepth - a.avgDepth; });

    // Draw each visible face with texture
    visibleFaces.forEach(function(face) {
        drawTexturedQuad(face.verts[0], face.verts[1], face.verts[2], face.verts[3]);
    });
}
