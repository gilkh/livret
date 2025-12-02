import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './theme.css'
import { SchoolYearProvider } from './context/SchoolYearContext'
import { LevelProvider } from './context/LevelContext'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SchoolYearProvider>
          <LevelProvider>
            <App />
          </LevelProvider>
        </SchoolYearProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
