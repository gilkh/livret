import { useEffect, useState } from 'react'
import api from '../api'

const NavPermissionSection = ({ role, label, items, permissions, onToggle }: any) => {
    return (
        <div className="card" style={{ padding: 24, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600, color: '#1e293b' }}>{label} - Menu Navigation</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                {items.map((item: any) => {
                    const isEnabled = permissions[role]?.[item.key] !== false // Default true
                    return (
                        <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input 
                                type="checkbox" 
                                checked={isEnabled} 
                                onChange={() => onToggle(role, item.key)}
                                id={`perm-${role}-${item.key}`}
                                style={{ width: 16, height: 16, cursor: 'pointer' }}
                            />
                            <label htmlFor={`perm-${role}-${item.key}`} style={{ cursor: 'pointer', fontSize: 14, color: '#334155' }}>
                                {item.label}
                            </label>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export default function AdminNavigationVisibility() {
    const [navPermissions, setNavPermissions] = useState<any>({})

    const loadSettings = async () => {
        try {
            const res = await api.get('/settings/public')
            setNavPermissions(res.data.nav_permissions || {})
        } catch (e) {
            console.error(e)
        }
    }

    useEffect(() => {
        loadSettings()
    }, [])

    const toggleNavPermission = async (role: string, key: string) => {
        const newPermissions = { ...navPermissions }
        if (!newPermissions[role]) newPermissions[role] = {}
        
        // Toggle
        const current = newPermissions[role][key] !== false
        newPermissions[role][key] = !current
        
        setNavPermissions(newPermissions)
        
        try {
            await api.post('/settings', {
                key: 'nav_permissions',
                value: newPermissions
            })
        } catch (e) {
            console.error("Error saving permissions", e)
            alert("Erreur lors de la sauvegarde des permissions")
        }
    }

    const teacherItems = [
        { key: 'classes', label: 'Mes Classes' }
    ]

    const subAdminItems = [
        { key: 'dashboard', label: 'Tableau de bord' },
        { key: 'progress', label: 'Progression' },
        { key: 'teacher-progress', label: 'Suivi Enseignants' },
        { key: 'gradebooks', label: 'Carnet' },
        { key: 'eleves', label: 'Élèves' },
        { key: 'signature', label: 'Ma signature' }
    ]

    const aefeItems = [
        { key: 'dashboard', label: 'Tableau de bord' },
        { key: 'progress', label: 'Progression' },
        { key: 'teacher-progress', label: 'Suivi Enseignants' },
        { key: 'gradebooks', label: 'Carnet' }
    ]

    return (
        <div className="container" style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
            <div style={{ marginBottom: 40 }}>
                <h2 style={{ fontSize: 20, marginBottom: 16, color: '#475569' }}>Visibilité Menu Navigation</h2>
                <NavPermissionSection 
                    role="TEACHER" 
                    label="Enseignants" 
                    items={teacherItems} 
                    permissions={navPermissions} 
                    onToggle={toggleNavPermission} 
                />
                <NavPermissionSection 
                    role="SUBADMIN" 
                    label="Préfets" 
                    items={subAdminItems} 
                    permissions={navPermissions} 
                    onToggle={toggleNavPermission} 
                />
                <NavPermissionSection 
                    role="AEFE" 
                    label="RPP ET DIRECTION" 
                    items={aefeItems} 
                    permissions={navPermissions} 
                    onToggle={toggleNavPermission} 
                />
            </div>
        </div>
    )
}
