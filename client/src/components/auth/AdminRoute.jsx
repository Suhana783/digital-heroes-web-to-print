import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { accountRequest } from '../../services/accountApi.js';

export function AdminRoute({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, allowed: false });

  useEffect(() => {
    let active = true;
    if (!user) { setState({ loading: false, allowed: false }); return undefined; }
    setState({ loading: true, allowed: false });
    accountRequest('/admin/access-check')
      .then(() => { if (active) setState({ loading: false, allowed: true }); })
      .catch(() => { if (active) setState({ loading: false, allowed: false }); });
    return () => { active = false; };
  }, [user?.id]);

  if (state.loading) return <main className="auth-shell"><div className="request-state" role="status">Checking administrator access…</div></main>;
  return state.allowed ? children : <Navigate to="/account" replace />;
}
