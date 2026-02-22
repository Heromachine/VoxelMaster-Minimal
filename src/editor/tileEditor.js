// ===============================
// Tile Editor — First-Person Paint Mode
// ===============================
// Aim with the crosshair, scroll to select a tile, click to paint.
// Pointer lock stays active so the camera can still be moved while editing.
"use strict";

var tileEditor = {
    open:          false,
    currentMapIdx: 1,      // map index to paint with
    allItems:      [],     // [{mapIdx, label}] flat list for scroll-cycling
    pickerIdx:     0       // position in allItems
};

// -----------------------------------------------------------------------
// Open / Close
// -----------------------------------------------------------------------

function openEditor() {
    if (!proceduralMode || !window.worldMapData) {
        alert('Generate a world first before editing.');
        return;
    }

    tileEditor.open = true;

    var editBtn = document.getElementById('edit-btn');
    if (editBtn) editBtn.classList.add('active');

    buildEditorTilePicker();

    var panel = document.getElementById('edit-picker-panel');
    if (panel) panel.style.display = 'flex';

    var hud = document.getElementById('edit-hud');
    if (hud) hud.style.display = 'flex';

    // Hide minimaps, show Rendering Optimizations panel.
    // Save current states so closeEditor can restore them.
    tileEditor._savedMinimapVisible = renderOpts.minimapVisible;
    renderOpts.minimapVisible = false;

    var optLegend = document.getElementById('optimization-legend');
    if (optLegend) {
        tileEditor._savedOptDisplay = optLegend.style.display;
        optLegend.style.display = 'block';
        if (typeof updateOptimizationLegend === 'function') updateOptimizationLegend();
    }

    updateEditHUD();
}

function closeEditor() {
    tileEditor.open = false;

    var editBtn = document.getElementById('edit-btn');
    if (editBtn) editBtn.classList.remove('active');

    var panel = document.getElementById('edit-picker-panel');
    if (panel) panel.style.display = 'none';

    var hud = document.getElementById('edit-hud');
    if (hud) hud.style.display = 'none';

    // Restore minimap and optimization-legend to their pre-edit states.
    renderOpts.minimapVisible = tileEditor._savedMinimapVisible !== undefined
        ? tileEditor._savedMinimapVisible : true;

    var optLegend = document.getElementById('optimization-legend');
    if (optLegend) {
        optLegend.style.display = tileEditor._savedOptDisplay !== undefined
            ? tileEditor._savedOptDisplay : 'none';
    }
}

// -----------------------------------------------------------------------
// Tile Targeting (ray march forward until we leave the current tile)
// -----------------------------------------------------------------------

function getTargetedTile() {
    var sh = screendata ? screendata.canvas.height : 600;
    var dx = -Math.sin(camera.angle);
    var dy = -Math.cos(camera.angle);

    // Derive the 3D vertical slope from camera tilt.
    // VoxelSpace screen-Y: sy = (camera.height - h) * focalLength / depth + camera.horizon
    // At crosshair (sy = sh/2): slope = (sh/2 - camera.horizon) / focalLength
    // Positive slope = looking down, negative = looking up.
    var vertSlope = (sh / 2 - camera.horizon) / camera.focalLength;

    if (vertSlope > 0) {
        // Looking downward — ray descends and will hit terrain.
        for (var d = 30; d <= 3000; d += 30) {
            var wx = camera.x + dx * d;
            var wy = camera.y + dy * d;
            var rayH     = camera.height - vertSlope * d;
            var terrainH = getGroundHeight(wx, wy);
            if (rayH <= terrainH) {
                return getTileCoords(wx, wy);
            }
        }
    }

    // Fallback (looking level/up, or ray missed): return first tile boundary ahead.
    var curTile = getTileCoords(camera.x, camera.y);
    for (var d2 = 30; d2 <= 3000; d2 += 30) {
        var tile = getTileCoords(camera.x + dx * d2, camera.y + dy * d2);
        if (tile.tileX !== curTile.tileX || tile.tileY !== curTile.tileY) {
            return tile;
        }
    }
    return getTileCoords(camera.x + dx * 3000, camera.y + dy * 3000);
}

function getTileDisplayName(tileX, tileY) {
    var key = getTileKey(tileX, tileY);
    var idx = tileSystem.tileMap[key];
    if (idx === 0) return 'SAND';
    if (idx === 1) return 'PLAINS';
    if (idx === 2) return 'HILLS';
    if (idx === 3) return 'MOUNTAIN';
    var found;
    if (window.mountainRidgeMapIndex) {
        found = Object.keys(window.mountainRidgeMapIndex).find(function(k) { return window.mountainRidgeMapIndex[k] === idx; });
        if (found) return 'MTN ' + found;
    }
    if (window.transitionMapIndex) {
        found = Object.keys(window.transitionMapIndex).find(function(k) { return window.transitionMapIndex[k] === idx; });
        if (found) return 'TRANS ' + found;
    }
    if (window.wideRidgeMapIndex) {
        found = Object.keys(window.wideRidgeMapIndex).find(function(k) { return window.wideRidgeMapIndex[k] === idx; });
        if (found) return 'RIDGE ' + found;
    }
    if (window.foothillMapIndex) {
        found = Object.keys(window.foothillMapIndex).find(function(k) { return window.foothillMapIndex[k] === idx; });
        if (found) return 'FOOTHILL ' + found;
    }
    return idx !== undefined ? 'TILE #' + idx : '—';
}

function updateEditHUD() {
    var targetEl = document.getElementById('edit-hud-target');
    var paintEl  = document.getElementById('edit-hud-paint');
    if (!targetEl || !paintEl) return;

    var target = getTargetedTile();
    targetEl.textContent = getTileDisplayName(target.tileX, target.tileY);
    paintEl.textContent  = tileEditor.allItems.length > 0
        ? tileEditor.allItems[tileEditor.pickerIdx].label
        : '—';
}

// -----------------------------------------------------------------------
// Tile Highlight Overlay (drawn each frame after Flip)
// -----------------------------------------------------------------------

function DrawEditOverlay() {
    if (!tileEditor.open) return;

    var canvas = document.getElementById('fullscreenCanvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var sw  = canvas.width;

    var sinang = Math.sin(camera.angle);
    var cosang = Math.cos(camera.angle);

    var target   = getTargetedTile();
    var tileAdvX = tileSystem.tileWidth  - tileSystem.overlapSize;
    var tileAdvY = tileSystem.tileHeight - tileSystem.overlapSize;

    var x0 = target.tileX * tileAdvX,  x1 = x0 + tileAdvX;
    var y0 = target.tileY * tileAdvY,  y1 = y0 + tileAdvY;

    // Sample height once at the tile centre so all 4 corners share the same
    // elevation — keeps the quad perfectly flat regardless of terrain slope.
    var tileH = getGroundHeight((x0 + x1) / 2, (y0 + y1) / 2);

    function toCam(wx, wy) {
        var dx = wx - camera.x,  dy = wy - camera.y;
        return {
            depth:   -(dx * sinang + dy * cosang),
            lateral:   dx * cosang - dy * sinang,
            h: tileH
        };
    }

    // Project camera-space point → screen {sx, sy}
    function toScreen(c) {
        return {
            sx: sw / 2 + c.lateral * sw / (2 * c.depth),
            sy: (camera.height - c.h) * camera.focalLength / c.depth + camera.horizon
        };
    }

    // Sutherland-Hodgman near-plane clip so no corner falls behind the camera
    var NEAR = 10;
    function clipNear(pts) {
        var out = [], n = pts.length;
        for (var i = 0; i < n; i++) {
            var a = pts[i], b = pts[(i + 1) % n];
            var aIn = a.depth >= NEAR, bIn = b.depth >= NEAR;
            if (aIn) out.push(a);
            if (aIn !== bIn) {
                var t = (NEAR - a.depth) / (b.depth - a.depth);
                out.push({
                    depth:   NEAR,
                    lateral: a.lateral + t * (b.lateral - a.lateral),
                    h:       a.h       + t * (b.h       - a.h)
                });
            }
        }
        return out;
    }

    var camPts  = [toCam(x0,y0), toCam(x1,y0), toCam(x1,y1), toCam(x0,y1)];
    var clipped = clipNear(camPts);
    if (clipped.length < 3) return;

    var sPts = clipped.map(toScreen);

    // Sort into convex order around centroid (handles any winding after clipping)
    var cx = sPts.reduce(function(s,p){return s+p.sx;},0)/sPts.length;
    var cy = sPts.reduce(function(s,p){return s+p.sy;},0)/sPts.length;
    sPts.sort(function(a,b){
        return Math.atan2(a.sy-cy, a.sx-cx) - Math.atan2(b.sy-cy, b.sx-cx);
    });

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sPts[0].sx, sPts[0].sy);
    for (var i = 1; i < sPts.length; i++) ctx.lineTo(sPts[i].sx, sPts[i].sy);
    ctx.closePath();

    ctx.globalAlpha = 0.22;
    ctx.fillStyle   = '#00ff88';
    ctx.fill();

    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth   = 2;
    ctx.stroke();

    ctx.restore();
}

// -----------------------------------------------------------------------
// Painting
// -----------------------------------------------------------------------

function paintTargetedTile() {
    if (!tileEditor.open) return;
    var target  = getTargetedTile();
    var tileKey = getTileKey(target.tileX, target.tileY);
    tileSystem.tileMap[tileKey] = tileEditor.currentMapIdx;
    if (typeof updateTreesOnTile === 'function') updateTreesOnTile(tileKey);
    if (typeof Draw === 'function') Draw();
    updateEditHUD();
}

// -----------------------------------------------------------------------
// Palette cycling (scroll wheel)
// -----------------------------------------------------------------------

function rotateEditorVariant(delta) {
    if (!tileEditor.open || tileEditor.allItems.length === 0) return;
    tileEditor.pickerIdx = (tileEditor.pickerIdx + delta + tileEditor.allItems.length)
                           % tileEditor.allItems.length;
    tileEditor.currentMapIdx = tileEditor.allItems[tileEditor.pickerIdx].mapIdx;
    highlightPickerItem(tileEditor.currentMapIdx);

    var selected = document.querySelector('#edit-picker-list .ep-item.ep-selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });

    updateEditHUD();
}

// -----------------------------------------------------------------------
// Tile Picker panel
// -----------------------------------------------------------------------

function buildEditorTilePicker() {
    var picker = document.getElementById('edit-picker-list');
    if (!picker) return;
    picker.innerHTML  = '';
    tileEditor.allItems = [];

    var THUMB = 52;

    function addLabel(text) {
        var lbl = document.createElement('div');
        lbl.className   = 'ep-group-label';
        lbl.textContent = text;
        picker.appendChild(lbl);
    }

    function addItem(mapObj, mapIdx, labelText) {
        if (!mapObj) return;
        var entry = { mapIdx: mapIdx, label: labelText || ('TILE #' + mapIdx) };
        tileEditor.allItems.push(entry);

        var item = document.createElement('div');
        item.className      = 'ep-item';
        item.dataset.mapidx = mapIdx;

        var thumb = renderTileThumb(mapObj, THUMB);
        thumb.className = 'ep-thumb';
        item.appendChild(thumb);

        var lbl = document.createElement('div');
        lbl.className   = 'ep-label';
        lbl.textContent = labelText || '';
        item.appendChild(lbl);

        item.addEventListener('click', function() {
            var pos = tileEditor.allItems.findIndex(function(it) { return it.mapIdx === mapIdx; });
            if (pos >= 0) {
                tileEditor.pickerIdx     = pos;
                tileEditor.currentMapIdx = mapIdx;
            }
            highlightPickerItem(mapIdx);
            updateEditHUD();
        });

        picker.appendChild(item);
    }

    addLabel('SAND');      addItem(maps[0], 0, 'SAND');
    addLabel('PLAINS');    addItem(maps[1], 1, 'PLAINS');
    addLabel('HILLS');     addItem(maps[2], 2, 'HILLS');
    addLabel('MOUNTAIN');  addItem(maps[3], 3, 'MTN BASE');

    if (window.mountainRidgeMapIndex) {
        Object.keys(window.mountainRidgeMapIndex).sort().forEach(function(k) {
            var idx = window.mountainRidgeMapIndex[k];
            addItem(maps[idx], idx, 'MTN ' + k);
        });
    }
    if (window.transitionMapIndex) {
        addLabel('TRANSITION');
        Object.keys(window.transitionMapIndex).sort().forEach(function(k) {
            var idx = window.transitionMapIndex[k];
            addItem(maps[idx], idx, 'TRANS ' + k);
        });
    }
    if (window.wideRidgeMapIndex) {
        addLabel('RIDGE');
        Object.keys(window.wideRidgeMapIndex).sort().forEach(function(k) {
            var idx = window.wideRidgeMapIndex[k];
            addItem(maps[idx], idx, 'RIDGE ' + k);
        });
    }
    if (window.foothillMapIndex) {
        addLabel('FOOTHILLS');
        Object.keys(window.foothillMapIndex).sort().forEach(function(k) {
            var idx = window.foothillMapIndex[k];
            addItem(maps[idx], idx, 'FOOTHILL ' + k);
        });
    }
    if (window.steepFoothillMapIndex) {
        addLabel('STEEP FOOTHILLS');
        Object.keys(window.steepFoothillMapIndex).sort().forEach(function(k) {
            var idx = window.steepFoothillMapIndex[k];
            addItem(maps[idx], idx, 'SFOOT ' + k);
        });
    }
    if (window.hillsCapMapIndex) {
        addLabel('HILLS CAP');
        Object.keys(window.hillsCapMapIndex).sort().forEach(function(k) {
            var idx = window.hillsCapMapIndex[k];
            addItem(maps[idx], idx, 'HCAP ' + k);
        });
    }
    if (window.wideRidgeMapIndex) {
        var capKeys = ['N_CAP', 'S_CAP', 'E_CAP', 'W_CAP'];
        var hasCaps = capKeys.some(function(k) { return window.wideRidgeMapIndex[k] !== undefined; });
        if (hasCaps) {
            addLabel('RIDGE CAPS');
            capKeys.forEach(function(k) {
                if (window.wideRidgeMapIndex[k] !== undefined) {
                    var idx = window.wideRidgeMapIndex[k];
                    addItem(maps[idx], idx, 'RCAP ' + k.replace('_CAP', ''));
                }
            });
        }
    }

    // Sync picker position to currentMapIdx
    var pos = tileEditor.allItems.findIndex(function(it) { return it.mapIdx === tileEditor.currentMapIdx; });
    if (pos < 0) {
        pos = 0;
        if (tileEditor.allItems.length > 0) tileEditor.currentMapIdx = tileEditor.allItems[0].mapIdx;
    }
    tileEditor.pickerIdx = pos;
    highlightPickerItem(tileEditor.currentMapIdx);
}

function highlightPickerItem(mapIdx) {
    var picker = document.getElementById('edit-picker-list');
    if (!picker) return;
    picker.querySelectorAll('.ep-item').forEach(function(item) {
        item.classList.toggle('ep-selected', parseInt(item.dataset.mapidx) === mapIdx);
    });
}

// -----------------------------------------------------------------------
// Tile Rotation (arrow keys)
// -----------------------------------------------------------------------

// Rotate a direction key string 90° CW or CCW.
// Letter mapping — CW: N→E→S→W→N  /  CCW: N→W→S→E→N
// Output is always sorted in NSEW order to match the key-building convention.
function rotateKey(key, clockwise) {
    if (key === 'ISO' || key === 'C') return key;  // non-directional — skip

    // Peak tiles toggle between single-peak and multi-peak on any arrow key
    if (key === 'PEAK')  return 'PEAK1';
    if (key === 'PEAK1') return 'PEAK';

    // End-cap keys rotate among themselves: N_CAP → E_CAP → S_CAP → W_CAP (CW)
    var capCW  = { 'N_CAP': 'E_CAP', 'E_CAP': 'S_CAP', 'S_CAP': 'W_CAP', 'W_CAP': 'N_CAP' };
    var capCCW = { 'N_CAP': 'W_CAP', 'W_CAP': 'S_CAP', 'S_CAP': 'E_CAP', 'E_CAP': 'N_CAP' };
    if (key in capCW) return clockwise ? capCW[key] : capCCW[key];

    // Hills end-cap keys
    var hcapCW  = { 'N_HCAP': 'E_HCAP', 'E_HCAP': 'S_HCAP', 'S_HCAP': 'W_HCAP', 'W_HCAP': 'N_HCAP' };
    var hcapCCW = { 'N_HCAP': 'W_HCAP', 'W_HCAP': 'S_HCAP', 'S_HCAP': 'E_HCAP', 'E_HCAP': 'N_HCAP' };
    if (key in hcapCW) return clockwise ? hcapCW[key] : hcapCCW[key];

    // Steep foothill keys
    var sfCW  = { 'N2': 'E2', 'E2': 'S2', 'S2': 'W2', 'W2': 'N2' };
    var sfCCW = { 'N2': 'W2', 'W2': 'S2', 'S2': 'E2', 'E2': 'N2' };
    if (key in sfCW) return clockwise ? sfCW[key] : sfCCW[key];

    var cw  = { N: 'E', E: 'S', S: 'W', W: 'N' };
    var ccw = { N: 'W', W: 'S', S: 'E', E: 'N' };
    var rot = clockwise ? cw : ccw;

    var hasN = false, hasS = false, hasE = false, hasW = false;
    for (var i = 0; i < key.length; i++) {
        var r = rot[key[i]];
        if (r === 'N') hasN = true;
        if (r === 'S') hasS = true;
        if (r === 'E') hasE = true;
        if (r === 'W') hasW = true;
    }
    return (hasN ? 'N' : '') + (hasS ? 'S' : '') + (hasE ? 'E' : '') + (hasW ? 'W' : '') || key;
}

// Rotate the currently highlighted tile 90° CW (+1) or CCW (-1).
// Only tiles that belong to a directional index group can be rotated.
// If the rotated-to key hasn't been generated yet for this world, it is
// created on demand using the same seed formula as the original batch pass.
function rotateTile(clockwise) {
    if (!tileEditor.open) return;
    var target  = getTargetedTile();
    var tileKey = getTileKey(target.tileX, target.tileY);
    var mapIdx  = tileSystem.tileMap[tileKey];
    if (mapIdx === undefined) return;

    // Base biomes have no orientation — nothing to rotate.
    if (mapIdx === 0 || mapIdx === 1 || mapIdx === 2 || mapIdx === 3) return;

    // Each entry: index object, generator function, seed function matching the
    // formula used during the original batch generation in biomeGen.js.
    var groups = [
        {
            index: window.mountainRidgeMapIndex,
            gen:   genDirectionalMountainTile,
            seed:  function(k) {
                return (currentSeed ^ (k.length * 0xDEAD + k.charCodeAt(0) * 0xBEEF)) >>> 0;
            }
        },
        {
            index: window.transitionMapIndex,
            gen:   genTransitionTile,
            seed:  function(k) {
                return (currentSeed ^ (k.length * 0x1337 + (k.charCodeAt(0) || 0) * 0xF00D)) >>> 0;
            }
        },
        {
            index: window.wideRidgeMapIndex,
            gen:   function(m, s, k) {
                if (k.indexOf('_CAP') >= 0) genRidgeEndCapTile(m, s, k);
                else genStraightRidgeTile(m, s, k);
            },
            seed:  function(k) {
                var capXOR = { 'N_CAP': 0x1A2B3C4D, 'S_CAP': 0x5E6F7A8B, 'E_CAP': 0x9C0D1E2F, 'W_CAP': 0x3F4A5B6C };
                if (capXOR[k] !== undefined) return (currentSeed ^ capXOR[k]) >>> 0;
                return (currentSeed ^ (k === 'NS' ? 0xAB12CD34 : 0xEF56AB78)) >>> 0;
            }
        },
        {
            index: window.foothillMapIndex,
            gen:   genFoothillTile,
            seed:  function(k) {
                return (currentSeed ^ (k.length * 0x7F3A + (k.charCodeAt(0) || 0) * 0xC9B1)) >>> 0;
            }
        },
        {
            index: window.hillsCapMapIndex,
            gen:   genHillsEndCapTile,
            seed:  function(k) {
                var hcapXOR = { 'N_HCAP': 0xA1B2C3D4, 'S_HCAP': 0xE5F6A7B8, 'E_HCAP': 0xC9D0E1F2, 'W_HCAP': 0x13243546 };
                return (currentSeed ^ (hcapXOR[k] || 0xB1C2D3E4)) >>> 0;
            }
        },
        {
            index: window.steepFoothillMapIndex,
            gen:   genSteepFoothillTile,
            seed:  function(k) {
                var sfXOR = { 'N2': 0xF1A2B3C4, 'S2': 0xD5E6F7A8, 'E2': 0xB9C0D1E2, 'W2': 0x73849506 };
                return (currentSeed ^ (sfXOR[k] || 0xA5B6C7D8)) >>> 0;
            }
        }
    ];

    for (var g = 0; g < groups.length; g++) {
        var grp = groups[g];
        if (!grp.index) continue;

        // Reverse-lookup: find the key string that maps to this mapIdx.
        var foundKey = null;
        var idxKeys = Object.keys(grp.index);
        for (var k = 0; k < idxKeys.length; k++) {
            if (grp.index[idxKeys[k]] === mapIdx) { foundKey = idxKeys[k]; break; }
        }
        if (foundKey === null) continue;  // not in this group

        var newKey = rotateKey(foundKey, clockwise);
        if (newKey === foundKey) return;  // ISO, C, or NSEW — nothing to do

        // Generate the destination tile on demand if it wasn't created for this world.
        if (grp.index[newKey] === undefined) {
            var newMap = {
                width:    1024,
                height:   1024,
                shift:    10,
                altitude: new Uint8Array(1024 * 1024),
                color:    new Uint32Array(1024 * 1024)
            };
            grp.gen(newMap, grp.seed(newKey), newKey);
            grp.index[newKey] = maps.length;
            maps.push(newMap);
        }

        tileSystem.tileMap[tileKey] = grp.index[newKey];
        if (typeof updateTreesOnTile === 'function') updateTreesOnTile(tileKey);
        if (typeof Draw === 'function') Draw();
        updateEditHUD();
        return;  // handled — stop searching groups
    }
}

// -----------------------------------------------------------------------
// Event Setup
// -----------------------------------------------------------------------

function initEditorEvents() {
    var canvas = document.getElementById('fullscreenCanvas');

    // Scroll wheel → cycle palette (needs passive:false to call preventDefault)
    // Accumulator threshold of 1.1 events per step = 10% slower than one-to-one.
    var _scrollAccum = 0;
    document.addEventListener('wheel', function(e) {
        if (!tileEditor.open) return;
        _scrollAccum += e.deltaY > 0 ? 1 : -1;
        if (Math.abs(_scrollAccum) >= 1.1) {
            rotateEditorVariant(_scrollAccum > 0 ? 1 : -1);
            _scrollAccum = 0;
        }
        e.preventDefault();
    }, { passive: false });

    // Left-click on game canvas while pointer-locked in edit mode → paint
    if (canvas) {
        canvas.addEventListener('mousedown', function(e) {
            if (!tileEditor.open) return;
            if (e.button === 0 && document.pointerLockElement) {
                e.preventDefault();
                paintTargetedTile();
            }
        });
    }

    // Close button on picker panel
    var closeBtn = document.getElementById('edit-panel-close');
    if (closeBtn) closeBtn.addEventListener('click', closeEditor);

    // EDIT button (in-game HUD)
    var editBtn = document.getElementById('edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', function() {
            if (tileEditor.open) closeEditor();
            else openEditor();
        });
    }

    // E key toggles edit mode while pointer-locked
    // Arrow keys rotate the targeted tile CW / CCW
    document.addEventListener('keydown', function(e) {
        if ((e.key === 'e' || e.key === 'E') && document.pointerLockElement) {
            if (tileEditor.open) closeEditor();
            else openEditor();
        }
        if (tileEditor.open) {
            if (e.key === 'ArrowRight') { e.preventDefault(); rotateTile(true);  }
            if (e.key === 'ArrowLeft')  { e.preventDefault(); rotateTile(false); }
        }
    });
}
