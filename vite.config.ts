import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.PORT) || 5180, // PORT env로 덮어쓰기 가능(프리뷰 도구 등)
    strictPort: true,
    host: true,
  },
})
