import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

type Option = {
    value: string
    label: string
    subLabel?: string
}

type SearchableSelectProps = {
    options: Option[]
    value: string
    onChange: (value: string) => void
    placeholder?: string
    disabled?: boolean
    className?: string
}

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = 'Sélectionner...',
    disabled = false,
    className
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [search, setSearch] = useState('')
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    const selectedOption = options.find(o => o.value === value)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus()
        }
        if (!isOpen) {
            setSearch('')
        }
    }, [isOpen])

    const filteredOptions = useMemo(() => {
        if (!search) return options
        const lowerSearch = search.toLowerCase()
        return options.filter(o => 
            o.label.toLowerCase().includes(lowerSearch) || 
            (o.subLabel && o.subLabel.toLowerCase().includes(lowerSearch))
        )
    }, [options, search])

    return (
        <div 
            ref={containerRef} 
            className={`searchable-select-container ${className || ''}`} 
            style={{ position: 'relative', width: '100%' }}
        >
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: disabled ? '#f1f5f9' : 'white',
                    color: disabled ? '#94a3b8' : '#1e293b',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 14,
                    minHeight: 42,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
            >
                <span style={{ 
                    whiteSpace: 'nowrap', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis',
                    marginRight: 8
                }}>
                    {selectedOption ? selectedOption.label : <span style={{ color: '#94a3b8' }}>{placeholder}</span>}
                </span>
                <ChevronDown size={16} color="#64748b" />
            </div>

            {isOpen && !disabled && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: 'white',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                    zIndex: 50,
                    maxHeight: 300,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    <div style={{ padding: 8, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Search size={14} color="#94a3b8" />
                        <input
                            ref={inputRef}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Rechercher..."
                            style={{
                                border: 'none',
                                outline: 'none',
                                width: '100%',
                                fontSize: 13,
                                background: 'transparent'
                            }}
                            onClick={e => e.stopPropagation()}
                        />
                        {search && (
                            <X 
                                size={14} 
                                color="#94a3b8" 
                                style={{ cursor: 'pointer' }} 
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setSearch('')
                                }} 
                            />
                        )}
                    </div>
                    
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {filteredOptions.length === 0 ? (
                            <div style={{ padding: '12px', fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>
                                Aucun résultat
                            </div>
                        ) : (
                            filteredOptions.map(option => (
                                <div
                                    key={option.value}
                                    onClick={() => {
                                        onChange(option.value)
                                        setIsOpen(false)
                                    }}
                                    style={{
                                        padding: '8px 12px',
                                        cursor: 'pointer',
                                        fontSize: 14,
                                        color: '#334155',
                                        background: option.value === value ? '#f1f5f9' : 'transparent',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        transition: 'background 0.15s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseLeave={e => e.currentTarget.style.background = option.value === value ? '#f1f5f9' : 'transparent'}
                                >
                                    <span>{option.label}</span>
                                    {option.subLabel && (
                                        <span style={{ fontSize: 12, color: '#64748b' }}>{option.subLabel}</span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
