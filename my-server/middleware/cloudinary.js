'use strict';
// =====================================================================
// Cloudinary: ảnh khách tải lên (avatar, ảnh sách thanh lý, ảnh đánh giá) lưu trên Cloudinary,
// =====================================================================
const { createHash } = require('node:crypto');

const ROOT_FOLDER = 'lightbook';
const ALLOWED_FORMATS = 'jpg,jpeg,png,webp';
const PURPOSES = { avatar: 'avatars', buyback: 'buyback', review: 'reviews' };

function config() {
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

function folderFor(purpose, userId) {
  const sub = PURPOSES[purpose];
  return sub ? `${ROOT_FOLDER}/${sub}/${String(userId)}` : null;
}

function sign(params, apiSecret) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1').update(payload + apiSecret).digest('hex');
}

function uploadParams(purpose, userId) {
  const cfg = config();
  const folder = folderFor(purpose, userId);
  if (!cfg || !folder) return null;
  const params = { allowed_formats: ALLOWED_FORMATS, folder, timestamp: Math.floor(Date.now() / 1000) };
  return {
    ...params,
    api_key: cfg.apiKey,
    signature: sign(params, cfg.apiSecret),
    uploadUrl: `https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`,
  };
}

function isOwnImageUrl(url, purpose, userId) {
  const cfg = config();
  const folder = folderFor(purpose, userId);
  if (!cfg || !folder || typeof url !== 'string' || url.length > 500) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com' || parsed.search || parsed.hash) return false;
  const prefix = `/${cfg.cloudName}/image/upload/`;
  if (!parsed.pathname.startsWith(prefix)) return false;
  const rest = parsed.pathname.slice(prefix.length).replace(/^v\d+\//, '');
  return rest.startsWith(`${folder}/`) && /^[A-Za-z0-9_\-/]+\.(jpe?g|png|webp)$/.test(rest) && !rest.includes('..');
}

module.exports = { config, uploadParams, isOwnImageUrl, PURPOSES };
