import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
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
import AdminStudentPromotions from './pages/AdminStudentPromotions'
import AdminSkillAnalytics from './pages/AdminSkillAnalytics'
import SubAdminSemesterRequest from './pages/SubAdminSemesterRequest'
import SuggestionGradebookTemplates from './pages/SuggestionGradebookTemplates'
import AdminMonitoring from './pages/AdminMonitoring'
import SystemAlertBanner from './components/SystemAlertBanner'
import SimulationLab from './pages/SimulationLab'

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

  // Hide navbar on login and print pages
  const showNavBar = location.pathname !== '/login' && location.pathname !== '/admin/login' && !location.pathname.startsWith('/print/')

  return (
    <>
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
          path="/admin/student-promotions"
          element={
            <RequireAuth>
              <AdminStudentPromotions />
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
      </Routes>
    </>
  )
}
