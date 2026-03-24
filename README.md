# VoxelSpace - Minimal

A stripped-down VoxelSpace renderer extended with a **procedural tile-based world system**: biome generation, constraint-based world layout, seamless tile blending, and a real-time tile editor.

> **⚠ Experiment in progress** — Adding a GZDoom-style indoor sector renderer as a modular opt-in system. This feature is self-contained under `src/indoor/` and does not affect the base voxel renderer. See the Indoor / Sector Engine section below for details.

---

## Controls

| Key | Action |
|---|---|
| W / A / S / D | Move forward / left / backward / right |
| Mouse | Look around (click canvas to enable pointer lock) |
| Space (hold) | Charge jump — hold longer for higher jump |
| Shift | Sprint |
| C | Crouch |
| F | Toggle fly mode |
| E | Open tile editor (paint tiles onto the world) |
| M | Toggle minimap |
| L | Toggle tile legend |

### Rendering Optimizations (toggle during play)
| Key | Option |
|---|---|
| 1 | Tile culling |
| 2 | Bilinear filtering (close range) |
| 3 | Depth interpolation |
| 4 | Tile blending (overlap zones) |
| G | Ground Floor mode (pin-art rendering) |
| 6 | Render mode cycle (Tiled / Cached) |

---

## How to Run

Open `index.html` in a modern web browser. Click the canvas to enable pointer lock.

---

## Project Structure

```
VoxelSpace-Minimal/
├── index.html
├── maps/                        # Terrain height + color maps
├── images/                      # Sprites and textures
└── src/
    ├── core/                    # Globals, polyfills
    ├── rendering/
    │   ├── voxelEngine.js       # Terrain renderer + tile blending
    │   ├── itemRenderer.js      # Tree / sprite rendering
    │   └── lod/
    │       └── distanceLOD.js   # Optional far-distance LOD (removable)
    ├── procedural/
    │   └── biomeGen.js          # All tile generators + world map
    ├── editor/
    │   └── tileEditor.js        # Paint tool, tile picker, save/load
    ├── entities/                # Camera, items
    ├── input/                   # Keyboard, mouse
    └── map/
        └── mapLoader.js         # Tile system init, WFC placement
```

---

## World Generation Pipeline

The world is produced in six sequential stages each time the page loads. Stages 1–4 build a 16×16 biome grid; stages 5–6 turn that grid into rendered tiles.

```
1. Voronoi seeding       — coarse biome regions (Beach / Plains / Hills)
2. Mountain ridge walks  — organic ridgeline paths carved into the grid
3. Straight ridge walks  — tall linear barriers (pure NS or EW orientation)
4. Constraint repair     — minimum-conflicts pass enforces adjacency rules
5. Post-processing       — inserts Transition and Foothill belts
6. Tile generation       — each cell gets a procedural 1024×1024 heightmap
```

---

### Stage 1 — Voronoi Seeding

8–16 seed points are placed at random positions on the 16×16 grid. Each cell is assigned to its nearest seed using Manhattan distance. Seeds are randomly typed as **Beach (30%)**, **Plains (35%)**, or **Hills (35%)**.

---

### Stage 2 — Mountain Ridge Walks

Mountain ridgelines are grown using a random walk:

- Walk length: 6–11 cells
- Each step continues in the same cardinal direction with a 70% chance; 30% chance to turn
- After the first walk, a 65% chance triggers a branch walk from a random existing mountain cell
- Mountain and Ridge cells are **locked** — they are never modified by later constraint repair

---

### Stage 3 — Straight Ridge Walks

1–2 purely straight ridge paths are added, 3–7 cells long. These are always oriented NS or EW with no turns, producing tall linear barriers (heightScale 2.0, roughly 510 world units tall).

---

### Stage 4 — Constraint Repair (Minimum-Conflicts)

A local-search constraint solver runs for up to 100 passes over the grid.

**Domain** (for non-locked cells): Beach, Plains, Hills

**Constraint table** (`BIOME_NOT_ALLOWED`):
- Beach cannot be adjacent to Hills, Mountain, or Ridge
- Hills cannot be adjacent to Beach
- Mountain and Ridge cannot be adjacent to Beach

**Algorithm per pass:**
1. Iterate all cells in random order
2. Skip Mountain and Ridge (locked)
3. Count violated adjacency constraints for the cell's current type
4. If violations > 0: try 8 random type assignments, keep the one with the fewest violations
5. Repeat until no violations remain or 100 passes exhausted

This is a greedy minimum-conflicts repair — not full CSP backtracking — so rare edge cases may leave minor violations.

---

### Stage 5 — Post-Processing Belts

Two automatic insertion passes run after constraint repair:

**Transition belt** — any Plains cell touching a Beach cell (cardinally or diagonally) is converted to Transition type. Transition tiles blend sand-to-grass seamlessly.

**Foothill belt** — any Plains cell touching a Ridge cell (cardinally) is converted to Foothill type. Foothill tiles ramp up from plains altitude (~72) to ridge base.

---

### Stage 6 — Tile Generation

Each cell in the 16×16 grid is converted to a 1024×1024 heightmap + colormap. The generator chosen depends on the cell's biome type and its **orientation key** — a compass string (e.g. `'NS'`, `'NE'`, `'NSEW'`, `'ISO'`) built by scanning the cell's neighbors.

Tile coordinates are offset so the playable grid runs from (−5, −5) to (+5, +5) in tile space. Border tiles are left empty (no tile placed).

---

## Tile Types and Generators

All tiles are **1024×1024** pixels. The last 128 pixels on every edge **overlap** with the adjacent tile (see Blending section). `heightScale` multiplies raw altitude values (0–255) into world units.

| Tile | Generator | Altitude Range | heightScale | Notes |
|---|---|---|---|---|
| Beach | `genBeachTile` | 18–72 | 1.0 | Y-split wet/dry sand zones |
| Plains | `genPlainsTile` | 50–100 | 1.0 | Rolling meadow baseline |
| Hills | `genHillsTile` | 65–158 | 1.0 | FBM + ridge noise mix |
| Hills EndCap | `genHillsEndCapTile` | 65–158 | 1.0 | Tapers to mossy ground at cap end |
| Mountain | `genMountainTile` | 80–255 | 1.0 | Single peak with snow |
| Mountain (directional) | `genDirectionalMountainTile` | 80–255 | 1.0 | Domain-warped ridge matching neighbors |
| Mountain Peak | `genPeakMountainTile` | 38–255 | **2.0** | 2–4 randomized peaks |
| Ridge (straight) | `genStraightRidgeTile` | 38–255 | **2.0** | Wide tall ridge with jagged crest spikes |
| Ridge EndCap | `genRidgeEndCapTile` | 38–255 | **2.0** | Ridge that tapers to flat at one end |
| Transition | `genTransitionTile` | 18–100 | 1.0 | Sand ↔ grass blend |
| Foothill | `genFoothillTile` | 65–165 | 1.0 | Smooth ramp toward ridge |
| Foothill (steep) | `genSteepFoothillTile` | 65–215 | 1.0 | Sharp abrupt ascent |

---

## How Individual Tiles Are Generated

### Noise Primitives

Every tile is built from two primitives defined in `biomeGen.js`:

**`createPerlinNoise(seed)`** — Returns a seeded 2D Perlin noise function using a Mulberry32 PRNG to shuffle a 256-element permutation table. Gradient vectors are chosen from 8 cardinal/diagonal directions. Output range is approximately [−0.7, 0.7].

**`fbm(noiseFn, x, y, octaves, lacunarity, gain)`** — Fractional Brownian Motion: sums `octaves` layers of noise, each at `lacunarity×` the previous frequency and `gain×` the previous amplitude. Produces terrain-like multi-scale detail.

---

### Edge Fade — Biome Continuity

Every generator applies `biomeEdgeFade(x, y, w, h)` near the tile boundary. This function:

1. Computes how close the pixel is to any of the 4 edges (normalized distance 0–1)
2. Applies a Hermite smoothstep: `t² (3 − 2t)`
3. Returns a fade factor [0, 1]: **0 at the border, 1 in the interior**

Altitude is blended toward `BIOME_TRANSITION_ALT = 72` at the edges:

```
altitude = lerp(BIOME_TRANSITION_ALT, interiorAltitude, edgeFade)
```

`BIOME_BLEND_WIDTH = 170` pixels is the fade zone width. Since tile overlap is only 128 pixels, edges always reach the neutral altitude before the overlap zone begins — this guarantees no altitude cliffs at tile seams regardless of which tiles are neighbors.

---

### Key Tile Algorithms

#### Plains
FBM (6 octaves, frequency 3.5). Output remapped to [0, 1], mapped to altitude range 50–100. Color varies by altitude through dark-to-light green shades.

#### Hills
Two noise sources combined:
- Main FBM (6 octaves, frequency 4.0) — broad rolling shape
- Ridge FBM (4 octaves, frequency 3.2), passed through `max(0, 1 − |n|)²` — sharpens bumps into ridge-like peaks

Combined: `n × 0.55 + ridge × 0.45`. Altitude 65–158. Color remapped away from the green zone to stay in rocky browns.

#### Directional Mountain
Three independent noise sources:
- **detailFn** (5 octaves) — surface roughness
- **warpFn** (3 octaves) — domain warp, bends the ridge axis organically
- **elevFn** (4 octaves) — varies ridge crest height along its length

Domain warp offsets each pixel's sample coordinate by `(warpFn_x, warpFn_y) × 0.14 × tileWidth` before distance-to-ridge is computed. This prevents the ridge from looking like a straight geometric line.

Ridge distance depends on the orientation key:
- `NS` → distance to vertical centerline `|warp_x − 0.5|`
- `EW` → distance to horizontal centerline `|warp_y − 0.5|`
- Diagonal / corner keys → distance to the appropriate line segment

Profile (altitude falloff from ridge crest):

```
profile = max(0, 1 − dist / halfWidth)²   (halfWidth = 0.28 in normalized coords)
altitude = BASE_ALT + (dynamicPeak − BASE_ALT) × profile + detail
```

`dynamicPeak` is driven by `elevFn` to create natural height variation (148–248 data units, ×1.0 scale).

#### Straight Ridge
Same domain-warp structure as directional mountain but:
- **heightScale = 2.0** — ridge reaches ~510 world units
- Wider half-width (0.60) — broad, shoulder-filled shape
- Profile uses double-squared softening: `max(0, 1 − (d/HW)²)²`
- Along-crest elevation varies 230–255 (data units)
- **Spike layer**: high-frequency FBM (14.0) multiplied by the profile creates jagged crest peaks concentrated at the top while flanks remain smooth

#### EndCap Tiles (Ridge and Hills)
EndCap tiles taper one end of the tile to ground level using a `capTaper` value:

```
axisT  = normalized position along the tile's primary axis (0 at cap end, 1 at open end)
capTaper = axisT² (3 − 2 × axisT)     // Hermite smoothstep
altitude = edgeFadeAlt + (fullAltitude − edgeFadeAlt) × capTaper
```

The direction (`N_CAP`, `S_CAP`, `E_CAP`, `W_CAP`) determines which end tapers to flat. Perpendicular edges still receive normal `biomeEdgeFade` treatment.

#### Peak Mountain
A seeded RNG places 2–4 peaks at random positions within normalized coords [0.2, 0.8]. Each peak is a quadratic cone:

```
d     = distance from pixel to peak center
cone  = max(0, 1 − d / radius)²
alt   = max(alt, peakHeight × cone)
```

Peak heights range 185–252 data units at **heightScale 2.0**, producing dramatic multi-summit ridges. Color is remapped entirely into the grey/snow range (148–255) — no green at any altitude.

#### Foothill
Ridge-weight `ridgeW` is computed from the orientation key:
- For each compass direction present in the key, accumulate the normalized distance from that tile edge (e.g., `N` key → distance from the north edge, `1.0 − localY/h`)
- Average over all present directions
- Apply FBM warp: `ridgeW += FBM(nx×3.5, ny×3.5) × 0.12` for organic shape
- Profile: `t = smoothstep(ridgeW)`

Altitude:
```
altitude = ALT_PLAINS + (ALT_RIDGE − ALT_PLAINS) × t + detail
```
Standard: `ALT_PLAINS=72`, `ALT_RIDGE=155`. Steep variant: `ALT_RIDGE=210`, `t = t²` for sharper curvature.

---

## Tile Blending System

Tiles are 1024×1024 but only advance **896 pixels** per step (1024 − 128). The trailing 128 pixels of each tile physically **overlap** with the leading 128 pixels of the next tile.

When `renderOpts.tileBlending` is enabled, `getTerrainData` detects which overlap zone a sample point is in and blends between adjacent tiles:

### Edge Zone (one axis in overlap)
A sample in the left overlap zone (localX ∈ [0, 128]):
- Reads from the **left neighbor tile** at `(tileWidth − 128 + localX, localY)`
- Reads from the **current tile** at `(localX, localY)`
- Blend factor = `localX / 128` (linear, 0 at far edge → 1 at inner boundary)
- Linearly interpolates both height and color

The same logic applies to right, top, and bottom edges.

### Corner Zone (both axes in overlap)
A sample in a corner (e.g., top-left) is in overlap on both X and Y simultaneously. Four tiles are sampled:

```
cs00 = diagonal neighbor   cs10 = X-axis neighbor
cs01 = Y-axis neighbor     cs11 = current tile
```

A 2D bilinear blend is applied:
```
topH    = lerp(cs00.height, cs10.height, bx)
bottomH = lerp(cs01.height, cs11.height, bx)
finalH  = lerp(topH, bottomH, by)
```
Missing neighbor tiles fall back gracefully to available samples.

### Close-Range Bilinear Filtering
For samples at render depth `z < 600` (closest ~20% of draw distance), `sampleBilinear` performs a 2D weighted average across the 4 nearest pixels within the tile. This suppresses pixelation on close terrain.

### Why It Looks Seamless
Biome edge fades to altitude 72 over 170 pixels → overlap blending operates over 128 pixels → the heights at the blend boundary are already converging before blending begins. Color is also channel-lerped independently, so no hue jumps occur.

---

## Distance LOD (`src/rendering/lod/distanceLOD.js`)

An optional, self-contained module. Remove its `<script>` tag in `index.html` to disable entirely.

For the far **10%** of draw distance (z > `threshold × camera.distance`), terrain color is replaced with a flat altitude-based ABGR color (4 bands: water-level, plains, hills, mountain). The transition is a smoothstep blend so there is no hard cutoff line. This reduces GPU color mixing work at distances where texture detail is invisible anyway.

---

## Ground Floor Mode (`G` key)

A pin-art rendering mode. Each vertical screen column is limited to a fixed height (20% of screen height) instead of filling to the bottom. This makes terrain appear as a series of equal-length pins — like a physical pin-art toy seen from the side.

When underground, the same projection math produces inverted stalactite shapes because camera height is below the terrain surface, reversing the sign of `(camera.height − terrainHeight)`. Items (trees) are depth-blocked in the gap area below each pin so they cannot show through the void.

**Depth clamp**: when the camera is very far below terrain, `heightonscreen` becomes an astronomically negative number. All loop bounds are clamped to `[0, screenHeight]` to prevent millions of wasted iterations.

---

## Tile Editor

Press **E** to open the paint tool. The editor overlays a grid on the minimap showing tile boundaries and the currently targeted tile. Use **SCROLL** to cycle through tile variants, **CLICK** to place. Arrow keys rotate directional tiles. The editor supports save/load of the current tile layout.

Tile groups available in the picker:
- Sand, Plains, Hills, Mountain (Base, directional, Peak, Peak1)
- Ridge (NS, EW, ISO, NE, NW, SE, SW, NSEW, etc.)
- Ridge Caps (N\_CAP, S\_CAP, E\_CAP, W\_CAP)
- Foothills, Steep Foothills
- Hills Caps (N\_HCAP, S\_HCAP, E\_HCAP, W\_HCAP)

---

## Credits

Based on the VoxelSpace raycasting technique from NovaLogic's *Comanche* (1992).
