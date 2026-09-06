import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so the bundle works both on a web server and inside Capacitor.
  base: './',
  // The dev server may be started through a junction (a path without spaces);
  // keep the link path instead of resolving to the real one, or Vite thinks
  // every source file lives outside its root.
  resolve: { preserveSymlinks: true },
  server: { fs: { allow: ['.', 'C:/Users/user/Desktop/30 Nights/game', 'C:/Users/user/Desktop/Last Ember/nights'] } },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
