import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Login from './pages/Login'
import AdminDashboard from './pages/AdminDashboard'
import AdminGradebooks from './pages/AdminGradebooks'
import TeacherDashboard from './pages/TeacherDashboard'
import StudentPage from './pages/StudentPage'
import Users from './pages/Users'
import Templates from './pages/Templates'
import AdminResources from './pages/AdminResources'
import TemplateBuilder from './pages/TemplateBuilder'
import NavBar from './components/NavBar'
import AdminMedia from './pages/AdminMedia'

const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  const navigate = useNavigate()
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/login" element={<Login />} />
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
          path="/student/:id"
          element={
            <RequireAuth>
              <StudentPage />
            </RequireAuth>
          }
        />
      </Routes>
    </>
  )
}
