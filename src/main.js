// ===============================
// Main Entry Point - Minimal
// ===============================
"use strict";

// Global trig values for cube rendering (shared between functions)
var cubeSinYaw, cubeCosYaw;

function OnResizeWindow() {
    screendata.canvas = document.getElementById('fullscreenCanvas');
    var gameContainer = document.getElementById('game-container');

    var dims = DisplayConfig.getCanvasDimensions(window.innerWidth, window.innerHeight);

    gameContainer.style.width = dims.canvasWidth + 'px';
    gameContainer.style.height = dims.canvasHeight + 'px';
    gameContainer.style.left = ((window.innerWidth - dims.canvasWidth) / 2) + 'px';
    gameContainer.style.top = ((window.innerHeight - dims.canvasHeight) / 2) + 'px';

    screendata.canvas.width = dims.renderWidth;
    screendata.canvas.height = dims.renderHeight;

    // Ensure canvas CSS matches container
    screendata.canvas.style.width = dims.canvasWidth + 'px';
    screendata.canvas.style.height = dims.canvasHeight + 'px';

    if (screendata.canvas.getContext) {
        screendata.context = screendata.canvas.getContext('2d');
        screendata.imagedata = screendata.context.createImageData(screendata.canvas.width, screendata.canvas.height);
    }
    screendata.bufarray = new ArrayBuffer(screendata.imagedata.width * screendata.imagedata.height * 4);
    screendata.buf8 = new Uint8Array(screendata.bufarray);
    screendata.buf32 = new Uint32Array(screendata.bufarray);
    screendata.depthBuffer = new Float32Array(screendata.canvas.width * screendata.canvas.height);
    hiddeny = new Int32Array(screendata.canvas.width);
}

// Main draw loop
function Draw(timestamp) {
    updaterunning = true;
    if (timestamp - lastFrameTime >= frameDuration) {
        lastFrameTime = timestamp;
        UpdateCamera();
        DrawBackground();
        RenderCube();
        Render();
        // RenderItems();  // Disabled - no trees
        RenderMinimap();
        Flip();
        frames++;
        fpsFrames++;

        // Update FPS counter once per second
        var currentTime = Date.now();
        if (currentTime - fpsLastTime >= 1000) {
            currentFPS = Math.round((fpsFrames * 1000) / (currentTime - fpsLastTime));
            var fpsElement = document.getElementById('fps-counter');
            if (fpsElement) {
                fpsElement.textContent = 'FPS: ' + currentFPS;
            }
            fpsFrames = 0;
            fpsLastTime = currentTime;
        }
    }
    requestAnimationFrame(Draw);
}

// Initialize game
function Init() {
    showSeedMenu();
    OnResizeWindow();
    InitMinimap();
    loadCubeTexture();

    // Load tree texture
    textures.tree = new Image();
    textures.tree.src = 'images/tree.png';

    // Event listeners
    document.addEventListener('keydown', DetectKeysDown, false);
    document.addEventListener('keyup', DetectKeysUp, false);

    // Mouse button listeners for sprint (right-click)
    document.addEventListener('mousedown', DetectMouseDown, false);
    document.addEventListener('mouseup', DetectMouseUp, false);
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();  // Prevent context menu from appearing
    }, false);

    // Pointer lock for FPS controls
    var canvas = document.getElementById('fullscreenCanvas');
    canvas.addEventListener('click', function() {
        canvas.requestPointerLock = canvas.requestPointerLock ||
                                    canvas.mozRequestPointerLock ||
                                    canvas.webkitRequestPointerLock;
        canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', lockChangeAlert, false);
    document.addEventListener('mozpointerlockchange', lockChangeAlert, false);
    document.addEventListener('webkitpointerlockchange', lockChangeAlert, false);

    function lockChangeAlert() {
        if (document.pointerLockElement === canvas ||
            document.mozPointerLockElement === canvas ||
            document.webkitPointerLockElement === canvas) {
            document.addEventListener("mousemove", DetectMouseMove, false);
        } else {
            document.removeEventListener("mousemove", DetectMouseMove, false);
        }
    }

    window.addEventListener('resize', OnResizeWindow, false);
}

// Start the game when page loads
window.onload = Init;
