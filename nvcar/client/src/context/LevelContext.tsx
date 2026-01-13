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
        // Fallback - only include the levels seeded in the database
        setLevels([
          { _id: '1', name: 'PS', order: 1 },
          { _id: '2', name: 'MS', order: 2 },
          { _id: '3', name: 'GS', order: 3 },
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
