import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, download } from '../api';
import { canManage, useAuth } from '../auth';
import { Banner } from '../components/Banner';
import { Modal } from '../components/Modal';
import { Pager } from '../components/Pager';
import { Pill } from '../components/Pill';
import { day, money, qty } from '../format';
import { usePagedList } from '../usePagedList';

function blankLine() {
  return { key: crypto.randomUUID(), productId: '', quantityOrdered: '1', unitCost: '' };
}

export function PurchaseOrders() {
  const { user } = useAuth();
  const manage = canManage(user);
  const [status, setStatus] = useState('');
  const [draftQuery, setDraftQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [expectedOn, setExpectedOn] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const list = usePagedList('/api/purchase-orders', { status });

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    Promise.all([
      api('/api/suppliers?limit=100'),
      api('/api/products?limit=100'),
    ]).then(([supplierPage, productPage]) => {
      if (cancelled) return;
      setSuppliers(supplierPage.data);
      setProducts(productPage.data);
    }).catch((err) => {
      if (!cancelled) setFormError(err.message);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setFormError('');
    setSupplierId('');
    setExpectedOn('');
    setNotes('');
    setLines([blankLine()]);
  }, []);

  function updateLine(key, field, value) {
    setLines((current) => current.map((line) => {
      if (line.key !== key) return line;
      const next = { ...line, [field]: value };
      if (field === 'productId') {
        const product = products.find((item) => item.id === value);
        if (product) next.unitCost = product.unitCost;
      }
      return next;
    }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await api('/api/purchase-orders', {
        method: 'POST',
        body: {
          supplierId,
          expectedOn: expectedOn || null,
          notes,
          lines: lines.map((line) => ({
            productId: line.productId,
            quantityOrdered: Number(line.quantityOrdered),
            unitCost: line.unitCost,
          })),
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
          <h1>Purchase orders</h1>
          <p className="muted">Draft, submit, then receive against the lines.</p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const params = new URLSearchParams();
              if (list.query) params.set('q', list.query);
              if (status) params.set('status', status);
              const qs = params.toString();
              download(`/api/purchase-orders/export${qs ? `?${qs}` : ''}`).catch((err) => window.alert(err.message));
            }}
          >
            Export CSV
          </button>
          {manage && <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>New purchase order</button>}
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
          placeholder="Search PO number or supplier"
          aria-label="Search purchase orders"
        />
        <select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            list.setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="partial">Partial</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button type="submit" className="btn">Search</button>
      </form>
      <Banner>{list.error}</Banner>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>PO</th>
              <th>Supplier</th>
              <th>Status</th>
              <th>Expected</th>
              <th className="num">Received</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((po) => (
              <tr key={po.id}>
                <td><Link to={`/purchase-orders/${po.id}`}>{po.poNumber}</Link></td>
                <td>{po.supplier?.name}</td>
                <td><Pill value={po.status} /></td>
                <td>{day(po.expectedOn) || '—'}</td>
                <td className="num">{qty(po.quantityReceived)} / {qty(po.quantityOrdered)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && list.data.length === 0 && <p className="empty">No purchase orders match.</p>}
        <Pager pagination={list.pagination} onPage={list.setPage} />
      </div>
      {open && (
        <Modal title="New purchase order" onClose={close} wide>
          <form onSubmit={onSubmit} className="stack">
            <Banner>{formError}</Banner>
            <div className="form-grid">
              <label>
                Supplier
                <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required>
                  <option value="">Select a supplier</option>
                  {suppliers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                </select>
              </label>
              <label>
                Expected
                <input type="date" value={expectedOn} onChange={(event) => setExpectedOn(event.target.value)} />
              </label>
              <label className="span-2">
                Notes
                <input value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Qty</th>
                  <th className="num">Unit cost</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.key}>
                    <td>
                      <select
                        aria-label="Product"
                        value={line.productId}
                        onChange={(event) => updateLine(line.key, 'productId', event.target.value)}
                        required
                      >
                        <option value="">Select a product</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label="Quantity ordered"
                        type="number"
                        min="1"
                        step="1"
                        value={line.quantityOrdered}
                        onChange={(event) => updateLine(line.key, 'quantityOrdered', event.target.value)}
                        required
                      />
                    </td>
                    <td>
                      <input
                        aria-label="Unit cost"
                        value={line.unitCost}
                        onChange={(event) => updateLine(line.key, 'unitCost', event.target.value)}
                        placeholder={money(0)}
                        required
                      />
                    </td>
                    <td className="row-action">
                      {lines.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setLines((current) => [...current, blankLine()])}>Add line</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create draft'}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
