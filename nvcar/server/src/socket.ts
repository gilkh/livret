import { Server, Socket } from 'socket.io'
import { Server as HttpServer } from 'http'

export const initSocket = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      methods: ['GET', 'POST'],
      credentials: true
    }
  })

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id)

    socket.on('join-template', (templateId: string) => {
      socket.join(`template:${templateId}`)
      console.log(`Socket ${socket.id} joined template:${templateId}`)
    })

    socket.on('leave-template', (templateId: string) => {
      socket.leave(`template:${templateId}`)
      console.log(`Socket ${socket.id} left template:${templateId}`)
    })

    socket.on('update-template', (data: { templateId: string, template: any }) => {
      // Broadcast to everyone else in the room
      socket.to(`template:${data.templateId}`).emit('template-updated', data.template)
    })

    // Generic room support for assignments/gradebooks
    socket.on('join-room', (roomId: string) => {
      socket.join(roomId)
      console.log(`Socket ${socket.id} joined room:${roomId}`)
    })

    socket.on('leave-room', (roomId: string) => {
      socket.leave(roomId)
      console.log(`Socket ${socket.id} left room:${roomId}`)
    })

    socket.on('broadcast-update', (data: { roomId: string, payload: any }) => {
      socket.to(data.roomId).emit('update-received', data.payload)
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
    })
  })

  return io
}
