import { useCallback, useEffect, useState } from 'react';
import { api, download } from '../api';
import { canManage, useAuth } from '../auth';
import { Banner } from '../components/Banner';
import { Modal } from '../components/Modal';
import { Pager } from '../components/Pager';
import { Pill } from '../components/Pill';
import { qty, when } from '../format';
import { usePagedList } from '../usePagedList';

export function Movements() {
  const { user } = useAuth();
  const manage = canManage(user);
  const [movementType, setMovementType] = useState('');
  const [draftQuery, setDraftQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [type, setType] = useState(manage ? 'receipt' : 'issue');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const list = usePagedList('/api/stock-movements', { movementType });

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    api('/api/products?limit=100')
      .then((body) => {
        if (!cancelled) setProducts(body.data);
      })
      .catch((err) => {
        if (!cancelled) setFormError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setFormError('');
    setProductId('');
    setQuantity('1');
    setNotes('');
    setType(manage ? 'receipt' : 'issue');
  }, [manage]);

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await api('/api/stock-movements', {
        method: 'POST',
        body: {
          productId,
          movementType: type,
          quantity: Number(quantity),
          notes,
        },
      });
      close();
      list.reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Stock movements</h1>
          <p className="muted">Every receipt and issue is the source of the on-hand balance.</p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const params = new URLSearchParams();
              if (list.query) params.set('q', list.query);
              if (movementType) params.set('movementType', movementType);
              const qs = params.toString();
              download(`/api/stock-movements/export${qs ? `?${qs}` : ''}`).catch((err) => window.alert(err.message));
            }}
          >
            Export CSV
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>Record movement</button>
        </div>
      </header>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          list.applySearch(draftQuery);
        }}
      >
        <input
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          placeholder="Search SKU or product name"
          aria-label="Search movements"
        />
        <select
          aria-label="Movement type"
          value={movementType}
          onChange={(event) => {
            setMovementType(event.target.value);
            list.setPage(1);
          }}
        >
          <option value="">Receipts and issues</option>
          <option value="receipt">Receipts</option>
          <option value="issue">Issues</option>
        </select>
        <button type="submit" className="btn">Search</button>
      </form>
      <Banner>{list.error}</Banner>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Product</th>
              <th>Type</th>
              <th className="num">Qty</th>
              <th>Reference</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((row) => (
              <tr key={row.id}>
                <td>{when(row.createdAt)}</td>
                <td>{row.product.sku} · {row.product.name}</td>
                <td><Pill value={row.movementType} /></td>
                <td className="num">{qty(row.quantity)}</td>
                <td>{row.referenceType === 'purchase_order' ? 'Purchase order' : (row.notes || 'Manual')}</td>
                <td>{row.actor?.name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && list.data.length === 0 && <p className="empty">No movements match.</p>}
        <Pager pagination={list.pagination} onPage={list.setPage} />
      </div>
      {open && (
        <Modal title="Record movement" onClose={close}>
          <form onSubmit={onSubmit} className="form-grid">
            <Banner>{formError}</Banner>
            <label className="span-2">
              Product
              <select value={productId} onChange={(event) => setProductId(event.target.value)} required>
                <option value="">Select a product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} — {product.name} ({qty(product.quantityOnHand)} on hand)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select value={type} onChange={(event) => setType(event.target.value)}>
                {manage && <option value="receipt">Receipt</option>}
                <option value="issue">Issue</option>
              </select>
            </label>
            <label>
              Quantity
              <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
            </label>
            <label className="span-2">
              Notes
              <input value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <div className="actions span-2">
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
