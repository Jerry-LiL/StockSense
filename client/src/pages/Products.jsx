import { useCallback, useState } from 'react';
import { api, download } from '../api';
import { canManage, useAuth } from '../auth';
import { Banner } from '../components/Banner';
import { Modal } from '../components/Modal';
import { Pager } from '../components/Pager';
import { money, qty } from '../format';
import { usePagedList } from '../usePagedList';

const EMPTY = {
  id: null,
  sku: '',
  name: '',
  description: '',
  category: '',
  unit: 'each',
  unitCost: '0.00',
  reorderLevel: '0',
  active: true,
  quantityOnHand: null,
};

function fromProduct(product) {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description || '',
    category: product.category || '',
    unit: product.unit,
    unitCost: product.unitCost,
    reorderLevel: String(product.reorderLevel),
    active: product.active,
    quantityOnHand: product.quantityOnHand,
  };
}

export function Products() {
  const { user } = useAuth();
  const manage = canManage(user);
  const [active, setActive] = useState('true');
  const [draftQuery, setDraftQuery] = useState('');
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const list = usePagedList('/api/products', { active: active === 'true' ? '' : active });

  const close = useCallback(() => {
    setForm(null);
    setFormError('');
  }, []);

  function exportCsv() {
    const params = new URLSearchParams();
    if (list.query) params.set('q', list.query);
    if (active !== 'true') params.set('active', active);
    const qs = params.toString();
    download(`/api/products/export${qs ? `?${qs}` : ''}`).catch((err) => {
      window.alert(err.message);
    });
  }

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const body = {
      sku: form.sku,
      name: form.name,
      description: form.description,
      category: form.category,
      unit: form.unit,
      unitCost: form.unitCost,
      reorderLevel: Number(form.reorderLevel),
    };
    if (form.id) body.active = form.active;
    try {
      if (form.id) await api(`/api/products/${form.id}`, { method: 'PATCH', body });
      else await api('/api/products', { method: 'POST', body });
      close();
      list.reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Products</h1>
          <p className="muted">On-hand quantity changes only when someone records a movement.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={exportCsv}>Export CSV</button>
          {manage && (
            <button type="button" className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}>New product</button>
          )}
        </div>
      </header>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          list.setPage(1);
          list.applySearch(draftQuery);
        }}
      >
        <input
          value={draftQuery}
          onChange={(event) => setDraftQuery(event.target.value)}
          placeholder="Search SKU, name, or category"
          aria-label="Search products"
        />
        <select
          aria-label="Active products"
          value={active}
          onChange={(event) => {
            setActive(event.target.value);
            list.setPage(1);
          }}
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="all">All</option>
        </select>
        <button type="submit" className="btn">Search</button>
      </form>
      <Banner>{list.error}</Banner>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Category</th>
              <th className="num">On hand</th>
              <th className="num">Reorder</th>
              <th className="num">Unit cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((product) => {
              const low = product.active && product.quantityOnHand <= product.reorderLevel;
              return (
                <tr key={product.id} className={low ? 'low' : undefined}>
                  <td>{product.sku}</td>
                  <td>
                    {product.name}
                    {low && <span className="pill pill-low">Low</span>}
                    {!product.active && <span className="pill pill-cancelled">Inactive</span>}
                  </td>
                  <td>{product.category || '—'}</td>
                  <td className="num">{qty(product.quantityOnHand)}</td>
                  <td className="num">{qty(product.reorderLevel)}</td>
                  <td className="num">{money(product.unitCost)}</td>
                  <td className="row-action">
                    {manage && (
                      <button type="button" className="btn btn-ghost" onClick={() => setForm(fromProduct(product))}>Edit</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.loading && list.data.length === 0 && <p className="empty">No products match.</p>}
        <Pager pagination={list.pagination} onPage={list.setPage} />
      </div>
      {form && (
        <Modal title={form.id ? 'Edit product' : 'New product'} onClose={close}>
          <form onSubmit={onSubmit} className="form-grid">
            <Banner>{formError}</Banner>
            <label>
              SKU
              <input value={form.sku} onChange={(event) => setField('sku', event.target.value)} required />
            </label>
            <label>
              Name
              <input value={form.name} onChange={(event) => setField('name', event.target.value)} required />
            </label>
            <label>
              Category
              <input value={form.category} onChange={(event) => setField('category', event.target.value)} />
            </label>
            <label>
              Unit
              <input value={form.unit} onChange={(event) => setField('unit', event.target.value)} required />
            </label>
            <label>
              Unit cost
              <input value={form.unitCost} onChange={(event) => setField('unitCost', event.target.value)} inputMode="decimal" required />
            </label>
            <label>
              Reorder level
              <input type="number" min="0" step="1" value={form.reorderLevel} onChange={(event) => setField('reorderLevel', event.target.value)} required />
            </label>
            <label className="span-2">
              Description
              <textarea rows="3" value={form.description} onChange={(event) => setField('description', event.target.value)} />
            </label>
            {form.id && (
              <label className="check span-2">
                <input type="checkbox" checked={form.active} onChange={(event) => setField('active', event.target.checked)} />
                Active
              </label>
            )}
            {form.id && <p className="muted span-2">On hand is {qty(form.quantityOnHand)}. Record a stock movement to change it.</p>}
            <div className="actions span-2">
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
