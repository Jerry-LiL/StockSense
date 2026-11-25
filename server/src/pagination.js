function pageParams(query) {
  let page = Number.parseInt(query.page, 10);
  if (!Number.isInteger(page) || page < 1) page = 1;
  if (page > 100000) page = 100000;

  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isInteger(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  return { page, limit, offset: (page - 1) * limit };
}

function pageBody(rows, count, page, limit) {
  return {
    data: rows,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: count === 0 ? 0 : Math.ceil(count / limit),
    },
  };
}

function searchText(query) {
  return String(query.q || '').trim().slice(0, 80);
}

function likePattern(raw) {
  const cleaned = String(raw || '').trim().slice(0, 80).replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${cleaned}%`;
}

function sortOrder(query, allow, fallbackKey, fallbackDir = 'ASC') {
  const key = Object.prototype.hasOwnProperty.call(allow, query.sort) ? query.sort : fallbackKey;
  const requested = String(query.direction || '').toLowerCase();
  const direction = requested === 'asc' || requested === 'desc' ? requested.toUpperCase() : fallbackDir;
  return [[allow[key], direction]];
}

module.exports = {
  pageParams,
  pageBody,
  searchText,
  likePattern,
  sortOrder,
};
