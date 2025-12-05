import React, { createContext, useContext, useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'

const SocketContext = createContext<Socket | null>(null)

export const useSocket = () => {
  return useContext(SocketContext)
}

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    // Adjust the URL if your server is running on a different port/host
    const host = window.location.hostname
    const protocol = window.location.protocol
    const defaultUrl = `${protocol}//${host}:4000`
    const url = import.meta.env.VITE_API_URL || defaultUrl
    
    const newSocket = io(url, {
      withCredentials: true,
    })

    setSocket(newSocket)

    return () => {
      newSocket.close()
    }
  }, [])

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  )
}
