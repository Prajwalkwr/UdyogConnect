const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^9[\d\s\-()]{8,18}$/;
const URL_PATTERN = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MEDIA_URL_PATTERN = /^(https?:\/\/\S+|data:[a-z0-9.+\/-]+;base64,[a-z0-9+/=\s]+|\/uploads\/[A-Za-z0-9._-]+)$/i;

const optionalUrlValidator = {
  validator(value) {
    if (value === undefined || value === null || value === '') return true;
    const str = String(value);
    return MEDIA_URL_PATTERN.test(str) || URL_PATTERN.test(str) || str.startsWith('/uploads/');
  },
  message: 'Invalid URL',
};

let isMongo = false;
let cachedDemoPasswordHash = null;

function shouldSeedDemoData() {
  return process.env.NODE_ENV === 'test' || process.env.SEED_DEMO === 'true';
}

function getDemoPasswordHash() {
  if (!cachedDemoPasswordHash) cachedDemoPasswordHash = bcrypt.hashSync('password', 10);
  return cachedDemoPasswordHash;
}
const DEMO_USERS = [
  {
    name: 'Prajwal Customer',
    email: 'customer@udyog.np',
    password: '',
    phone: '9840000001',
    role: 'customer',
    loyaltyPoints: 120,
    profilePicture: '',
    addresses: [{ _id: 'a_1', title: 'Home', address: 'Baneshwor, Kathmandu' }],
    paymentMethods: [{ _id: 'p_1', brand: 'Visa', last4: '4242' }],
    wishlist: { products: [], services: [], businesses: [] },
    twoFactorEnabled: false,
    loginHistory: [],
    isVerified: true,
  },
  {
    name: 'Ram Seller',
    email: 'seller@udyog.np',
    password: '',
    phone: '9840000002',
    role: 'seller',
    loyaltyPoints: 0,
    profilePicture: '',
    addresses: [],
    paymentMethods: [],
    wishlist: { products: [], services: [], businesses: [] },
    twoFactorEnabled: false,
    loginHistory: [],
    isVerified: true,
  },
  {
    demoId: 's2',
    name: 'Mina Craft Seller',
    email: 'crafts@udyog.np',
    password: '',
    phone: '9840000005',
    role: 'seller',
    loyaltyPoints: 0,
    profilePicture: '',
    addresses: [],
    paymentMethods: [],
    wishlist: { products: [], services: [], businesses: [] },
    twoFactorEnabled: false,
    loginHistory: [],
    isVerified: true,
  },
  {
    demoId: 's3',
    name: 'Suman Home Seller',
    email: 'home@udyog.np',
    password: '',
    phone: '9840000006',
    role: 'seller',
    loyaltyPoints: 0,
    profilePicture: '',
    addresses: [],
    paymentMethods: [],
    wishlist: { products: [], services: [], businesses: [] },
    twoFactorEnabled: false,
    loginHistory: [],
    isVerified: true,
  },
  {
    demoId: 'demo-owner-b4',
    name: 'Asha Spice Seller',
    email: 'spice@udyog.np',
    password: '',
    phone: '9840000007',
    role: 'seller',
    loyaltyPoints: 0,
    profilePicture: '',
    addresses: [],
    paymentMethods: [],
    wishlist: { products: [], services: [], businesses: [] },
    twoFactorEnabled: false,
    loginHistory: [],
    isVerified: true,
  },
  {
    demoId: 'demo-owner-b5',
    name: 'Bikash Lakeside Seller',
    email: 'treasures@udyog.np',
    password: '',
    phone: '9840000008',
    role: 'seller',
    loyaltyPoints: 0,
    profilePicture: '',
    addresses: [],
    paymentMethods: [],
    wishlist: { products: [], services: [], businesses: [] },
    twoFactorEnabled: false,
    loginHistory: [],
    isVerified: true,
  },
  {
    demoId: 'demo-owner-b6',
    name: 'Nabin Repair Seller',
    email: 'repair@udyog.np',
    password: '',
    phone: '9840000009',
    role: 'seller',
    loyaltyPoints: 0,
    profilePicture: '',
    addresses: [],
    paymentMethods: [],
    wishlist: { products: [], services: [], businesses: [] },
    twoFactorEnabled: false,
    loginHistory: [],
    isVerified: true,
  },
  
  {
    name: 'Platform Admin',
    email: 'admin@udyog.np',
    password: '',
    phone: '9840000004',
    role: 'admin',
    loyaltyPoints: 0,
    profilePicture: '',
    addresses: [],
    paymentMethods: [],
    wishlist: { products: [], services: [], businesses: [] },
    twoFactorEnabled: false,
    loginHistory: [],
    isVerified: true,
  },
];

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const INLINE_IMAGE_PATTERN = /^data:image\/([a-z0-9.+-]+);base64,/i;
const INLINE_IMAGE_MIN_LENGTH = 2048;
// Chat media stays inline so it remains behind conversation access checks instead of public /uploads.
const KEEP_INLINE_MEDIA_MODELS = new Set(['Chat', 'Conversation', 'Message', 'SupportTicket']);

function saveInlineImage(dataUrl) {
  const match = dataUrl.match(INLINE_IMAGE_PATTERN);
  const subtype = match[1].toLowerCase();
  const ext = subtype === 'jpeg' ? 'jpg' : subtype === 'svg+xml' ? 'svg' : subtype.replace(/[^a-z0-9]/g, '') || 'img';
  const buffer = Buffer.from(dataUrl.slice(match[0].length), 'base64');
  const hash = require('crypto').createHash('sha1').update(buffer).digest('hex').slice(0, 20);
  const filename = `inline-${hash}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(filePath, buffer);
  }
  return `/uploads/${filename}`;
}

/** Replaces large base64 images with /uploads files in place; returns true if anything changed. */
function externalizeInlineImages(node) {
  let changed = false;
  const entries = Array.isArray(node) ? node.entries() : Object.entries(node);
  for (const [key, value] of entries) {
    if (typeof value === 'string') {
      if (value.length >= INLINE_IMAGE_MIN_LENGTH && INLINE_IMAGE_PATTERN.test(value)) {
        try {
          node[key] = saveInlineImage(value);
          changed = true;
        } catch (e) {
          console.warn('Could not move inline image to uploads:', e.message);
        }
      }
    } else if (value && typeof value === 'object') {
      changed = externalizeInlineImages(value) || changed;
    }
  }
  return changed;
}

// Mock database model wrapper mimicking Mongoose methods
class MockModel {
  constructor(name, defaultData = []) {
    this.name = name;
    this.filePath = path.join(__dirname, '.data', `${name}.json`);
    this.defaultData = defaultData;
    this.externalizeMedia = !KEEP_INLINE_MEDIA_MODELS.has(name);

    // ensure dir exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // ensure file exists
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify(defaultData, null, 2));
    }
    this._migrateInlineImages();
  }

  _migrateInlineImages() {
    if (!this.externalizeMedia) return;
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      if (!content.includes(';base64,')) return;
      const data = JSON.parse(content);
      if (externalizeInlineImages(data)) {
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
        console.log(`[db] Moved inline images in ${this.name}.json to /uploads`);
      }
    } catch (e) {
      console.warn(`Inline image migration skipped for ${this.name}:`, e.message);
    }
  }

  _read() {
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      return this.defaultData;
    }
  }

  _write(data) {
    try {
      if (this.externalizeMedia) externalizeInlineImages(data);
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error(`Failed to write database file: ${this.name}`, e);
    }
  }

  async find(query = {}) {
    let data = this._read();
    return data.filter((item) => {
      for (let key in query) {
        if (query[key] !== undefined && String(item[key]) !== String(query[key])) {
          return false;
        }
      }
      return true;
    });
  }

  async findOne(query = {}) {
    let data = this._read();
    return data.find((item) => {
      for (let key in query) {
        if (query[key] !== undefined && String(item[key]) !== String(query[key])) {
          return false;
        }
      }
      return true;
    }) || null;
  }

  async findById(id) {
    return this.findOne({ _id: id });
  }

  async create(doc) {
    let data = this._read();
    const newDoc = {
      _id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...doc,
    };
    data.unshift(newDoc); // Add to beginning
    this._write(data);
    return newDoc;
  }

  async findByIdAndUpdate(id, update, options = {}) {
    let data = this._read();
    const idStr = String(id);
    let index = data.findIndex((item) => String(item._id) === idStr);
    if (index === -1) return null;
    // Support mongoose-style $set updates as well as plain objects
    const patch = update && typeof update === 'object' && update.$set && typeof update.$set === 'object'
      ? update.$set
      : (update || {});
    const updated = {
      ...data[index],
      ...patch,
      _id: data[index]._id,
      updatedAt: new Date().toISOString(),
    };
    data[index] = updated;
    this._write(data);
    return updated;
  }

  async updateOne(query, update) {
    let data = this._read();
    let index = data.findIndex((item) => {
      for (let key in query) {
        if (item[key] !== query[key]) return false;
      }
      return true;
    });
    if (index === -1) return { modifiedCount: 0 };
    data[index] = {
      ...data[index],
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this._write(data);
    return { modifiedCount: 1 };
  }

  async deleteOne(query) {
    let data = this._read();
    let index = data.findIndex((item) => {
      for (let key in query) {
        if (item[key] !== query[key]) return false;
      }
      return true;
    });
    if (index === -1) return { deletedCount: 0 };
    data.splice(index, 1);
    this._write(data);
    return { deletedCount: 1 };
  }

  async deleteMany(query) {
    let data = this._read();
    let initialLength = data.length;
    data = data.filter((item) => {
      for (let key in query) {
        if (item[key] !== query[key]) return true;
      }
      return false;
    });
    this._write(data);
    return { deletedCount: initialLength - data.length };
  }

  async countDocuments(query = {}) {
    const results = await this.find(query);
    return results.length;
  }

  /**
   * Conditional update used for idempotency claims. Read-modify-write is fully synchronous,
   * so it cannot interleave with other requests in this process.
   * Supports equality, $exists, $ne, $in, $lt, $or filters and $set/$inc/$unset updates.
   */
  async findOneAndUpdate(filter = {}, update = {}, options = {}) {
    const data = this._read();
    let index = data.findIndex((item) => matchesMockFilter(item, filter));
    if (index === -1 && !options.upsert) return null;

    const now = new Date().toISOString();
    let doc;
    if (index === -1) {
      doc = { _id: filter._id !== undefined ? filter._id : Math.random().toString(36).substr(2, 9), createdAt: now };
      for (const [key, value] of Object.entries(filter)) {
        if (!key.startsWith('$') && (value === null || typeof value !== 'object')) doc[key] = value;
      }
      data.unshift(doc);
      index = 0;
    } else {
      doc = data[index];
    }
    const before = { ...doc };

    const hasOperators = Object.keys(update).some((key) => key.startsWith('$'));
    const toStorable = (value) => (value instanceof Date ? value.toISOString() : value);
    const set = hasOperators ? (update.$set || {}) : update;
    for (const [key, value] of Object.entries(set)) doc[key] = toStorable(value);
    for (const [key, value] of Object.entries(update.$inc || {})) doc[key] = (Number(doc[key]) || 0) + Number(value);
    for (const key of Object.keys(update.$unset || {})) delete doc[key];
    doc.updatedAt = now;

    data[index] = doc;
    this._write(data);
    return options.new || options.returnDocument === 'after' ? doc : before;
  }
}

function mockValuesEqual(actual, expected) {
  if (expected === null) return actual === null || actual === undefined;
  return String(actual) === String(expected);
}

function toComparable(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).getTime();
  return value;
}

function matchesMockFilter(item, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return condition.some((sub) => matchesMockFilter(item, sub));
    const actual = item[key];
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('$exists' in condition) {
        const exists = actual !== undefined;
        if (exists !== Boolean(condition.$exists)) return false;
      }
      if ('$ne' in condition && mockValuesEqual(actual, condition.$ne)) return false;
      if ('$in' in condition && !condition.$in.some((value) => mockValuesEqual(actual, value))) return false;
      if ('$lt' in condition) {
        if (actual === undefined || actual === null) return false;
        if (!(toComparable(actual) < toComparable(condition.$lt))) return false;
      }
      return true;
    }
    return mockValuesEqual(actual, condition instanceof Date ? condition.toISOString() : condition);
  });
}

// Default Seed Data
const defaultBusinesses = [
  {
    _id: 'cafe-xyz',
    ownerId: 's1',
    name: 'The Himalayan Café',
    category: 'Food & Beverages',
    subcategory: 'Cafe & Restaurant',
    location: 'Thamel, Kathmandu',
    price: '200',
    description: 'Cozy café serving specialty coffee, snacks, and comforting meals made with locally sourced ingredients.',
    contactEmail: 'hello@himalayancafe.com',
    phone: '9812345678',
    website: 'https://www.himalayancafe.com',
    hours: '07:00-22:00',
    openingDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    imageUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=400&q=80',
    coverUrl: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1600&q=80',
    latitude: 27.7152,
    longitude: 85.3126,
    verified: 'verified',
    approvalStatus: 'approved',
    rating: 0,
    reviewCount: 0,
  },
  {
    _id: 'b1',
    ownerId: 's1',
    name: 'Bhoj Garden',
    category: 'Restaurants',
    subcategory: 'Traditional meals',
    location: 'Kathmandu',
    price: '500',
    description: 'Traditional Newari meals, local flavors, and weekly catering.',
    contactEmail: 'bhoj@garden.np',
    phone: '9841234567',
    website: 'https://bhojgarden.com',
    hours: '10:00 - 22:00',
    imageUrl: '',
    latitude: 27.7007,
    longitude: 85.3001,
    verified: 'verified',
    rating: 0,
    reviewCount: 0,
  },
  {
    _id: 'b2',
    ownerId: 's2',
    name: 'Sunar Craft House',
    category: 'Gift Shop',
    subcategory: 'Arts & Crafts',
    location: 'Pokhara',
    price: '300',
    description: 'Handcrafted gifts, home decor, and local art pieces.',
    contactEmail: 'sunar@craft.np',
    phone: '9847654321',
    website: '',
    hours: '09:00 - 19:00',
    imageUrl: '',
    latitude: 28.2096,
    longitude: 83.9856,
    verified: 'verified',
    rating: 0,
    reviewCount: 0,
  },
  {
    _id: 'b3',
    ownerId: 's3',
    name: 'Lalitpur Home Essentials',
    category: 'Furniture',
    subcategory: 'Home Essentials',
    location: 'Lalitpur',
    price: '1200',
    description: 'Useful home supplies, decor, and daily essentials.',
    contactEmail: 'lalitpur@home.np',
    phone: '9851011121',
    website: '',
    hours: '08:00 - 20:00',
    imageUrl: '',
    latitude: 27.6710,
    longitude: 85.3240,
    verified: 'pending',
    rating: 0,
    reviewCount: 0,
  },
  {
    _id: 'b4',
    ownerId: 'demo-owner-b4',
    name: 'Himalayan Spice Corner',
    category: 'Grocery',
    subcategory: 'Local groceries and spices',
    location: 'Bhaktapur',
    price: '100-2500',
    description: 'Nepali spices, organic grains, lentils, and everyday household groceries sourced from local producers.',
    contactEmail: 'hello@himalayanspice.np',
    phone: '9841000004',
    website: '',
    hours: '07:00 - 20:00',
    imageUrl: '',
    latitude: 27.6710,
    longitude: 85.4298,
    approvalStatus: 'approved',
    verified: 'verified',
    isVerified: true,
    approvedAt: new Date().toISOString(),
    approvedBy: 'demo-admin',
    rating: 0,
    reviewCount: 0,
  },
  {
    _id: 'b5',
    ownerId: 'demo-owner-b5',
    name: 'Pokhara Lakeside Treasures',
    category: 'Gift Shop',
    subcategory: 'Handmade crafts and souvenirs',
    location: 'Pokhara',
    price: '250-5000',
    description: 'Handmade lokta paper, wool products, woodcraft, and thoughtful souvenirs from Nepali artisans.',
    contactEmail: 'hello@lakesidetreasures.np',
    phone: '9856000005',
    website: '',
    hours: '09:00 - 20:00',
    imageUrl: '',
    latitude: 28.2096,
    longitude: 83.9596,
    approvalStatus: 'approved',
    verified: 'verified',
    isVerified: true,
    approvedAt: new Date().toISOString(),
    approvedBy: 'demo-admin',
    rating: 0,
    reviewCount: 0,
  },
  {
    _id: 'b6',
    ownerId: 'demo-owner-b6',
    name: 'Bagmati Home Repair',
    category: 'Home Services',
    subcategory: 'Plumbing and electrical repair',
    location: 'Lalitpur',
    price: '800-5000',
    description: 'Reliable local plumbing, electrical, appliance repair, and home maintenance services across the valley.',
    contactEmail: 'support@bagmatihomerepair.np',
    phone: '9860000006',
    website: '',
    hours: '08:00 - 18:00',
    imageUrl: '',
    latitude: 27.6588,
    longitude: 85.3247,
    approvalStatus: 'approved',
    verified: 'verified',
    isVerified: true,
    approvedAt: new Date().toISOString(),
    approvedBy: 'demo-admin',
    rating: 0,
    reviewCount: 0,
  },
];

const defaultProducts = [
  {
    _id: 'p1',
    businessId: 'b1',
    name: 'Rice Platter',
    category: 'Restaurants',
    subcategory: 'Newari',
    description: 'A traditional platter with curry, lentils, pickle, and fresh tea.',
    price: 500,
    discount: 10,
    stock: 20,
    sku: 'BHOJ-RICE-01',
    brand: 'Homegrown',
    images: ['https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80'],
    availability: true,
  },
  {
    _id: 'p2',
    businessId: 'b2',
    name: 'Craft Basket',
    category: 'Gift Shop',
    subcategory: 'Basketry',
    description: 'A decorative basket made by a local artisan using bamboo fibers.',
    price: 750,
    discount: 0,
    stock: 5,
    sku: 'SUNAR-BASKET-02',
    brand: 'Sunar Crafts',
    images: ['https://images.unsplash.com/photo-1594737625785-c668dffdad9c?auto=format&fit=crop&w=800&q=80'],
    availability: true,
  },
  {
    _id: 'p3',
    businessId: 'b3',
    name: 'Dining Set',
    category: 'Furniture',
    subcategory: 'Kitchenware',
    description: 'A durable and stylish wooden plate and bowl set for everyday use.',
    price: 1200,
    discount: 5,
    stock: 6,
    sku: 'LHE-DINING-03',
    brand: 'Lalitpur Wood',
    images: ['https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&w=800&q=80'],
    availability: true,
  },
  {
    _id: 'p4', businessId: 'b4', name: 'Himalayan Turmeric Powder', category: 'Grocery', subcategory: 'Spices',
    description: 'Stone-ground turmeric sourced from Nepali hill farms.', price: 220, discount: 0, stock: 40, sku: 'HSC-TURMERIC-04', brand: 'Himalayan Spice Corner',
    images: ['https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=800&q=80'],
    availability: true,
  },
  {
    _id: 'p5', businessId: 'b5', name: 'Lokta Paper Journal', category: 'Gift Shop', subcategory: 'Stationery',
    description: 'Handmade lokta paper journal crafted by Nepali artisans.', price: 450, discount: 5, stock: 25, sku: 'PLT-JOURNAL-05', brand: 'Pokhara Lakeside Treasures',
    images: ['https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=800&q=80'],
    availability: true,
  },
  {
    _id: 'p6', businessId: 'b6', name: 'Home Electrical Safety Check', category: 'Home Services', subcategory: 'Electrical',
    description: 'A professional inspection of household wiring and electrical fittings.', price: 1500, discount: 0, stock: 20, sku: 'BHR-SAFETY-06', brand: 'Bagmati Home Repair',
    images: ['https://images.unsplash.com/photo-1621905251189-08b45d6a809e?auto=format&fit=crop&w=800&q=80'],
    availability: true,
  },
];

const defaultServices = [
  {
    _id: 's_v1',
    businessId: 'b1',
    name: 'Private Catering Service',
    description: 'Hire our chefs for Newari feast catering at your home.',
    price: 5000,
    duration: 180,
    availability: true,
    slots: ['12:00 - 15:00', '17:00 - 20:00'],
    staff: ['Chef Ram', 'Server Hari'],
    homeService: true,
  },
  {
    _id: 's_v2',
    businessId: 'b3',
    name: 'Furniture Polish & Refinish',
    description: 'Get your old wooden furniture repolished to look brand new.',
    price: 3500,
    duration: 120,
    availability: true,
    slots: ['09:00 - 11:00', '13:00 - 15:00'],
    staff: ['Madan Lal'],
    homeService: true,
  },
  {
    _id: 's_v3', businessId: 'b4', name: 'Monthly Grocery Delivery', description: 'Scheduled delivery of fresh staples and spices around Bhaktapur.', price: 150, duration: 30, availability: true, slots: ['08:00 - 10:00', '16:00 - 18:00'], staff: ['Asha'], homeService: true,
  },
  {
    _id: 's_v4', businessId: 'b5', name: 'Custom Souvenir Gift Pack', description: 'A curated Nepali craft gift pack prepared for events and visitors.', price: 1800, duration: 60, availability: true, slots: ['10:00 - 12:00', '14:00 - 16:00'], staff: ['Bikash'], homeService: false,
  },
  {
    _id: 's_v5', businessId: 'b6', name: 'Plumbing Emergency Visit', description: 'Same-day plumbing inspection and repair for homes in the Kathmandu Valley.', price: 1200, duration: 90, availability: true, slots: ['09:00 - 11:00', '13:00 - 15:00'], staff: ['Nabin'], homeService: true,
  },
];

const defaultCoupons = [
  { _id: 'c_p1', code: 'NEPAL50', discountPercent: 15, maxDiscount: 500, expiryDate: '2026-12-31', active: true },
  { _id: 'c_p2', code: 'WELCOME10', discountPercent: 10, maxDiscount: 200, expiryDate: '2026-12-31', active: true },
];

let db = {};

// Initialize Mongoose Schemas if mongo is active
const seedDemoUsers = async () => {
  if (!db.User || !shouldSeedDemoData()) return;
  const password = getDemoPasswordHash();
  for (const userData of DEMO_USERS) {
    const existing = await db.User.findOne({ email: userData.email });
    if (!existing) {
      const seedData = isMongo
        ? (({ demoId, ...data }) => data)(userData)
        : { ...userData, _id: userData.demoId || undefined };
      await db.User.create({ ...seedData, password });
    }
  }
};

const seedDemoBusinesses = async () => {
  if (!db.Business || !shouldSeedDemoData()) return;

  const ownerIdMap = {};
  const seller = await db.User.findOne({ email: 'seller@udyog.np' });
  if (seller) ownerIdMap.s1 = String(seller._id);
  for (const userData of DEMO_USERS) {
    if (userData.role !== 'seller' || !userData.demoId) continue;
    const found = await db.User.findOne({ email: userData.email });
    if (found) ownerIdMap[userData.demoId] = String(found._id);
  }

  for (const businessData of defaultBusinesses) {
    const existing = await db.Business.findOne({ name: businessData.name });
    if (!existing) {
      const mappedOwner = ownerIdMap[businessData.ownerId] || businessData.ownerId;
      const seedData = isMongo
        ? (({ _id, ...data }) => ({ ...data, ownerId: mappedOwner }))(businessData)
        : { ...businessData, ownerId: mappedOwner };
      await db.Business.create(seedData);
    } else if (ownerIdMap[existing.ownerId] || (businessData.ownerId && ownerIdMap[businessData.ownerId] && String(existing.ownerId) !== ownerIdMap[businessData.ownerId])) {
      const nextOwner = ownerIdMap[existing.ownerId] || ownerIdMap[businessData.ownerId];
      if (nextOwner && String(existing.ownerId) !== String(nextOwner)) {
        await db.Business.findByIdAndUpdate(existing._id, { ownerId: nextOwner });
      }
    }
  }
};

const seedDemoCatalog = async () => {
  if (!shouldSeedDemoData() || !db.Product || !db.Service) return;
  for (const productData of defaultProducts) {
    const business = isMongo ? null : await db.Business.findOne({ _id: productData.businessId });
    const seedData = { ...productData, businessId: business?._id || productData.businessId };
    const existing = await db.Product.findOne({ sku: productData.sku });
    if (!existing) {
      await db.Product.create(isMongo ? (({ _id, ...data }) => data)(seedData) : seedData);
    } else if (Array.isArray(productData.images) && productData.images.length
      && (!Array.isArray(existing.images) || existing.images.length === 0)) {
      await db.Product.findByIdAndUpdate(existing._id, { images: productData.images });
    }
  }
  for (const serviceData of defaultServices) {
    const business = isMongo ? null : await db.Business.findOne({ _id: serviceData.businessId });
    const seedData = { ...serviceData, businessId: business?._id || serviceData.businessId };
    const existing = await db.Service.findOne({ name: serviceData.name, businessId: seedData.businessId });
    if (!existing) await db.Service.create(isMongo ? (({ _id, ...data }) => data)(seedData) : seedData);
  }
};

const initMongooseModels = async () => {
  const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, match: [EMAIL_PATTERN, 'Invalid email address'] },
    password: { type: String, required: true },
    phone: { type: String, trim: true, match: [PHONE_PATTERN, 'Invalid phone number'] },
    role: { type: String, enum: ['customer', 'seller', 'admin'], default: 'customer' },
    businessOfferingType: { type: String, enum: ['products', 'services', 'both'] },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    profilePicture: { type: String, default: '', trim: true, validate: optionalUrlValidator },
    addresses: { type: Array, default: [] },
    paymentMethods: { type: Array, default: [] },
    wishlist: {
      products: { type: Array, default: [] },
      services: { type: Array, default: [] },
      businesses: { type: Array, default: [] },
    },
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    twoFactorEnabled: { type: Boolean, default: false },
    loginHistory: { type: Array, default: [] },
    termsAcceptedAt: { type: Date, default: null },
    termsVersion: { type: String, default: '', trim: true },
    isVerified: { type: Boolean, default: false },
    verificationOtp: { type: String, default: '' },
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockUntil: { type: Date, default: null },
    resetOtp: { type: String, default: '' },
    passwordResetTokenHash: { type: String, default: null },
    passwordResetExpires: { type: Date, default: null },
    passwordResetRequestedAt: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null },
    lastSeen: { type: Date, default: null },
  }, { timestamps: true });

  const businessSchema = new mongoose.Schema({
    ownerId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    subcategory: { type: String, default: '', trim: true },
    location: { type: String, required: true, trim: true },
    price: { type: String, default: '0', trim: true },
    description: { type: String, required: true, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true, match: [EMAIL_PATTERN, 'Invalid email address'] },
    phone: { type: String, trim: true, match: [PHONE_PATTERN, 'Invalid phone number'] },
    website: { type: String, default: '', trim: true, validate: optionalUrlValidator },
    hours: { type: String, default: '09:00 - 18:00', trim: true },
    openingDays: {
      type: [String],
      default: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    },
    holidays: { type: Array, default: [] },
    blockedDates: { type: Array, default: [] },
    openingTime: { type: String, default: '', trim: true },
    closingTime: { type: String, default: '', trim: true },
    minBookingNoticeMinutes: { type: Number, default: 30, min: 0 },
    maxAdvanceBookingDays: { type: Number, default: 60, min: 1 },
    bookingSlotIntervalMinutes: { type: Number, default: 30, min: 5 },
    imageUrl: { type: String, default: '', trim: true, validate: optionalUrlValidator },
    coverUrl: { type: String, default: '', trim: true, validate: optionalUrlValidator },
    qrUrl: { type: String, default: '', trim: true, validate: optionalUrlValidator },
    latitude: { type: Number, default: 27.7007 },
    longitude: { type: Number, default: 85.3001 },
    verified: { type: String, enum: ['pending', 'verified', 'approved', 'rejected', 'suspended'] },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended', 'revision_requested'] },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: String, default: null, trim: true },
    isVerified: { type: Boolean, default: false },
    rejectionReason: { type: String, default: '', trim: true },
    revisionStatus: { type: String, enum: ['none', 'requested', 'in_review', 'resubmitted'], default: 'none' },
    revisionReason: { type: String, default: '', trim: true },
    revisionRequestedAt: { type: Date, default: null },
    revisionRequestedBy: { type: String, default: null, trim: true },
    documents: { type: Array, default: [] },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    registrationNumber: { type: String, default: '', trim: true },
    panVatNumber: { type: String, default: '', trim: true },
    deliveryAvailable: { type: Boolean, default: true },
    visitorsCount: { type: Number, default: 0, min: 0 },
    commissionRate: { type: Number, default: 10, min: 0, max: 100 },
    offeringType: { type: String, enum: ['products', 'services', 'both'], default: 'both' },
    isOpen: { type: Boolean, default: true },
    manualOpenOverride: { type: Boolean, default: null },
    manualOverrideAt: { type: Date, default: null },
    deliveryAvailable: { type: Boolean, default: true },
    deliveryRadiusKm: { type: Number, default: 5, min: 0 },
    // The eSewa secret key is kept in PaymentCredential, never on the business document.
    paymentSettings: {
      provider: { type: String, enum: ['eSewa'], default: 'eSewa' },
      merchantCode: { type: String, default: '', trim: true },
      environment: { type: String, enum: ['sandbox', 'live'], default: 'sandbox' },
      successUrl: { type: String, default: '', trim: true },
      failureUrl: { type: String, default: '', trim: true },
      isConnected: { type: Boolean, default: false },
      connectedAt: { type: Date, default: null },
    },
  }, { timestamps: true });

  const productSchema = new mongoose.Schema({
    businessId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    subcategory: { type: String, default: '', trim: true },
    description: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    sku: { type: String, default: '', trim: true },
    brand: { type: String, default: '', trim: true },
    images: { type: Array, default: [] },
    availability: { type: Boolean, default: true },
  }, { timestamps: true });

  const serviceSchema = new mongoose.Schema({
    businessId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    duration: { type: Number, default: 60, min: 0 },
    availability: { type: Boolean, default: true },
    availableFrom: { type: String, default: '', trim: true },
    availableTo: { type: String, default: '', trim: true },
    slots: { type: Array, default: [] },
    staff: { type: Array, default: [] },
    homeService: { type: Boolean, default: false },
    imageUrl: { type: String, default: '', trim: true, validate: optionalUrlValidator },
    images: { type: Array, default: [] },
  }, { timestamps: true });

  const deliveryAddressSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, match: [EMAIL_PATTERN, 'Invalid email address'] },
    phone: { type: String, required: true, trim: true, match: [PHONE_PATTERN, 'Invalid phone number'] },
    location: { type: String, default: '', trim: true },
    address: { type: String, required: true, trim: true },
    method: { type: String, enum: ['delivery', 'pickup'], required: true },
  }, { _id: false });

  const orderSchema = new mongoose.Schema({
    customerId: { type: String, required: true, trim: true },
    businessId: { type: String, required: true, trim: true },
    items: { type: Array, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['placed', 'accepted', 'preparing', 'dispatched', 'completed', 'cancelled', 'rejected'], default: 'placed' },
    paymentMethod: { type: String, enum: ['COD', 'Card', 'Wallet', 'QR', 'eSewa'], required: true },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
    deliveryAddress: { type: deliveryAddressSchema, required: true },
    deliveryRiderId: { type: String, default: '' },
    deliveryOtp: { type: String, default: '' },
    deliveryOtpAttempts: { type: Number, default: 0, min: 0 },
    deliveryProof: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    esewaTransactionUuid: { type: String, trim: true },
    dispatchedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    trackingHistory: { type: Array, default: [] },
    checkoutKey: { type: String, trim: true },
    paidAt: { type: Date, default: null },
    paymentTransactionId: { type: String, default: '' },
    stripeSessionId: { type: String, default: '' },
    billNumber: { type: String, trim: true },
    billGeneratedAt: { type: Date, default: null },
    billPdfFilename: { type: String, default: null },
    billEmailSent: { type: Boolean, default: false },
    billEmailSentAt: { type: Date, default: null },
    billEmailStatus: { type: String, enum: ['not_sent', 'sending', 'sent', 'failed'], default: 'not_sent' },
    billEmailTo: { type: String, default: '' },
    billEmailError: { type: String, default: '' },
    billEmailAttempts: { type: Number, default: 0 },
    billEmailLastAttemptAt: { type: Date, default: null },
    billEmailLockedAt: { type: Date, default: null },
  }, { timestamps: true });
  // Sparse so legacy orders without a bill (or checkout key) don't collide on null.
  orderSchema.index({ billNumber: 1 }, { unique: true, sparse: true });
  orderSchema.index({ customerId: 1, checkoutKey: 1 }, { unique: true, partialFilterExpression: { checkoutKey: { $type: 'string' } } });
  orderSchema.index({ esewaTransactionUuid: 1 }, { unique: true, partialFilterExpression: { esewaTransactionUuid: { $type: 'string' } } });

  const paymentCredentialSchema = new mongoose.Schema({
    businessId: { type: String, required: true, trim: true, unique: true },
    provider: { type: String, enum: ['eSewa'], default: 'eSewa' },
    secretKeyEncrypted: { type: String, required: true },
  }, { timestamps: true });

  // One eSewa checkout attempt. The order is only created after eSewa confirms the payment.
  const esewaPaymentSchema = new mongoose.Schema({
    transactionUuid: { type: String, required: true, trim: true, unique: true },
    customerId: { type: String, required: true, trim: true },
    businessId: { type: String, required: true, trim: true },
    merchantCode: { type: String, required: true, trim: true },
    environment: { type: String, enum: ['sandbox', 'live'], default: 'sandbox' },
    checkoutKey: { type: String, trim: true },
    items: { type: Array, required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    deliveryAddress: { type: Object, required: true },
    status: { type: String, enum: ['initiated', 'processing', 'completed', 'failed'], default: 'initiated' },
    orderId: { type: String, default: '' },
    transactionCode: { type: String, default: '' },
    refId: { type: String, default: '' },
    failureReason: { type: String, default: '' },
    verifiedAt: { type: Date, default: null },
    simulatedAt: { type: Date, default: null },
  }, { timestamps: true });
  esewaPaymentSchema.index({ customerId: 1, checkoutKey: 1 });

  const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  });

  const bookingSchema = new mongoose.Schema({
    customerId: { type: String, required: true },
    customerName: { type: String, default: '', trim: true },
    customerEmail: { type: String, default: '', trim: true },
    customerPhone: { type: String, default: '', trim: true },
    businessId: { type: String, required: true },
    businessName: { type: String, default: '', trim: true },
    serviceId: { type: String, required: true },
    serviceName: { type: String, default: '', trim: true },
    servicePrice: { type: Number, default: 0, min: 0 },
    date: { type: String, required: true },
    timeSlot: { type: String, required: true },
    durationMinutes: { type: Number, default: 60, min: 5 },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    staffMember: { type: String },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'cancelled', 'rejected'],
      default: 'pending',
    },
    homeService: { type: Boolean, default: false },
    reminderSent: { type: Boolean, default: false },
    timezone: { type: String, default: 'Asia/Kathmandu' },
  }, { timestamps: true });
  bookingSchema.index({ businessId: 1, date: 1, status: 1 });
  bookingSchema.index({ businessId: 1, serviceId: 1, date: 1, timeSlot: 1 });
  bookingSchema.index({ customerId: 1, createdAt: -1 });

  const reviewSchema = new mongoose.Schema({
    customerId: { type: String, required: true, trim: true },
    customerName: { type: String, required: true, trim: true },
    businessId: { type: String, required: true, trim: true },
    targetId: { type: String, required: true, trim: true },
    targetType: { type: String, enum: ['product', 'service', 'business'], required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true },
    images: { type: Array, default: [] },
    reported: { type: Boolean, default: false },
    reportCount: { type: Number, default: 0, min: 0 },
  }, { timestamps: true });

  const reportSchema = new mongoose.Schema({
    targetType: { type: String, enum: ['review', 'business'], required: true },
    targetId: { type: String, required: true, trim: true },
    businessId: { type: String, default: '', trim: true },
    reporterId: { type: String, required: true, trim: true },
    reporterName: { type: String, default: '', trim: true },
    reporterRole: { type: String, default: '', trim: true },
    reason: { type: String, required: true, trim: true },
    details: { type: String, default: '', trim: true, maxlength: 500 },
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
    resolution: { type: String, default: '', trim: true },
    resolvedBy: { type: String, default: '' },
    resolvedAt: { type: Date, default: null },
    targetSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  }, { timestamps: true });
  reportSchema.index({ targetType: 1, targetId: 1, reporterId: 1 }, { unique: true });
  reportSchema.index({ status: 1, createdAt: -1 });

  const chatSchema = new mongoose.Schema({
    senderId: { type: String, required: true },
    receiverId: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['text', 'image'], default: 'text' },
    mediaUrl: { type: String, default: '' },
  }, { timestamps: true });

  const conversationSchema = new mongoose.Schema({
    customerId: { type: String, required: true, trim: true, index: true },
    businessId: { type: String, required: true, trim: true, index: true },
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: null },
    customerUnreadCount: { type: Number, default: 0, min: 0 },
    businessUnreadCount: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'archived', 'blocked'], default: 'active' },
    customerArchived: { type: Boolean, default: false },
    businessArchived: { type: Boolean, default: false },
    blockedBy: { type: String, default: '' },
    reportedBy: { type: String, default: '' },
    reportReason: { type: String, default: '' },
    reportedAt: { type: Date, default: null },
  }, { timestamps: true });
  conversationSchema.index({ customerId: 1, businessId: 1 }, { unique: true });
  conversationSchema.index({ updatedAt: -1 });
  conversationSchema.index({ lastMessageAt: -1 });

  const messageSchema = new mongoose.Schema({
    conversationId: { type: String, required: true, trim: true, index: true },
    senderId: { type: String, required: true, trim: true, index: true },
    senderRole: { type: String, enum: ['customer', 'seller', 'business', 'system', 'admin'], required: true },
    receiverId: { type: String, required: true, trim: true, index: true },
    message: { type: String, default: '' },
    messageType: {
      type: String,
      enum: ['text', 'image', 'file', 'product', 'order', 'system'],
      default: 'text',
    },
    attachmentUrl: { type: String, default: '', trim: true, validate: optionalUrlValidator },
    productId: { type: String, default: '' },
    orderId: { type: String, default: '' },
    clientMessageId: { type: String, default: '', trim: true, index: true },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  }, { timestamps: true });
  messageSchema.index({ conversationId: 1, createdAt: -1 });
  messageSchema.index({ conversationId: 1, clientMessageId: 1 }, { unique: true, partialFilterExpression: { clientMessageId: { $type: 'string', $gt: '' } } });

  const notificationSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, default: 'general' },
    read: { type: Boolean, default: false },
    conversationId: { type: String, default: '' },
    link: { type: String, default: '' },
  }, { timestamps: true });

  const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    discountPercent: { type: Number, required: true, min: 0 },
    maxDiscount: { type: Number, required: true, min: 0 },
    expiryDate: { type: String, required: true, trim: true, match: [DATE_PATTERN, 'Expiry date must be YYYY-MM-DD'] },
    active: { type: Boolean, default: true },
  }, { timestamps: true });

  const auditLogSchema = new mongoose.Schema({
    userId: { type: String },
    action: { type: String, required: true },
    details: { type: String },
  }, { timestamps: true });

  const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
  }, { timestamps: true });

  const systemSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
  }, { timestamps: true });

  const activityEventSchema = new mongoose.Schema({
    type: { type: String, enum: ['view_business', 'view_product', 'wishlist_add'], required: true },
    userId: { type: String, default: '', trim: true },
    visitorId: { type: String, default: '', trim: true },
    businessId: { type: String, default: '', trim: true },
    productId: { type: String, default: '', trim: true },
  }, { timestamps: true });
  activityEventSchema.index({ userId: 1, createdAt: -1 });
  activityEventSchema.index({ businessId: 1, createdAt: -1 });
  activityEventSchema.index({ visitorId: 1, createdAt: -1 });
  // Behaviour signals only matter while recent; let MongoDB expire them.
  activityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

  userSchema.index({ role: 1 });
  userSchema.index({ passwordResetTokenHash: 1 }, { sparse: true });
  userSchema.index({ phone: 1 }, { unique: true, sparse: true });
  businessSchema.index({ ownerId: 1 });
  businessSchema.index({ category: 1 });
  businessSchema.index({ location: 1 });
  businessSchema.index({ approvalStatus: 1 });
  productSchema.index({ businessId: 1 });
  productSchema.index({ category: 1 });
  serviceSchema.index({ businessId: 1 });
  orderSchema.index({ customerId: 1, createdAt: -1 });
  orderSchema.index({ businessId: 1, createdAt: -1 });
  reviewSchema.index({ businessId: 1, createdAt: -1 });
  reviewSchema.index({ customerId: 1 });
  notificationSchema.index({ userId: 1, createdAt: -1 });

  const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

  db.User = model('User', userSchema);
  db.Business = model('Business', businessSchema);
  db.Product = model('Product', productSchema);
  db.Service = model('Service', serviceSchema);
  db.Order = model('Order', orderSchema);
  db.Counter = model('Counter', counterSchema);
  db.ActivityEvent = model('ActivityEvent', activityEventSchema);
  db.PaymentCredential = model('PaymentCredential', paymentCredentialSchema);
  db.EsewaPayment = model('EsewaPayment', esewaPaymentSchema);
  db.Booking = model('Booking', bookingSchema);
  db.Review = model('Review', reviewSchema);
  db.Report = model('Report', reportSchema);
  db.Chat = model('Chat', chatSchema);
  db.Conversation = model('Conversation', conversationSchema);
  db.Message = model('Message', messageSchema);
  db.Notification = model('Notification', notificationSchema);
  db.Coupon = model('Coupon', couponSchema);
  db.AuditLog = model('AuditLog', auditLogSchema);
  db.Category = model('Category', categorySchema);
  db.SystemSetting = model('SystemSetting', systemSettingSchema);

  const supportTicketSchema = new mongoose.Schema({
    userId: { type: String, required: true, trim: true },
    userName: { type: String, default: '' },
    email: { type: String, default: '', trim: true },
    category: { type: String, default: 'general', trim: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ['open', 'in-progress', 'resolved'], default: 'open' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    resolution: { type: String, default: '' },
  }, { timestamps: true });

  db.SupportTicket = mongoose.models.SupportTicket || mongoose.model('SupportTicket', supportTicketSchema);

  await seedDemoUsers();
  await seedDemoBusinesses();
  await seedDemoCatalog();
  // Ensure indexes (unique constraints) are created
  try {
    await Promise.all([
      db.User.createIndexes(),
      db.Business.createIndexes(),
      db.Product.createIndexes(),
      db.Service.createIndexes(),
      db.Order.createIndexes(),
      db.Review.createIndexes(),
      db.Report.createIndexes(),
      db.Notification.createIndexes(),
      db.Conversation.createIndexes(),
      db.Message.createIndexes(),
    ]);
    console.log('Database indexes ensured');
  } catch (e) {
    console.warn('Failed to create user indexes:', e && e.message);
  }
};

const initMockModels = async () => {
  const legacyIds = {
    'customer@udyog.np': 'u1',
    'seller@udyog.np': 's1',
    'admin@udyog.np': 'a1',
  };
  const seededUsers = shouldSeedDemoData()
    ? DEMO_USERS.map((user) => {
      const seededId = user.demoId || legacyIds[user.email];
      return { ...user, password: getDemoPasswordHash(), ...(seededId ? { _id: seededId } : {}) };
    })
    : [];

  const userModel = new MockModel('User', seededUsers);
  db.User = userModel;
  await seedDemoUsers();

  db.Business = new MockModel('Business', shouldSeedDemoData() ? defaultBusinesses : []);
  db.Product = new MockModel('Product', shouldSeedDemoData() ? defaultProducts : []);
  db.Service = new MockModel('Service', shouldSeedDemoData() ? defaultServices : []);
  db.Order = new MockModel('Order', []);
  db.Counter = new MockModel('Counter', []);
  db.ActivityEvent = new MockModel('ActivityEvent', []);
  db.PaymentCredential = new MockModel('PaymentCredential', []);
  db.EsewaPayment = new MockModel('EsewaPayment', []);
  db.Booking = new MockModel('Booking', []);
  db.Review = new MockModel('Review', []);
  db.Report = new MockModel('Report', []);
  db.Chat = new MockModel('Chat', [
    {
      _id: 'ch1',
      senderId: 'u1',
      receiverId: 's1',
      message: 'Hello, is the Bhoj Garden open today?',
      type: 'text',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      _id: 'ch2',
      senderId: 's1',
      receiverId: 'u1',
      message: 'Yes! We are open until 10 PM. You can order online or book a table.',
      type: 'text',
      createdAt: new Date(Date.now() - 3000000).toISOString(),
    },
  ]);
  db.Conversation = new MockModel('Conversation', []);
  db.Message = new MockModel('Message', []);
  db.Notification = new MockModel('Notification', [
    {
      _id: 'n1',
      userId: 'u1',
      title: 'Welcome to UdyogConnect',
      message: 'Explore local businesses and services around you.',
      type: 'general',
      read: false,
      createdAt: new Date().toISOString(),
    },
    {
      _id: 'n2',
      userId: 's1',
      title: 'Seller Dashboard Access',
      message: 'Your seller profile is active. Check out your new orders!',
      type: 'general',
      read: false,
      createdAt: new Date().toISOString(),
    },
    {
      _id: 'n3',
      userId: 'a1',
      title: 'Admin Action Required',
      message: 'There are new business profiles pending your review.',
      type: 'admin',
      read: false,
      createdAt: new Date().toISOString(),
    }
  ]);
  db.Coupon = new MockModel('Coupon', defaultCoupons);
  db.AuditLog = new MockModel('AuditLog', []);
  db.SupportTicket = new MockModel('SupportTicket', [
    {
      _id: 'st1',
      userId: 'u1',
      userName: 'Prajwal Customer',
      email: 'customer@udyog.np',
      category: 'checkout',
      subject: 'Payment issue during checkout',
      message: 'I was unable to complete the payment, but the cart was not reset properly.',
      status: 'open',
      priority: 'high',
      resolution: '',
      createdAt: new Date().toISOString(),
    },
  ]);

  const defaultCategories = [
    { _id: 'cat1', name: 'Grocery', description: 'Daily grocery and essential needs' },
    { _id: 'cat2', name: 'Restaurants', description: 'Local restaurants, food joints, and dining places' },
    { _id: 'cat3', name: 'Furniture', description: 'Durable home and office wooden furniture' },
    { _id: 'cat4', name: 'Gift Shop', description: 'Handcrafted gifts, crafts, and home decor' },
    { _id: 'cat5', name: 'Home Services', description: 'Plumbing, cleaning, and beauty home services' },
    { _id: 'cat6', name: 'Mechanics', description: 'Vehicle repair, electronics, and appliance mechanics' },
  ];

  const defaultSettings = [
    { _id: 'set1', key: 'taxRate', value: 13 },
    { _id: 'set2', key: 'deliveryFee', value: 70 },
    { _id: 'set3', key: 'commissionRate', value: 10 },
    { _id: 'set4', key: 'paymentMethods', value: { cod: true, stripe: false, esewa: true } },
  ];

  db.Category = new MockModel('Category', defaultCategories);
  db.SystemSetting = new MockModel('SystemSetting', defaultSettings);
  await seedDemoBusinesses();
  await seedDemoCatalog();
};

let dbConnectionPromise = null;

async function connectDb() {
  // If running in production, warn if MONGODB_URI is missing
  if (process.env.NODE_ENV === 'production' && !process.env.MONGODB_URI) {
    console.warn('WARNING: MONGODB_URI is missing in production. Falling back to ephemeral in-memory storage. ALL DATA WILL BE LOST ON RESTART.');
  }

  if (process.env.MONGODB_URI) {
    if (mongoose.connection.readyState === 1) {
      if (!db.User || !db.Business || !db.Conversation || !db.Message) {
        isMongo = true;
        await initMongooseModels();
      }
      console.log('MongoDB connection already established. Reusing existing connection.');
      return true;
    }
    
    if (dbConnectionPromise) {
      console.log('MongoDB connection is already in progress. Waiting for it to resolve...');
      return dbConnectionPromise;
    }

    dbConnectionPromise = (async () => {
      try {
        console.log('Attempting to connect to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI, {
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        });

        isMongo = true;

        mongoose.connection.on('connected', () => console.log('Mongoose connected to MongoDB'));
        mongoose.connection.on('error', (err) => console.error('Mongoose connection error:', err && err.message));
        mongoose.connection.on('disconnected', () => console.warn('Mongoose disconnected.'));
        mongoose.connection.on('reconnected', () => console.log('Mongoose reconnected to MongoDB'));

        await initMongooseModels();
        console.log('Database initialized: Connected to MongoDB.');
        return true;
      } catch (err) {
        console.warn('MongoDB connection failed.');
        console.warn(err && err.message);
        dbConnectionPromise = null;
        if (process.env.NODE_ENV === 'production') {
          console.error('ERROR: Failed to connect to MongoDB in production. Falling back to in-memory storage. THIS MEANS DATA WILL BE LOST ON RESTART. Check your MONGODB_URI or Atlas IP Allowlist.');
        }
        console.warn('Falling back to local JSON file DB for development only.');
        isMongo = false;
        await initMockModels();
        return false;
      }
    })();
    
    return dbConnectionPromise;
  } else {
    console.log('MONGODB_URI not provided; using local JSON DB for development/testing.');
  }

  // Initialize fallback mock DB (development only)
  isMongo = false;
  if (!db.User || !db.Business) {
    await initMockModels();
  }
  return false;
}

const getModel = (name) => {
  if (!db[name]) {
    try {
      initMockModels();
    } catch (_) {}
  }
  return db[name];
};

/** Atomically increments and returns a named sequence (used for readable bill numbers). */
async function nextSequence(key) {
  const counter = await getModel('Counter').findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return Number(counter.seq);
}

module.exports = {
  connectDb,
  getIsMongo: () => isMongo,
  nextSequence,
  db,
  // Helper to dynamically return correct models
  User: () => getModel('User'),
  Business: () => getModel('Business'),
  Product: () => getModel('Product'),
  Service: () => getModel('Service'),
  Order: () => getModel('Order'),
  Counter: () => getModel('Counter'),
  ActivityEvent: () => getModel('ActivityEvent'),
  PaymentCredential: () => getModel('PaymentCredential'),
  EsewaPayment: () => getModel('EsewaPayment'),
  Booking: () => getModel('Booking'),
  Review: () => getModel('Review'),
  Report: () => getModel('Report'),
  Chat: () => getModel('Chat'),
  Conversation: () => getModel('Conversation'),
  Message: () => getModel('Message'),
  Notification: () => getModel('Notification'),
  Coupon: () => getModel('Coupon'),
  AuditLog: () => getModel('AuditLog'),
  Category: () => getModel('Category'),
  SystemSetting: () => getModel('SystemSetting'),
  SupportTicket: () => getModel('SupportTicket'),
};
