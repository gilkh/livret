import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import './PdfExportProgress.css'

type ExportStatus = 'preparing' | 'generating' | 'downloading' | 'complete' | 'error'

export default function PdfExportProgress() {
    const [searchParams] = useSearchParams()
    const [status, setStatus] = useState<ExportStatus>('preparing')
    const [progress, setProgress] = useState(0)
    const [errorMessage, setErrorMessage] = useState('')
    const [fileName, setFileName] = useState('')
    const [estimatedTime, setEstimatedTime] = useState<number | null>(null)
    const [elapsedTime, setElapsedTime] = useState(0)
    const startTimeRef = useRef<number>(Date.now())
    const abortControllerRef = useRef<AbortController | null>(null)
    const fetchStartedRef = useRef<boolean>(false)

    // Get export parameters from URL
    const exportUrl = searchParams.get('url') || ''
    const exportType = searchParams.get('type') || 'single' // 'single' | 'batch'
    const studentName = searchParams.get('name') || 'Carnet'
    const count = parseInt(searchParams.get('count') || '1', 10)
    const exportId = searchParams.get('exportId') || ''

    // Elapsed time counter
    useEffect(() => {
        const interval = setInterval(() => {
            setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
        }, 1000)
        return () => clearInterval(interval)
    }, [])

    // Estimate time based on progress and elapsed time
    useEffect(() => {
        if (progress > 5 && progress < 100) {
            const remaining = ((elapsedTime / progress) * (100 - progress))
            setEstimatedTime(Math.ceil(remaining))
        }
    }, [progress, elapsedTime])

    useEffect(() => {
        // Prevent running multiple times (React Strict Mode runs effects twice)
        if (fetchStartedRef.current) {
            return
        }
        fetchStartedRef.current = true

        // For batch exports, we need to get data from sessionStorage
        let batchData: any = null
        if (exportType === 'batch' && exportId) {
            const storedData = sessionStorage.getItem(`pdf-export-${exportId}`)
            if (storedData) {
                try {
                    batchData = JSON.parse(storedData)
                    // Clean up sessionStorage after reading
                    sessionStorage.removeItem(`pdf-export-${exportId}`)
                } catch {
                    setStatus('error')
                    setErrorMessage('Données d\'export invalides')
                    return
                }
            } else {
                setStatus('error')
                setErrorMessage('Données d\'export non trouvées')
                return
            }
        } else if (!exportUrl) {
            setStatus('error')
            setErrorMessage('URL d\'export manquante')
            return
        }

        const fetchPdf = async () => {
            abortControllerRef.current = new AbortController()

            try {
                setStatus('generating')
                setProgress(10)

                const token = localStorage.getItem('token') || sessionStorage.getItem('token')
                const origin = window.location.origin

                let response: Response

                if (exportType === 'batch' && batchData) {
                    // Batch export - use POST request
                    const progressInterval = setInterval(() => {
                        setProgress(prev => {
                            if (prev >= 50) {
                                clearInterval(progressInterval)
                                return prev
                            }
                            // Slower progress for batch since it takes longer
                            return prev + Math.random() * 2
                        })
                    }, 1000)

                    response = await fetch(batchData.url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': token ? `Bearer ${token}` : '',
                        },
                        body: JSON.stringify({
                            assignmentIds: batchData.assignmentIds,
                            groupLabel: batchData.groupLabel,
                            frontendOrigin: origin
                        }),
                        signal: abortControllerRef.current.signal
                    })

                    clearInterval(progressInterval)
                } else {
                    // Single export - use GET request
                    let finalUrl = exportUrl
                    if (token && !exportUrl.includes('token=')) {
                        finalUrl += (exportUrl.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`
                    }
                    if (!finalUrl.includes('frontendOrigin=')) {
                        finalUrl += `&frontendOrigin=${encodeURIComponent(origin)}`
                    }

                    const progressInterval = setInterval(() => {
                        setProgress(prev => {
                            if (prev >= 60) {
                                clearInterval(progressInterval)
                                return prev
                            }
                            return prev + Math.random() * 5
                        })
                    }, 500)

                    response = await fetch(finalUrl, {
                        method: 'GET',
                        headers: {
                            'Authorization': token ? `Bearer ${token}` : '',
                        },
                        signal: abortControllerRef.current.signal
                    })

                    clearInterval(progressInterval)
                }

                if (!response.ok) {
                    // Try to extract error message from response
                    let errorText = `Erreur serveur: ${response.status} ${response.statusText}`
                    try {
                        const errorData = await response.json()
                        errorText = errorData.message || errorData.error || errorText
                    } catch {
                        try {
                            errorText = await response.text() || errorText
                        } catch { }
                    }
                    throw new Error(errorText)
                }

                setStatus('downloading')
                setProgress(70)

                // Get content length for progress tracking
                const contentLength = response.headers.get('content-length')
                const total = contentLength ? parseInt(contentLength, 10) : 0

                // Get file name from content-disposition header
                const contentDisposition = response.headers.get('content-disposition') || ''
                const fileNameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
                let downloadFileName = exportType === 'batch'
                    ? `carnets-${(batchData?.groupLabel || studentName).replace(/[^a-zA-Z0-9-_]/g, '_')}.zip`
                    : `${studentName.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`
                if (fileNameMatch && fileNameMatch[1]) {
                    downloadFileName = fileNameMatch[1].replace(/['"]/g, '')
                }
                setFileName(downloadFileName)

                // Read the response as a stream
                const reader = response.body?.getReader()
                if (!reader) {
                    throw new Error('Impossible de lire la réponse')
                }

                const chunks: Uint8Array[] = []
                let receivedLength = 0

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    chunks.push(value)
                    receivedLength += value.length

                    if (total > 0) {
                        const downloadProgress = 70 + (receivedLength / total) * 25
                        setProgress(Math.min(95, downloadProgress))
                    } else {
                        // Indeterminate progress
                        setProgress(prev => Math.min(95, prev + 0.5))
                    }
                }

                // Combine chunks into a single Blob
                let totalLength = 0
                for (const chunk of chunks) {
                    totalLength += chunk.length
                }
                const combined = new Uint8Array(totalLength)
                let offset = 0
                for (const chunk of chunks) {
                    combined.set(chunk, offset)
                    offset += chunk.length
                }
                const contentType = response.headers.get('content-type') || (exportType === 'batch' ? 'application/zip' : 'application/pdf')
                const blob = new Blob([combined.buffer], { type: contentType })

                setProgress(100)
                setStatus('complete')

                // Trigger download
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = downloadFileName
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                window.URL.revokeObjectURL(url)

                // Auto-close after a short delay
                setTimeout(() => {
                    window.close()
                }, 2500)

            } catch (error: any) {
                if (error.name === 'AbortError') {
                    setStatus('error')
                    setErrorMessage('Export annulé')
                } else {
                    setStatus('error')
                    setErrorMessage(error.message || 'Une erreur est survenue')
                }
            }
        }

        fetchPdf()

        // No cleanup abort - this is a dedicated export page
        // Abort only happens when user clicks Cancel button
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleCancel = () => {
        abortControllerRef.current?.abort()
        setStatus('error')
        setErrorMessage('Export annulé')
    }

    const handleRetry = () => {
        setStatus('preparing')
        setProgress(0)
        setErrorMessage('')
        startTimeRef.current = Date.now()
        setElapsedTime(0)
        window.location.reload()
    }

    const handleClose = () => {
        window.close()
    }

    const formatTime = (seconds: number) => {
        if (seconds < 60) return `${seconds}s`
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}m ${secs}s`
    }

    const getStatusMessage = () => {
        switch (status) {
            case 'preparing':
                return 'Préparation de l\'export...'
            case 'generating':
                return exportType === 'batch'
                    ? `Génération de ${count} carnet${count > 1 ? 's' : ''}...`
                    : 'Génération du PDF...'
            case 'downloading':
                return 'Téléchargement en cours...'
            case 'complete':
                return 'Export terminé !'
            case 'error':
                return 'Une erreur est survenue'
            default:
                return 'Export en cours...'
        }
    }

    const getStatusIcon = () => {
        switch (status) {
            case 'complete':
                return (
                    <div className="status-icon success">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </div>
                )
            case 'error':
                return (
                    <div className="status-icon error">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </div>
                )
            default:
                return (
                    <div className="status-icon loading">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                    </div>
                )
        }
    }

    return (
        <div className="pdf-export-container">
            <div className="pdf-export-card">
                {/* Animated background gradient */}
                <div className={`card-background ${status}`} />

                {/* Header */}
                <div className="export-header">
                    <h1>Export PDF</h1>
                    <span className="student-name">{studentName}</span>
                </div>

                {/* Status Icon */}
                <div className="status-section">
                    {getStatusIcon()}
                    <h2 className="status-message">{getStatusMessage()}</h2>

                    {status === 'error' && (
                        <p className="error-detail">{errorMessage}</p>
                    )}
                </div>

                {/* Progress Bar */}
                {status !== 'error' && (
                    <div className="progress-section">
                        <div className="progress-bar-container">
                            <div
                                className={`progress-bar-fill ${status}`}
                                style={{ width: `${progress}%` }}
                            />
                            <div className="progress-glow" style={{ left: `${progress}%` }} />
                        </div>
                        <div className="progress-info">
                            <span className="progress-percentage">{Math.round(progress)}%</span>
                            {estimatedTime !== null && status !== 'complete' && (
                                <span className="time-estimate">
                                    ~{formatTime(estimatedTime)} restant{estimatedTime !== 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* File info */}
                {fileName && status === 'complete' && (
                    <div className="file-info">
                        <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span>{fileName}</span>
                    </div>
                )}

                {/* Elapsed time */}
                <div className="elapsed-time">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>Temps écoulé: {formatTime(elapsedTime)}</span>
                </div>

                {/* Action buttons */}
                <div className="action-buttons">
                    {status === 'error' ? (
                        <>
                            <button className="btn-retry" onClick={handleRetry}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="23 4 23 10 17 10" />
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                </svg>
                                Réessayer
                            </button>
                            <button className="btn-close" onClick={handleClose}>
                                Fermer
                            </button>
                        </>
                    ) : status === 'complete' ? (
                        <button className="btn-close success" onClick={handleClose}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Fermer (auto dans 2s)
                        </button>
                    ) : (
                        <button className="btn-cancel" onClick={handleCancel}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            Annuler
                        </button>
                    )}
                </div>

                {/* Decorative elements */}
                <div className="decorative-circles">
                    <div className="circle circle-1" />
                    <div className="circle circle-2" />
                    <div className="circle circle-3" />
                </div>
            </div>

            {/* Footer tip */}
            <div className="footer-tip">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>Cette fenêtre se fermera automatiquement une fois le téléchargement terminé</span>
            </div>
        </div>
    )
}
