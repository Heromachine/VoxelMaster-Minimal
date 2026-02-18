// ===============================
// Tile Legend Panel
// ===============================
// Renders small thumbnails of every generated map tile into #tile-legend.
// Called once after world generation completes.
"use strict";

// Sample a map's color data into a new <canvas> element of the given size.
function renderTileThumb(mapObj, thumbSize) {
    var canvas = document.createElement('canvas');
    canvas.width  = thumbSize;
    canvas.height = thumbSize;
    var ctx     = canvas.getContext('2d');
    var imgData = ctx.createImageData(thumbSize, thumbSize);
    var step    = mapObj.width / thumbSize;

    for (var ty = 0; ty < thumbSize; ty++) {
        for (var tx = 0; tx < thumbSize; tx++) {
            var mx  = Math.min(mapObj.width  - 1, Math.floor(tx * step));
            var my  = Math.min(mapObj.height - 1, Math.floor(ty * step));
            var col = mapObj.color[(my << mapObj.shift) + mx];  // 0xFF_BB_GG_RR
            var pi  = (ty * thumbSize + tx) * 4;
            imgData.data[pi]     =  col        & 0xFF;  // R
            imgData.data[pi + 1] = (col >>  8) & 0xFF;  // G
            imgData.data[pi + 2] = (col >> 16) & 0xFF;  // B
            imgData.data[pi + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

function BuildTileLegend() {
    var legend = document.getElementById('tile-legend');
    if (!legend) return;
    legend.innerHTML = '';

    var THUMB = 56;

    // Build one titled section with a row of thumbnail cells.
    function addSection(title, items) {
        if (!items || items.length === 0) return;

        var section  = document.createElement('div');
        section.className = 'tl-section';

        var titleEl  = document.createElement('div');
        titleEl.className   = 'tl-title';
        titleEl.textContent = title;
        section.appendChild(titleEl);

        var row = document.createElement('div');
        row.className = 'tl-row';

        items.forEach(function(item) {
            var cell  = document.createElement('div');
            cell.className = 'tl-cell';

            var thumb = renderTileThumb(item.map, THUMB);
            thumb.className = 'tl-thumb';
            cell.appendChild(thumb);

            if (item.label) {
                var lbl = document.createElement('div');
                lbl.className   = 'tl-label';
                lbl.textContent = item.label;
                cell.appendChild(lbl);
            }
            row.appendChild(cell);
        });

        section.appendChild(row);
        legend.appendChild(section);
    }

    // ---- Base biome tiles ----
    addSection('SAND',   [{ map: maps[0] }]);
    addSection('PLAINS', [{ map: maps[1] }]);
    addSection('HILLS',  [{ map: maps[2] }]);

    // ---- Mountain tiles: base + all ridge variants ----
    var mountainItems = [{ map: maps[3], label: 'BASE' }];
    if (window.mountainRidgeMapIndex) {
        Object.keys(window.mountainRidgeMapIndex).sort().forEach(function(k) {
            mountainItems.push({ map: maps[window.mountainRidgeMapIndex[k]], label: k });
        });
    }
    addSection('MOUNTAIN', mountainItems);

    // ---- Transition tiles ----
    if (window.transitionMapIndex) {
        var transItems = Object.keys(window.transitionMapIndex).sort().map(function(k) {
            return { map: maps[window.transitionMapIndex[k]], label: k };
        });
        addSection('TRANSITION', transItems);
    }
}
