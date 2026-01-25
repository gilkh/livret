export function formatDdMmYyyy(dateInput: Date | string | number | null | undefined): string {
    if (!dateInput) return ''
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput)
    if (Number.isNaN(d.getTime())) return ''
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = String(d.getFullYear())
    return `${dd}/${mm}/${yyyy}`
}

const FRENCH_MONTHS = [
    'Janvier',
    'Février',
    'Mars',
    'Avril',
    'Mai',
    'Juin',
    'Juillet',
    'Août',
    'Septembre',
    'Octobre',
    'Novembre',
    'Décembre'
]

export function formatDdMonthYyyy(dateInput: Date | string | number | null | undefined): string {
    if (!dateInput) return ''
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput)
    if (Number.isNaN(d.getTime())) return ''
    const dd = String(d.getUTCDate()).padStart(2, '0')
    const month = FRENCH_MONTHS[d.getUTCMonth()] || ''
    const yyyy = String(d.getUTCFullYear())
    return month ? `${dd} ${month} ${yyyy}` : `${dd}/${String(d.getMonth() + 1).padStart(2, '0')}/${yyyy}`
}

// Backward-compatible name (was previously colon-separated, now slash-separated).
export const formatDdMmYyyyColon = formatDdMmYyyy
