import { useCallback, useState } from 'react';
import { api, download } from '../api';
import { canManage, useAuth } from '../auth';
import { Banner } from '../components/Banner';
import { Modal } from '../components/Modal';
import { Pager } from '../components/Pager';
import { usePagedList } from '../usePagedList';

const EMPTY = {
  id: null,
  name: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  active: true,
};

export function Suppliers() {
  const { user } = useAuth();
  const manage = canManage(user);
  const [draftQuery, setDraftQuery] = useState('');
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const list = usePagedList('/api/suppliers', { active: 'all' });

  const close = useCallback(() => {
    setForm(null);
    setFormError('');
  }, []);

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    const body = {
      name: form.name,
      contactName: form.contactName,
      email: form.email,
      phone: form.phone,
      address: form.address,
    };
    if (form.id) body.active = form.active;
    try {
      if (form.id) await api(`/api/suppliers/${form.id}`, { method: 'PATCH', body });
      else await api('/api/suppliers', { method: 'POST', body });
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
          <h1>Suppliers</h1>
          <p className="muted">Vendors that purchase orders are raised against.</p>
        </div>
        <div className="actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              const params = new URLSearchParams({ active: 'all' });
              if (list.query) params.set('q', list.query);
              download(`/api/suppliers/export?${params.toString()}`).catch((err) => window.alert(err.message));
            }}
          >
            Export CSV
          </button>
          {manage && <button type="button" className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}>New supplier</button>}
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
          placeholder="Search name, contact, or email"
          aria-label="Search suppliers"
        />
        <button type="submit" className="btn">Search</button>
      </form>
      <Banner>{list.error}</Banner>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Phone</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.name}
                  {!row.active && <span className="pill pill-cancelled">Inactive</span>}
                </td>
                <td>{row.contactName || '—'}</td>
                <td>{row.email || '—'}</td>
                <td>{row.phone || '—'}</td>
                <td className="row-action">
                  {manage && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setForm({
                        id: row.id,
                        name: row.name,
                        contactName: row.contactName || '',
                        email: row.email || '',
                        phone: row.phone || '',
                        address: row.address || '',
                        active: row.active,
                      })}
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && list.data.length === 0 && <p className="empty">No suppliers match.</p>}
        <Pager pagination={list.pagination} onPage={list.setPage} />
      </div>
      {form && (
        <Modal title={form.id ? 'Edit supplier' : 'New supplier'} onClose={close}>
          <form onSubmit={onSubmit} className="form-grid">
            <Banner>{formError}</Banner>
            <label className="span-2">
              Name
              <input value={form.name} onChange={(event) => setField('name', event.target.value)} required />
            </label>
            <label>
              Contact
              <input value={form.contactName} onChange={(event) => setField('contactName', event.target.value)} />
            </label>
            <label>
              Email
              <input type="email" value={form.email} onChange={(event) => setField('email', event.target.value)} />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={(event) => setField('phone', event.target.value)} />
            </label>
            <label className="span-2">
              Address
              <textarea rows="2" value={form.address} onChange={(event) => setField('address', event.target.value)} />
            </label>
            {form.id && (
              <label className="check span-2">
                <input type="checkbox" checked={form.active} onChange={(event) => setField('active', event.target.checked)} />
                Active
              </label>
            )}
            <div className="actions span-2">
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
