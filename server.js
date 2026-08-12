const express = require('express');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { connectDb, db, getIsMongo, User, Business, Product, Service, Order, Booking, Review, Chat, Notification, Coupon, AuditLog } = require('./db');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'udyogconnect_secret_key_123';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(__dirname));

const upload = multer({ storage: multer.memoryStorage() });

// Middleware: Authenticate JWT Token
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authentication token required.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired session token.' });
  }
};

// Middleware: Role-Based Access Control
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied: Insufficient permissions.' });
    }
    next();
  };
};

// Helper: Convert File to Base64 String if Cloudinary is offline
const processImageUpload = (file) => {
  if (!file) return '';
  const base64 = file.buffer.toString('base64');
  return `data:${file.mimetype};base64,${base64}`;
};

// Geolocation distance helper (Haversine formula in km)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(1));
};

// ==================== AUTHENTICATION APIS ====================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    const UserMDL = User();
    const existing = await UserMDL.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'A user with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role || 'customer';

    const newUser = await UserMDL.create({
      name,
      email,
      password: hashedPassword,
      phone: phone || '',
      role: userRole,
      loyaltyPoints: 0,
      profilePicture: '',
      addresses: [],
      paymentMethods: [],
      wishlist: { products: [], services: [], businesses: [] },
      twoFactorEnabled: false,
      loginHistory: [],
    });

    const token = jwt.sign({ id: newUser._id, email: newUser.email, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, token, user: { id: newUser._id, name: newUser.name, email: newUser.email, role: newUser.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Registration failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, otp } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const UserMDL = User();
    const user = await UserMDL.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    // 2FA Mock Check
    if (user.twoFactorEnabled && !otp) {
      return res.json({ require2FA: true, message: '2FA verification code required.' });
    }

    if (user.twoFactorEnabled && otp !== '123456') {
      return res.status(400).json({ message: 'Invalid 2FA verification code.' });
    }

    // Update login log
    const updatedHistory = [...(user.loginHistory || []), { timestamp: new Date().toISOString(), ip: req.ip, agent: req.headers['user-agent'] }];
    await UserMDL.findByIdAndUpdate(user._id, { loginHistory: updatedHistory });

    const AuditLogMDL = AuditLog();
    await AuditLogMDL.create({ userId: user._id, action: 'LOGIN', details: 'User logged in successfully' });

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed.' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { email, name, googleId } = req.body;
    if (!email || !name) return res.status(400).json({ message: 'Google authentication details missing.' });

    const UserMDL = User();
    let user = await UserMDL.findOne({ email });

    if (!user) {
      user = await UserMDL.create({
        name,
        email,
        password: await bcrypt.hash(Math.random().toString(36), 10),
        role: 'customer',
        loyaltyPoints: 10,
        googleId,
        addresses: [],
        paymentMethods: [],
        wishlist: { products: [], services: [], businesses: [] },
      });
    }

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Google Sign In failed.' });
  }
});

app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const UserMDL = User();
    const user = await UserMDL.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Profile not found.' });

    const { password, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving profile.' });
  }
});

app.put('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const UserMDL = User();
    const updated = await UserMDL.findByIdAndUpdate(req.user.id, req.body);
    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ message: 'Error updating profile.' });
  }
});

// ==================== MARKETPLACE & BUSINESS APIS ====================

app.get('/api/businesses', async (req, res) => {
  try {
    const { category, search, lat, lng, maxDistance, status } = req.query;
    const BusinessMDL = Business();
    let query = {};

    if (status) {
      query.verified = status;
    }

    let listings = await BusinessMDL.find(query);

    // Apply filter on listings
    if (category && category !== 'All') {
      listings = listings.filter((b) => b.category.toLowerCase() === category.toLowerCase());
    }

    if (search) {
      const term = search.toLowerCase();
      listings = listings.filter(
        (b) =>
          b.name.toLowerCase().includes(term) ||
          b.description.toLowerCase().includes(term) ||
          b.category.toLowerCase().includes(term)
      );
    }

    // Distance Calculation & Filter
    if (lat && lng) {
      listings = listings.map((b) => {
        const dist = calculateDistance(parseFloat(lat), parseFloat(lng), b.latitude, b.longitude);
        return { ...b, distanceVal: dist, distance: dist !== null ? `${dist} km` : 'Nearby' };
      });

      if (maxDistance) {
        const max = parseFloat(maxDistance);
        listings = listings.filter((b) => b.distanceVal !== null && b.distanceVal <= max);
      }
    }

    res.json(listings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to retrieve listings.' });
  }
});

app.get('/api/businesses/:id', async (req, res) => {
  try {
    const BusinessMDL = Business();
    const ProductMDL = Product();
    const ServiceMDL = Service();
    const ReviewMDL = Review();

    const business = await BusinessMDL.findById(req.params.id);
    if (!business) return res.status(404).json({ message: 'Business profile not found.' });

    const products = await ProductMDL.find({ businessId: req.params.id });
    const services = await ServiceMDL.find({ businessId: req.params.id });
    const reviews = await ReviewMDL.find({ businessId: req.params.id, targetType: 'business' });

    res.json({ business, products, services, reviews });
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving business details.' });
  }
});

app.post('/api/businesses', authenticateToken, upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'document', maxCount: 1 }]), async (req, res) => {
  try {
    const { name, category, subcategory, location, price, description, phone, contactEmail, website, hours, latitude, longitude, offeringType } = req.body;
    if (!name || !category || !location || !description) {
      return res.status(400).json({ message: 'All required fields are needed.' });
    }

    const BusinessMDL = Business();
    let logoUrl = '';
    let docUrl = '';

    if (req.files) {
      if (req.files.logo && req.files.logo[0]) {
        logoUrl = processImageUpload(req.files.logo[0]);
      }
      if (req.files.document && req.files.document[0]) {
        docUrl = processImageUpload(req.files.document[0]);
      }
    }

    const newBusiness = await BusinessMDL.create({
      ownerId: req.user.id,
      name,
      category,
      subcategory: subcategory || '',
      location,
      price: price || '0',
      description,
      contactEmail: contactEmail || req.user.email,
      phone: phone || '',
      website: website || '',
      hours: hours || '09:00 - 18:00',
      imageUrl: logoUrl,
      latitude: latitude ? parseFloat(latitude) : 27.7007 + (Math.random() - 0.5) * 0.05,
      longitude: longitude ? parseFloat(longitude) : 85.3001 + (Math.random() - 0.5) * 0.05,
      verified: 'pending',
      documents: docUrl ? [docUrl] : [],
      rating: 5.0,
      reviewCount: 0,
      offeringType: offeringType || 'both',
    });

    res.status(201).json({ success: true, business: newBusiness });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to register business.' });
  }
});

app.put('/api/businesses/:id', authenticateToken, requireRole(['seller', 'admin']), async (req, res) => {
  try {
    const BusinessMDL = Business();
    const biz = await BusinessMDL.findById(req.params.id);
    if (!biz) return res.status(404).json({ message: 'Business not found.' });

    if (biz.ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized profile edit.' });
    }

    const updated = await BusinessMDL.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true, business: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update business.' });
  }
});

// Admin approves business & sets verification badge
app.put('/api/businesses/:id/verify', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { status } = req.body; // 'verified', 'suspended', 'pending'
    const BusinessMDL = Business();
    const updated = await BusinessMDL.findByIdAndUpdate(req.params.id, { verified: status });
    res.json({ success: true, business: updated });
  } catch (err) {
    res.status(500).json({ message: 'Action failed.' });
  }
});

// Admin deletes business account and all associated data
app.delete('/api/businesses/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const BusinessMDL = Business();
    const ProductMDL = Product();
    const ServiceMDL = Service();
    const ReviewMDL = Review();
    const BookingMDL = Booking();

    const bizId = req.params.id;
    let biz;

    try {
      biz = await BusinessMDL.findById(bizId);
    } catch (findErr) {
      if (BusinessMDL.collection) {
        biz = await BusinessMDL.collection.findOne({ _id: bizId });
      } else {
        throw findErr;
      }
    }

    if (!biz) {
      return res.status(404).json({ message: 'Business not found.' });
    }

    // Delete the business document
    try {
      await BusinessMDL.deleteOne({ _id: bizId });
    } catch (delErr) {
      if (BusinessMDL.collection) {
        await BusinessMDL.collection.deleteOne({ _id: bizId });
      } else {
        throw delErr;
      }
    }

    // Clean up associated products
    try {
      await ProductMDL.deleteMany({ businessId: bizId });
    } catch (err) {
      if (ProductMDL.collection) {
        await ProductMDL.collection.deleteMany({ businessId: bizId });
      } else {
        throw err;
      }
    }

    // Clean up associated services
    try {
      await ServiceMDL.deleteMany({ businessId: bizId });
    } catch (err) {
      if (ServiceMDL.collection) {
        await ServiceMDL.collection.deleteMany({ businessId: bizId });
      } else {
        throw err;
      }
    }

    // Clean up associated reviews
    try {
      await ReviewMDL.deleteMany({ businessId: bizId });
    } catch (err) {
      if (ReviewMDL.collection) {
        await ReviewMDL.collection.deleteMany({ businessId: bizId });
      } else {
        throw err;
      }
    }

    // Clean up associated bookings
    try {
      await BookingMDL.deleteMany({ businessId: bizId });
    } catch (err) {
      if (BookingMDL.collection) {
        await BookingMDL.collection.deleteMany({ businessId: bizId });
      } else {
        throw err;
      }
    }

    res.json({ success: true, message: 'Business and all associated records deleted successfully.' });
  } catch (err) {
    console.error('Failed to delete business', err);
    res.status(500).json({ message: 'Failed to delete business account.', error: err.message });
  }
});

// ==================== CATALOG MANAGEMENT ====================

app.get('/api/products', async (req, res) => {
  try {
    const ProductMDL = Product();
    const products = await ProductMDL.find({});
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving products.' });
  }
});

app.post('/api/products', authenticateToken, requireRole(['seller', 'admin']), upload.single('image'), async (req, res) => {
  try {
    const { businessId, name, category, subcategory, description, price, discount, stock, sku, brand } = req.body;
    const ProductMDL = Product();
    let imgUrl = '';

    if (req.file) {
      imgUrl = processImageUpload(req.file);
    }

    const newProd = await ProductMDL.create({
      businessId,
      name,
      category,
      subcategory: subcategory || '',
      description,
      price: parseFloat(price),
      discount: discount ? parseFloat(discount) : 0,
      stock: stock ? parseInt(stock) : 0,
      sku: sku || `SKU-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      brand: brand || 'Local',
      images: imgUrl ? [imgUrl] : [],
      availability: true,
    });

    res.status(201).json({ success: true, product: newProd });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create product.' });
  }
});

app.put('/api/products/:id', authenticateToken, requireRole(['seller', 'admin']), async (req, res) => {
  try {
    const ProductMDL = Product();
    const updated = await ProductMDL.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true, product: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update product.' });
  }
});

app.delete('/api/products/:id', authenticateToken, requireRole(['seller', 'admin']), async (req, res) => {
  try {
    const ProductMDL = Product();
    await ProductMDL.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete product.' });
  }
});

app.post('/api/services', authenticateToken, requireRole(['seller', 'admin']), async (req, res) => {
  try {
    const { businessId, name, description, price, duration, slots, staff, homeService } = req.body;
    const ServiceMDL = Service();

    const newServ = await ServiceMDL.create({
      businessId,
      name,
      description,
      price: parseFloat(price),
      duration: duration ? parseInt(duration) : 60,
      slots: Array.isArray(slots) ? slots : ['09:00 - 10:00', '11:00 - 12:00', '14:00 - 15:00'],
      staff: Array.isArray(staff) ? staff : ['Regular Staff'],
      homeService: homeService === 'true' || homeService === true,
      availability: true,
    });

    res.status(201).json({ success: true, service: newServ });
  } catch (err) {
    res.status(500).json({ message: 'Failed to create service.' });
  }
});

app.put('/api/services/:id', authenticateToken, requireRole(['seller', 'admin']), async (req, res) => {
  try {
    const ServiceMDL = Service();
    const updated = await ServiceMDL.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true, service: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update service.' });
  }
});

app.delete('/api/services/:id', authenticateToken, requireRole(['seller', 'admin']), async (req, res) => {
  try {
    const ServiceMDL = Service();
    await ServiceMDL.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete service.' });
  }
});

// ==================== CART, CHECKOUT & PAYMENTS ====================

app.post('/api/checkout', authenticateToken, async (req, res) => {
  try {
    const { businessId, items, promoCode, paymentMethod, deliveryAddress } = req.body;
    if (!businessId || !items || !Array.isArray(items) || items.length === 0 || !deliveryAddress) {
      return res.status(400).json({ message: 'Missing order details.' });
    }

    const ProductMDL = Product();
    const CouponMDL = Coupon();
    const OrderMDL = Order();
    const UserMDL = User();

    // Verify stock and calculate subtotal
    let subtotal = 0;
    for (let item of items) {
      const p = await ProductMDL.findById(item.id);
      if (!p) return res.status(404).json({ message: `Product ${item.name} not found.` });
      if (p.stock < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${p.name}. Only ${p.stock} units available.` });
      }
      const unitPrice = p.price - (p.price * (p.discount || 0)) / 100;
      subtotal += unitPrice * item.quantity;
    }

    // Apply Coupon
    let discount = 0;
    if (promoCode) {
      const coupon = await CouponMDL.findOne({ code: promoCode.toUpperCase(), active: true });
      if (coupon) {
        discount = (subtotal * coupon.discountPercent) / 100;
        if (discount > coupon.maxDiscount) discount = coupon.maxDiscount;
      }
    }

    const deliveryFee = 70; // NPR 70 flat delivery
    const tax = parseFloat((subtotal * 0.13).toFixed(2)); // 13% VAT
    const total = parseFloat((subtotal + deliveryFee + tax - discount).toFixed(2));

    // Deduct Stock
    for (let item of items) {
      const p = await ProductMDL.findById(item.id);
      await ProductMDL.findByIdAndUpdate(item.id, { stock: p.stock - item.quantity });
    }

    // Add Loyalty points (+10 for order)
    const buyer = await UserMDL.findById(req.user.id);
    await UserMDL.findByIdAndUpdate(req.user.id, { loyaltyPoints: (buyer.loyaltyPoints || 0) + 10 });

    // Create Order
    const newOrder = await OrderMDL.create({
      customerId: req.user.id,
      businessId,
      items,
      subtotal,
      deliveryFee,
      tax,
      discount,
      total,
      status: 'placed',
      paymentMethod,
      paymentStatus: paymentMethod === 'COD' ? 'pending' : 'paid',
      deliveryAddress,
      deliveryRiderId: '',
      deliveryOtp: Math.floor(1000 + Math.random() * 9000).toString(), // 4-digit OTP
      deliveryProof: '',
      trackingHistory: [{ status: 'placed', time: new Date().toISOString(), note: 'Order placed by customer.' }],
    });

    res.status(201).json({ success: true, order: newOrder });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Checkout transaction failed.' });
  }
});

app.post('/api/payment/confirm', authenticateToken, async (req, res) => {
  try {
    const { orderId, status } = req.body;
    const OrderMDL = Order();
    const order = await OrderMDL.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    await OrderMDL.findByIdAndUpdate(orderId, { paymentStatus: status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Payment confirmation failed.' });
  }
});

// ==================== BOOKINGS & ORDERS ====================

app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const OrderMDL = Order();
    let orders = [];

    if (req.user.role === 'admin') {
      orders = await OrderMDL.find({});
    } else if (req.user.role === 'seller') {
      const BusinessMDL = Business();
      const myBizs = await BusinessMDL.find({ ownerId: req.user.id });
      const myBizIds = myBizs.map((b) => b._id);
      orders = await OrderMDL.find({});
      orders = orders.filter((o) => myBizIds.includes(o.businessId));
    } else if (req.user.role === 'rider') {
      orders = await OrderMDL.find({ deliveryRiderId: req.user.id });
    } else {
      orders = await OrderMDL.find({ customerId: req.user.id });
    }

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve orders.' });
  }
});

app.put('/api/orders/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status, note } = req.body;
    const OrderMDL = Order();
    const order = await OrderMDL.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const trackingHistory = [...(order.trackingHistory || []), { status, time: new Date().toISOString(), note: note || `Order updated to ${status}.` }];

    const updated = await OrderMDL.findByIdAndUpdate(req.params.id, { status, trackingHistory });
    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ message: 'Status update failed.' });
  }
});

app.post('/api/bookings', authenticateToken, async (req, res) => {
  try {
    const { businessId, serviceId, date, timeSlot, staffMember, homeService } = req.body;
    if (!businessId || !serviceId || !date || !timeSlot) {
      return res.status(400).json({ message: 'Missing booking details.' });
    }

    const BookingMDL = Booking();
    const newBooking = await BookingMDL.create({
      customerId: req.user.id,
      businessId,
      serviceId,
      date,
      timeSlot,
      staffMember: staffMember || 'Any available staff',
      status: 'pending',
      homeService: homeService === 'true' || homeService === true,
      reminderSent: false,
    });

    res.status(201).json({ success: true, booking: newBooking });
  } catch (err) {
    res.status(500).json({ message: 'Booking failed.' });
  }
});

app.get('/api/bookings', authenticateToken, async (req, res) => {
  try {
    const BookingMDL = Booking();
    let bookings = [];

    if (req.user.role === 'admin') {
      bookings = await BookingMDL.find({});
    } else if (req.user.role === 'seller') {
      const BusinessMDL = Business();
      const myBizs = await BusinessMDL.find({ ownerId: req.user.id });
      const myBizIds = myBizs.map((b) => b._id);
      bookings = await BookingMDL.find({});
      bookings = bookings.filter((bk) => myBizIds.includes(bk.businessId));
    } else {
      bookings = await BookingMDL.find({ customerId: req.user.id });
    }

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load bookings.' });
  }
});

app.put('/api/bookings/:id', authenticateToken, async (req, res) => {
  try {
    const { status, date, timeSlot } = req.body;
    const BookingMDL = Booking();
    const updates = {};
    if (status) updates.status = status;
    if (date) updates.date = date;
    if (timeSlot) updates.timeSlot = timeSlot;

    const updated = await BookingMDL.findByIdAndUpdate(req.params.id, updates);
    res.json({ success: true, booking: updated });
  } catch (err) {
    res.status(500).json({ message: 'Booking update failed.' });
  }
});

// ==================== DELIVERY MODULE APIS ====================

app.get('/api/delivery/pending', authenticateToken, requireRole(['rider', 'admin']), async (req, res) => {
  try {
    const OrderMDL = Order();
    // Orders prepared and ready to dispatch
    const pendingDeliveries = await OrderMDL.find({ status: 'preparing', deliveryRiderId: '' });
    res.json(pendingDeliveries);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load deliveries.' });
  }
});

app.put('/api/delivery/:id/assign', authenticateToken, requireRole(['rider', 'admin']), async (req, res) => {
  try {
    const OrderMDL = Order();
    const order = await OrderMDL.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const trackingHistory = [...(order.trackingHistory || []), { status: 'dispatched', time: new Date().toISOString(), note: 'Delivery accepted by rider.' }];

    await OrderMDL.findByIdAndUpdate(req.params.id, {
      deliveryRiderId: req.user.id,
      status: 'dispatched',
      trackingHistory,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Delivery assignment failed.' });
  }
});

app.put('/api/delivery/:id/complete', authenticateToken, requireRole(['rider', 'admin']), async (req, res) => {
  try {
    const { otp, proof } = req.body;
    const OrderMDL = Order();
    const order = await OrderMDL.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (order.deliveryOtp !== otp) {
      return res.status(400).json({ message: 'Invalid delivery verification OTP.' });
    }

    const trackingHistory = [...(order.trackingHistory || []), { status: 'completed', time: new Date().toISOString(), note: 'Order delivered.' }];

    await OrderMDL.findByIdAndUpdate(req.params.id, {
      status: 'completed',
      paymentStatus: 'paid', // Completed order implies paid
      deliveryProof: proof || 'OTP Confirmed',
      trackingHistory,
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Delivery confirmation failed.' });
  }
});

// ==================== REVIEW SYSTEM ====================

app.post('/api/reviews', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { businessId, targetId, targetType, rating, comment } = req.body;
    const ReviewMDL = Review();
    const BusinessMDL = Business();
    const UserMDL = User();

    let imgUrl = '';
    if (req.file) {
      imgUrl = processImageUpload(req.file);
    }

    const buyer = await UserMDL.findById(req.user.id);

    const newReview = await ReviewMDL.create({
      customerId: req.user.id,
      customerName: buyer ? buyer.name : 'Valued Customer',
      businessId,
      targetId,
      targetType,
      rating: parseInt(rating),
      comment,
      images: imgUrl ? [imgUrl] : [],
      reported: false,
    });

    // Recompute average rating for Business
    const reviews = await ReviewMDL.find({ businessId, targetType: 'business' });
    if (reviews.length > 0) {
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      const avg = parseFloat((sum / reviews.length).toFixed(1));
      await BusinessMDL.findByIdAndUpdate(businessId, { rating: avg, reviewCount: reviews.length });
    }

    res.status(201).json({ success: true, review: newReview });
  } catch (err) {
    res.status(500).json({ message: 'Failed to post review.' });
  }
});

app.put('/api/reviews/:id/report', authenticateToken, async (req, res) => {
  try {
    const ReviewMDL = Review();
    await ReviewMDL.findByIdAndUpdate(req.params.id, { reported: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to flag review.' });
  }
});

// ==================== CHAT & AI SUPPORT CHATBOT ====================

app.get('/api/chat/:receiverId', authenticateToken, async (req, res) => {
  try {
    const ChatMDL = Chat();
    const msgs = await ChatMDL.find({});
    // Filter messages between sender and receiver in either direction
    const filtered = msgs
      .filter(
        (m) =>
          (m.senderId === req.user.id && m.receiverId === req.params.receiverId) ||
          (m.senderId === req.params.receiverId && m.receiverId === req.user.id)
      )
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve messages.' });
  }
});

app.post('/api/chat', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { receiverId, message } = req.body;
    const ChatMDL = Chat();
    let imgUrl = '';
    if (req.file) {
      imgUrl = processImageUpload(req.file);
    }

    const newMsg = await ChatMDL.create({
      senderId: req.user.id,
      receiverId,
      message: message || '',
      type: imgUrl ? 'image' : 'text',
      mediaUrl: imgUrl,
    });

    res.status(201).json(newMsg);
  } catch (err) {
    res.status(500).json({ message: 'Send failed.' });
  }
});

// AI Chatbot supporting Catalog Queries & Status Check
app.post('/api/ai/chatbot', async (req, res) => {
  try {
    const { message, customerId } = req.body;
    if (!message) return res.status(400).json({ message: 'Prompt is required.' });

    const prompt = message.toLowerCase().trim();
    const BusinessMDL = Business();
    const ProductMDL = Product();
    const CouponMDL = Coupon();
    const OrderMDL = Order();

    const businesses = await BusinessMDL.find({});
    const products = await ProductMDL.find({});

    let response = '';

    // Order Tracking Query
    if (prompt.includes('order') || prompt.includes('track') || prompt.includes('status')) {
      const match = message.match(/[a-z0-9]{5,10}/i);
      if (match) {
        const orderId = match[0];
        const ord = await OrderMDL.findById(orderId);
        if (ord) {
          response = `Your order **${orderId}** totaling **NPR ${ord.total}** is currently **${ord.status.toUpperCase()}**.\n` +
            `Payment Status: **${ord.paymentStatus.toUpperCase()}**.\n` +
            `Tracking Note: _${ord.trackingHistory[ord.trackingHistory.length - 1].note}_`;
        } else {
          response = `I found a code "${orderId}" but couldn't locate a matching order in our marketplace database. Please double-check your Order ID.`;
        }
      } else {
        // Find recent orders for user
        if (customerId) {
          const userOrders = await OrderMDL.find({ customerId });
          if (userOrders.length > 0) {
            const last = userOrders[0];
            response = `Your most recent order is **${last._id}** (${last.items.map(i=>i.name).join(', ')}).\n` +
              `Status: **${last.status.toUpperCase()}**.\n` +
              `Total: **NPR ${last.total}**.`;
          } else {
            response = 'You have not placed any orders yet. Would you like help finding a shop?';
          }
        } else {
          response = 'To track an order, please provide your 9-character Order ID (e.g. `u8h3jnsd`).';
        }
      }
    }
    // Coupon Query
    else if (prompt.includes('coupon') || prompt.includes('promo') || prompt.includes('discount')) {
      const coupons = await CouponMDL.find({ active: true });
      if (coupons.length > 0) {
        response = `Here are active marketplace discount coupons you can use:\n` +
          coupons.map((c) => `- **${c.code}**: Get ${c.discountPercent}% off (up to NPR ${c.maxDiscount})`).join('\n');
      } else {
        response = 'There are no active coupons right now, but check back during flash sales!';
      }
    }
    // Business Queries
    else {
      let matchedBiz = null;
      for (let b of businesses) {
        if (prompt.includes(b.name.toLowerCase())) {
          matchedBiz = b;
          break;
        }
      }

      if (matchedBiz) {
        const bizProds = products.filter((p) => p.businessId === matchedBiz._id);
        const prodList = bizProds.length > 0 ? bizProds.map((p) => `- ${p.name} (NPR ${p.price})`).slice(0, 3).join('\n') : 'No products loaded.';
        response = `**${matchedBiz.name}** is a verified vendor in **${matchedBiz.category}** located in **${matchedBiz.location}**.\n` +
          `Hours: **${matchedBiz.hours}**\n` +
          `Rating: **${matchedBiz.rating} ⭐** (${matchedBiz.reviewCount} reviews)\n` +
          `Description: _${matchedBiz.description}_\n\n` +
          `**Featured Products/Services:**\n${prodList}`;
      }
      // General categories or generic welcome
      else if (prompt.includes('food') || prompt.includes('restaurant') || prompt.includes('eat')) {
        const foodBizs = businesses.filter((b) => b.category.toLowerCase().includes('restaurant') || b.category.toLowerCase().includes('food'));
        response = `Here are some food options on UdyogConnect:\n` +
          foodBizs.map((b) => `- **${b.name}** in ${b.location} (${b.rating} ⭐)`).join('\n');
      } else if (prompt.includes('craft') || prompt.includes('gift') || prompt.includes('art')) {
        const craftBizs = businesses.filter((b) => b.category.toLowerCase().includes('gift') || b.category.toLowerCase().includes('craft'));
        response = `Check out our local artisan shops:\n` +
          craftBizs.map((b) => `- **${b.name}** in ${b.location} (${b.rating} ⭐)`).join('\n');
      } else {
        response = `Namaste! I am the **UdyogConnect Support AI**. I can assist you with:\n` +
          `- **Finding Shops**: Ask about "Bhoj Garden" or "Sunar Craft House".\n` +
          `- **Tracking Delivery**: Ask "Where is my order" or provide your Order ID.\n` +
          `- **Discount Coupons**: Type "coupons" to see active offers.\n` +
          `- **Categories**: Search for "food", "furniture", or "crafts".`;
      }
    }

    res.json({ text: response });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Chatbot encountered an error.' });
  }
});

// Location-based recommendations
app.get('/api/ai/recommendations', authenticateToken, async (req, res) => {
  try {
    const BusinessMDL = Business();
    const ProductMDL = Product();
    const OrderMDL = Order();

    const businesses = await BusinessMDL.find({ verified: 'verified' });
    const products = await ProductMDL.find({});
    const myOrders = await OrderMDL.find({ customerId: req.user.id });

    // Recommendation logic:
    // 1. If customer bought from category, recommend products in same category
    // 2. Recommend highest rated businesses
    // 3. Match distance (fallback)

    let recommendedBizs = [...businesses].sort((a, b) => b.rating - a.rating).slice(0, 3);
    let recommendedProds = [];

    if (myOrders.length > 0) {
      const itemsBought = myOrders.flatMap((o) => o.items);
      if (itemsBought.length > 0) {
        const matchName = itemsBought[0].name;
        const matchingProd = products.find((p) => p.name === matchName);
        if (matchingProd) {
          recommendedProds = products.filter((p) => p.category === matchingProd.category && p._id !== matchingProd._id).slice(0, 3);
        }
      }
    }

    if (recommendedProds.length === 0) {
      // Recommend products with discounts
      recommendedProds = products.filter((p) => p.discount > 0).slice(0, 3);
    }
    if (recommendedProds.length === 0) {
      recommendedProds = products.slice(0, 3);
    }

    res.json({ businesses: recommendedBizs, products: recommendedProds });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch recommendations.' });
  }
});

// ==================== ADMIN DASHBOARD & REPORTS ====================

app.get('/api/admin/analytics', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const UserMDL = User();
    const BusinessMDL = Business();
    const OrderMDL = Order();
    const ReviewMDL = Review();

    const usersCount = await UserMDL.countDocuments({});
    const sellersCount = await UserMDL.countDocuments({ role: 'seller' });
    const ridersCount = await UserMDL.countDocuments({ role: 'rider' });
    const customersCount = await UserMDL.countDocuments({ role: 'customer' });

    const businesses = await BusinessMDL.find({});
    const orders = await OrderMDL.find({});
    const reviews = await ReviewMDL.find({});

    const totalRevenue = orders.filter((o) => o.status === 'completed' || o.paymentStatus === 'paid').reduce((acc, o) => acc + o.total, 0);
    const totalTax = orders.filter((o) => o.status === 'completed' || o.paymentStatus === 'paid').reduce((acc, o) => acc + (o.tax || 0), 0);

    // Calculate sales charts grouping by date (last 7 days)
    const salesChart = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      salesChart[dateStr] = 0;
    }

    orders.forEach((o) => {
      const dateStr = new Date(o.createdAt).toISOString().split('T')[0];
      if (salesChart[dateStr] !== undefined) {
        salesChart[dateStr] += o.total;
      }
    });

    const chartsData = Object.keys(salesChart).map((date) => ({ date, amount: salesChart[date] }));

    res.json({
      metrics: {
        totalUsers: usersCount,
        customers: customersCount,
        sellers: sellersCount,
        riders: ridersCount,
        totalBusinesses: businesses.length,
        pendingApprovals: businesses.filter((b) => b.verified === 'pending').length,
        totalOrders: orders.length,
        revenue: totalRevenue,
        tax: totalTax,
        reportedReviews: reviews.filter((r) => r.reported).length,
      },
      charts: chartsData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Analytics compilation failed.' });
  }
});

// CSV Export reports endpoint
app.get('/api/admin/reports', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { type } = req.query; // 'sales', 'tax', 'revenue', 'users'
    const OrderMDL = Order();
    const UserMDL = User();
    let csvContent = '';

    if (type === 'users') {
      const users = await UserMDL.find({});
      csvContent = 'User ID,Name,Email,Phone,Role,Loyalty Points\n' +
        users.map((u) => `"${u._id}","${u.name}","${u.email}","${u.phone || ''}","${u.role}",${u.loyaltyPoints || 0}`).join('\n');
    } else {
      const orders = await OrderMDL.find({});
      if (type === 'tax') {
        csvContent = 'Order ID,Subtotal,VAT Tax (13%),Total,Status\n' +
          orders.map((o) => `"${o._id}",${o.subtotal},${o.tax || 0},${o.total},"${o.status}"`).join('\n');
      } else {
        // Sales / Revenue Report
        csvContent = 'Order ID,Customer ID,Subtotal,Delivery,Tax,Discount,Total,Status,Payment\n' +
          orders.map((o) => `"${o._id}","${o.customerId}",${o.subtotal},${o.deliveryFee},${o.tax},${o.discount},${o.total},"${o.status}","${o.paymentStatus}"`).join('\n');
      }
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=udyogconnect_${type}_report.csv`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ message: 'Report generation failed.' });
  }
});

app.post('/api/admin/coupons', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { code, discountPercent, maxDiscount, expiryDate } = req.body;
    if (!code || !discountPercent || !maxDiscount || !expiryDate) {
      return res.status(400).json({ message: 'All coupon fields required.' });
    }

    const CouponMDL = Coupon();
    const newCoupon = await CouponMDL.create({
      code: code.toUpperCase(),
      discountPercent: parseInt(discountPercent),
      maxDiscount: parseFloat(maxDiscount),
      expiryDate,
      active: true,
    });
    res.status(201).json({ success: true, coupon: newCoupon });
  } catch (err) {
    res.status(500).json({ message: 'Coupon creation failed.' });
  }
});

app.get('/api/admin/coupons', authenticateToken, async (req, res) => {
  try {
    const CouponMDL = Coupon();
    const coupons = await CouponMDL.find({});
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve coupons.' });
  }
});

// Notifications API
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const NotificationMDL = Notification();
    const list = await NotificationMDL.find({ userId: req.user.id });
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve notifications.' });
  }
});

app.put('/api/notifications/read', authenticateToken, async (req, res) => {
  try {
    const NotificationMDL = Notification();
    const list = await NotificationMDL.find({ userId: req.user.id });
    for (let n of list) {
      await NotificationMDL.findByIdAndUpdate(n._id, { read: true });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update notifications.' });
  }
});

// Health Endpoint
app.get('/health', (_req, res) => {
  res.json({ ok: true, isMongo: getIsMongo() });
});

// Initialize database and start server
connectDb().then(() => {
  app.listen(port, () => {
    console.log(`UdyogConnect running on http://localhost:${port}`);
  });
});
