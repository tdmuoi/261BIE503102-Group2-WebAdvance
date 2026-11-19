'use strict';
const express = require('express');
const { ObjectId } = require('mongodb');
const { createHash } = require('node:crypto');
const transaction = require('../middleware/admin-transaction');
const revisions = require('../middleware/admin-revision');
const fail = (status, message) => Object.assign(new Error(message), { status });
const text = v => typeof v === 'string' ? v.trim() : '';

async function reserve(db, body) {
  if (!body || Object.keys(body).some(k => !['eventId', 'fullName', 'email', 'phone', 'seats'].includes(k)))
    throw fail(400, 'Dữ liệu giữ chỗ không hợp lệ.');
  const { seats } = body, fullName = text(body.fullName), email = text(body.email).toLowerCase(), phone = text(body.phone);
  if (!/^[a-f\d]{24}$/i.test(body.eventId) || fullName.length < 2 || fullName.length > 80 ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^(0|\+84)(3|5|7|8|9)\d{8}$/.test(phone) || !Number.isSafeInteger(seats) || seats < 1 || seats > 5)
    throw fail(400, 'Vui lòng kiểm tra họ tên, email, số điện thoại và số chỗ (1–5).');
  const eventId = new ObjectId(body.eventId);
  const _id = createHash('sha256').update(String(eventId) + ':' + email).digest('hex');
  try {
    return await transaction(db, async session => {
      const registrations = db.collection('event_registrations');
      const existing = await registrations.findOne({ _id }, { session });
      if (existing) {
        if (existing.seats !== seats || existing.fullName !== fullName || existing.phone !== phone)
          throw fail(409, 'Email này đã giữ chỗ cho sự kiện. Vui lòng liên hệ hỗ trợ để thay đổi.');
        return { registrationId: _id, seats: existing.seats, replay: true };
      }
      const events = db.collection('events');
      const event = await events.findOne({ _id: eventId, status: 'published', isDemo: { $ne: true } }, { session });
      if (!event || !(event.startAt instanceof Date) || event.startAt <= new Date()) throw fail(409, 'Sự kiện không còn nhận đăng ký.');
      const count = event.registeredCount ?? 0;
      if (!Number.isSafeInteger(count) || count < 0 || (event.capacity != null &&
          (!Number.isSafeInteger(event.capacity) || count + seats > event.capacity))) throw fail(409, 'Sự kiện không còn đủ chỗ.');
      const now = new Date();
      const changed = await events.updateOne({ _id: eventId, ...revisions.snapshot(event) },
        { $set: { registeredCount: count + seats, updatedAt: revisions.nextUpdatedAt(event) } }, { session });
      if (changed.modifiedCount !== 1) throw fail(409, 'Số chỗ vừa thay đổi. Vui lòng thử lại.');
      await registrations.insertOne({ _id, eventId, fullName, email, phone, seats, status: 'confirmed',
        registeredAt: now, checkedInAt: null, createdAt: now }, { session });
      return { registrationId: _id, seats, replay: false };
    });
  } catch (error) {
    if (error.code === 11000) throw fail(409, 'Email này đã có yêu cầu giữ chỗ. Vui lòng kiểm tra trước khi gửi lại.');
    throw error;
  }
}
module.exports = function eventRegistrations(getDb) {
  const router = express.Router();
  router.post('/event-registrations', async (req, res, next) => {
    try { const result = await reserve(getDb(), req.body); res.status(result.replay ? 200 : 201).json(result); }
    catch (error) { next(error); }
  });
  return router;
};
module.exports.reserve = reserve;
