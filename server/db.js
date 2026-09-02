const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^9[\d\s\-()]{8,18}$/;
const URL_PATTERN = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([\/\w .-]*)*\/?$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

let isMongo = false;
const DEMO_PASSWORD_HASH = bcrypt.hashSync('password', 10);
const DEMO_USERS = [
  {
    name: 'Prajwal Customer',
    email: 'customer@udyog.np',
    password: DEMO_PASSWORD_HASH,
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
    password: DEMO_PASSWORD_HASH,
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
    password: DEMO_PASSWORD_HASH,
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
    password: DEMO_PASSWORD_HASH,
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
    password: DEMO_PASSWORD_HASH,
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
    password: DEMO_PASSWORD_HASH,
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
    password: DEMO_PASSWORD_HASH,
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
    password: DEMO_PASSWORD_HASH,
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

// Mock database model wrapper mimicking Mongoose methods
class MockModel {
  constructor(name, defaultData = []) {
    this.name = name;
    this.filePath = path.join(__dirname, '.data', `${name}.json`);
    this.defaultData = defaultData;

    // ensure dir exists
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // ensure file exists
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify(defaultData, null, 2));
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
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error(`Failed to write database file: ${this.name}`, e);
    }
  }

  async find(query = {}) {
    let data = this._read();
    return data.filter((item) => {
      for (let key in query) {
        if (query[key] !== undefined && item[key] !== query[key]) {
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
        if (query[key] !== undefined && item[key] !== query[key]) {
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
    let index = data.findIndex((item) => item._id === id);
    if (index === -1) return null;
    const updated = {
      ...data[index],
      ...update,
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
}

// Default Seed Data
const defaultBusinesses = [
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
    rating: 4.8,
    reviewCount: 1,
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
    rating: 4.5,
    reviewCount: 1,
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
    rating: 4.0,
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
    rating: 4.7,
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
    rating: 4.8,
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
    rating: 4.6,
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
    images: [],
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
    images: [],
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
    images: [],
    availability: true,
  },
  {
    _id: 'p4', businessId: 'b4', name: 'Himalayan Turmeric Powder', category: 'Grocery', subcategory: 'Spices',
    description: 'Stone-ground turmeric sourced from Nepali hill farms.', price: 220, discount: 0, stock: 40, sku: 'HSC-TURMERIC-04', brand: 'Himalayan Spice Corner', images: [], availability: true,
  },
  {
    _id: 'p5', businessId: 'b5', name: 'Lokta Paper Journal', category: 'Gift Shop', subcategory: 'Stationery',
    description: 'Handmade lokta paper journal crafted by Nepali artisans.', price: 450, discount: 5, stock: 25, sku: 'PLT-JOURNAL-05', brand: 'Pokhara Lakeside Treasures', images: [], availability: true,
  },
  {
    _id: 'p6', businessId: 'b6', name: 'Home Electrical Safety Check', category: 'Home Services', subcategory: 'Electrical',
    description: 'A professional inspection of household wiring and electrical fittings.', price: 1500, discount: 0, stock: 20, sku: 'BHR-SAFETY-06', brand: 'Bagmati Home Repair', images: [], availability: true,
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
  if (!db.User) return;
  for (const userData of DEMO_USERS) {
    const existing = await db.User.findOne({ email: userData.email });
    if (!existing) {
      const seedData = db.User.db
        ? (({ demoId, ...data }) => data)(userData)
        : { ...userData, _id: userData.demoId || undefined };
      await db.User.create({ ...seedData });
    }
  }
};

const seedDemoBusinesses = async () => {
  if (!db.Business) return;
  for (const businessData of defaultBusinesses) {
    const existing = await db.Business.findOne({ name: businessData.name });
    if (!existing) {
      const seedData = db.Business.db ? (({ _id, ...data }) => data)(businessData) : businessData;
      await db.Business.create({ ...seedData });
    }
  }
};

const seedDemoCatalog = async () => {
  if (!db.Product || !db.Service) return;
  for (const productData of defaultProducts) {
    const business = await db.Business.findOne({ _id: productData.businessId });
    const seedData = { ...productData, businessId: business?._id || productData.businessId };
    const existing = await db.Product.findOne({ sku: productData.sku });
    if (!existing) await db.Product.create(db.Product.db ? (({ _id, ...data }) => data)(seedData) : seedData);
  }
  for (const serviceData of defaultServices) {
    const business = await db.Business.findOne({ _id: serviceData.businessId });
    const seedData = { ...serviceData, businessId: business?._id || serviceData.businessId };
    const existing = await db.Service.findOne({ name: serviceData.name, businessId: seedData.businessId });
    if (!existing) await db.Service.create(db.Service.db ? (({ _id, ...data }) => data)(seedData) : seedData);
  }
};

const initMongooseModels = async () => {
  const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, match: [EMAIL_PATTERN, 'Invalid email address'] },
    password: { type: String, required: true },
    phone: { type: String, trim: true, match: [PHONE_PATTERN, 'Invalid phone number'] },
    role: { type: String, enum: ['customer', 'seller', 'admin'], default: 'customer' },
    profilePicture: { type: String, default: '', trim: true, match: [URL_PATTERN, 'Invalid profile picture URL'] },
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
    isVerified: { type: Boolean, default: false },
    verificationOtp: { type: String, default: '' },
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockUntil: { type: Date, default: null },
    resetOtp: { type: String, default: '' },
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
    website: { type: String, default: '', trim: true, match: [URL_PATTERN, 'Invalid website URL'] },
    hours: { type: String, default: '09:00 - 18:00', trim: true },
    imageUrl: { type: String, default: '', trim: true, match: [URL_PATTERN, 'Invalid image URL'] },
    coverUrl: { type: String, default: '', trim: true, match: [URL_PATTERN, 'Invalid cover URL'] },
    qrUrl: { type: String, default: '', trim: true, match: [URL_PATTERN, 'Invalid QR URL'] },
    latitude: { type: Number, default: 27.7007 },
    longitude: { type: Number, default: 85.3001 },
    verified: { type: String, enum: ['pending', 'verified', 'approved', 'rejected', 'suspended'] },
    approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'] },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: String, default: null, trim: true },
    isVerified: { type: Boolean, default: false },
    rejectionReason: { type: String, default: '', trim: true },
    documents: { type: Array, default: [] },
    rating: { type: Number, default: 5.0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    registrationNumber: { type: String, default: '', trim: true },
    panVatNumber: { type: String, default: '', trim: true },
    deliveryAvailable: { type: Boolean, default: true },
    visitorsCount: { type: Number, default: 0, min: 0 },
    commissionRate: { type: Number, default: 10, min: 0, max: 100 },
    offeringType: { type: String, enum: ['products', 'services', 'both'], default: 'both' },
    isOpen: { type: Boolean, default: true },
    deliveryAvailable: { type: Boolean, default: true },
    deliveryRadiusKm: { type: Number, default: 5, min: 0 },
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
    slots: { type: Array, default: [] },
    staff: { type: Array, default: [] },
    homeService: { type: Boolean, default: false },
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
    status: { type: String, enum: ['placed', 'accepted', 'preparing', 'dispatched', 'completed', 'cancelled'], default: 'placed' },
    paymentMethod: { type: String, enum: ['COD', 'Card', 'Wallet', 'QR'], required: true },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
    deliveryAddress: { type: deliveryAddressSchema, required: true },
    deliveryRiderId: { type: String, default: '' },
    deliveryOtp: { type: String, default: '' },
    deliveryProof: { type: String, default: '' },
    trackingHistory: { type: Array, default: [] },
  }, { timestamps: true });

  const bookingSchema = new mongoose.Schema({
    customerId: { type: String, required: true },
    businessId: { type: String, required: true },
    serviceId: { type: String, required: true },
    date: { type: String, required: true },
    timeSlot: { type: String, required: true },
    staffMember: { type: String },
    status: { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled'], default: 'pending' },
    homeService: { type: Boolean, default: false },
    reminderSent: { type: Boolean, default: false },
  }, { timestamps: true });

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
  }, { timestamps: true });

  const chatSchema = new mongoose.Schema({
    senderId: { type: String, required: true },
    receiverId: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['text', 'image'], default: 'text' },
    mediaUrl: { type: String, default: '' },
  }, { timestamps: true });

  const notificationSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, default: 'general' },
    read: { type: Boolean, default: false },
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

  db.User = mongoose.model('User', userSchema);
  db.Business = mongoose.model('Business', businessSchema);
  db.Product = mongoose.model('Product', productSchema);
  db.Service = mongoose.model('Service', serviceSchema);
  db.Order = mongoose.model('Order', orderSchema);
  db.Booking = mongoose.model('Booking', bookingSchema);
  db.Review = mongoose.model('Review', reviewSchema);
  db.Chat = mongoose.model('Chat', chatSchema);
  db.Notification = mongoose.model('Notification', notificationSchema);
  db.Coupon = mongoose.model('Coupon', couponSchema);
  db.AuditLog = mongoose.model('AuditLog', auditLogSchema);
  db.Category = mongoose.model('Category', categorySchema);
  db.SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);

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

  db.SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

  await seedDemoUsers();
  await seedDemoBusinesses();
  await seedDemoCatalog();
  // Ensure indexes (unique constraints) are created
  try {
    await db.User.createIndexes();
    console.log('User indexes ensured');
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
  const seededUsers = DEMO_USERS.map((user) => {
    const seededId = user.demoId || legacyIds[user.email];
    return { ...user, ...(seededId ? { _id: seededId } : {}) };
  });

  const userModel = new MockModel('User', seededUsers);
  db.User = userModel;
  await seedDemoUsers();

  db.Business = new MockModel('Business', defaultBusinesses);
  db.Product = new MockModel('Product', defaultProducts);
  db.Service = new MockModel('Service', defaultServices);
  db.Order = new MockModel('Order', []);
  db.Booking = new MockModel('Booking', []);
  db.Review = new MockModel('Review', [
    {
      _id: 'r_v1',
      customerId: 'u1',
      customerName: 'Prajwal Customer',
      businessId: 'b1',
      targetId: 'b1',
      targetType: 'business',
      rating: 5,
      comment: 'Excellent food, traditional tastes are amazing! Love the Newari platter.',
      images: [],
      reported: false,
      createdAt: new Date().toISOString(),
    },
    {
      _id: 'r_v2',
      customerId: 'u1',
      customerName: 'Prajwal Customer',
      businessId: 'b2',
      targetId: 'p2',
      targetType: 'product',
      rating: 4,
      comment: 'Very beautiful handmade basket. Highly recommended!',
      images: [],
      reported: false,
      createdAt: new Date().toISOString(),
    },
  ]);
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
  await initMockModels();
  return false;
}

module.exports = {
  connectDb,
  getIsMongo: () => isMongo,
  db,
  // Helper to dynamically return correct models
  User: () => db.User,
  Business: () => db.Business,
  Product: () => db.Product,
  Service: () => db.Service,
  Order: () => db.Order,
  Booking: () => db.Booking,
  Review: () => db.Review,
  Chat: () => db.Chat,
  Notification: () => db.Notification,
  Coupon: () => db.Coupon,
  AuditLog: () => db.AuditLog,
  Category: () => db.Category,
  SystemSetting: () => db.SystemSetting,
  SupportTicket: () => db.SupportTicket,
};
