const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

/**
 * Builds the Chrome extension's JavaScript files using esbuild.
 * Bundles src/contentScript.js and src/background.js into the dist/ directory.
 * Creates the dist/ directory if it doesn't exist.
 */
async function build() {
  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist');
  }

  try {
    await esbuild.build({
      entryPoints: ['src/contentScript.js', 'src/background.js'],
      bundle: true,
      outdir: 'dist',
      minify: false, // Keep readable for now
      sourcemap: false,
      target: ['chrome100'], // Target Chrome 100+
    });
    console.log('Build complete: dist/contentScript.js, dist/background.js');
  } catch (e) {
    console.error('Build failed:', e);
    process.exit(1);
  }
}

build();