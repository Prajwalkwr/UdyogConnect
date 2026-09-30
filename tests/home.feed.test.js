import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const require = createRequire(import.meta.url);
const {
  buildUserProfile,
  recommendForYou,
  recommendAlsoViewed,
  recommendTrending,
  recommendNewLocal,
  pickHighlights,
} = require('../server/home/recommend');
const { resolvePlace, categoryGroupsOf } = require('../server/home/catalog');

const card = (id, overrides = {}) => ({
  _id: id,
  name: `Biz ${id}`,
  category: 'Restaurants',
  groups: ['restaurants'],
  rating: 4,
  reviewCount: 2,
  popularity: 1,
  distanceKm: 2,
  stats: { orders7: 0, orders30: 0, bookings7: 0, bookings30: 0, views7: 0, views14: 0, reviews14: 0, wishlistCount: 0, wishlist7: 0 },
  ...overrides,
});

describe('recommendation engine', () => {
  it('explains personalised picks by the interaction that caused them', () => {
    const cards = [
      card('a', { name: 'Bhoj Garden' }),
      card('b', { name: 'Momo House' }),
      card('c', { name: 'Tool Shop', category: 'Hardware', groups: ['home'], rating: 5, reviewCount: 10 }),
    ];
    const byId = new Map(cards.map((c) => [c._id, c]));
    const profile = buildUserProfile([{ kind: 'order', businessId: 'a' }], byId);
    const [first] = recommendForYou(cards, profile);
    expect(first._id).toBe('b');
    expect(first.reason).toBe('Because you ordered from Bhoj Garden');
  });

  it('never recommends a business the user rated badly or owns', () => {
    const cards = [card('a'), card('b', { ownerId: 'u1' }), card('c')];
    const byId = new Map(cards.map((c) => [c._id, c]));
    const profile = buildUserProfile([{ kind: 'review', businessId: 'a', rating: 1 }], byId);
    const ids = recommendForYou(cards, profile, { userId: 'u1' }).map((c) => c._id);
    expect(ids).toEqual(['c']);
  });

  it('uses co-occurrence for "people also viewed"', () => {
    const cards = [card('a', { name: 'Seed' }), card('b'), card('c')];
    const byId = new Map(cards.map((c) => [c._id, c]));
    const actorSets = new Map([
      ['visitor:x', new Set(['a', 'c'])],
      ['visitor:y', new Set(['a', 'c'])],
      ['visitor:z', new Set(['b'])],
    ]);
    const [first] = recommendAlsoViewed(cards, { seeds: new Set(['a']), actorSets, ownActors: new Set(), cardById: byId });
    expect(first._id).toBe('c');
    expect(first.reason).toContain('Seed');
  });

  it('ranks trending by this week\'s momentum inside the area', () => {
    const cards = [
      card('far', { distanceKm: 120, stats: { ...card('x').stats, orders7: 9 } }),
      card('hot', { stats: { ...card('x').stats, orders7: 2 } }),
      card('quiet'),
    ];
    const list = recommendTrending(cards, { label: 'Kalanki', city: 'Kathmandu' });
    expect(list[0]._id).toBe('hot');
    expect(list[0].reason).toBe('2 orders this week');
    expect(list.map((c) => c._id)).not.toContain('far');
  });

  it('shows each business at most once in the highlight row', () => {
    const shared = card('a');
    const highlights = pickHighlights({ forYou: [shared], nearYou: [shared, card('b')], alsoViewed: [shared], trending: [card('c')] });
    expect(highlights.map((h) => h.business._id)).toEqual(['a', 'b', 'c']);
  });

  it('promotes recently joined businesses, closest and newest first', () => {
    const now = Date.UTC(2026, 8, 28, 12);
    const daysAgo = (days) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    const cards = [
      card('old', { approvedAt: daysAgo(45) }),
      card('far-new', { approvedAt: daysAgo(0), distanceKm: 140 }),
      card('near-week', { approvedAt: daysAgo(9) }),
      card('near-today', { createdAt: daysAgo(40), approvedAt: daysAgo(0) }),
      card('mine', { approvedAt: daysAgo(1), ownerId: 'u1' }),
      card('registered', { createdAt: daysAgo(1) }),
    ];
    const list = recommendNewLocal(cards, { userId: 'u1', now });
    expect(list.map((c) => c._id)).toEqual(['near-today', 'registered', 'near-week', 'far-new']);
    expect(list[0].reason).toBe('Joined UdyogConnect today. Support a new local business');
    expect(list[1].reason).toContain('yesterday');
    expect(list[2].reason).toContain('1 week ago');
  });

  it('keeps a new business in its own highlight slot even when other lists want it', () => {
    const fresh = card('new');
    const highlights = pickHighlights({ forYou: [fresh, card('a')], nearYou: [fresh], trending: [card('t')], newLocal: [fresh] });
    expect(highlights.map((h) => [h.slot, h.business._id])).toEqual([['forYou', 'a'], ['trending', 't'], ['newLocal', 'new']]);
  });

  it('resolves Nepal localities and category groups', () => {
    expect(resolvePlace('Baneshwor, Kathmandu')).toMatchObject({ label: 'Baneshwor', city: 'Kathmandu' });
    expect(resolvePlace('somewhere unknown')).toBeNull();
    expect(categoryGroupsOf({ category: 'Restaurants & Food' })).toEqual(['restaurants']);
    const { nextNepalMidnight } = require('../server/home/feedService');
    expect(new Date(nextNepalMidnight(Date.UTC(2026, 8, 28, 6, 0))).toISOString()).toBe('2026-09-28T18:15:00.000Z');
  });
});

let mongo;
let app;
let db;
let feedService;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'home_feed_test_secret';
  process.env.NODE_ENV = 'test';
  process.env.SEED_DEMO = 'true';
  db = await import('../server/db.js');
  await db.connectDb();
  const serverModule = await import('../server/server.js');
  app = serverModule.app || serverModule.default?.app;
  feedService = require('../server/home/feedService');
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('home feed API', () => {
  let liveIds = [];

  beforeAll(async () => {
    const businesses = await db.Business().find({}).lean();
    await Promise.all(businesses.map((b) => db.Business().findByIdAndUpdate(b._id, { approvalStatus: 'approved' })));
    liveIds = businesses.map((b) => String(b._id));
    feedService.invalidateHomeCache();
  });

  it('serves a guest feed built from live businesses only', async () => {
    const res = await request(app).get('/api/home/feed').set('X-Visitor-Id', 'guest-visitor-001');
    expect(res.status).toBe(200);
    expect(res.body.personalized).toBe(false);
    expect(res.body.featured.length).toBeGreaterThan(0);
    expect(res.body.highlights.length).toBeGreaterThan(0);
    expect(res.body.activity).toEqual([]);
    for (const item of [...res.body.featured, ...res.body.popular]) {
      expect(liveIds).toContain(item._id);
      expect(item.ownerId).toBeUndefined();
    }
    for (const highlight of res.body.highlights) expect(highlight.business.reason).toBeTruthy();
    expect(new Set(res.body.highlights.map((h) => h.business._id)).size).toBe(res.body.highlights.length);
    expect(Array.isArray(res.body.deals.items)).toBe(true);
    res.body.deals.items.forEach((deal) => expect(deal.discount).toBeGreaterThan(0));
  });

  it('lists a newly approved business under New Local Business', async () => {
    const before = await request(app).get('/api/home/feed').set('X-Visitor-Id', 'guest-visitor-002');
    const target = before.body.recommendations.nearYou.find((b) => b.distanceKm != null && b.distanceKm <= 25);
    expect(target).toBeTruthy();
    await db.Business().findByIdAndUpdate(target._id, { approvedAt: new Date() });
    feedService.invalidateHomeCache();
    const res = await request(app).get('/api/home/feed').set('X-Visitor-Id', 'guest-visitor-002');
    expect(res.status).toBe(200);
    expect(res.body.recommendations.newLocal[0]._id).toBe(target._id);
    expect(res.body.highlights.find((h) => h.slot === 'newLocal')?.business._id).toBe(target._id);
  });

  it('uses the typed area for location-based picks', async () => {
    const res = await request(app).get('/api/home/feed?area=Lakeside%2C%20Pokhara');
    expect(res.status).toBe(200);
    expect(res.body.location).toMatchObject({ label: 'Lakeside', city: 'Pokhara', source: 'area' });
  });

  it('records views once per 30 minutes and rejects bad input', async () => {
    const target = liveIds[0];
    const first = await request(app).post('/api/activity/view').set('X-Visitor-Id', 'view-tester-01').send({ businessId: target });
    const again = await request(app).post('/api/activity/view').set('X-Visitor-Id', 'view-tester-01').send({ businessId: target });
    expect(first.status).toBe(202);
    expect(first.body.recorded).toBe(true);
    expect(again.body.recorded).toBe(false);

    expect((await request(app).post('/api/activity/view').send({ businessId: target })).status).toBe(400);
    expect((await request(app).post('/api/activity/view').set('X-Visitor-Id', 'bad id!').send({ businessId: target })).status).toBe(400);
    expect((await request(app).post('/api/activity/view').set('X-Visitor-Id', 'view-tester-01').send({ businessId: 'not-an-id' })).status).toBe(400);
    expect((await request(app).post('/api/activity/view').set('X-Visitor-Id', 'view-tester-01')
      .send({ businessId: new mongoose.Types.ObjectId().toString() })).status).toBe(404);
  });

  it('personalises "people also viewed" from other shoppers\' views', async () => {
    const [seed, companion] = liveIds;
    for (const visitor of ['cooc-visitor-1', 'cooc-visitor-2']) {
      await request(app).post('/api/activity/view').set('X-Visitor-Id', visitor).send({ businessId: seed });
      await request(app).post('/api/activity/view').set('X-Visitor-Id', visitor).send({ businessId: companion });
    }
    await request(app).post('/api/activity/view').set('X-Visitor-Id', 'cooc-me-0001').send({ businessId: seed });
    feedService.invalidateHomeCache();

    const res = await request(app).get('/api/home/feed').set('X-Visitor-Id', 'cooc-me-0001');
    expect(res.status).toBe(200);
    const [first] = res.body.recommendations.alsoViewed;
    expect(first._id).toBe(companion);
    expect(first.reason).toMatch(/also viewed this/);
    expect(res.body.signals.views).toBe(1);
  });

  it('shows the signed-in customer\'s wishlist saves in Recent Activity', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'customer@udyog.np', password: 'password' });
    expect(login.status).toBe(200);
    const auth = { Authorization: `Bearer ${login.body.token}` };
    const target = liveIds[1];

    const save = await request(app).put('/api/auth/wishlist').set(auth).send({ wishlist: { businesses: [target] } });
    expect(save.status).toBe(200);

    const res = await request(app).get('/api/home/feed').set(auth);
    expect(res.status).toBe(200);
    const saved = res.body.activity.find((item) => item.type === 'wishlist');
    expect(saved).toBeTruthy();
    expect(saved.businessId).toBe(target);
    expect(res.body.signals.saved).toBe(1);
    expect(res.body.personalized).toBe(true);
    expect(res.body.recommendations.forYou.length).toBeGreaterThan(0);
  });
});
