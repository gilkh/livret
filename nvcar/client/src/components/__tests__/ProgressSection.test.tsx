import React from 'react'
import { render, screen } from '@testing-library/react'
import ProgressSection from '../ProgressSection'

describe('ProgressSection', () => {
  it('renders and exposes accessible region with title', () => {
    const props = {
      title: 'Résumé PS',
      subtitle: '10 élèves',
      progress: { total: 100, filled: 40, percentage: 40 },
      byCategory: [
        { name: 'Maths', total: 50, filled: 30, percentage: 60 },
        { name: 'Anglais', total: 50, filled: 10, percentage: 20 }
      ],
      compact: true
    }

    render(<ProgressSection {...props} />)

    // region with accessible name should exist
    const region = screen.getByRole('region', { name: /Résumé PS/i })
    expect(region).toBeInTheDocument()

    // percentage visible text
    expect(screen.getByText('40%')).toBeInTheDocument()

    // legend items present
    expect(screen.getByText(/Maths/i)).toBeInTheDocument()
    expect(screen.getByText(/Anglais/i)).toBeInTheDocument()
  })
})
