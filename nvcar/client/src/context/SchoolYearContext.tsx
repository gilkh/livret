import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../api'

type SchoolYear = {
  _id: string
  name: string
  startDate: string
  endDate: string
  active: boolean
  activeSemester?: number
  sequence?: number
}

type SchoolYearContextType = {
  years: SchoolYear[]
  activeYearId: string
  setActiveYearId: (id: string) => void
  activeYear: SchoolYear | undefined
  isLoading: boolean
  refetchYears: () => Promise<void>
}

const SchoolYearContext = createContext<SchoolYearContextType | undefined>(undefined)

export function SchoolYearProvider({ children }: { children: ReactNode }) {
  const [years, setYears] = useState<SchoolYear[]>([])
  const [activeYearId, setActiveYearId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const location = useLocation()

  const loadYears = async (forceUpdateActiveId = false) => {
    try {
      const res = await api.get('/school-years')
      const list = res.data
      setYears(list)

      // If forceUpdateActiveId is true, or if there's no current activeYearId,
      // set it to the active year from DB
      if (forceUpdateActiveId || !activeYearId) {
        const active = list.find((y: SchoolYear) => y.active)
        if (active) {
          setActiveYearId(active._id)
        } else if (list.length > 0 && !activeYearId) {
          setActiveYearId(list[0]._id)
        }
      }
    } catch (e) {
      console.error('Failed to load school years', e)
    } finally {
      setIsLoading(false)
    }
  }

  const refetchYears = async () => {
    // Force update to sync with DB active year
    await loadYears(true)
  }

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setYears([])
      setActiveYearId('')
      setIsLoading(false)
      return
    }

    if (years.length > 0) return

    loadYears(false)
  }, [location.pathname, years.length])

  const activeYear = years.find(y => y._id === activeYearId)

  return (
    <SchoolYearContext.Provider value={{ years, activeYearId, setActiveYearId, activeYear, isLoading, refetchYears }}>
      {children}
    </SchoolYearContext.Provider>
  )
}

export function useSchoolYear() {
  const context = useContext(SchoolYearContext)
  if (context === undefined) {
    throw new Error('useSchoolYear must be used within a SchoolYearProvider')
  }
  return context
}
