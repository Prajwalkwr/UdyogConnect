import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo;
let app;
let token;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = 'addresses_test_jwt_secret_123';
  process.env.NODE_ENV = 'test';
  process.env.DISABLE_REGISTRATION_OTP = 'true';

  const db = await import('../server/db.js');
  await (db.connectDb || db.default.connectDb)();
  const serverModule = await import('../server/server.js');
  app = serverModule.app || (serverModule.default && serverModule.default.app);

  const reg = await request(app).post('/api/auth/register').send({
    name: 'Address Customer', email: `addr${Date.now()}@example.com`, password: 'Password123', confirmPassword: 'Password123', acceptTerms: true, role: 'customer', phone: `98${String(Date.now()).slice(-8)}`,
  });
  token = reg.body.token;
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

const valid = {
  _id: 'addr_1',
  fullName: 'Prajwal Kunwor',
  phone: '9861763879',
  landmark: 'beside train station',
  province: 'Bagmati Province',
  city: 'Kathmandu Outside Ring Road',
  address: 'Shrijana Chowk',
  label: 'Home',
};

const save = (addresses) => request(app).put('/api/auth/profile').set('Authorization', `Bearer ${token}`).send({ addresses });

describe('Delivery address book', () => {
  it('saves a valid address with the fields checkout needs', async () => {
    const res = await save([valid, { ...valid, _id: 'addr_2', label: 'Office', phone: '9712345678', landmark: '' }]);
    expect(res.status).toBe(200);
    expect(res.body.user.addresses).toHaveLength(2);
    expect(res.body.user.addresses[0]).toMatchObject({ ...valid, title: 'Home', location: 'Kathmandu Outside Ring Road' });
    expect(res.body.user.addresses[1]).toMatchObject({ label: 'Office', title: 'Office' });
  });

  it.each([
    ['a name with numbers', { fullName: 'Prajwal 2' }],
    ['a name with symbols', { fullName: 'Prajwal@Kunwor' }],
    ['a phone not starting with 97 or 98', { phone: '9612345678' }],
    ['a phone that is too short', { phone: '986176387' }],
    ['a phone with letters', { phone: '98617638ab' }],
    ['a province outside the list', { province: 'Province 3' }],
    ['a city outside the list', { city: 'Pokhara' }],
    ['an address with numbers', { address: 'House 12 Shrijana Chowk' }],
    ['an address with symbols', { address: 'Shrijana-Chowk' }],
    ['a landmark with numbers', { landmark: 'Gate 2' }],
    ['a label other than Home or Office', { label: 'Friend' }],
  ])('rejects %s', async (_, change) => {
    const res = await save([{ ...valid, ...change }]);
    expect(res.status).toBe(400);
  });

  it('keeps older saved addresses working and rejects non-list input', async () => {
    const legacy = await save([{ _id: 'a_1', title: 'Home', address: 'Baneshwor, Kathmandu' }]);
    expect(legacy.status).toBe(200);
    expect(legacy.body.user.addresses[0]).toMatchObject({ title: 'Home', address: 'Baneshwor, Kathmandu' });

    expect((await save('not a list')).status).toBe(400);
    expect((await save(Array.from({ length: 11 }, (_, i) => ({ ...valid, _id: `a${i}` })))).status).toBe(400);
  });
});
