import { useCallback, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Banner } from '../components/Banner';
import { Modal } from '../components/Modal';
import { Pager } from '../components/Pager';
import { Pill } from '../components/Pill';
import { usePagedList } from '../usePagedList';

const EMPTY = { name: '', email: '', password: '', role: 'staff' };

export function Users() {
  const { user } = useAuth();
  const [draftQuery, setDraftQuery] = useState('');
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const list = usePagedList('/api/users');

  const close = useCallback(() => {
    setForm(null);
    setFormError('');
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      await api('/api/users', { method: 'POST', body: form });
      close();
      list.reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(row) {
    setError('');
    try {
      await api(`/api/users/${row.id}`, { method: 'PATCH', body: { active: !row.active } });
      list.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Users</h1>
          <p className="muted">Admins grant manager and staff access.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setForm({ ...EMPTY })}>New user</button>
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
          placeholder="Search name or email"
          aria-label="Search users"
        />
        <button type="submit" className="btn">Search</button>
      </form>
      <Banner>{list.error || error}</Banner>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
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
                <td>{row.email}</td>
                <td><Pill value={row.role} /></td>
                <td className="row-action">
                  {row.id !== user.id && (
                    <button type="button" className="btn btn-ghost" onClick={() => toggle(row)}>
                      {row.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && list.data.length === 0 && <p className="empty">No users match.</p>}
        <Pager pagination={list.pagination} onPage={list.setPage} />
      </div>
      {form && (
        <Modal title="New user" onClose={close}>
          <form
            className="form-grid"
            onSubmit={onSubmit}
          >
            <Banner>{formError}</Banner>
            <label>
              Name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              Role
              <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="span-2">
              Email
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </label>
            <label className="span-2">
              Password
              <input type="password" minLength="8" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
            </label>
            <div className="actions span-2">
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create user'}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
