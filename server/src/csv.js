function exportMaxRows() {
  const n = Number.parseInt(process.env.EXPORT_MAX_ROWS || '10000', 10);
  return Number.isInteger(n) && n > 0 ? n : 10000;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers, rows) {
  const head = headers.map((header) => csvEscape(header.label)).join(',');
  const lines = rows.map((row) => headers.map((header) => {
    const value = typeof header.value === 'function' ? header.value(row) : row[header.value];
    return csvEscape(value);
  }).join(','));
  return `\uFEFF${[head, ...lines].join('\r\n')}\r\n`;
}

function sendCsv(res, filename, headers, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(headers, rows));
}

module.exports = {
  exportMaxRows,
  csvEscape,
  toCsv,
  sendCsv,
};
