// ===============================
// Seeded Perlin Noise + FBM
// ===============================
"use strict";

// Seeded pseudo-random number generator (Mulberry32)
function mulberry32(seed) {
    var s = seed >>> 0;
    return function() {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Create a seeded Perlin noise function
// Returns a function noise(x, y) → approximately [-0.7, 0.7]
function createPerlinNoise(seed) {
    var rng = mulberry32(seed >>> 0);

    // Build permutation table shuffled with the seed
    var p = new Uint8Array(256);
    for (var i = 0; i < 256; i++) p[i] = i;
    for (var i = 255; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    var perm = new Uint8Array(512);
    for (var i = 0; i < 512; i++) perm[i] = p[i & 255];

    function fade(t) {
        return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    }

    function lerp(a, b, t) {
        return a + t * (b - a);
    }

    // 2D gradient using hash bits
    function grad(hash, x, y) {
        var h = hash & 7;
        var u = h < 4 ? x : y;
        var v = h < 4 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }

    return function(x, y) {
        var xi = Math.floor(x) & 255;
        var yi = Math.floor(y) & 255;
        var xf = x - Math.floor(x);
        var yf = y - Math.floor(y);
        var u = fade(xf);
        var v = fade(yf);
        var aa = perm[perm[xi    ] + yi    ];
        var ab = perm[perm[xi    ] + yi + 1];
        var ba = perm[perm[xi + 1] + yi    ];
        var bb = perm[perm[xi + 1] + yi + 1];
        return lerp(
            lerp(grad(aa, xf,     yf    ), grad(ba, xf - 1, yf    ), u),
            lerp(grad(ab, xf,     yf - 1), grad(bb, xf - 1, yf - 1), u),
            v
        );
    };
}

// Fractional Brownian Motion — sums multiple octaves of noise
// Returns value normalized to approximately [-1, 1]
function fbm(noiseFn, x, y, octaves, lacunarity, gain) {
    var sum = 0.0;
    var amp = 0.5;
    var freq = 1.0;
    var maxAmp = 0.0;
    for (var i = 0; i < octaves; i++) {
        sum   += noiseFn(x * freq, y * freq) * amp;
        maxAmp += amp;
        freq  *= lacunarity;
        amp   *= gain;
    }
    return sum / maxAmp;
}
