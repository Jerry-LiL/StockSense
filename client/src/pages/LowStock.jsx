import { useState } from 'react';
import { download } from '../api';
import { Banner } from '../components/Banner';
import { Pager } from '../components/Pager';
import { money, qty } from '../format';
import { usePagedList } from '../usePagedList';

export function LowStock() {
  const [draftQuery, setDraftQuery] = useState('');
  const list = usePagedList('/api/reports/low-stock');

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Low stock</h1>
          <p className="muted">Active products whose on-hand quantity is at or under the reorder level.</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const params = new URLSearchParams();
            if (list.query) params.set('q', list.query);
            const qs = params.toString();
            download(`/api/reports/low-stock/export${qs ? `?${qs}` : ''}`).catch((err) => window.alert(err.message));
          }}
        >
          Export CSV
        </button>
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
          placeholder="Search SKU, name, or category"
          aria-label="Search low stock"
        />
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
              <th className="num">Shortfall</th>
              <th className="num">Unit cost</th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((row) => (
              <tr key={row.id} className="low">
                <td>{row.sku}</td>
                <td>{row.name}</td>
                <td>{row.category || '—'}</td>
                <td className="num">{qty(row.quantityOnHand)}</td>
                <td className="num">{qty(row.reorderLevel)}</td>
                <td className="num">{qty(row.shortfall)}</td>
                <td className="num">{money(row.unitCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.loading && list.data.length === 0 && <p className="empty">Nothing is low.</p>}
        <Pager pagination={list.pagination} onPage={list.setPage} />
      </div>
    </section>
  );
}
