# VoxelSpace - Minimal

A stripped-down version of the VoxelSpace FPS game, featuring only the core graphics and movement mechanics.

## Features

- **FPS Movement Controls**: WASD movement with mouse look
- **Gravity & Physics**: Realistic jump mechanics with charging system
- **Voxel Terrain Rendering**: Classic height-map based terrain rendering
- **3D Textured Cube**: Perspective-correct textured cube rendering
- **Sprite Rendering**: Trees and other decorative sprites
- **Collision Detection**: Player collision with terrain and cube

## Controls

- **W/A/S/D**: Move forward/left/backward/right
- **Mouse**: Look around (click canvas to enable pointer lock)
- **Space** (hold): Charge jump - hold longer for higher jumps
- **Shift**: Sprint
- **C**: Crouch

## What's Removed

This minimal version has removed:
- All weapon/gun mechanics
- Shooting and bullets
- Health system
- Settings menu/UI
- Debug overlays
- Gamepad support
- Touch controls
- Multiple maps (uses C1W;D1 only)

## How to Run

Simply open `index.html` in a modern web browser. Click the canvas to enable pointer lock and start exploring!

## Structure

```
VoxelSpace-Minimal/
├── index.html           # Main HTML file
├── maps/               # Terrain maps (color and height)
├── images/             # Textures and sprites
├── modules/            # Display configuration
└── src/
    ├── core/           # Core engine (globals, polyfills)
    ├── rendering/      # Rendering pipeline (voxel, cube, items)
    ├── entities/       # Camera and items
    ├── input/          # Keyboard and mouse
    └── map/            # Map loading
```

## Credits

Based on the VoxelSpace technique from NovaLogic's Comanche (1992).
