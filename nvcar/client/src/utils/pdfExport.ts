/**
 * Helper function to open a PDF export with the progress UI
 * @param url - The backend PDF generation URL (without token)
 * @param name - The student or document name to display
 * @param type - 'single' for individual PDF, 'batch' for multiple
 * @param count - Number of documents (for batch exports)
 */
export function openPdfExport(
    url: string,
    name: string = 'Carnet',
    type: 'single' | 'batch' = 'single',
    count: number = 1,
    highQuality: boolean = false
): void {
    // Build progress page URL with parameters
    const progressUrl = new URL('/export-progress', window.location.origin)
    progressUrl.searchParams.set('url', url)
    progressUrl.searchParams.set('name', name)
    progressUrl.searchParams.set('type', type)
    if (count > 1) {
        progressUrl.searchParams.set('count', count.toString())
    }
    if (highQuality) {
        progressUrl.searchParams.set('hq', '1')
    }

    // Open in new tab
    window.open(progressUrl.toString(), '_blank')
}

/**
 * Build the PDF export URL for a single student
 */
export function buildStudentPdfUrl(
    baseUrl: string,
    studentId: string,
    templateId: string
): string {
    const base = baseUrl.replace(/\/$/, '')
    return `${base}/pdf-v2/student/${studentId}?templateId=${templateId}`
}

/**
 * Build the PDF export URL for a template preview
 */
export function buildPreviewPdfUrl(
    baseUrl: string,
    templateId: string,
    studentId: string
): string {
    const base = baseUrl.replace(/\/$/, '')
    const origin = window.location.origin
    return `${base}/pdf-v2/preview/${templateId}/${studentId}?frontendOrigin=${encodeURIComponent(origin)}`
}

/**
 * Build the PDF export URL for a saved gradebook
 */
export function buildSavedGradebookPdfUrl(
    baseUrl: string,
    savedId: string
): string {
    const base = baseUrl.replace(/\/$/, '')
    return `${base}/pdf-v2/saved/${savedId}`
}

/**
 * Build the PDF export URL for an empty template preview
 */
export function buildPreviewEmptyPdfUrl(
    baseUrl: string,
    templateId: string
): string {
    const base = baseUrl.replace(/\/$/, '')
    const origin = window.location.origin
    return `${base}/pdf-v2/preview-empty/${templateId}?frontendOrigin=${encodeURIComponent(origin)}`
}

/**
 * Open a batch PDF export (ZIP) with the progress UI
 * Uses sessionStorage to pass data to the new tab since POST body can't go in URL
 * @param baseUrl - The API base URL
 * @param assignmentIds - Array of assignment IDs to export
 * @param groupLabel - Label for the group (used in filename)
 * @param displayName - Name to display in the progress UI
 */
export function openBatchPdfExport(
    baseUrl: string,
    assignmentIds: string[],
    groupLabel: string,
    displayName: string,
    requestBody: Record<string, unknown> = {},
    highQuality: boolean = false
): void {
    // Generate unique export ID
    const exportId = `batch-${Date.now()}-${Math.random().toString(36).substring(7)}`

    // Store batch data in sessionStorage
    const progressToken = `progress-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`

    const batchData = {
        type: 'batch',
        url: `${baseUrl.replace(/\/$/, '')}/pdf-v2/assignments/zip`,
        progressUrl: `${baseUrl.replace(/\/$/, '')}/pdf-v2/assignments/zip-progress/${encodeURIComponent(progressToken)}`,
        progressToken,
        assignmentIds,
        groupLabel,
        highQuality,
        requestBody: {
            ...requestBody,
            progressToken,
            highQuality
        },
        displayName,
        count: assignmentIds.length
    }
    sessionStorage.setItem(`pdf-export-${exportId}`, JSON.stringify(batchData))

    // Build progress page URL
    const progressUrl = new URL('/export-progress', window.location.origin)
    progressUrl.searchParams.set('exportId', exportId)
    progressUrl.searchParams.set('type', 'batch')
    progressUrl.searchParams.set('name', displayName)
    progressUrl.searchParams.set('count', assignmentIds.length.toString())
    if (highQuality) {
        progressUrl.searchParams.set('hq', '1')
    }

    // Open in new tab
    window.open(progressUrl.toString(), '_blank')
}

