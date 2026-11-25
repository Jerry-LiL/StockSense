import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Banner } from '../components/Banner';
import { Pill } from '../components/Pill';
import { qty, when } from '../format';

export function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [low, setLow] = useState([]);
  const [moves, setMoves] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api('/api/reports/summary'),
      api('/api/reports/low-stock?limit=5'),
      api('/api/stock-movements?limit=6'),
    ]).then(([sum, lowStock, movements]) => {
      if (cancelled) return;
      setSummary(sum);
      setLow(lowStock.data);
      setMoves(movements.data);
    }).catch((err) => {
      if (!cancelled) setError(err.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">What needs attention on the floor today.</p>
        </div>
      </header>
      <Banner>{error}</Banner>
      {summary && (
        <div className="stats">
          <Link className="stat" to="/products">
            <span className="stat-label">Active products</span>
            <strong>{qty(summary.productCount)}</strong>
          </Link>
          <Link className="stat" to="/products">
            <span className="stat-label">Units on hand</span>
            <strong>{qty(summary.unitsOnHand)}</strong>
          </Link>
          <Link className="stat" to="/low-stock">
            <span className="stat-label">Low stock</span>
            <strong>{qty(summary.lowStockCount)}</strong>
          </Link>
          <Link className="stat" to="/purchase-orders">
            <span className="stat-label">Open purchase orders</span>
            <strong>{qty(summary.openPurchaseOrders)}</strong>
          </Link>
        </div>
      )}
      <div className="split">
        <section className="panel">
          <header className="panel-head">
            <h2>Low stock</h2>
            <Link to="/low-stock">View report</Link>
          </header>
          {loading ? <p className="empty">Loading…</p> : low.length === 0 ? <p className="empty">Nothing is at or under its reorder level.</p> : (
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th className="num">On hand</th>
                  <th className="num">Reorder</th>
                </tr>
              </thead>
              <tbody>
                {low.map((row) => (
                  <tr key={row.id} className="low">
                    <td>{row.sku}</td>
                    <td>{row.name}</td>
                    <td className="num">{qty(row.quantityOnHand)}</td>
                    <td className="num">{qty(row.reorderLevel)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="panel">
          <header className="panel-head">
            <h2>Recent movements</h2>
            <Link to="/movements">View all</Link>
          </header>
          {loading ? <p className="empty">Loading…</p> : moves.length === 0 ? <p className="empty">No stock movements yet.</p> : (
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Product</th>
                  <th>Type</th>
                  <th className="num">Qty</th>
                </tr>
              </thead>
              <tbody>
                {moves.map((row) => (
                  <tr key={row.id}>
                    <td>{when(row.createdAt)}</td>
                    <td>{row.product.sku}</td>
                    <td><Pill value={row.movementType} /></td>
                    <td className="num">{qty(row.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </section>
  );
}
