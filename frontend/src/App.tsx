import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { Spinner } from './components/ui'
import AppLayout from './layouts/AppLayout'
const ChurnPage = lazy(() => import('./pages/ChurnPage'))
const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage'))
const CustomersPage = lazy(() => import('./pages/CustomersPage'))
import LoginPage from './pages/LoginPage'
const ModelPage = lazy(() => import('./pages/ModelPage'))
const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const RetentionPage = lazy(() => import('./pages/RetentionPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function Protected() {
  const { me, loading } = useAuth()
  if (loading) return <Spinner label="Loading workspace" />
  return me ? <AppLayout /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Suspense fallback={<Spinner label="Loading" />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Protected />}>
        <Route index element={<OverviewPage />} />
        <Route path="churn" element={<ChurnPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="retention" element={<RetentionPage />} />
        <Route path="model" element={<ModelPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}
