import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthFormLayout, FormMessage } from '../../components/auth/AuthFormLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { signInCustomer } from '../../services/accountApi.js';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { supabaseConfigured } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const { error: authError } = await signInCustomer({ email: form.email.trim(), password: form.password });
      if (authError) throw authError;
      navigate(location.state?.from || '/account', { replace: true });
    } catch (authError) {
      setError(authError.message || 'Unable to sign in with those details.');
    } finally { setBusy(false); }
  }

  return <AuthFormLayout title="Welcome back" introduction="Sign in to see your account and order history.">
    {!supabaseConfigured && <FormMessage>Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in client/.env.</FormMessage>}
    <form className="auth-form" onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required /></label>
      {error && <FormMessage>{error}</FormMessage>}
      <button className="calculate-button" disabled={busy || !supabaseConfigured}>{busy ? 'Signing in…' : 'Sign in'} <span>↗</span></button>
    </form>
    <p className="auth-switch">New to Digital Heroes? <Link to="/register">Create an account</Link></p>
  </AuthFormLayout>;
}
