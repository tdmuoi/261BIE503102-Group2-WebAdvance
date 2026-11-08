// Admin date filters use calendar days in Vietnam, independently of server TZ.
function parseDay(value, end = false) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid();
  const result = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}+07:00`);
  if (!Number.isFinite(+result) || new Date(+result + 7 * 3600000).toISOString().slice(0, 10) !== value) throw invalid();
  return result;
}
function invalid() {
  return Object.assign(new Error('Khoảng ngày không hợp lệ. Dùng ngày thực tế YYYY-MM-DD và ngày kết thúc không trước ngày bắt đầu.'), { status: 400 });
}
module.exports = function dateRange(query) {
  const from = parseDay(query.from), to = parseDay(query.to, true);
  if (from && to && from > to) throw invalid();
  return { from, to };
};
