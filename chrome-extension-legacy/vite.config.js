import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, existsSync } from 'fs'
import { join } from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'copy-extension-files',
      closeBundle() {
        // Copy extension files to dist folder
        const filesToCopy = [
          { src: 'public/background.js', dest: 'dist/background.js' },
          { src: 'manifest.json', dest: 'dist/manifest.json' }
        ];
        
        filesToCopy.forEach(({ src, dest }) => {
          try {
            const srcPath = join(__dirname, src);
            const destPath = join(__dirname, dest);
            
            if (existsSync(srcPath)) {
              copyFileSync(srcPath, destPath);
              console.log(`✓ Copied ${src} to ${dest}`);
            } else {
              console.warn(`⚠ ${src} not found, skipping copy`);
            }
          } catch (error) {
            console.warn(`Could not copy ${src}:`, error.message);
          }
        });
      }
    }
  ],
  server: {
    host: '0.0.0.0', // Allow access from all network interfaces
    port: 3000,
    // No proxy needed - frontend makes direct API calls
  },
  build: {
    outDir: 'dist',
    // Use relative paths for extension compatibility
    base: './',
    rollupOptions: {
      input: {
        main: join(__dirname, 'index.html'),
      },
    },
  },
})
