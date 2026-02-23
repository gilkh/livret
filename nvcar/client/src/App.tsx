import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import api from './api'
import Login from './pages/Login'
import AdminLogin from './pages/AdminLogin'
import AdminDashboard from './pages/AdminDashboard'
import AdminGradebooks from './pages/AdminGradebooks'
import TeacherDashboard from './pages/TeacherDashboard'
import StudentPage from './pages/StudentPage'
import Users from './pages/Users'
import Templates from './pages/Templates'
import AdminResources from './pages/AdminResources'
import TemplateBuilder from './pages/TemplateBuilder'
import NavBar from './components/NavBar'
import ImpersonationBanner from './components/ImpersonationBanner'
import AdminMedia from './pages/AdminMedia'
import TeacherClassView from './pages/TeacherClassView'
import TeacherStudentTemplates from './pages/TeacherStudentTemplates'
import TeacherTemplateEditor from './pages/TeacherTemplateEditor'
import TeacherQuickGrading from './pages/TeacherQuickGrading'
import SubAdminDashboard from './pages/SubAdminDashboard'
import SubAdminTeacherView from './pages/SubAdminTeacherView'
import SubAdminTemplateReview from './pages/SubAdminTemplateReview'
import SubAdminSignature from './pages/SubAdminSignature'
import SubAdminStudents from './pages/SubAdminStudents'
import SubAdminProgress from './pages/SubAdminProgress'
import SubAdminTeacherProgress from './pages/SubAdminTeacherProgress'
import SubAdminMyTeachers from './pages/SubAdminMyTeachers'
import SubAdminGradebooks from './pages/SubAdminGradebooks'
import AdminAssignments from './pages/AdminAssignments'
import AdminAssignmentList from './pages/AdminAssignmentList'
import AdminAuditLogs from './pages/AdminAuditLogs'
import AdminSuggestions from './pages/AdminSuggestions'
import AdminClasses from './pages/AdminClasses'
import AdminSchoolYears from './pages/AdminSchoolYears'
import AdminStudents from './pages/AdminStudents'
import AdminAnalytics from './pages/AdminAnalytics'
import AdminSettings from './pages/AdminSettings'
import CarnetPrint from './pages/CarnetPrint'
import AdminProgress from './pages/AdminProgress'
import AdminPermissions from './pages/AdminPermissions'
import AdminOnlineUsers from './pages/AdminOnlineUsers'
import AdminAllGradebooks from './pages/AdminAllGradebooks'
import AdminGradebookReview from './pages/AdminGradebookReview'
import AdminSignatures from './pages/AdminSignatures'
import AdminGlobalPermissions from './pages/AdminGlobalPermissions'
import AdminNavigationVisibility from './pages/AdminNavigationVisibility'
import AdminBlockVisibility from './pages/AdminBlockVisibility'
import AdminStudentPromotions from './pages/AdminStudentPromotions'
import AdminPsOnboarding from './pages/AdminPsOnboarding'
import AdminSkillAnalytics from './pages/AdminSkillAnalytics'
import SubAdminSemesterRequest from './pages/SubAdminSemesterRequest'
import SuggestionGradebookTemplates from './pages/SuggestionGradebookTemplates'
import AdminMonitoring from './pages/AdminMonitoring'
import AdminClassTeacherCoverage from './pages/AdminClassTeacherCoverage'
import SystemAlertBanner from './components/SystemAlertBanner'
import SimulationLab from './pages/SimulationLab'
import Toast, { ToastType } from './components/Toast'
import MobileBlocker from './components/MobileBlocker'
import PdfExportProgress from './pages/PdfExportProgress'

const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const location = useLocation()

  let token = sessionStorage.getItem('token') || localStorage.getItem('token')
  if (!token) {
    const params = new URLSearchParams(location.search || '')
    const tokenParam = params.get('token')
    if (tokenParam) {
      sessionStorage.setItem('token', tokenParam)
      token = tokenParam
    }
  }

  if (token) {
    return children
  }

  const search = location.search || ''
  // Preserve query params (e.g., Microsoft OAuth code) when redirecting to login
  return <Navigate to={`/login${search}`} replace />
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()

  const [authToken, setAuthToken] = useState<string | null>(() => sessionStorage.getItem('token') || localStorage.getItem('token'))
  const [extendBusy, setExtendBusy] = useState(false)
  const [globalToast, setGlobalToast] = useState<{
    message: string;
    type: ToastType;
    duration?: number;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null)

  // Mobile blocking settings
  const [mobileBlockEnabled, setMobileBlockEnabled] = useState(false)
  const [mobileMinWidth, setMobileMinWidth] = useState(1024)
  const [schoolName, setSchoolName] = useState('')

  const sessionTimersRef = useRef<number[]>([])

  const clearStoredAuth = () => {
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('role')
    sessionStorage.removeItem('displayName')
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('displayName')
  }

  const decodeJwtExpMs = (token: string) => {
    try {
      const part = token.split('.')[1]
      if (!part) return null
      const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
      const pad = (4 - (base64.length % 4)) % 4
      const json = JSON.parse(atob(base64 + '='.repeat(pad)))
      const expSec = Number(json?.exp)
      if (!Number.isFinite(expSec)) return null
      return expSec * 1000
    } catch {
      return null
    }
  }

  const extendSession = async () => {
    if (extendBusy) return
    setExtendBusy(true)
    try {
      const r = await api.post('/auth/extend')
      const token = r.data?.token
      if (!token) throw new Error('missing_token')

      if (sessionStorage.getItem('token')) sessionStorage.setItem('token', token)
      else localStorage.setItem('token', token)

      setAuthToken(token)
      setGlobalToast({ message: 'Session extended by 30 minutes.', type: 'success', duration: 4000 })
    } catch (e) {
      setGlobalToast({ message: 'Unable to extend session.', type: 'error', duration: 5000 })
    } finally {
      setExtendBusy(false)
    }
  }

  useEffect(() => {
    const syncToken = () => {
      const next = sessionStorage.getItem('token') || localStorage.getItem('token')
      setAuthToken(prev => (prev === next ? prev : next))
    }

    syncToken()
    const id = window.setInterval(syncToken, 3000)
    return () => window.clearInterval(id)
  }, [])

  // Fetch mobile blocking settings from public endpoint
  useEffect(() => {
    const fetchMobileSettings = async () => {
      try {
        const res = await api.get('/settings/public')
        setMobileBlockEnabled(res.data.mobile_block_enabled === true)
        setMobileMinWidth(res.data.mobile_min_width || 1024)
        setSchoolName(res.data.school_name || '')
      } catch (err) {
        // If fetch fails, default to not blocking
        console.error('Failed to fetch mobile settings:', err)
      }
    }
    fetchMobileSettings()
  }, [])

  useEffect(() => {
    sessionTimersRef.current.forEach(id => window.clearTimeout(id))
    sessionTimersRef.current = []

    if (!authToken) {
      setGlobalToast(null)
      return
    }

    const expMs = decodeJwtExpMs(authToken)
    if (!expMs) return

    const scheduleAt = (atMs: number, fn: () => void) => {
      const delay = atMs - Date.now()
      if (delay <= 0) return
      const id = window.setTimeout(fn, delay)
      sessionTimersRef.current.push(id)
    }

    for (const minutes of [5, 4, 3, 2, 1]) {
      scheduleAt(expMs - minutes * 60 * 1000, () => {
        setGlobalToast({
          message: `Your session will expire in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
          type: 'info',
          duration: 59000,
          actionLabel: 'Extend +30 min',
          onAction: extendSession,
        })
      })
    }

    scheduleAt(expMs, () => {
      clearStoredAuth()
      setAuthToken(null)
      if (window.location.pathname !== '/login') {
        window.location.href = '/login' + window.location.search
      }
    })

    return () => {
      sessionTimersRef.current.forEach(id => window.clearTimeout(id))
      sessionTimersRef.current = []
    }
  }, [authToken])

  // Hide navbar on login, print, and export progress pages
  const showNavBar = location.pathname !== '/login' && location.pathname !== '/admin/login' && !location.pathname.startsWith('/print/') && location.pathname !== '/export-progress'
  const showMobileBlocker = mobileBlockEnabled && !location.pathname.startsWith('/print/')

  return (
    <>
      {/* Mobile blocker overlay - shows when screen is too small */}
      {showMobileBlocker && <MobileBlocker minWidth={mobileMinWidth} schoolName={schoolName} />}

      <SystemAlertBanner />
      {showNavBar && (
        <>
          <ImpersonationBanner />
          <NavBar />
        </>
      )}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        {/* Print route without auth/navbar for PDF generation */}
        <Route path="/print/carnet/:assignmentId" element={<CarnetPrint />} />
        <Route path="/print/saved/:savedId" element={<CarnetPrint mode="saved" />} />
        <Route path="/print/preview/:templateId/student/:studentId" element={<CarnetPrint mode="preview" />} />
        <Route path="/print/preview-empty/:templateId" element={<CarnetPrint mode="preview" />} />
        {/* PDF export progress page - no auth required, handles its own token */}
        <Route path="/export-progress" element={<PdfExportProgress />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <TeacherDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <RequireAuth>
              <AdminSettings />
            </RequireAuth>
          }
        />
        <Route
          path="/simulation-lab"
          element={
            <RequireAuth>
              <SimulationLab />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/ressource"
          element={
            <RequireAuth>
              <AdminResources />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/media"
          element={
            <RequireAuth>
              <AdminMedia />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAuth>
              <Users />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/templates"
          element={
            <RequireAuth>
              <Templates />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/template-builder"
          element={
            <RequireAuth>
              <TemplateBuilder />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/gradebooks"
          element={
            <RequireAuth>
              <AdminGradebooks />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/assignments"
          element={
            <RequireAuth>
              <AdminAssignments />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/assignment-list"
          element={
            <RequireAuth>
              <AdminAssignmentList />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/skill-analytics"
          element={
            <RequireAuth>
              <AdminSkillAnalytics />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/audit-logs"
          element={
            <RequireAuth>
              <AdminAuditLogs />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/suggestions"
          element={
            <RequireAuth>
              <AdminSuggestions />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/classes"
          element={
            <RequireAuth>
              <AdminClasses />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/school-years"
          element={
            <RequireAuth>
              <AdminSchoolYears />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/students"
          element={
            <RequireAuth>
              <AdminStudents />
            </RequireAuth>
          }
        />
        <Route
          path="/student/:id"
          element={
            <RequireAuth>
              <StudentPage />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/classes"
          element={
            <RequireAuth>
              <TeacherDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/classes/:classId"
          element={
            <RequireAuth>
              <TeacherClassView />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/students/:studentId/templates"
          element={
            <RequireAuth>
              <TeacherStudentTemplates />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/templates/:assignmentId/edit"
          element={
            <RequireAuth>
              <TeacherTemplateEditor />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/templates/:assignmentId/quick"
          element={
            <RequireAuth>
              <TeacherQuickGrading />
            </RequireAuth>
          }
        />
        <Route
          path="/subadmin/dashboard"
          element={
            <RequireAuth>
              <SubAdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/subadmin/teachers/:teacherId"
          element={
            <RequireAuth>
              <SubAdminTeacherView />
            </RequireAuth>
          }
        />
        <Route
          path="/subadmin/templates/:assignmentId/review"
          element={
            <RequireAuth>
              <SubAdminTemplateReview />
            </RequireAuth>
          }
        />
        <Route
          path="/subadmin/signature"
          element={
            <RequireAuth>
              <SubAdminSignature />
            </RequireAuth>
          }
        />
        <Route
          path="/subadmin/eleves"
          element={
            <RequireAuth>
              <SubAdminStudents />
            </RequireAuth>
          }
        />
        <Route
          path="/subadmin/progress"
          element={
            <RequireAuth>
              <SubAdminProgress />
            </RequireAuth>
          }
        />
        <Route
          path="/subadmin/teacher-progress"
          element={
            <RequireAuth>
              <SubAdminTeacherProgress />
            </RequireAuth>
          }
        />
        <Route
          path="/subadmin/my-teachers"
          element={
            <RequireAuth>
              <SubAdminMyTeachers />
            </RequireAuth>
          }
        />
        <Route
          path="/subadmin/gradebooks"
          element={
            <RequireAuth>
              <SubAdminGradebooks />
            </RequireAuth>
          }
        />
        <Route
          path="/subadmin/semester-request"
          element={
            <RequireAuth>
              <SubAdminSemesterRequest />
            </RequireAuth>
          }
        />
        <Route
          path="/subadmin/suggestion"
          element={
            <RequireAuth>
              <SubAdminSemesterRequest />
            </RequireAuth>
          }
        />
        <Route
          path="/subadmin/suggestion/gradebooks"
          element={
            <RequireAuth>
              <SuggestionGradebookTemplates />
            </RequireAuth>
          }
        />
        <Route
          path="/aefe/dashboard"
          element={
            <RequireAuth>
              <SubAdminDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/aefe/teachers/:teacherId"
          element={
            <RequireAuth>
              <SubAdminTeacherView />
            </RequireAuth>
          }
        />
        <Route
          path="/aefe/templates/:assignmentId/review"
          element={
            <RequireAuth>
              <SubAdminTemplateReview />
            </RequireAuth>
          }
        />
        <Route
          path="/aefe/progress"
          element={
            <RequireAuth>
              <SubAdminProgress />
            </RequireAuth>
          }
        />
        <Route
          path="/aefe/teacher-progress"
          element={
            <RequireAuth>
              <SubAdminTeacherProgress />
            </RequireAuth>
          }
        />
        <Route
          path="/aefe/my-teachers"
          element={
            <RequireAuth>
              <SubAdminMyTeachers />
            </RequireAuth>
          }
        />
        <Route
          path="/aefe/gradebooks"
          element={
            <RequireAuth>
              <SubAdminGradebooks />
            </RequireAuth>
          }
        />
        <Route
          path="/aefe/suggestion"
          element={
            <RequireAuth>
              <SubAdminSemesterRequest />
            </RequireAuth>
          }
        />
        <Route
          path="/aefe/suggestion/gradebooks"
          element={
            <RequireAuth>
              <SuggestionGradebookTemplates />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/analytics"
          element={
            <RequireAuth>
              <AdminAnalytics />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/progress"
          element={
            <RequireAuth>
              <AdminProgress />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/signatures"
          element={
            <RequireAuth>
              <AdminSignatures />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/permissions"
          element={
            <RequireAuth>
              <AdminPermissions />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/global-permissions"
          element={
            <RequireAuth>
              <AdminGlobalPermissions />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/navigation-visibility"
          element={
            <RequireAuth>
              <AdminNavigationVisibility />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/block-visibility"
          element={
            <RequireAuth>
              <AdminBlockVisibility />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/student-promotions"
          element={
            <RequireAuth>
              <AdminStudentPromotions />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/ps-onboarding"
          element={
            <RequireAuth>
              <AdminPsOnboarding />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/all-gradebooks"
          element={
            <RequireAuth>
              <AdminAllGradebooks />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/gradebooks/:assignmentId/review"
          element={
            <RequireAuth>
              <AdminGradebookReview />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/online-users"
          element={
            <RequireAuth>
              <AdminOnlineUsers />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/monitoring"
          element={
            <RequireAuth>
              <AdminMonitoring />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/class-teacher-coverage"
          element={
            <RequireAuth>
              <AdminClassTeacherCoverage />
            </RequireAuth>
          }
        />
      </Routes>
      {globalToast && (
        <Toast
          message={globalToast.message}
          type={globalToast.type}
          duration={globalToast.duration}
          onAction={globalToast.onAction}
          actionLabel={globalToast.actionLabel}
          actionDisabled={extendBusy}
          onClose={() => setGlobalToast(null)}
        />
      )}
    </>
  )
}
