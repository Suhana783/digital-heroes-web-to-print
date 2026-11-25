import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthFormLayout, FormMessage } from '../../components/auth/AuthFormLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { signUpCustomer } from '../../services/accountApi.js';

export default function Register() {
  const navigate = useNavigate();
  const { supabaseConfigured } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); setMessage(null); }

  async function submit(event) {
    event.preventDefault(); setMessage(null);
    const fullName = form.fullName.trim();
    if (!fullName || !form.email.trim() || !form.password || !form.confirmPassword) return setMessage({ kind: 'error', text: 'Complete all fields to create your account.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setMessage({ kind: 'error', text: 'Enter a valid email address.' });
    if (form.password.length < 8) return setMessage({ kind: 'error', text: 'Use a password with at least 8 characters.' });
    if (form.password !== form.confirmPassword) return setMessage({ kind: 'error', text: 'The passwords do not match.' });
    setBusy(true);
    try {
      const { data, error } = await signUpCustomer({ fullName, email: form.email.trim(), password: form.password });
      if (error) throw error;
      if (data.session) navigate('/account', { replace: true });
      else setMessage({ kind: 'success', text: 'Your account was created. Check your email to confirm your address, then sign in.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error.message || 'Unable to create your account right now.' });
    } finally { setBusy(false); }
  }

  return <AuthFormLayout title="Create account" introduction="Keep your details and future orders together in one place.">
    {!supabaseConfigured && <FormMessage>{'Supabase Auth is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in client/.env.'}</FormMessage>}
    <form className="auth-form" onSubmit={submit}>
      <label>Full name<input name="fullName" autoComplete="name" value={form.fullName} onChange={change} required maxLength="120" /></label>
      <label>Email<input name="email" type="email" autoComplete="email" value={form.email} onChange={change} required /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" value={form.password} onChange={change} required minLength="8" /></label>
      <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={change} required /></label>
      {message && <FormMessage kind={message.kind}>{message.text}</FormMessage>}
      <button className="calculate-button" disabled={busy || !supabaseConfigured}>{busy ? 'Creating account…' : 'Create account'} <span>↗</span></button>
    </form>
    <p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p>
  </AuthFormLayout>;
}
