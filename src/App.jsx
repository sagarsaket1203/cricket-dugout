import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Auction from './pages/Auction'
import Players from './pages/Players'
import Matches from './pages/Matches'
import Admin from './pages/Admin'
import Trades from './pages/Trades'

function AppRoutes() {
  const { profile, loading } = useAuth()

  if (loading) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#060C18', flexDirection: 'column', gap: 16
    }}>
      <div style={{
        width: 48, height: 48,
        border: '3px solid rgba(240,165,0,0.2)',
        borderTop: '3px solid #F0A500',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <div style={{ color: '#F0A500', fontFamily: 'Rajdhani, sans-serif', fontSize: 18, fontWeight: 600, letterSpacing: 1 }}>
        Cricket Dugout
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!profile) return <Login />

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="auction" element={<Auction />} />
        <Route path="players" element={<Players />} />
        <Route path="matches" element={<Matches />} />
        <Route path="admin" element={<Admin />} />
<Route path="trades" element={<Trades />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}