// ===============================
// Keyboard Input Handlers - Minimal
// ===============================
"use strict";

function DetectKeysDown(e) {
    switch (e.keyCode) {
        case 87: input.forward = true; break;   // W
        case 83: input.backward = true; break;  // S
        case 65: input.left = true; break;      // A
        case 68: input.right = true; break;     // D
        case 32: input.jump = true; break;      // Space
        case 16:                                // Shift - Sprint (only in normal mode)
            if (!player.flyMode) {
                input.sprint = true;
            }
            break;
        case 67: input.crouch = true; break;    // C
        case 81: input.flyUp = true; break;     // Q - Fly up
        case 69: input.flyDown = true; break;   // E - Fly down
        case 70:                                 // F - Toggle fly mode
            player.flyMode = !player.flyMode;
            console.log("Fly mode: " + (player.flyMode ? "ON" : "OFF"));
            // Update visual indicator
            var indicator = document.getElementById('fly-indicator');
            if (indicator) {
                indicator.style.display = player.flyMode ? 'block' : 'none';
            }
            break;
        case 49:                                 // 1 - Toggle tile culling
            renderOpts.tileCulling = !renderOpts.tileCulling;
            console.log("Tile culling: " + (renderOpts.tileCulling ? "ON" : "OFF"));
            updateOptimizationLegend();
            break;
        case 50:                                 // 2 - Toggle bilinear filtering
            renderOpts.bilinearFilter = !renderOpts.bilinearFilter;
            console.log("Bilinear filter: " + (renderOpts.bilinearFilter ? "ON" : "OFF"));
            updateOptimizationLegend();
            break;
        case 51:                                 // 3 - Toggle depth interpolation
            renderOpts.depthInterp = !renderOpts.depthInterp;
            console.log("Depth interpolation: " + (renderOpts.depthInterp ? "ON" : "OFF"));
            updateOptimizationLegend();
            break;
        case 52:                                 // 4 - Toggle tile blending
            renderOpts.tileBlending = !renderOpts.tileBlending;
            console.log("Tile blending: " + (renderOpts.tileBlending ? "ON" : "OFF"));
            updateOptimizationLegend();
            break;
        case 71:                                 // G - Toggle ground floor cap
            renderOpts.groundFloor = !renderOpts.groundFloor;
            console.log("Ground floor: " + (renderOpts.groundFloor ? "ON" : "OFF"));
            updateOptimizationLegend();
            break;
        case 77:                                 // M - Toggle minimap
            renderOpts.minimapVisible = !renderOpts.minimapVisible;
            console.log("Minimap: " + (renderOpts.minimapVisible ? "ON" : "OFF"));
            updateOptimizationLegend();
            break;
        case 76: {                               // L - Toggle tile legend
            var legendEl = document.getElementById('tile-legend');
            if (legendEl) {
                var isOn = legendEl.style.display !== 'none' && legendEl.style.display !== '';
                legendEl.style.display = isOn ? 'none' : 'block';
                updateOptimizationLegend();
            }
            break;
        }
        case 54:                                 // 6 - Cycle render mode
            var modes = ['tiled', 'cached', 'direct', 'subdivided'];
            var currentIndex = modes.indexOf(renderOpts.renderMode);
            var nextIndex = (currentIndex + 1) % modes.length;
            renderOpts.renderMode = modes[nextIndex];
            var modeNames = {
                'tiled': 'Tiled (Slow)',
                'cached': 'Cached Tiles (Fast)',
                'direct': 'Direct Array (Fastest)',
                'subdivided': 'Subdivided Tiles (Visual)'
            };
            console.log("Render mode: " + modeNames[renderOpts.renderMode]);
            updateOptimizationLegend();
            break;
    }
    if (!updaterunning) {
        time = Date.now();
        Draw();
    }
}

function DetectKeysUp(e) {
    switch (e.keyCode) {
        case 87: input.forward = false; break;  // W
        case 83: input.backward = false; break; // S
        case 65: input.left = false; break;     // A
        case 68: input.right = false; break;    // D
        case 32: input.jump = false; break;     // Space
        case 16: input.sprint = false; break;   // Shift
        case 67: input.crouch = false; break;   // C
        case 81: input.flyUp = false; break;    // Q
        case 69: input.flyDown = false; break;  // E
    }
}

// Update optimization legend display
function updateOptimizationLegend() {
    var legend = document.getElementById('optimization-legend');
    if (legend) {
        var modeNames = {
            'tiled': 'Tiled (Slow)',
            'cached': 'Cached (Fast)',
            'direct': 'Direct (Fastest)',
            'subdivided': 'Subdivided (Visual)'
        };
        var legendEl   = document.getElementById('tile-legend');
        var legendOn   = legendEl && legendEl.style.display !== 'none' && legendEl.style.display !== '';
        legend.innerHTML =
            '<div><strong>Rendering Optimizations:</strong></div>' +
            '<div>[1] Tile Culling: ' + (renderOpts.tileCulling ? 'ON' : 'OFF') + '</div>' +
            '<div>[2] Bilinear Filter: ' + (renderOpts.bilinearFilter ? 'ON' : 'OFF') + '</div>' +
            '<div>[3] Depth Interp: ' + (renderOpts.depthInterp ? 'ON' : 'OFF') + '</div>' +
            '<div>[4] Tile Blending: ' + (renderOpts.tileBlending ? 'ON' : 'OFF') + '</div>' +
            '<div>[G] Ground Floor: ' + (renderOpts.groundFloor ? 'ON' : 'OFF') + '</div>' +
            '<div>[6] Mode: ' + modeNames[renderOpts.renderMode] + '</div>' +
            '<div>[M] Minimap: ' + (renderOpts.minimapVisible ? 'ON' : 'OFF') + '</div>' +
            '<div>[L] Tile Legend: ' + (legendOn ? 'ON' : 'OFF') + '</div>';
    }
}

// Mouse button handlers
function DetectMouseDown(e) {
    if (e.button === 2) {  // Right mouse button
        input.sprint = true;
        e.preventDefault();  // Prevent context menu
    }
}

function DetectMouseUp(e) {
    if (e.button === 2) {  // Right mouse button
        input.sprint = false;
    }
}
