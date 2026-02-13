// ===============================
// Mouse Input Handlers - Minimal
// ===============================
"use strict";

function DetectMouseDown(e) {
    // No shooting in minimal version
}

function DetectMouseUp(e) {
    // No shooting in minimal version
}

function DetectMouseMove(e) {
    camera.angle = (camera.angle - e.movementX * 0.002) % (2 * Math.PI);
    if (camera.angle < 0) camera.angle += 2 * Math.PI;
    camera.horizon = Math.max(-400, Math.min(600, camera.horizon - e.movementY * 0.2));
}

function DetectMouseWheel(e) {
    // No zoom in minimal version
}
