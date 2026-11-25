import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';

const LINKS = [
  ['/', 'Dashboard'],
  ['/products', 'Products'],
  ['/suppliers', 'Suppliers'],
  ['/purchase-orders', 'Purchase orders'],
  ['/movements', 'Stock movements'],
  ['/low-stock', 'Low stock'],
];

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">SS</span>
          <span>
            <strong>StockSense</strong>
            <small>Warehouse</small>
          </span>
        </div>
        <nav aria-label="Primary">
          {LINKS.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              {label}
            </NavLink>
          ))}
          {user.role === 'admin' && (
            <NavLink to="/users" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              Users
            </NavLink>
          )}
        </nav>
        <div className="side-foot">
          <div className="who">
            <strong>{user.name}</strong>
            <span className={`role role-${user.role}`}>{user.role}</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
