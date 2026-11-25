import { Link } from 'react-router-dom';

export function AuthFormLayout({ title, introduction, children }) {
  return (
    <main className="auth-shell">
      <Link className="brand auth-brand" to="/"><span className="brand-mark">DH</span><span>DIGITAL HEROES</span></Link>
      <section className="auth-card">
        <p className="eyebrow">CUSTOMER ACCOUNT</p><h1>{title}</h1><p className="auth-intro">{introduction}</p>
        {children}
      </section>
      <Link className="back-link auth-home-link" to="/">← Back to the workshop</Link>
    </main>
  );
}

export function FormMessage({ kind = 'error', children }) {
  return <p className={`form-message ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>;
}
