export function Pager({ pagination, onPage }) {
  if (!pagination) return null;
  if (pagination.totalPages <= 1) {
    return <p className="muted result-count">{pagination.total} results</p>;
  }
  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.total, pagination.page * pagination.limit);
  return (
    <div className="pager">
      <span>{start}–{end} of {pagination.total}</span>
      <div className="pager-buttons">
        <button type="button" className="btn" disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>
          Previous
        </button>
        <button
          type="button"
          className="btn"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPage(pagination.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
