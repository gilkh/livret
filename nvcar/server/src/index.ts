import 'dotenv/config'
import { createApp } from './app'
import os from 'os'
import { initSocket } from './socket'

const port = process.env.PORT ? Number(process.env.PORT) : 4000
const app = createApp()

const server = app.listen(port, () => {
  const nets = os.networkInterfaces()
  const addrs: string[] = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if ((net as any).family === 'IPv4' && !(net as any).internal) addrs.push((net as any).address)
    }
  }
  console.log(`server listening on http://localhost:${port}`)
  if (addrs.length) {
    for (const a of addrs) console.log(`server shared on http://${a}:${port}`)
  }
})

initSocket(server)
