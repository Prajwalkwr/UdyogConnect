import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo;
let app;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
  process.env.NODE_ENV = 'test';

  // Connect DB models
  const dbModule = await import('../server/db.js');
  const connectDb = dbModule.connectDb || (dbModule.default && dbModule.default.connectDb);
  if (!connectDb) throw new Error('connectDb not found in server/db.js');
  await connectDb();

  // Import express app after DB env is set
  const serverModule = await import('../server/server.js');
  app = serverModule.app || (serverModule.default && serverModule.default.app);
  if (!app) throw new Error('Express app not found in server/server.js');
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('Auth: register and login', () => {
  it('registers a user and allows login', async () => {
    const email = `testuser+${Date.now()}@example.com`;
    const password = 'Testpass123';

    // Register
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email, password, confirmPassword: password })
      .expect(201);

    expect(reg.body).toHaveProperty('success', true);

    // Login
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    expect(login.body).toHaveProperty('token');
    expect(login.body).toHaveProperty('user');
    expect(login.body.user).toHaveProperty('email', email);
  });
});
