const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const cloudinary = require('./cloudinary');

beforeEach(() => {
  process.env.CLOUDINARY_CLOUD_NAME = 'lbdemo';
  process.env.CLOUDINARY_API_KEY = 'key123';
  process.env.CLOUDINARY_API_SECRET = 'secret456';
});

test('upload params are signed with the secret and scoped to the user folder', () => {
  const params = cloudinary.uploadParams('buyback', 'u1');
  assert.equal(params.folder, 'lightbook/buyback/u1');
  assert.equal(params.uploadUrl, 'https://api.cloudinary.com/v1_1/lbdemo/image/upload');
  assert.equal(params.api_key, 'key123');
  assert.equal('api_secret' in params, false);
  const payload = `allowed_formats=${params.allowed_formats}&folder=${params.folder}&timestamp=${params.timestamp}`;
  assert.equal(params.signature, createHash('sha1').update(payload + 'secret456').digest('hex'));
});

test('unknown purpose or missing config gives no params', () => {
  assert.equal(cloudinary.uploadParams('other', 'u1'), null);
  delete process.env.CLOUDINARY_API_SECRET;
  assert.equal(cloudinary.uploadParams('avatar', 'u1'), null);
});

test('only accepts images in our cloud and in the same user folder', () => {
  const ok = 'https://res.cloudinary.com/lbdemo/image/upload/v1712/lightbook/avatars/u1/abc.jpg';
  assert.equal(cloudinary.isOwnImageUrl(ok, 'avatar', 'u1'), true);
  assert.equal(cloudinary.isOwnImageUrl(ok.replace('/v1712', ''), 'avatar', 'u1'), true);
  for (const bad of [
    ok.replace('/u1/', '/u2/'),
    ok.replace('lbdemo', 'other'),
    ok.replace('avatars', 'buyback'),
    ok + '?x=1',
    'http://res.cloudinary.com/lbdemo/image/upload/lightbook/avatars/u1/abc.jpg',
    'https://evil.com/lbdemo/image/upload/lightbook/avatars/u1/abc.jpg',
    'data:image/png;base64,AAAA',
    null,
  ]) {
    assert.equal(cloudinary.isOwnImageUrl(bad, 'avatar', 'u1'), false, String(bad));
  }
});
