import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '../certs/key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, '../certs/cert.pem')),
    },
    host: true, // Listen on all addresses
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'https://localhost:4000',
        secure: false,
        ws: true,
        changeOrigin: true
      },
      '^/(auth|categories|students|levels|import|pdf-v2|reports-v2|files-v2|pdf|reports|files|templates|users|signatures|school-years|classes|media|teacher-assignments|template-assignments|subadmin-assignments|teacher|subadmin|aefe|audit-logs|impersonation|suggestions|settings|admin-extras|microsoft|outlook-users|analytics|backup|saved-gradebooks|uploads)': {
        target: 'https://localhost:4000',
        secure: false,
        changeOrigin: true,
        bypass: (req) => {
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return req.url
          }
        }
      }
    }
  }
})
