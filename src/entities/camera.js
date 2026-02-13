// ===============================
// Camera, Physics, and Player Movement - Minimal
// ===============================
"use strict";

// Physics helpers
var MAX_SLOPE = 2;
var PLAYER_RADIUS = 10;
var PUSH_OUT_BUFFER = 5;
var isOnGround = () => camera.height <= getGroundHeight(camera.x, camera.y) + 0.1;

// Check if position collides with the cube (AABB collision)
function collidesWithCube(x, y, z) {
    var halfSize = cube.size / 2;
    var cubeBaseZ = getRawTerrainHeight(cube.x, cube.y);
    var cubeTopZ = cubeBaseZ + cube.size;

    // Check X bounds (with player radius)
    if (x + PLAYER_RADIUS < cube.x - halfSize) return false;
    if (x - PLAYER_RADIUS > cube.x + halfSize) return false;

    // Check Y bounds (with player radius)
    if (y + PLAYER_RADIUS < cube.y - halfSize) return false;
    if (y - PLAYER_RADIUS > cube.y + halfSize) return false;

    // Check Z bounds - allow walking on top
    var feetZ = z - playerHeightOffset;
    if (feetZ >= cubeTopZ - 1) return false;  // Standing on top
    if (feetZ < cubeBaseZ) return false;      // Below cube

    return true;  // Collision with cube sides!
}

// Push player away from cube if too close (prevents camera clipping on rotation)
function pushAwayFromCube() {
    var halfSize = cube.size / 2;
    var cubeBaseZ = getRawTerrainHeight(cube.x, cube.y);
    var cubeTopZ = cubeBaseZ + cube.size;
    var feetZ = camera.height - playerHeightOffset;

    // Only push if player is at cube's height level (not on top or below)
    if (feetZ >= cubeTopZ - 1 || feetZ < cubeBaseZ) return;

    // Minimum safe distance from cube center to camera
    var safeDistance = PLAYER_RADIUS + PUSH_OUT_BUFFER;

    // Vector from cube center to camera
    var dx = camera.x - cube.x;
    var dy = camera.y - cube.y;

    // Clamp to cube surface to find closest point on cube
    var clampedX = Math.max(-halfSize, Math.min(halfSize, dx));
    var clampedY = Math.max(-halfSize, Math.min(halfSize, dy));

    // Vector from closest point on cube to camera
    var pushX = dx - clampedX;
    var pushY = dy - clampedY;
    var dist = Math.sqrt(pushX * pushX + pushY * pushY);

    // If camera is inside the cube, push toward nearest edge
    if (dist < 0.001) {
        var distToLeft = dx + halfSize;
        var distToRight = halfSize - dx;
        var distToBack = dy + halfSize;
        var distToFront = halfSize - dy;

        var minDist = Math.min(distToLeft, distToRight, distToBack, distToFront);

        if (minDist === distToLeft) {
            camera.x = cube.x - halfSize - safeDistance;
        } else if (minDist === distToRight) {
            camera.x = cube.x + halfSize + safeDistance;
        } else if (minDist === distToBack) {
            camera.y = cube.y - halfSize - safeDistance;
        } else {
            camera.y = cube.y + halfSize + safeDistance;
        }
    } else if (dist < safeDistance) {
        // Camera is too close to cube surface - push outward
        var pushAmount = safeDistance - dist;
        var normX = pushX / dist;
        var normY = pushY / dist;
        camera.x += normX * pushAmount;
        camera.y += normY * pushAmount;
    }
}

var canMoveTo = (nx, ny) => {
    // Check if any valid tile exists at this position (2D tile system)
    var tileData = getTerrainData(nx, ny);
    if (!tileData) {
        return false;  // No tile at this position
    }

    // Check cube collision
    var playerZ = camera.height;
    if (collidesWithCube(nx, ny, playerZ)) return false;

    // Slope checking (only when on ground)
    if (!isOnGround()) return true;
    var curH = getGroundHeight(camera.x, camera.y), newH = getGroundHeight(nx, ny);
    if (newH <= curH) return true;
    var horizDist = Math.hypot(nx - camera.x, ny - camera.y);
    if (!horizDist) return true;
    return (newH - curH) / horizDist <= MAX_SLOPE;
};

// Main camera update function - handles movement, jumping
function UpdateCamera() {
    var current = Date.now(), deltaTime = (current - time) * 0.03;

    // FLY MODE - No collision, free movement
    if (player.flyMode) {
        // Apply sprint multiplier when sprinting (Right Mouse Button only in fly mode)
        var sprintActive = input.sprint;
        var flySpeed = player.flySpeed * (sprintActive ? player.sprintMultiplier : 1) * deltaTime;

        // Horizontal movement
        if (input.forward) {
            camera.x -= Math.sin(camera.angle) * flySpeed;
            camera.y -= Math.cos(camera.angle) * flySpeed;
        }
        if (input.backward) {
            camera.x += Math.sin(camera.angle) * flySpeed;
            camera.y += Math.cos(camera.angle) * flySpeed;
        }
        if (input.left) {
            camera.x -= Math.cos(camera.angle) * flySpeed;
            camera.y += Math.sin(camera.angle) * flySpeed;
        }
        if (input.right) {
            camera.x += Math.cos(camera.angle) * flySpeed;
            camera.y -= Math.sin(camera.angle) * flySpeed;
        }

        // Vertical movement (Q = up, E = down in fly mode)
        if (input.flyUp) {
            camera.height += flySpeed * 2;
        }
        if (input.flyDown) {
            camera.height -= flySpeed * 2;
        }

        camera.velocityY = 0;  // No gravity in fly mode
        time = current;
        return;
    }

    // NORMAL MODE - Original movement with collision
    var isSprinting = input.sprint,
        baseSpeed = player.moveSpeed * (isSprinting ? player.sprintMultiplier : 1) * deltaTime, nx, ny, slopeMult;

    // Push player away from cube if too close (prevents camera clipping on rotation)
    pushAwayFromCube();

    // Keyboard Movement
    if (input.forward) {
        nx = camera.x - Math.sin(camera.angle) * baseSpeed;
        ny = camera.y - Math.cos(camera.angle) * baseSpeed;
        slopeMult = canMoveTo(nx, ny);
        camera.x += (nx - camera.x) * slopeMult;
        camera.y += (ny - camera.y) * slopeMult;
    }
    if (input.backward) {
        nx = camera.x + Math.sin(camera.angle) * baseSpeed;
        ny = camera.y + Math.cos(camera.angle) * baseSpeed;
        slopeMult = canMoveTo(nx, ny);
        camera.x += (nx - camera.x) * slopeMult;
        camera.y += (ny - camera.y) * slopeMult;
    }
    if (input.left) {
        nx = camera.x - Math.cos(camera.angle) * baseSpeed;
        ny = camera.y + Math.sin(camera.angle) * baseSpeed;
        slopeMult = canMoveTo(nx, ny);
        camera.x += (nx - camera.x) * slopeMult;
        camera.y += (ny - camera.y) * slopeMult;
    }
    if (input.right) {
        nx = camera.x + Math.cos(camera.angle) * baseSpeed;
        ny = camera.y - Math.sin(camera.angle) * baseSpeed;
        slopeMult = canMoveTo(nx, ny);
        camera.x += (nx - camera.x) * slopeMult;
        camera.y += (ny - camera.y) * slopeMult;
    }

    // Gravity
    camera.velocityY -= 0.5 * deltaTime;
    camera.height += camera.velocityY * deltaTime;

    // Ground clamping
    var groundHeight = getGroundHeight(camera.x, camera.y);
    if (camera.height < groundHeight) {
        camera.height = groundHeight;
        camera.velocityY = 0;
    }

    // Crouch handling
    var isCrouching = input.crouch;
    if (isCrouching) {
        if (!player.isCrouching) {
            player.isCrouching = true;
        }
    } else if (player.isCrouching) {
        player.isCrouching = false;
    }

    // Charged jump system - hold to charge, release to jump
    var jumpHeld = input.jump;
    var onGround = (camera.height <= groundHeight + 2) && (camera.velocityY <= 0.5);

    if (jumpHeld) {
        // Button is held
        if (onGround && !player.isChargingJump) {
            // Just started pressing while on ground - begin charging
            player.isChargingJump = true;
            player.jumpChargeTime = 0;
        }

        if (player.isChargingJump) {
            // Continue charging
            player.jumpChargeTime = Math.min(player.jumpChargeTime + (current - time), player.jumpMaxChargeTime);
        }
    } else {
        // Button released
        if (player.isChargingJump) {
            // Was charging - JUMP!
            var chargeRatio = player.jumpChargeTime / player.jumpMaxChargeTime;
            var jumpStrength = player.jumpMinStrength + (player.jumpMaxStrength - player.jumpMinStrength) * chargeRatio;
            camera.velocityY = jumpStrength;
        }

        // Reset charge state
        player.isChargingJump = false;
        player.jumpChargeTime = 0;
    }

    time = current;
}
