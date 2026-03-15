/**
 * UFO: Cosmic Clash — Vite konfigurace
 * Autor: Alexandre Basseville
 *
 * Všechny HTML entry pointy musí být zde uvedeny,
 * jinak je Vite při buildu ignoruje → 404 v produkci.
 */
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main:      resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        admin:     resolve(__dirname, 'admin.html'),
        settings:  resolve(__dirname, 'settings.html'),
      }
    }
  }
})
