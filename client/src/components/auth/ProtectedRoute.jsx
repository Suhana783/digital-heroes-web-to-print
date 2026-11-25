import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <main className="auth-shell"><div className="request-state" role="status">Restoring your session…</div></main>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function GuestOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="auth-shell"><div className="request-state" role="status">Restoring your session…</div></main>;
  return user ? <Navigate to="/account" replace /> : children;
}
