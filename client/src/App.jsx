import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { LowStock } from './pages/LowStock';
import { Movements } from './pages/Movements';
import { Products } from './pages/Products';
import { PurchaseOrderDetail } from './pages/PurchaseOrderDetail';
import { PurchaseOrders } from './pages/PurchaseOrders';
import { Suppliers } from './pages/Suppliers';
import { Users } from './pages/Users';

function RequireAuth() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <div className="boot">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Layout />;
}

function AdminOnly() {
  const { user } = useAuth();
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return <Users />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/purchase-orders" element={<PurchaseOrders />} />
        <Route path="/purchase-orders/:id" element={<PurchaseOrderDetail />} />
        <Route path="/movements" element={<Movements />} />
        <Route path="/low-stock" element={<LowStock />} />
        <Route path="/users" element={<AdminOnly />} />
        <Route path="*" element={<p className="empty">That page is not part of StockSense.</p>} />
      </Route>
    </Routes>
  );
}
