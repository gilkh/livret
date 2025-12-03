import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../api'

type Level = {
  _id: string
  name: string
  order: number
}

type LevelContextType = {
  levels: Level[]
  levelNames: string[]
  isLoading: boolean
}

const LevelContext = createContext<LevelContextType | undefined>(undefined)

export function LevelProvider({ children }: { children: ReactNode }) {
  const [levels, setLevels] = useState<Level[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const location = useLocation()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setLevels([])
      setIsLoading(false)
      return
    }

    if (levels.length > 0) return

    const loadLevels = async () => {
      try {
        const res = await api.get('/levels')
        setLevels(res.data)
      } catch (e) {
        console.error('Failed to load levels', e)
        // Fallback
        setLevels([
            { _id: '1', name: 'TPS', order: 1 },
            { _id: '2', name: 'PS', order: 2 },
            { _id: '3', name: 'MS', order: 3 },
            { _id: '4', name: 'GS', order: 4 },
            { _id: '5', name: 'EB1', order: 5 },
            { _id: '6', name: 'EB2', order: 6 },
            { _id: '7', name: 'EB3', order: 7 },
            { _id: '8', name: 'EB4', order: 8 },
            { _id: '9', name: 'EB5', order: 9 },
            { _id: '10', name: 'EB6', order: 10 },
            { _id: '11', name: 'EB7', order: 11 },
            { _id: '12', name: 'EB8', order: 12 },
            { _id: '13', name: 'EB9', order: 13 },
        ])
      } finally {
        setIsLoading(false)
      }
    }
    loadLevels()
  }, [location.pathname, levels.length])

  const levelNames = levels.map(l => l.name)

  return (
    <LevelContext.Provider value={{ levels, levelNames, isLoading }}>
      {children}
    </LevelContext.Provider>
  )
}

export function useLevels() {
  const context = useContext(LevelContext)
  if (context === undefined) {
    throw new Error('useLevels must be used within a LevelProvider')
  }
  return context
}
