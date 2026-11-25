import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';
import { accountRequest } from '../../services/accountApi.js';

export function SiteLayout({ children }) {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { itemCount } = useCart();
  const [signOutError, setSignOutError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    setIsAdmin(false);
    if (user) accountRequest('/admin/access-check').then(() => { if (active) setIsAdmin(true); }).catch(() => {});
    return () => { active = false; };
  }, [user?.id]);

  async function logout() {
    setSignOutError('');
    try { await signOut(); navigate('/'); }
    catch { setSignOutError('Unable to sign out. Please try again.'); }
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Digital Heroes home">
          <span className="brand-mark">DH</span><span>DIGITAL HEROES</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link to="/#divisions">What we make</Link>
          {user ? <><Link className="nav-contact" to="/cart">Cart <span>{itemCount}</span></Link><Link to="/account">My account</Link><Link to="/account/designs">Designs</Link><Link to="/account/variable-data">CSV merge</Link>{isAdmin && <><Link to="/admin/proofs">Orders</Link><Link to="/admin/reports">Reports</Link><Link to="/admin/payments">Payments</Link><Link to="/admin/products">Products</Link><Link to="/admin/templates">Templates</Link></>}<button className="header-logout" type="button" onClick={logout}>Log out</button></> : <><Link className="nav-contact" to="/login">Sign in <span>↗</span></Link><a href="mailto:hello@digitalheroes.in">Let’s talk</a></>}
        </nav>
      </header>
      {signOutError && <p className="signout-error" role="alert">{signOutError}</p>}
      {children}
      <footer className="site-footer page-gutter">
        <Link className="brand" to="/"><span className="brand-mark">DH</span><span>DIGITAL HEROES</span></Link>
        <span>Web-to-Print Platform</span><span>© 2026 Digital Heroes</span>
      </footer>
    </div>
  );
}
