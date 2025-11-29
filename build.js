// esbuild.js
const esbuild = require('esbuild');
const copyStaticFiles = require('esbuild-copy-static-files');

esbuild
  .build({
    entryPoints: ['src/background.js', 'src/contentScript.js', 'src/popup.js'],
    bundle: true,
    outdir: 'dist',
    minify: false,
    sourcemap: 'inline',
    format: 'esm',
    plugins: [
      copyStaticFiles({
        src: './',
        dest: './dist',
        filter: (src, dest) => {
          return (
            src.endsWith('popup.html') ||
            src.endsWith('popup.css') ||
            src.includes('icons')
          );
        },
      }),
    ],
  })
  .catch(() => process.exit(1));
