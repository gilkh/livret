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
}

const SchoolYearContext = createContext<SchoolYearContextType | undefined>(undefined)

export function SchoolYearProvider({ children }: { children: ReactNode }) {
  const [years, setYears] = useState<SchoolYear[]>([])
  const [activeYearId, setActiveYearId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const location = useLocation()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setYears([])
      setActiveYearId('')
      setIsLoading(false)
      return
    }

    if (years.length > 0) return

    const loadYears = async () => {
      try {
        const res = await api.get('/school-years')
        const list = res.data
        setYears(list)
        
        // Default to the active year from DB, or the first one
        const active = list.find((y: SchoolYear) => y.active)
        if (active) {
          setActiveYearId(active._id)
        } else if (list.length > 0) {
          setActiveYearId(list[0]._id)
        }
      } catch (e) {
        console.error('Failed to load school years', e)
      } finally {
        setIsLoading(false)
      }
    }
    loadYears()
  }, [location.pathname, years.length])

  const activeYear = years.find(y => y._id === activeYearId)

  return (
    <SchoolYearContext.Provider value={{ years, activeYearId, setActiveYearId, activeYear, isLoading }}>
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
