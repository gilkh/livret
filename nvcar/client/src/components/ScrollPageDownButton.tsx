import { ArrowDown } from 'lucide-react'

export default function ScrollPageDownButton() {
    const scrollDown5Pages = () => {
        // Scroll down by 5 viewport heights
        window.scrollBy({
            top: window.innerHeight * 5,
            behavior: 'smooth'
        })
    }

    return (
        <button
            onClick={scrollDown5Pages}
            title="Descendre de 5 pages"
            style={{
                position: 'fixed',
                right: '20px',
                // Position it below the "Top" button (which is at 50% - translateY(-50%))
                // Let's put this one slightly lower. 
                // If top button is centered vertically, maybe we want this one lower down?
                // The user said "arrow with 5 in it".
                // Let's assume the top button is somewhere visible.
                // ScrollToTopButton in the other files is fixed at top: '50%'.
                // So this one can be top: '50% + 50px' or similar.
                top: 'calc(50% + 50px)',
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
                transition: 'all 0.2s ease',
                flexDirection: 'column',
                gap: 0
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
            <ArrowDown size={18} />
            <span style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: '#3b82f6',
                color: 'white',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }}>5</span>
        </button>
    )
}
