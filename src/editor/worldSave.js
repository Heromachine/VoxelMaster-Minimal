// ===============================
// World Save / Load System
// ===============================
// Three localStorage save slots + JSON export/import.
// Save data includes the seed (for deterministic re-generation) and the
// full tileSystem.tileMap so edited tile placements are preserved.
"use strict";

var SAVE_SLOTS      = 3;
var SAVE_KEY_PREFIX = 'voxel_save_';

// -----------------------------------------------------------------------
// Core save / load
// -----------------------------------------------------------------------

function getSaveSlot(slotIndex) {
    try {
        var raw = localStorage.getItem(SAVE_KEY_PREFIX + slotIndex);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function saveToSlot(slotIndex) {
    if (!proceduralMode || !window.worldMapData) return false;
    var data = {
        seed:         String(currentSeed),
        savedAt:      new Date().toISOString(),
        tileMap:      JSON.parse(JSON.stringify(tileSystem.tileMap)),
        worldMapData: Array.from(window.worldMapData)
    };
    try {
        localStorage.setItem(SAVE_KEY_PREFIX + slotIndex, JSON.stringify(data));
        return true;
    } catch (e) {
        console.error('Save failed:', e);
        return false;
    }
}

function loadFromData(data, onDone) {
    if (!data || !data.seed || !data.tileMap) return false;

    // Re-generate world from seed (deterministic: same maps[] indices as when saved)
    items = [];
    generateTerrain(data.seed);

    // Initialize tile system first (sets tileMap from worldMapData),
    // then override it with the saved tileMap to restore any edits.
    initializeTileSystem();
    tileSystem.tileMap = JSON.parse(JSON.stringify(data.tileMap));

    // Restore world map grid (needed for minimap and editor)
    if (data.worldMapData) {
        window.worldMapData = new Uint8Array(data.worldMapData);
    }

    // Re-initialize systems that depend on tile map
    spawnBiomeTrees();
    camera.height = getRawTerrainHeight(camera.x, camera.y) + player.normalHeight;
    BuildTileLegend();
    flattenTerrainUnderCube();

    // Show in-game buttons
    var gameBtns = document.getElementById('game-buttons');
    if (gameBtns) gameBtns.style.display = 'flex';

    if (typeof onDone === 'function') onDone();
    Draw();
    return true;
}

function loadFromSlot(slotIndex, onDone) {
    var data = getSaveSlot(slotIndex);
    if (!data) return false;
    return loadFromData(data, onDone);
}

// -----------------------------------------------------------------------
// Export / Import (file-based backup)
// -----------------------------------------------------------------------

function exportWorld() {
    if (!proceduralMode || !window.worldMapData) return;
    var data = {
        seed:         String(currentSeed),
        savedAt:      new Date().toISOString(),
        tileMap:      JSON.parse(JSON.stringify(tileSystem.tileMap)),
        worldMapData: Array.from(window.worldMapData)
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = 'voxelworld_' + data.seed + '.json';
    a.click();
    URL.revokeObjectURL(url);
}

function importWorld(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            loadFromData(data, function() {
                // Hide seed menu if visible
                var menuEl = document.getElementById('seed-menu');
                if (menuEl) menuEl.style.display = 'none';
                var loadEl = document.getElementById('load-screen');
                if (loadEl) loadEl.style.display = 'none';
            });
        } catch (err) {
            alert('Import failed: invalid file format.');
        }
    };
    reader.readAsText(file);
}

// -----------------------------------------------------------------------
// Save Popup UI (3 slots, shown when SAVE clicked)
// -----------------------------------------------------------------------

function showSavePopup() {
    var popup = document.getElementById('save-popup');
    if (!popup) return;

    // Refresh slot summaries
    refreshSavePopupSlots();
    popup.style.display = 'block';

    // Close if clicking outside
    function onOutsideClick(e) {
        if (!popup.contains(e.target) &&
            e.target.id !== 'save-btn') {
            popup.style.display = 'none';
            document.removeEventListener('mousedown', onOutsideClick);
        }
    }
    setTimeout(function() {
        document.addEventListener('mousedown', onOutsideClick);
    }, 0);
}

function refreshSavePopupSlots() {
    for (var i = 0; i < SAVE_SLOTS; i++) {
        (function(slotIndex) {
            var slotEl = document.getElementById('sp-slot-' + slotIndex);
            if (!slotEl) return;
            var data = getSaveSlot(slotIndex);
            if (data) {
                var dt = new Date(data.savedAt);
                var dateStr = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                slotEl.innerHTML =
                    '<span class="sp-num">FILE ' + (slotIndex + 1) + '</span>' +
                    '<span class="sp-seed">SEED: ' + data.seed + '</span>' +
                    '<span class="sp-date">' + dateStr + '</span>' +
                    '<span class="sp-action">OVERWRITE</span>';
                slotEl.classList.add('sp-occupied');
            } else {
                slotEl.innerHTML =
                    '<span class="sp-num">FILE ' + (slotIndex + 1) + '</span>' +
                    '<span class="sp-empty">- EMPTY -</span>' +
                    '<span class="sp-action">SAVE HERE</span>';
                slotEl.classList.remove('sp-occupied');
            }
        })(i);
    }
}

function initSavePopupEvents() {
    var saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            showSavePopup();
        });
    }

    for (var i = 0; i < SAVE_SLOTS; i++) {
        (function(slotIndex) {
            var slotEl = document.getElementById('sp-slot-' + slotIndex);
            if (!slotEl) return;
            slotEl.addEventListener('click', function() {
                var ok = saveToSlot(slotIndex);
                if (ok) {
                    // Flash confirmation
                    var actionEl = slotEl.querySelector('.sp-action');
                    if (actionEl) {
                        var orig = actionEl.textContent;
                        actionEl.textContent = '✓ SAVED';
                        actionEl.style.color = '#00ff88';
                        setTimeout(function() {
                            actionEl.textContent = orig;
                            actionEl.style.color = '';
                            refreshSavePopupSlots();
                        }, 1500);
                    }
                }
            });
        })(i);
    }

    var exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            exportWorld();
        });
    }
}

// -----------------------------------------------------------------------
// Load Screen UI (Zelda-style file select, shown from main menu)
// -----------------------------------------------------------------------

function showLoadScreen() {
    refreshLoadSlots();
    var loadScreen = document.getElementById('load-screen');
    var seedCard   = document.getElementById('seed-card');
    if (loadScreen) loadScreen.style.display = 'flex';
    if (seedCard)   seedCard.style.display   = 'none';
}

function hideLoadScreen() {
    var loadScreen = document.getElementById('load-screen');
    var seedCard   = document.getElementById('seed-card');
    if (loadScreen) loadScreen.style.display = 'none';
    if (seedCard)   seedCard.style.display   = 'block';
}

function refreshLoadSlots() {
    var container = document.getElementById('load-slots');
    if (!container) return;
    container.innerHTML = '';

    for (var i = 0; i < SAVE_SLOTS; i++) {
        (function(slotIndex) {
            var data     = getSaveSlot(slotIndex);
            var card     = document.createElement('div');
            card.className = 'ls-card' + (data ? '' : ' ls-empty');

            if (data) {
                var dt      = new Date(data.savedAt);
                var dateStr = dt.toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                card.innerHTML =
                    '<div class="ls-file-num">FILE ' + (slotIndex + 1) + '</div>' +
                    '<div class="ls-seed">SEED: ' + data.seed + '</div>' +
                    '<div class="ls-date">' + dateStr + '</div>' +
                    '<button class="ls-load-btn">▸ LOAD</button>';

                card.querySelector('.ls-load-btn').addEventListener('click', function() {
                    var menuEl = document.getElementById('seed-menu');
                    var progressEl = document.getElementById('gen-progress');
                    if (progressEl) progressEl.textContent = 'LOADING WORLD...';

                    setTimeout(function() {
                        loadFromSlot(slotIndex, function() {
                            if (menuEl) menuEl.style.display = 'none';
                        });
                    }, 50);
                });
            } else {
                card.innerHTML =
                    '<div class="ls-file-num">FILE ' + (slotIndex + 1) + '</div>' +
                    '<div class="ls-empty-label">- EMPTY -</div>';
            }

            container.appendChild(card);
        })(i);
    }
}

function initLoadScreenEvents() {
    // LOAD button in main menu
    var loadBtn = document.getElementById('load-btn');
    if (loadBtn) {
        loadBtn.addEventListener('click', showLoadScreen);
    }

    // Back button in load screen
    var backBtn = document.getElementById('load-back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', hideLoadScreen);
    }

    // Import file input
    var importInput = document.getElementById('import-file-input');
    if (importInput) {
        importInput.addEventListener('change', function(e) {
            var file = e.target.files[0];
            if (file) {
                var menuEl = document.getElementById('seed-menu');
                var progressEl = document.getElementById('gen-progress');
                if (progressEl) progressEl.textContent = 'IMPORTING...';
                importWorld(file);
                importInput.value = '';
            }
        });
    }
}

// -----------------------------------------------------------------------
// Boot: wire all events after DOM is ready
// -----------------------------------------------------------------------

function initSaveLoadSystem() {
    initSavePopupEvents();
    initLoadScreenEvents();
}
