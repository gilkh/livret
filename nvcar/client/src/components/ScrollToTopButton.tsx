import { ArrowUp } from 'lucide-react'

export default function ScrollToTopButton() {
    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        })
    }

    return (
        <button
            onClick={scrollToTop}
            title="Retour en haut"
            style={{
                position: 'fixed',
                right: '20px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 1000,
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'white',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b',
                transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.color = '#3b82f6'
                e.currentTarget.style.borderColor = '#3b82f6'
                e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.color = '#64748b'
                e.currentTarget.style.borderColor = '#e2e8f0'
                e.currentTarget.style.transform = 'translateY(-50%) scale(1)'
            }}
        >
            <ArrowUp size={24} />
        </button>
    )
}
