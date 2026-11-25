import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { canManage, useAuth } from '../auth';
import { Banner } from '../components/Banner';
import { Pill } from '../components/Pill';
import { day, money, qty } from '../format';

export function PurchaseOrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const manage = canManage(user);
  const [po, setPo] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [quantities, setQuantities] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError('');
    return api(`/api/purchase-orders/${id}`)
      .then((body) => {
        setPo(body);
        const next = {};
        body.lines.forEach((line) => {
          next[line.id] = '';
        });
        setQuantities(next);
      })
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(path, body) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await api(path, { method: 'POST', body });
      setPo(updated);
      setNotice('Saved.');
      const next = {};
      updated.lines.forEach((line) => {
        next[line.id] = '';
      });
      setQuantities(next);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function receive(event) {
    event.preventDefault();
    const lines = po.lines
      .map((line) => ({ lineId: line.id, quantity: Number(quantities[line.id] || 0) }))
      .filter((line) => line.quantity > 0);
    if (lines.length === 0) {
      setError('Enter a quantity to receive.');
      return;
    }
    act(`/api/purchase-orders/${id}/receive`, { lines });
  }

  if (!po && !error) return <p className="empty">Loading purchase order…</p>;

  const receivable = po && manage && (po.status === 'submitted' || po.status === 'partial');

  return (
    <section>
      <p><Link to="/purchase-orders">Back to purchase orders</Link></p>
      <Banner>{error}</Banner>
      <Banner kind="ok">{notice}</Banner>
      {po && (
        <>
          <header className="page-head">
            <div>
              <h1>{po.poNumber}</h1>
              <p className="muted">
                {po.supplier.name}
                {po.expectedOn ? ` · expected ${day(po.expectedOn)}` : ''}
                {po.creator ? ` · opened by ${po.creator.name}` : ''}
              </p>
            </div>
            <div className="actions">
              <Pill value={po.status} />
              {manage && po.status === 'draft' && (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(`/api/purchase-orders/${id}/submit`)}>
                  Submit
                </button>
              )}
              {manage && (po.status === 'draft' || po.status === 'submitted') && (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Cancel ${po.poNumber}?`)) act(`/api/purchase-orders/${id}/cancel`);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </header>
          {po.notes && <p>{po.notes}</p>}
          <form onSubmit={receive} className="panel">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th className="num">Ordered</th>
                  <th className="num">Received</th>
                  <th className="num">Unit cost</th>
                  {receivable && <th className="num">Receive now</th>}
                </tr>
              </thead>
              <tbody>
                {po.lines.map((line) => {
                  const remaining = line.quantityOrdered - line.quantityReceived;
                  return (
                    <tr key={line.id}>
                      <td>{line.product.sku}</td>
                      <td>{line.product.name}</td>
                      <td className="num">{qty(line.quantityOrdered)}</td>
                      <td className="num">{qty(line.quantityReceived)}</td>
                      <td className="num">{money(line.unitCost)}</td>
                      {receivable && (
                        <td className="num">
                          <input
                            aria-label={`Receive ${line.product.sku}`}
                            type="number"
                            min="0"
                            max={remaining}
                            step="1"
                            value={quantities[line.id] || ''}
                            disabled={remaining === 0}
                            onChange={(event) => setQuantities((current) => ({
                              ...current,
                              [line.id]: event.target.value,
                            }))}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {receivable && (
              <div className="actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>Receive</button>
              </div>
            )}
          </form>
        </>
      )}
    </section>
  );
}
