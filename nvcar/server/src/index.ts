import 'dotenv/config'

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

import { createApp } from './app'
import { repairRouter } from './routes/repair'
import os from 'os'
import { initSocket } from './socket'
import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'

const port = process.env.PORT ? Number(process.env.PORT) : 4000
const app = createApp()

app.use('/api/repair', repairRouter)

let server: https.Server | http.Server

try {
  // Look for certs in ../certs relative to project root (server folder)
  // If running from src/index.ts via ts-node, __dirname is src
  // If running from dist/index.js, __dirname is dist
  // So we need to go up two levels to get to server root, then up one more to get to nvcar root?
  // No, I put certs in nvcar/certs.
  // server root is nvcar/server.
  // so path is ../certs relative to server root.
  // from src: ../../certs
  const certPath = path.join(__dirname, '../../certs')
  
  if (fs.existsSync(path.join(certPath, 'key.pem'))) {
    const key = fs.readFileSync(path.join(certPath, 'key.pem'))
    const cert = fs.readFileSync(path.join(certPath, 'cert.pem'))
    server = https.createServer({ key, cert }, app)
    console.log('SSL certificates loaded. Starting HTTPS server.')
  } else {
    throw new Error('Certificates not found')
  }
} catch (e) {
  console.warn('Could not load SSL certificates, falling back to HTTP')
  server = http.createServer(app)
}

server.listen(port, () => {
  const nets = os.networkInterfaces()
  const addrs: string[] = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if ((net as any).family === 'IPv4' && !(net as any).internal) addrs.push((net as any).address)
    }
  }
  const protocol = server instanceof https.Server ? 'https' : 'http'
  console.log(`server listening on ${protocol}://localhost:${port}`)
  if (addrs.length) {
    for (const a of addrs) console.log(`server shared on ${protocol}://${a}:${port}`)
  }
})

initSocket(server)
