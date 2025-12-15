import { useEffect, useState } from 'react'
import api from '../api'
import { BarChart3, ArrowLeft, Filter, Calendar, Users, GraduationCap } from 'lucide-react'
import { Link } from 'react-router-dom'

type Template = {
    _id: string
    name: string
}

type SkillStat = {
    skillText: string
    totalStudents: number
    allowedLanguages?: string[]
    languages: Record<string, number>
}

export default function AdminSkillAnalytics() {
    const [templates, setTemplates] = useState<Template[]>([])
    const [selectedTemplateId, setSelectedTemplateId] = useState('')
    
    // Filter Data
    const [years, setYears] = useState<any[]>([])
    const [levels, setLevels] = useState<any[]>([])
    const [classes, setClasses] = useState<any[]>([])
    
    // Selected Filters
    const [selectedYear, setSelectedYear] = useState('')
    const [selectedLevel, setSelectedLevel] = useState('')
    const [selectedClass, setSelectedClass] = useState('')

    const [stats, setStats] = useState<SkillStat[]>([])
    const [totalAssigned, setTotalAssigned] = useState(0)
    const [loading, setLoading] = useState(false)
    const [templateName, setTemplateName] = useState('')

    useEffect(() => {
        api.get('/templates').then(r => setTemplates(r.data))
        api.get('/school-years').then(r => {
            setYears(r.data)
            // Auto-select active year?
            const active = r.data.find((y: any) => y.active)
            if (active) setSelectedYear(active._id)
        })
        api.get('/levels').then(r => setLevels(r.data))
        api.get('/classes').then(r => setClasses(r.data))
    }, [])

    useEffect(() => {
        if (!selectedTemplateId) {
            setStats([])
            setTemplateName('')
            setTotalAssigned(0)
            return
        }

        setLoading(true)
        const params: any = {}
        if (selectedYear) params.yearId = selectedYear
        if (selectedLevel) params.level = selectedLevel
        if (selectedClass) params.classId = selectedClass

        api.get(`/analytics/skills/${selectedTemplateId}`, { params })
            .then(r => {
                setStats(r.data.stats)
                setTemplateName(r.data.templateName)
                setTotalAssigned(r.data.totalAssigned || 0)
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false))
    }, [selectedTemplateId, selectedYear, selectedLevel, selectedClass])

    const renderLangCell = (stat: SkillStat, langCode: string) => {
        // If allowedLanguages is defined and this lang is NOT in it, show disabled state
        if (stat.allowedLanguages && !stat.allowedLanguages.includes(langCode)) {
            return (
                <td style={{ 
                    padding: '12px 16px', 
                    textAlign: 'center', 
                    background: `repeating-linear-gradient(
                        45deg,
                        #fff1f2,
                        #fff1f2 10px,
                        #ffe4e6 10px,
                        #ffe4e6 20px
                    )`,
                    borderLeft: '1px solid #ffe4e6',
                    borderRight: '1px solid #ffe4e6'
                }}>
                </td>
            )
        }

        const count = stat.languages[langCode] || 0
        const hasData = count > 0

        return (
            <td style={{ padding: '12px 16px', textAlign: 'center', color: hasData ? '#16a34a' : '#cbd5e1', fontWeight: hasData ? 600 : 400 }}>
                {hasData ? count : '-'}
            </td>
        )
    }

    // Filter classes for dropdown
    const filteredClasses = classes.filter(c => {
        if (selectedYear && c.schoolYearId !== selectedYear) return false
        if (selectedLevel && c.level !== selectedLevel) return false
        return true
    })

    return (
        <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <Link to="/admin" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: '#fff', border: '1px solid #ddd', color: '#666' }}>
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 'bold', margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <BarChart3 size={28} color="#2563eb" />
                        Analyse des Compétences
                    </h1>
                    <p style={{ margin: '4px 0 0', color: '#666' }}>
                        Suivi détaillé de l'acquisition des compétences par template
                    </p>
                </div>
            </div>

            {/* Filters Section */}
            <div className="card" style={{ padding: 20, marginBottom: 24, background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    
                    {/* Template Select */}
                    <div style={{ flex: 2, minWidth: 300 }}>
                        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14, color: '#475569' }}>Modèle (Template)</label>
                        <select 
                            value={selectedTemplateId} 
                            onChange={e => setSelectedTemplateId(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                        >
                            <option value="">-- Choisir un modèle --</option>
                            {templates.map(t => (
                                <option key={t._id} value={t._id}>{t.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Year Select */}
                    <div style={{ flex: 1, minWidth: 140 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontWeight: 500, fontSize: 14, color: '#475569' }}>
                            <Calendar size={14} /> Année
                        </label>
                        <select 
                            value={selectedYear} 
                            onChange={e => setSelectedYear(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                        >
                            <option value="">Toutes</option>
                            {years.map(y => (
                                <option key={y._id} value={y._id}>{y.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Level Select */}
                    <div style={{ flex: 1, minWidth: 140 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontWeight: 500, fontSize: 14, color: '#475569' }}>
                            <GraduationCap size={14} /> Niveau
                        </label>
                        <select 
                            value={selectedLevel} 
                            onChange={e => {
                                setSelectedLevel(e.target.value)
                                setSelectedClass('') // Reset class when level changes
                            }}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                        >
                            <option value="">Tous</option>
                            {levels.map(l => (
                                <option key={l._id} value={l.name}>{l.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Class Select */}
                    <div style={{ flex: 1, minWidth: 140 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontWeight: 500, fontSize: 14, color: '#475569' }}>
                            <Users size={14} /> Classe
                        </label>
                        <select 
                            value={selectedClass} 
                            onChange={e => setSelectedClass(e.target.value)}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                        >
                            <option value="">Toutes</option>
                            {filteredClasses.map(c => (
                                <option key={c._id} value={c._id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {loading && (
                <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>Chargement...</div>
            )}

            {!loading && selectedTemplateId && stats.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: '#666', background: '#f8f9fa', borderRadius: 12 }}>
                    Aucune donnée de compétence trouvée pour ce modèle.
                </div>
            )}

            {!loading && stats.length > 0 && (
                <div className="card" style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee', background: '#f8f9fa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: 16 }}>{templateName} - {stats.length} Compétences suivies</h3>
                        <div style={{ fontSize: 14, color: '#64748b' }}>
                            Total Élèves: <strong>{totalAssigned}</strong>
                        </div>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                            <thead>
                                <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                                    <th style={{ textAlign: 'left', padding: '12px 24px', fontWeight: 600 }}>Compétence</th>
                                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600, width: 120 }}>Acquis / Total</th>
                                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600, width: 100 }}>FR 🇫🇷</th>
                                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600, width: 100 }}>EN 🇬🇧</th>
                                    <th style={{ textAlign: 'center', padding: '12px 16px', fontWeight: 600, width: 100 }}>AR 🇱🇧</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.map((stat, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fcfcfc' }}>
                                        <td style={{ padding: '12px 24px', color: '#1e293b' }}>{stat.skillText}</td>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                <span style={{ 
                                                    display: 'inline-flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'center', 
                                                    background: stat.totalStudents > 0 ? '#eff6ff' : '#f1f5f9', 
                                                    color: stat.totalStudents > 0 ? '#2563eb' : '#94a3b8', 
                                                    fontWeight: 600, 
                                                    borderRadius: 20, 
                                                    padding: '4px 12px',
                                                    minWidth: 40
                                                }}>
                                                    {stat.totalStudents}
                                                </span>
                                                <span style={{ color: '#94a3b8', fontSize: 12 }}>/ {totalAssigned}</span>
                                            </div>
                                        </td>
                                        {renderLangCell(stat, 'fr')}
                                        {renderLangCell(stat, 'en')}
                                        {renderLangCell(stat, 'ar')}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
