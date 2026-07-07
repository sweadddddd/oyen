'use strict';

// Rasterizes a small "Oyen face" as RGBA pixels from a hand-authored low-res
// grid, scaled nearest-neighbor to any square size. Shared by the runtime tray
// icon (main process) and the build-time app-icon generator.

const PALETTE = {
  '.': null, // transparent
  f: [0xf0, 0xc9, 0x88, 0xff], // fur (pale ginger)
  c: [0xfa, 0xf1, 0xde, 0xff], // cream chest/muzzle
  s: [0xc9, 0x95, 0x4f, 0xff], // tabby stripe
  e: [0x9f, 0xb0, 0x8c, 0xff], // eye (green-grey)
  p: [0x2b, 0x2b, 0x2b, 0xff], // pupil / outline
  n: [0xe8, 0xa5, 0x98, 0xff], // pink nose / inner ear
  b: [0xe8, 0x93, 0x5a, 0xff], // bell
};

// 16 x 16. A friendly front-facing cat head with ears, eyes, nose and a bell.
// Every row must be exactly 16 characters.
const GRID = [
  '................',
  '..s........s....',
  '.sfs......sfs...',
  '.snfs....sfns...',
  '..sffssssffs....',
  '..sffffffffs....',
  '.sffffffffffs...',
  '.ffeeffffeeff...',
  '.ffepffffpeff...',
  '.ffffffnnffff...',
  '.fffffnnnnfff...',
  '.ffcffnnffcff...',
  '..fcccfnnfccf...',
  '...fcccccccf....',
  '....fbbbbf......',
  '.....fbbf.......',
];

/**
 * @param {number} size  output square size in pixels
 * @returns {{rgba: Buffer, size: number}}
 */
function renderOyenIcon(size) {
  const grid = GRID;
  const gh = grid.length;
  const gw = grid[0].length;
  const rgba = Buffer.alloc(size * size * 4); // all transparent by default

  for (let y = 0; y < size; y++) {
    const gy = Math.min(gh - 1, Math.floor((y / size) * gh));
    for (let x = 0; x < size; x++) {
      const gx = Math.min(gw - 1, Math.floor((x / size) * gw));
      const ch = grid[gy][gx];
      const color = PALETTE[ch];
      if (!color) continue;
      const idx = (y * size + x) * 4;
      rgba[idx] = color[0];
      rgba[idx + 1] = color[1];
      rgba[idx + 2] = color[2];
      rgba[idx + 3] = color[3];
    }
  }
  return { rgba, size };
}

module.exports = { renderOyenIcon, PALETTE };
