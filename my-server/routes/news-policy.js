// Read-time publication rules shared by the public and admin News APIs.
// No migration, timer or database write is needed when a scheduled article becomes due.
const publicationDate = () => ({
  $convert: { input: "$publishedAt", to: "date", onError: null, onNull: null },
});
function effectiveStatusExpression(now = new Date()) {
  const validDate = { $ne: [publicationDate(), null] };
  return {
    $cond: [
      {
        $and: [
          { $eq: ["$status", "scheduled"] },
          validDate,
          { $lte: [publicationDate(), now] },
        ],
      },
      "published",
      {
        $cond: [
          {
            $and: [
              { $eq: ["$status", "published"] },
              validDate,
              { $gt: [publicationDate(), now] },
            ],
          },
          "scheduled",
          "$status",
        ],
      },
    ],
  };
}
function presentStatus(doc, now = new Date()) {
  if (!doc || doc.publishedAt == null) return doc;
  const date = new Date(doc.publishedAt);
  if (!Number.isFinite(date.getTime())) return doc;
  if (doc.status === "scheduled" && date <= now)
    return { ...doc, status: "published" };
  if (doc.status === "published" && date > now)
    return { ...doc, status: "scheduled" };
  return doc;
}
function publishedFilter(now = new Date()) {
  return { $expr: { $eq: [effectiveStatusExpression(now), "published"] } };
}
function parseSchedule(value) {
  if (typeof value !== "string") return null;
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (
    !match ||
    Number(match[2]) > 23 ||
    Number(match[3]) > 59 ||
    Number(match[4]) > 59
  )
    return null;
  const day = new Date(`${match[1]}T00:00:00.000Z`);
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== match[1]
  )
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
module.exports = {
  effectiveStatusExpression,
  presentStatus,
  publishedFilter,
  parseSchedule,
};
