'use strict';

// Generates build/icon.png (256x256) from the hand-coded Oyen face so
// electron-builder has an application icon without any checked-in image files.
// Run automatically via `prebuild` / `postinstall`, or manually: npm run gen-icon

const fs = require('fs');
const path = require('path');
const { encodePNG } = require('../src/shared/pngEncoder');
const { renderOyenIcon } = require('../src/shared/oyenIcon');

const SIZE = 256;
const outDir = path.join(__dirname, '..', 'build');
const outFile = path.join(outDir, 'icon.png');

function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const { rgba } = renderOyenIcon(SIZE);
  const png = encodePNG(rgba, SIZE, SIZE);
  fs.writeFileSync(outFile, png);
  console.log(`[gen-icon] wrote ${outFile} (${SIZE}x${SIZE}, ${png.length} bytes)`);
}

main();
