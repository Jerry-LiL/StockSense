export function money(value) {
  if (value === null || value === undefined || value === '') return '';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function qty(value) {
  return Number(value || 0).toLocaleString('en-US');
}

export function when(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function day(value) {
  if (!value) return '';
  const [year, month, date] = String(value).slice(0, 10).split('-');
  if (!year || !month || !date) return String(value);
  return new Date(Number(year), Number(month) - 1, Number(date)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
