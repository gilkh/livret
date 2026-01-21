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
    // Allow accessing the dev server via a custom hostname (e.g. through a hosts entry or reverse proxy)
    // without tripping Vite's host check.
    allowedHosts: true,
    host: true, // Listen on all addresses
    port: 443,
    // When the page is opened via a hostname different from "localhost", the default HMR client
    // may try to connect to the wrong websocket host/port. These env vars let you pin it.
    // Examples:
    //   set VITE_HMR_HOST=livret.champville.com
    //   set VITE_HMR_CLIENT_PORT=443
    //   set VITE_HMR_PROTOCOL=wss
    hmr: {
      host: process.env.VITE_HMR_HOST,
      clientPort: process.env.VITE_HMR_CLIENT_PORT ? Number(process.env.VITE_HMR_CLIENT_PORT) : undefined,
      protocol: (process.env.VITE_HMR_PROTOCOL as any) || undefined,
    },
    proxy: {
      '/socket.io': {
        target: 'https://localhost:4000',
        secure: false,
        ws: true,
        changeOrigin: true
      },
      '^/(auth|categories|students|levels|import|pdf-v2|reports-v2|files-v2|pdf|reports|files|templates|users|signatures|school-years|classes|media|teacher-assignments|template-assignments|template-propagation|subadmin-assignments|teacher|subadmin|aefe|audit-logs|impersonation|suggestions|settings|admin-extras|microsoft|outlook-users|analytics|backup|saved-gradebooks|uploads|simulations|error-logs|api)': {
        target: 'https://localhost:4000',
        secure: false,
        changeOrigin: true,
        bypass: (req) => {
          // Always proxy PDF/download routes even if browser requests text/html (direct navigation)
          if (req.url && (
            req.url.startsWith('/pdf-v2') ||
            req.url.startsWith('/reports-v2') ||
            req.url.startsWith('/files-v2') ||
            req.url.startsWith('/pdf') ||
            req.url.startsWith('/reports') ||
            req.url.startsWith('/files')
          )) {
            return null
          }
          // Only bypass for GET navigation requests that accept text/html. This avoids treating POST/PUT/DELETE
          // requests (which sometimes include 'text/html' in the Accept header) as static file lookups that return 404.
          if (req.method === 'GET' && req.headers.accept && req.headers.accept.includes('text/html')) {
            return req.url
          }
        }
      }
    }
  }
})
