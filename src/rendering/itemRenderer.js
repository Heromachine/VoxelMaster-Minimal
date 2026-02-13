// ===============================
// Item Rendering (trees, decorations)
// ===============================
"use strict";

// Cache for image pixel data at fixed base resolution
var imageDataCache = {};
var BASE_SIZE = 64; // single cached size per image

function getImagePixelData(img) {
    var key = img.src;
    if (imageDataCache[key]) return imageDataCache[key];

    var canvas = document.createElement('canvas');
    canvas.width = BASE_SIZE;
    canvas.height = BASE_SIZE;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, BASE_SIZE, BASE_SIZE);
    var data = ctx.getImageData(0, 0, BASE_SIZE, BASE_SIZE);
    imageDataCache[key] = data;
    return data;
}

function RenderItems(){
    var sw = screendata.canvas.width,
        sh = screendata.canvas.height,
        depth = screendata.depthBuffer,
        buf32 = screendata.buf32,
        sinYaw = Math.sin(camera.angle),
        cosYaw = Math.cos(camera.angle),
        rx = cosYaw, ry = -sinYaw,
        focal = camera.focalLength;

    // Project items using ground-plane distance (consistent with terrain rendering)
    let projected = items.map(it => {
        var dx = it.x - camera.x,
            dy = it.y - camera.y;
        var groundForward = -dx*sinYaw - dy*cosYaw;
        return {it, dx, dy, groundForward};
    });

    // Filter valid + sort back-to-front (far items first)
    projected = projected
        .filter(obj => obj.groundForward > 0.1 && obj.groundForward < camera.distance)
        .sort((a,b) => b.groundForward - a.groundForward);

    // Draw each item pixel-by-pixel with depth testing
    projected.forEach(obj => {
        let it = obj.it;
        let dx = obj.dx, dy = obj.dy;
        let groundForward = obj.groundForward;

        var right = dx*rx + dy*ry;
        var screenX = right * (sw / 2) / groundForward + sw/2;
        var screenY = (camera.height - it.z) * focal / groundForward + camera.horizon;

        var scale = 12 * focal / groundForward;
        var scaleX = scale;
        var scaleY = scale;
        if (it.type === "tree") {
            scaleX *= 6;   // wider trees
            scaleY *= 12;  // much taller trees (stretched)
        }

        // Quick bounds check
        if (screenX < -scaleX || screenX >= sw + scaleX || screenY < -scaleY || screenY >= sh + scaleY) return;
        if (!it.image || !it.image.complete) return;

        // Get cached image pixel data (fixed size)
        var imgData = getImagePixelData(it.image);
        var srcSize = imgData.width; // BASE_SIZE
        var pixels = imgData.data;

        // Destination size and position using actual scale
        var destW = Math.max(1, Math.ceil(scaleX));
        var destH = Math.max(1, Math.ceil(scaleY));
        var destX = Math.floor(screenX - destW/2);
        var destY = Math.floor(screenY - destH);

        // Draw each destination pixel, sampling from source
        for (var py = 0; py < destH; py++) {
            var sy = destY + py;
            if (sy < 0 || sy >= sh) continue;

            // Map destination Y to source Y
            var srcY = Math.floor(py * srcSize / destH);

            for (var px = 0; px < destW; px++) {
                var sx = destX + px;
                if (sx < 0 || sx >= sw) continue;

                var bufIdx = sy * sw + sx;

                // Depth test - only draw if in front of terrain
                if (groundForward >= depth[bufIdx]) continue;

                // Map destination X to source X
                var srcX = Math.floor(px * srcSize / destW);
                var srcIdx = (srcY * srcSize + srcX) * 4;

                var a = pixels[srcIdx + 3];
                if (a < 128) continue; // skip transparent pixels

                var r = pixels[srcIdx];
                var g = pixels[srcIdx + 1];
                var b = pixels[srcIdx + 2];

                // Write to buffer (ABGR format for Uint32Array on little-endian)
                buf32[bufIdx] = 0xFF000000 | (b << 16) | (g << 8) | r;
            }
        }
    });
}
