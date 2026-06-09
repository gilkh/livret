import { User, Calendar, Hash, Phone, Clock, Trash2, Mail, Edit2, Crop, Trash, Upload, UserMinus, UserPlus, Undo2 } from 'lucide-react'
import { useRef, useState, useEffect } from 'react'
import ImageCropper from '../ImageCropper'
import { getCroppedImg } from '../../utils/imageUtils'

type YearOption = { _id: string; name: string; active: boolean }
type ClassOption = { _id: string; name: string; level: string; schoolYearId: string }

interface StudentDetailsProps {
  student: any
  history: any[]
  onPhotoUpload: (file: File) => void
  onPhotoRemove: (studentId: string) => void
  onDelete?: (studentId: string) => void
  onEdit?: () => void
  onMarkLeft?: (studentId: string) => void
  onReturnStudent?: (studentId: string, yearId: string, classId?: string) => void
  onUndoLeft?: (studentId: string) => void
  availableYears?: YearOption[]
  availableClasses?: ClassOption[]
}

export default function StudentDetails({ student, history, onPhotoUpload, onPhotoRemove, onDelete, onEdit, onMarkLeft, onReturnStudent, onUndoLeft, availableYears, availableClasses }: StudentDetailsProps) {
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showLeftConfirm, setShowLeftConfirm] = useState(false)
  const [markingLeft, setMarkingLeft] = useState(false)
  const [returnYearId, setReturnYearId] = useState('')
  const [returnClassId, setReturnClassId] = useState('')

  // Cropping State
  const [imageToCrop, setImageToCrop] = useState<string | null>(null)
  const [isCropping, setIsCropping] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Initialize return year when a left student is selected (MUST be before early return)
  useEffect(() => {
    if (student?.status === 'left' && availableYears && availableYears.length > 0) {
      const activeYear = availableYears.find(y => y.active)
      setReturnYearId(activeYear ? activeYear._id : availableYears[availableYears.length - 1]._id)
      setReturnClassId('')
    }
  }, [student?._id, student?.status])

  if (!student) {
    return (
      <div className="card" style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', textAlign: 'center' }}>
        <div>
          <div style={{ background: '#f1f5f9', borderRadius: '50%', padding: 24, marginBottom: 16, display: 'inline-flex' }}>
            <User size={48} />
          </div>
          <p style={{ fontSize: 16, fontWeight: 500 }}>Sélectionnez un élève pour voir les détails</p>
        </div>
      </div>
    )
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setDeleting(true)
    try {
      await onDelete(student._id)
      setShowDeleteConfirm(false)
    } catch (e) {
      console.error('Delete failed:', e)
    } finally {
      setDeleting(false)
    }
  }

  const handleMarkLeft = async () => {
    if (!onMarkLeft) return
    setMarkingLeft(true)
    try {
      await onMarkLeft(student._id)
      setShowLeftConfirm(false)
    } catch (e) {
      console.error('Mark left failed:', e)
    } finally {
      setMarkingLeft(false)
    }
  }

  // Filter classes for the selected return year
  const returnYearClasses = (availableClasses || []).filter(c => c.schoolYearId === returnYearId)
  const classesByLevel: Record<string, ClassOption[]> = {}
  returnYearClasses.forEach(c => {
    const level = c.level || 'Autre'
    if (!classesByLevel[level]) classesByLevel[level] = []
    classesByLevel[level].push(c)
  })
  const sortedReturnLevels = Object.keys(classesByLevel).sort()

  const handleReturn = () => {
    if (!onReturnStudent) return
    onReturnStudent(student._id, returnYearId, returnClassId || undefined)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      const reader = new FileReader()
      reader.addEventListener('load', () => {
        setImageToCrop(reader.result as string)
        setIsCropping(true)
      })
      reader.readAsDataURL(file)
    }
    // Reset input value so same file can be selected again
    e.target.value = ''
  }

  const handleCropComplete = async (cropData: { x: number; y: number; width: number; height: number }) => {
    if (!imageToCrop) return
    setProcessing(true)
    try {
      const croppedBlob = await getCroppedImg(imageToCrop, cropData)
      if (croppedBlob) {
        const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' })
        onPhotoUpload(file)
      }
      setIsCropping(false)
      setImageToCrop(null)
    } catch (e) {
      console.error('Cropping failed:', e)
      alert('Erreur lors du recadrage de l\'image')
    } finally {
      setProcessing(false)
    }
  }

  const handleEditCurrentPhoto = () => {
    if (student.avatarUrl) {
      setImageToCrop(student.avatarUrl)
      setIsCropping(true)
    }
  }

  return (
    <div className="card" style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: 0 }}>
      {/* Header with Photo */}
      <div style={{ padding: '32px 20px', background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)', textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'relative', width: 100, height: 130, margin: '0 auto 16px' }}>
          <div
            style={{
              width: '100%', height: '100%', borderRadius: 12,
              background: 'white', overflow: 'hidden', position: 'relative',
              cursor: 'pointer', border: '4px solid white', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)'
            }}
            onClick={() => photoInputRef.current?.click()}
          >
            {student.avatarUrl ? (
              <img src={student.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={48} color="#cbd5e1" />
              </div>
            )}
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: 10, padding: 6,
              backdropFilter: 'blur(4px)', fontWeight: 500
            }}>
              {student.avatarUrl ? 'CHANGER' : 'UPLOADER'}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div style={{
            position: 'absolute',
            bottom: -10,
            right: -10,
            display: 'flex',
            gap: 4
          }}>
            {student.avatarUrl && (
              <>
                <button
                  onClick={handleEditCurrentPhoto}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: '#3b82f6', color: 'white', border: '2px solid white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    transition: 'transform 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  title="Recadrer"
                >
                  <Crop size={14} />
                </button>
                <button
                  onClick={() => onPhotoRemove(student._id)}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: '#ef4444', color: 'white', border: '2px solid white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    transition: 'transform 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                  onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  title="Supprimer la photo"
                >
                  <Trash size={14} />
                </button>
              </>
            )}
            {!student.avatarUrl && (
              <button
                onClick={() => photoInputRef.current?.click()}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: '#10b981', color: 'white', border: '2px solid white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  transition: 'transform 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                title="Uploader une photo"
              >
                <Upload size={14} />
              </button>
            )}
          </div>
        </div>

        <h2 style={{ margin: '0 0 4px', fontSize: 20, color: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {student.firstName} {student.lastName}
          {onEdit && (
            <button onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', padding: 4 }} title="Modifier les infos">
              <Edit2 size={16} />
            </button>
          )}
        </h2>
        <div style={{ color: '#64748b', fontWeight: 500 }}>{student.className || 'Non assigné'}</div>

        <input type="file" ref={photoInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileChange} />
      </div>

      {isCropping && imageToCrop && (
        <ImageCropper
          imageUrl={imageToCrop}
          onCancel={() => {
            setIsCropping(false)
            setImageToCrop(null)
          }}
          onCropComplete={handleCropComplete}
        />
      )}

      {processing && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 11000, backdropFilter: 'blur(4px)'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div className="spinner" style={{ width: 40, height: 40, border: '4px solid #f3f3f3', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }}></div>
            <p style={{ fontWeight: 600, color: '#1e293b' }}>Traitement de l'image...</p>
          </div>
          <style>{`
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Info Card */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Informations</div>
            {onEdit && (
              <button
                onClick={onEdit}
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#334155',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Edit2 size={14} />
                Modifier
              </button>
            )}
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: 'white', padding: 8, borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' }}><Calendar size={16} color="#6c5ce7" /></div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Date de naissance</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>{new Date(student.dateOfBirth).toLocaleDateString()}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: 'white', padding: 8, borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' }}><Hash size={16} color="#6c5ce7" /></div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Identifiant (ID)</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#1e293b', fontFamily: 'monospace' }}>{student.logicalKey}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: 'white', padding: 8, borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' }}><Phone size={16} color="#6c5ce7" /></div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Parent / Contact</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>
                    {student.fatherName || student.parentName || 'Non renseigné'}
                    {student.parentPhone && <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 4 }}>({student.parentPhone})</span>}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: 'white', padding: 8, borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' }}><Mail size={16} color="#6c5ce7" /></div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Emails</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div>Père: {student.fatherEmail || '—'}</div>
                    <div>Mère: {student.motherEmail || '—'}</div>
                    <div>Élève: {student.studentEmail || '—'}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: 'white', padding: 8, borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)' }}><User size={16} color="#6c5ce7" /></div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>Sexe</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#1e293b' }}>
                    {student.sex === 'female' ? 'Fille' : student.sex === 'male' ? 'Garcon' : 'Non renseigne'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* History Card */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>Historique Scolaire</div>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 4, border: '1px solid #e2e8f0' }}>
            {history.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {history.map((h, i) => (
                  <div key={i} style={{
                    padding: 12,
                    borderBottom: i === history.length - 1 ? 'none' : '1px solid #e2e8f0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ background: 'white', padding: 6, borderRadius: 6 }}><Clock size={14} color="#94a3b8" /></div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{h.year}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{h.className}</div>
                      </div>
                    </div>
                    <div className={`pill ${h.promotionStatus === 'promoted' ? 'green' : h.promotionStatus === 'retained' ? 'red' : 'grey'}`} style={{ fontSize: 10, height: 'fit-content', padding: '4px 8px' }}>
                      {h.promotionStatus === 'promoted' ? 'Promu' : h.promotionStatus === 'retained' ? 'Retenu' : h.promotionStatus}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic', fontSize: 13 }}>Aucun historique disponible</div>
            )}
          </div>
        </div>

        {/* Return/Undo Card — shown for left students */}
        {student.status === 'left' && (onReturnStudent || onUndoLeft) && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>Réintégration</div>
            <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 16, border: '1px solid #bbf7d0' }}>
              {onReturnStudent && availableYears && (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 4 }}>Année scolaire:</label>
                    <select
                      value={returnYearId}
                      onChange={e => { setReturnYearId(e.target.value); setReturnClassId('') }}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', fontSize: 13 }}
                    >
                      {availableYears.map(y => (
                        <option key={y._id} value={y._id}>{y.name} {y.active ? '(Active)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: '#475569', fontWeight: 600, display: 'block', marginBottom: 4 }}>Classe (optionnel):</label>
                    <select
                      value={returnClassId}
                      onChange={e => setReturnClassId(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', fontSize: 13 }}
                    >
                      <option value="">Non assigné</option>
                      {sortedReturnLevels.map(level => (
                        <optgroup key={level} label={level}>
                          {classesByLevel[level].map(c => (
                            <option key={c._id} value={c._id}>{c.name}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleReturn}
                    disabled={!returnYearId}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: 8,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontWeight: 600,
                      fontSize: 14,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#059669'}
                    onMouseLeave={e => e.currentTarget.style.background = '#10b981'}
                  >
                    <UserPlus size={16} />
                    Réintégrer l'élève
                  </button>
                  <p style={{ fontSize: 11, color: '#065f46', marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
                    {returnClassId
                      ? "L'élève sera directement affecté à la classe sélectionnée."
                      : "L'élève sera placé dans \"En attente d'affectation\"."}
                  </p>
                </>
              )}
              {onUndoLeft && (
                <button
                  onClick={() => onUndoLeft(student._id)}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    marginTop: 10,
                    background: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    fontWeight: 600,
                    fontSize: 13,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
                >
                  <Undo2 size={14} />
                  Annuler le départ
                </button>
              )}
            </div>
          </div>
        )}

        {/* Mark as Left Card — shown for active students */}
        {onMarkLeft && student.status !== 'left' && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>Départ</div>
            <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16, border: '1px solid #fde68a' }}>
              <button
                onClick={() => setShowLeftConfirm(true)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontWeight: 600,
                  fontSize: 14,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#d97706'}
                onMouseLeave={e => e.currentTarget.style.background = '#f59e0b'}
              >
                <UserMinus size={16} />
                Il a quitté l'école
              </button>
              <p style={{ fontSize: 11, color: '#92400e', marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
                L'élève sera retiré de sa classe et son carnet sera archivé.
              </p>
            </div>
          </div>
        )}

        {/* Actions Card */}
        {onDelete && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>Actions</div>
            <div style={{ background: '#fef2f2', borderRadius: 12, padding: 16, border: '1px solid #fecaca' }}>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontWeight: 600,
                  fontSize: 14,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#dc2626'}
                onMouseLeave={e => e.currentTarget.style.background = '#ef4444'}
              >
                <Trash2 size={16} />
                Supprimer l'élève
              </button>
              <p style={{ fontSize: 11, color: '#991b1b', marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
                Cette action est irréversible et supprimera toutes les données de l'élève.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: 16,
            padding: 24,
            maxWidth: 400,
            width: '90%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <h3 style={{ margin: '0 0 12px', color: '#1e293b' }}>Confirmer la suppression</h3>
            <p style={{ color: '#64748b', marginBottom: 24 }}>
              Êtes-vous sûr de vouloir supprimer <strong>{student.firstName} {student.lastName}</strong>?
              <br /><br />
              Cette action supprimera définitivement:
            </p>
            <ul style={{ color: '#64748b', marginBottom: 24, paddingLeft: 20 }}>
              <li>Les informations de l'élève</li>
              <li>Toutes les inscriptions</li>
              <li>Les compétences acquises</li>
              <li>Les carnets et signatures</li>
            </ul>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  opacity: deleting ? 0.7 : 1
                }}
              >
                {deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Left Confirmation Modal */}
      {showLeftConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            borderRadius: 16,
            padding: 24,
            maxWidth: 400,
            width: '90%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <h3 style={{ margin: '0 0 12px', color: '#92400e' }}>Il a quitté l'école</h3>
            <p style={{ color: '#64748b', marginBottom: 24 }}>
              Êtes-vous sûr de vouloir marquer <strong>{student.firstName} {student.lastName}</strong> comme ayant quitté l'école?
              <br /><br />
              Cette action va:
            </p>
            <ul style={{ color: '#64748b', marginBottom: 24, paddingLeft: 20 }}>
              <li>Retirer l'élève de sa classe actuelle</li>
              <li>Archiver son carnet (snapshot)</li>
              <li>Le placer dans la liste "Élèves partis"</li>
            </ul>
            <p style={{ fontSize: 12, color: '#059669', marginBottom: 24 }}>
              ✓ Vous pourrez annuler cette action ou réintégrer l'élève plus tard.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowLeftConfirm(false)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleMarkLeft}
                disabled={markingLeft}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  background: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: markingLeft ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  opacity: markingLeft ? 0.7 : 1
                }}
              >
                {markingLeft ? 'En cours...' : 'Confirmer le départ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

