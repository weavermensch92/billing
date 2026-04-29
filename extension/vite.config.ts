import { defineConfig } from 'vite'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'

// MV3 Chrome Extension은 3개 entry를 별도 번들로:
//   popup.js       (popup.html 로드)
//   background.js  (service worker)
//   content.js     (content script)
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        popup:      resolve(__dirname, 'src/popup/popup.ts'),
        background: resolve(__dirname, 'src/background/background.ts'),
        content:    resolve(__dirname, 'src/content/content.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'es',
        inlineDynamicImports: false,
      },
    },
  },
  plugins: [
    {
      name: 'copy-static',
      closeBundle() {
        const publicDir = resolve(__dirname, 'public')
        const distDir = resolve(__dirname, 'dist')
        const iconsDir = resolve(distDir, 'icons')
        if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true })
        for (const f of ['manifest.json', 'popup.html', 'popup.css']) {
          try { copyFileSync(resolve(publicDir, f), resolve(distDir, f)) } catch {}
        }
        for (const icon of ['icon-16.png', 'icon-48.png', 'icon-128.png']) {
          try { copyFileSync(resolve(publicDir, 'icons', icon), resolve(iconsDir, icon)) } catch {}
        }
      },
    },
  ],
})
