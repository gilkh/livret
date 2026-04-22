import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminResources from './AdminResources';
import AdminStudents from './AdminStudents';
import { School, Users } from 'lucide-react';
import './AdminResources.css'; // For basic layout resets if needed

export default function AdminResourceCenter() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const queryParams = new URLSearchParams(location.search);
  const currentTab = queryParams.get('tab') || 'structure';

  const setTab = (tab: string) => {
    navigate(`/admin/ressource?tab=${tab}`, { replace: true });
  };

  return (
    <div className="resource-center-wrapper" style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
      
      {/* Page Header */}
      <div style={{ background: '#fff', padding: '24px 32px 0 32px', borderBottom: '1px solid #e2e8f0' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', color: '#0f172a' }}>Ressources & Élèves</h1>
        <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '14px' }}>
          Gérez l'organisation de l'école, les classes, et le dossier détaillé de chaque élève.
        </p>

        {/* Top Navigation Tabs */}
        <div style={{ display: 'flex', gap: '32px' }}>
          <button 
            onClick={() => setTab('structure')}
            style={{
              padding: '0 0 16px 0',
              background: 'none',
              border: 'none',
              borderBottom: currentTab === 'structure' ? '3px solid #3b82f6' : '3px solid transparent',
              color: currentTab === 'structure' ? '#3b82f6' : '#64748b',
              fontWeight: currentTab === 'structure' ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '15px',
              transition: 'all 0.2s'
            }}
          >
            <School size={18} />
            Structure & Affectations
          </button>
          <button 
            onClick={() => setTab('students')}
            style={{
              padding: '0 0 16px 0',
              background: 'none',
              border: 'none',
              borderBottom: currentTab === 'students' ? '3px solid #3b82f6' : '3px solid transparent',
              color: currentTab === 'students' ? '#3b82f6' : '#64748b',
              fontWeight: currentTab === 'students' ? 600 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '15px',
              transition: 'all 0.2s'
            }}
          >
            <Users size={18} />
            Détails Élèves & Photos
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="rc-content-area" style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {/* We keep both mounted but hidden to maintain state if needed, or mount/unmount.
            Mount/unmount is better to ensure data refresh on tab switch. */}
        {currentTab === 'structure' && <AdminResources isTab={true} />}
        {currentTab === 'students' && <AdminStudents isTab={true} />}
      </div>
    </div>
  );
}
