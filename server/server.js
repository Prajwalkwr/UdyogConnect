const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Prevent the server from crashing on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { generateToken, getJwtSecret } = require('./utils/generateToken');
const { authenticateToken } = require('./middleware/authMiddleware');
const { requireRole } = require('./middleware/roleMiddleware');
const { isNepalPlace } = require('./utils/nepalPlaces');
const { connectDb, db, getIsMongo, User, Business, Product, Service, Order, Booking, Review, Chat, Notification, Coupon, AuditLog, Category, SystemSetting } = require('./db');
const { getRegistrationUserDefaults } = require('./authHelpers');
const {
  validateRegistration,
  validateLogin,
  validateBusinessPayload,
  validateProductPayload,
  validateServicePayload,
  validateReviewPayload,
  validateOrderPayload,
  validateFileUpload,
} = require('./validationMiddleware');
const nodemailer = require('nodemailer');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const app = express();
// Request timing middleware for performance monitoring
app.use((req, res, next) => {
  const startHrTime = process.hrtime();
  res.on('finish', () => {
    const elapsedHrTime = process.hrtime(startHrTime);
    const elapsedMs = elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6;
    console.log(`[PERF] ${req.method} ${req.originalUrl} - ${elapsedMs.toFixed(3)} ms`);
  });
  next();
});
const httpServer = http.createServer(app);
const port = process.env.PORT || 3000;

function getAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const net = require('net');
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(getAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });

    server.once('listening', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });

    server.listen(startPort);
  });
}
const JWT_SECRET = getJwtSecret();
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
let stripe = null;
if (STRIPE_SECRET && STRIPE_SECRET !== 'mock') {
  try {
    const Stripe = require('stripe');
    stripe = Stripe(STRIPE_SECRET);
  } catch (err) {
    console.error('Failed to load stripe module', err);
  }
} else {
  // Mock stripe for testing without a real key
  stripe = {
    checkout: {
      sessions: {
        create: async (data) => {
          return { url: `${process.env.CLIENT_URL || 'http://localhost:5174'}/payment-success?session_id=mock_sess_123&orderId=${data.metadata.orderId}` };
        },
        retrieve: async (id) => {
          return { payment_status: 'paid' };
        }
      }
    }
  };
}

// Cloudinary setup (optional)
let cloudinary = null;
let cloudinaryConfigured = false;

const looksLikePlaceholder = (value) => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized.includes('your_') || normalized.includes('placeholder') || normalized.includes('changeme');
};

try {
  const cld = require('cloudinary').v2;
  cloudinary = cld;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const cloudinaryUrl = process.env.CLOUDINARY_URL;

  if (cloudinaryUrl || (!looksLikePlaceholder(cloudName) && !looksLikePlaceholder(apiKey) && !looksLikePlaceholder(apiSecret))) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    cloudinaryConfigured = true;
  }
} catch (e) {
  console.warn('Cloudinary package not available. Falling back to base64 storage.');
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const ensureDbReady = async (req, res, next) => {
  try {
    if (!db.User || !db.Business) {
      await connectDb();
    }
  } catch (err) {
    console.warn('DB bootstrap warning:', err && err.message);
  }
  next();
};
app.use(ensureDbReady);

// ─── Email helper (Nodemailer) ───────────────────────────────────────────────
let mailTransporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  try {
    mailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true' || false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    // verify connection
    mailTransporter.verify().then(() => console.log('SMTP transporter verified')).catch((e) => console.warn('SMTP verify failed', e.message));
  } catch (e) {
    console.warn('Failed to initialize SMTP transporter', e.message);
    mailTransporter = null;
  }
} else {
  console.warn('SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env to enable email notifications.');
}

async function sendMail(options = {}) {
  if (!mailTransporter) {
    console.warn('Mail transporter not available — skipping email:', options.to, options.subject);
    return false;
  }
  try {
    const info = await mailTransporter.sendMail(options);
    console.log('Email sent:', info.messageId);
    return true;
  } catch (err) {
    console.error('Failed to send email:', err && err.message);
    return false;
  }
}

// ─── Socket.IO real-time setup ────────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
});
const onlineUsers = new Map();

// Middleware: authenticate socket connections via JWT token in handshake
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) {
    // Allow unauthenticated connections for broadcast-only rooms
    socket.userId = null;
    socket.userRole = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.id;
    socket.userRole = decoded.role;
    next();
  } catch {
    socket.userId = null;
    socket.userRole = null;
    next();
  }
});

io.on('connection', (socket) => {
  // Each user joins their own private room (by userId) for targeted delivery
  if (socket.userId) {
    onlineUsers.set(String(socket.userId), (onlineUsers.get(String(socket.userId)) || 0) + 1);
    socket.join(`user:${socket.userId}`);
    // Also join a role-based room for broadcast events (e.g. admin, seller)
    if (socket.userRole) {
      socket.join(`role:${socket.userRole}`);
    }
    socket.emit('presence_snapshot', Array.from(onlineUsers.keys()));
    socket.broadcast.emit('presence_update', { userId: socket.userId, online: true });
  }

  socket.on('disconnect', () => {
    if (!socket.userId) return;
    const connectionCount = (onlineUsers.get(String(socket.userId)) || 1) - 1;
    if (connectionCount > 0) {
      onlineUsers.set(String(socket.userId), connectionCount);
    } else {
      onlineUsers.delete(String(socket.userId));
      socket.broadcast.emit('presence_update', { userId: socket.userId, online: false });
    }
  });
});

// Expose io instance so routes can emit events
app.set('io', io);
// ─────────────────────────────────────────────────────────────────────────────


const BUSINESS_ACCESS_MESSAGES = {
  pending: 'Your business registration is waiting for admin approval.',
  rejected: 'Your business registration was rejected. Please check the reason.',
  suspended: 'Your business account has been suspended. Please contact support.',
  revision_requested: 'Your business registration was rejected. Please check the reason.',
};

const getApprovalStatus = (business) => {
  if (business?.approvalStatus === 'suspended' || business?.verified === 'suspended') return 'suspended';
  if (['pending', 'approved', 'rejected', 'revision_requested'].includes(business?.approvalStatus)) return business.approvalStatus;
  if (business?.verified === 'approved' || business?.verified === 'verified') return 'approved';
  if (business?.verified === 'rejected') return 'rejected';
  if (business?.verified === 'revision_requested') return 'revision_requested';
  return 'pending';
};

const isPubliclyLiveBusiness = (business) => getApprovalStatus(business) === 'approved';

const getOptionalRequestUser = (req) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader && String(authHeader).split(' ')[1];
    if (!token) return null;
    const decoded = jwt.verify(token, getJwtSecret());
    const userId = decoded.userId || decoded.id;
    if (!userId) return null;
    return {
      ...decoded,
      userId,
      id: userId,
      role: decoded.role,
    };
  } catch (_) {
    return null;
  }
};

const businessAccessDenial = (business, user) => {
  if (!user || user.role === 'admin') return null;
  const status = getApprovalStatus(business);
  if (status === 'approved') return null;
  return BUSINESS_ACCESS_MESSAGES[status] || BUSINESS_ACCESS_MESSAGES.pending;
};

const serializeBusiness = (business) => {
  const plain = typeof business?.toObject === 'function' ? business.toObject() : { ...business };
  const approvalStatus = getApprovalStatus(plain);
  const normalizedVerified = approvalStatus === 'approved'
    ? 'verified'
    : approvalStatus === 'suspended'
      ? 'suspended'
      : approvalStatus === 'revision_requested'
        ? 'pending'
        : approvalStatus;
  const reviewCount = Number(plain.reviewCount || 0);

  return {
    ...plain,
    approvalStatus,
    isVerified: approvalStatus === 'approved',
    verified: normalizedVerified,
    reviewCount,
    // Never show a seeded demo rating when the business has no reviews yet.
    rating: reviewCount > 0 ? Number(plain.rating || 0) : 0,
    imageUrl: plain.imageUrl || plain.logoUrl || plain.logo || plain.image || '',
  };
};

const idempotencyStore = new Map();

app.use((req, res, next) => {
  const method = req.method.toUpperCase();
  const idempotencyKey = req.headers['idempotency-key'] || req.headers['Idempotency-Key'];
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !idempotencyKey) {
    return next();
  }

  const now = Date.now();
  for (const [key, value] of idempotencyStore.entries()) {
    if ((value?.expiresAt || 0) <= now) {
      idempotencyStore.delete(key);
    }
  }

  const cacheKey = `${method}:${req.path}:${req.user?.id || req.ip || 'anonymous'}:${idempotencyKey}`;
  const cached = idempotencyStore.get(cacheKey);
  if (cached) {
    return res.status(cached.statusCode).json(cached.body);
  }

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyStore.set(cacheKey, { statusCode: res.statusCode || 200, body, expiresAt: Date.now() + 10 * 60 * 1000 });
    }
    return originalJson(body);
  };

  const originalSend = res.send.bind(res);
  res.send = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyStore.set(cacheKey, { statusCode: res.statusCode || 200, body, expiresAt: Date.now() + 10 * 60 * 1000 });
    }
    return originalSend(body);
  };

  return next();
});

// Expose simple config to client
app.get('/api/config', (req, res) => {
  res.json({
    cloudinary: !!cloudinaryConfigured,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || null,
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || null,
  });
});

// Provide a signing endpoint for client-side direct uploads
app.post('/api/cloudinary/sign', authenticateToken, async (req, res) => {
  try {
    if (!cloudinaryConfigured || !cloudinary) return res.status(501).json({ message: 'Cloudinary not configured.' });
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { timestamp };
    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);
    res.json({ signature, timestamp, api_key: process.env.CLOUDINARY_API_KEY, cloud_name: process.env.CLOUDINARY_CLOUD_NAME, upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET || null });
  } catch (err) {
    console.error('Signing failed', err);
    res.status(500).json({ message: 'Signing failed.' });
  }
});

// Delete asset by public_id
app.post('/api/cloudinary/delete', authenticateToken, requireRole(['seller','admin']), async (req, res) => {
  try {
    if (!cloudinaryConfigured || !cloudinary) return res.status(501).json({ message: 'Cloudinary not configured.' });
    const { public_id } = req.body;
    if (!public_id) return res.status(400).json({ message: 'public_id required.' });
    const result = await cloudinary.uploader.destroy(public_id, { resource_type: 'auto' });
    res.json({ success: true, result });
  } catch (err) {
    console.error('Cloudinary delete failed', err);
    res.status(500).json({ message: 'Deletion failed.' });
  }
});

// Serve client build if present (production multi-stage docker will copy client/dist)
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
} else {
  app.use(express.static(__dirname));
}

const upload = multer({ storage: multer.memoryStorage() });

// Helper: Convert File to Base64 String if Cloudinary is offline
const processImageUpload = (file) => {
  if (!file) return '';
  // If Cloudinary is configured, upload the buffer and return the secure URL
  if (cloudinaryConfigured && cloudinary) {
    return uploadBufferToCloudinary(file.buffer, file.originalname).catch((err) => {
      console.error('Cloudinary upload failed, falling back to base64', err);
      const base64 = file.buffer.toString('base64');
      return `data:${file.mimetype};base64,${base64}`;
    });
  }
  const base64 = file.buffer.toString('base64');
  return `data:${file.mimetype};base64,${base64}`;
};

// Upload helper using cloudinary uploader stream
const uploadBufferToCloudinary = (buffer, filename = 'upload', folder = 'udyogconnect') => {
  return new Promise((resolve, reject) => {
    if (!cloudinary || !cloudinaryConfigured) return reject(new Error('Cloudinary not configured'));
    const options = { folder, resource_type: 'auto' };
    // sanitize public_id
    if (filename) {
      const safeName = filename.replace(/[^a-zA-Z0-9-_\.]/g, '_').slice(0, 120);
      options.public_id = `${safeName}-${Date.now()}`;
    }
    const uploader = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result.secure_url || result.url);
    });
    uploader.end(buffer);
  });
};

// Helper: Extract Cloudinary public_id from secure_url
const extractPublicIdFromUrl = (url) => {
  if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) return null;
  try {
    const parts = url.split('/upload/');
    if (parts.length < 2) return null;
    const pathParts = parts[1].split('/');
    if (pathParts[0].match(/^v\d+$/)) {
      pathParts.shift(); // remove version
    }
    const fullPath = pathParts.join('/');
    const dotIndex = fullPath.lastIndexOf('.');
    if (dotIndex !== -1) {
      return fullPath.substring(0, dotIndex);
    }
    return fullPath;
  } catch (err) {
    return null;
  }
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

app.post('/api/auth/register', validateRegistration, async (req, res) => {
  try {
    const { name, email, password, confirmPassword, phone, role } = req.body;

    const UserMDL = User();
    const existing = await UserMDL.findOne({ email });
    if (existing) {
      return res.status(409).json({
        message: 'An account with this email already exists.',
        errors: { email: 'An account with this email already exists.' }
      });
    }

    if (phone) {
      const existingPhone = await UserMDL.findOne({ phone });
      if (existingPhone) {
        return res.status(409).json({
          message: 'This phone number is already registered.',
          errors: { phone: 'This phone number is already registered.' }
        });
      }
    }

    if (role === 'admin') {
      return res.status(403).json({ message: 'Admin accounts cannot be created through public registration.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role === 'seller' ? 'seller' : 'customer';
    const registrationDefaults = getRegistrationUserDefaults();
    const verificationOtp = registrationDefaults.isVerified ? '' : Math.floor(100000 + Math.random() * 900000).toString();

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
      isVerified: registrationDefaults.isVerified,
      verificationOtp: registrationDefaults.isVerified ? '' : verificationOtp,
      failedLoginAttempts: 0,
      lockUntil: null,
      resetOtp: '',
    });

    console.log('User registered:', newUser._id, newUser.email);

    // Create notification safely
    if (verificationOtp) {
      try {
        const NotificationMDL = Notification();
        if (NotificationMDL) {
          await NotificationMDL.create({
            userId: String(newUser._id),
            title: 'Verification OTP',
            message: `Welcome to UdyogConnect! Your activation OTP code is: ${verificationOtp}`,
            type: 'general',
          });
        }
      } catch (notifErr) {
        console.warn('Verification notification creation skipped:', notifErr && notifErr.message);
      }
    }

    const responsePayload = {
      success: true,
      isVerified: !!newUser.isVerified,
      message: registrationDefaults.isVerified ? 'Registration completed. You can now sign in immediately.' : 'Registration completed. Verification required.',
      email: newUser.email,
    };
    if (newUser.verificationOtp) responsePayload.otp = newUser.verificationOtp;

    // When OTP is not required, return a session so the client can finish signup in one step.
    if (newUser.isVerified) {
      const token = generateToken(newUser);
      const { password: _password, resetOtp: _resetOtp, verificationOtp: _verificationOtp, ...safeUser } =
        typeof newUser.toObject === 'function' ? newUser.toObject() : newUser;
      responsePayload.token = token;
      responsePayload.user = {
        ...safeUser,
        id: newUser._id,
        businessStatus: 'none',
        businessMessage: '',
        onboardingPending: userRole === 'seller',
      };
    }

    res.status(201).json(responsePayload);
  } catch (err) {
    if (err && err.code === 11000) {
      console.warn('Registration duplicate key error:', err.message);
      const duplicateField = err.keyPattern?.phone ? 'phone' : 'email';
      const duplicateMessage = duplicateField === 'phone'
        ? 'This phone number is already registered.'
        : 'An account with this email already exists.';
      return res.status(409).json({
        message: duplicateMessage,
        errors: { [duplicateField]: duplicateMessage }
      });
    }
    console.error('Registration error:', err && (err.stack || err.message));
    res.status(500).json({ message: 'Registration failed due to server error.' });
  }
});

app.post('/api/auth/login', validateLogin, async (req, res) => {
  try {
    const body = req.body || {};
    const email = body.email || body.username || body.user || '';
    const password = body.password || '';
    const otp = body.otp;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email/phone and password are required.' });
    }

    const UserMDL = User();
    let user = await UserMDL.findOne({ email });
    if (!user) {
      user = await UserMDL.findOne({ phone: email });
    }

    if (!user) {
      console.log('Login failed: no matching user for', email);
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'Your account has been suspended. Please contact support.' });
    }

    if (!user.isVerified) {
      console.log('Login blocked: account not verified for', email);
      return res.status(400).json({
        requireVerification: true,
        otp: user.verificationOtp || '',
        message: 'Account verification required. Please verify your account to continue.',
        email: user.email,
      });
    }

    // Check lockout status
    if (user.lockUntil && new Date(user.lockUntil) > new Date()) {
      const remainingSeconds = Math.ceil((new Date(user.lockUntil) - new Date()) / 1000);
      const remainingMins = Math.ceil(remainingSeconds / 60);
      return res.status(403).json({
        message: `Account locked due to consecutive failures. Try again in ${remainingMins} minute(s).`
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Login failed: password mismatch for', email);
      const attempts = (user.failedLoginAttempts || 0) + 1;
      let lockUntil = null;
      let msg = '';
      if (attempts >= 5) {
        lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        msg = 'Too many failed login attempts. Account locked for 5 minutes.';
      } else {
        msg = 'Invalid email or password.';
      }
      await UserMDL.findByIdAndUpdate(user._id, { failedLoginAttempts: attempts, lockUntil });
      return res.status(400).json({ failedAttempts: attempts, message: msg });
    }

    // Reset login failures on success
    await UserMDL.findByIdAndUpdate(user._id, { failedLoginAttempts: 0, lockUntil: null });

    // 2FA Mock Check
    if (user.twoFactorEnabled && !otp) {
      return res.json({ require2FA: true, message: '2FA verification code required.' });
    }

    if (user.twoFactorEnabled && otp !== '123456') {
      return res.status(400).json({ message: 'Invalid 2FA verification code.' });
    }

    // Check if Seller has registered a business
    let onboardingPending = false;
    let businessStatus = 'none';
    if (user.role === 'seller') {
      const BusinessMDL = Business();
      const biz = await BusinessMDL.findOne({ ownerId: user._id });
      if (!biz) {
        onboardingPending = true;
        businessStatus = 'none';
      } else {
        businessStatus = getApprovalStatus(biz);
      }
    }

    // Update login history
    const updatedHistory = [...(user.loginHistory || []), { timestamp: new Date().toISOString(), ip: req.ip, agent: req.headers['user-agent'] }];
    await UserMDL.findByIdAndUpdate(user._id, { loginHistory: updatedHistory });

    const AuditLogMDL = AuditLog();
    await AuditLogMDL.create({ userId: user._id, action: 'LOGIN', details: 'User logged in successfully' });

    const token = generateToken(user);
    console.log('User logged in:', user._id, user.email);
    const { password: _password, resetOtp: _resetOtp, verificationOtp: _verificationOtp, ...safeLoginUser } = typeof user.toObject === 'function' ? user.toObject() : user;
    res.json({
      success: true,
      token,
      user: {
        ...safeLoginUser,
        id: user._id,
        businessStatus,
        businessMessage: BUSINESS_ACCESS_MESSAGES[businessStatus] || '',
        onboardingPending
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed.' });
  }
});

// Verification Endpoints
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });

    const UserMDL = User();
    const user = await UserMDL.findOne({ email });
    if (!user) return res.status(400).json({ message: 'User not found.' });

    if (user.verificationOtp !== otp) {
      return res.status(400).json({ message: 'Invalid activation OTP code.' });
    }

    await UserMDL.findByIdAndUpdate(user._id, { isVerified: true, verificationOtp: '' });
    res.json({ success: true, message: 'Account activated successfully. You can now login.' });
  } catch (err) {
    res.status(500).json({ message: 'Verification failed.' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { emailOrPhone } = req.body;
    if (!emailOrPhone) return res.status(400).json({ message: 'Email or Phone is required.' });

    const UserMDL = User();
    let user = await UserMDL.findOne({ email: emailOrPhone });
    if (!user) {
      user = await UserMDL.findOne({ phone: emailOrPhone });
    }

    if (!user) return res.status(400).json({ message: 'No registered account found with this email/phone.' });

    const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
    await UserMDL.findByIdAndUpdate(user._id, { resetOtp });

    // Send notification
    const NotificationMDL = Notification();
    await NotificationMDL.create({
      userId: String(user._id),
      title: 'Password Reset OTP',
      message: `Your password reset request code is: ${resetOtp}`,
      type: 'general',
    });

    res.json({
      success: true,
      message: 'Password reset OTP dispatched successfully.',
      email: user.email,
      otp: resetOtp // Returned for debug convenience
    });
  } catch (err) {
    res.status(500).json({ message: 'Forgot password request failed.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { emailOrPhone, otp, password, confirmPassword } = req.body;
    if (!emailOrPhone || !otp || !password) {
      return res.status(400).json({ message: 'All inputs are required.' });
    }

    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long and contain at least one letter and one number.' });
    }

    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const UserMDL = User();
    let user = await UserMDL.findOne({ email: emailOrPhone });
    if (!user) {
      user = await UserMDL.findOne({ phone: emailOrPhone });
    }

    if (!user) return res.status(400).json({ message: 'Account not found.' });

    if (user.resetOtp !== otp) {
      return res.status(400).json({ message: 'Invalid or expired password reset OTP.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await UserMDL.findByIdAndUpdate(user._id, { password: hashedPassword, resetOtp: '' });
    res.json({ success: true, message: 'Password updated successfully. You can now login.' });
  } catch (err) {
    res.status(500).json({ message: 'Password reset operation failed.' });
  }
});



app.get('/api/auth/profile', authenticateToken, async (req, res) => {
  try {
    const UserMDL = User();
    const user = await UserMDL.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Profile not found.' });

    const safeUser = toSafeUser(user);
    if (user.role === 'seller') {
      const BusinessMDL = Business();
      const business = await BusinessMDL.findOne({ ownerId: String(req.user.id) });
      safeUser.business = business ? serializeBusiness(business) : null;
      safeUser.businessStatus = business ? getApprovalStatus(business) : 'none';
    }
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving profile.' });
  }
});

const authProfileUpload = upload.single('profilePhoto');
const parseMaybeJson = (value, fallback) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (err) {
      return fallback;
    }
  }
  return fallback;
};

const toSafeUser = (user) => {
  if (!user) return null;
  const plain = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  const { password, resetOtp, verificationOtp, ...safeUser } = plain;
  return safeUser;
};

app.put('/api/auth/profile', authenticateToken, (req, res, next) => {
  const contentType = String(req.headers['content-type'] || '');
  if (contentType.includes('multipart/form-data')) {
    return authProfileUpload(req, res, next);
  }
  return next();
}, async (req, res) => {
  try {
    const UserMDL = User();
    const user = await UserMDL.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Profile not found.' });

    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    if (req.body.email) updates.email = String(req.body.email).trim().toLowerCase();
    if (req.body.twoFactorEnabled !== undefined) {
      updates.twoFactorEnabled = req.body.twoFactorEnabled === 'true' || req.body.twoFactorEnabled === true;
    }
    if (req.body.addresses !== undefined) {
      updates.addresses = parseMaybeJson(req.body.addresses, []);
    }
    if (req.body.wishlist !== undefined) {
      const nextWishlist = parseMaybeJson(req.body.wishlist, user.wishlist || { products: [], services: [], businesses: [] });
      const toIdList = (items) => (Array.isArray(items) ? items : [])
        .map((item) => String(item?._id || item?.id || item || '').trim())
        .filter(Boolean);
      updates.wishlist = {
        products: toIdList(nextWishlist.products),
        services: toIdList(nextWishlist.services),
        businesses: toIdList(nextWishlist.businesses),
      };
    }
    if (req.body.paymentMethods !== undefined) {
      updates.paymentMethods = parseMaybeJson(req.body.paymentMethods, user.paymentMethods || []);
    }

    if (req.file) {
      const photoUrl = await processImageUpload(req.file);
      if (photoUrl) {
        if (user.profilePicture && user.profilePicture.includes('cloudinary.com')) {
          const publicId = extractPublicIdFromUrl(user.profilePicture);
          if (publicId && cloudinary) {
            await cloudinary.uploader.destroy(publicId, { resource_type: 'auto' }).catch(console.error);
          }
        }
        updates.profilePicture = photoUrl;
      }
    }

    const updated = await UserMDL.findByIdAndUpdate(req.user.id, updates, { new: true });
    res.json({ success: true, user: toSafeUser(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating profile.' });
  }
});

app.put('/api/auth/wishlist', authenticateToken, async (req, res) => {
  try {
    const UserMDL = User();
    const user = await UserMDL.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Profile not found.' });

    const incoming = parseMaybeJson(req.body?.wishlist ?? req.body, null);
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ message: 'Wishlist payload is required.' });
    }

    const toIdList = (items) => (Array.isArray(items) ? items : [])
      .map((item) => String(item?._id || item?.id || item || '').trim())
      .filter(Boolean);

    const wishlist = {
      products: toIdList(incoming.products),
      services: toIdList(incoming.services),
      businesses: toIdList(incoming.businesses),
    };

    const updated = await UserMDL.findByIdAndUpdate(req.user.id, { wishlist }, { new: true });
    res.json({ success: true, wishlist, user: toSafeUser(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to update wishlist.' });
  }
});

app.put('/api/auth/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required.' });
    }
    if (newPassword.length < 8 || !/\d/.test(newPassword) || !/[a-zA-Z]/.test(newPassword)) {
      return res.status(400).json({ message: 'New password must be at least 8 characters and include letters and numbers.' });
    }
    if (confirmPassword && confirmPassword !== newPassword) {
      return res.status(400).json({ message: 'Password confirmation does not match.' });
    }

    const UserMDL = User();
    const user = await UserMDL.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Profile not found.' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect.' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await UserMDL.findByIdAndUpdate(req.user.id, { password: hashedPassword });
    res.json({ success: true, message: 'Password updated.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update password.' });
  }
});

// ==================== HEALTH CHECK & PERSISTENCE VERIFICATION ====================

// Health check endpoint - verify MongoDB connection
app.get('/api/health/status', async (req, res) => {
  try {
    const mongoConnected = getIsMongo();
    
    // Try to count businesses to verify connection
    let businessCount = 0;
    let mongoError = null;
    
    try {
      const BusinessMDL = Business();
      businessCount = await BusinessMDL.countDocuments({});
    } catch (err) {
      mongoError = err.message;
    }

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        type: mongoConnected ? 'MongoDB (Production)' : 'JSON File Storage (Development)',
        connected: true,
        mongoError: mongoError || null,
        businessCount: businessCount
      },
      message: mongoConnected 
        ? 'Database connected. Business data will PERSIST across server restarts.' 
        : 'Using file-based storage. Business data will persist if saved to JSON files.'
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Health check failed', 
      error: err.message 
    });
  }
});

// Admin endpoint - verify all businesses are persisted
app.get('/api/admin/businesses/persistence-check', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const BusinessMDL = Business();
    const businesses = await BusinessMDL.find({});
    
    const stats = {
      totalBusinesses: businesses.length,
      byStatus: {
        pending: businesses.filter(b => b.verified === 'pending').length,
        verified: businesses.filter(b => b.verified === 'verified').length,
        approved: businesses.filter(b => b.verified === 'approved').length,
        rejected: businesses.filter(b => b.verified === 'rejected').length,
        suspended: businesses.filter(b => b.verified === 'suspended').length,
      },
      mongoConnected: getIsMongo(),
      timestamp: new Date().toISOString(),
    };

    res.json({
      status: 'ok',
      databaseType: getIsMongo() ? 'MongoDB (Production)' : 'JSON Files (Development)',
      persistenceInfo: 'All business data listed below is permanently stored and will persist across server restarts.',
      stats,
      businesses: businesses.map(b => ({
        id: b._id,
        name: b.name,
        owner: b.ownerId,
        category: b.category,
        verified: b.verified,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt
      }))
    });
  } catch (err) {
    res.status(500).json({ 
      status: 'error', 
      message: 'Failed to check business persistence', 
      error: err.message 
    });
  }
});

// ==================== MARKETPLACE & BUSINESS APIS ====================

app.get('/api/businesses', async (req, res) => {
  try {
    const { category, search, lat, lng, maxDistance, status } = req.query;
    const BusinessMDL = Business();
    let listings = await BusinessMDL.find({});

    // Public marketplace: only admin-approved businesses go live.
    // Admins may pass ?status=... or ?includeAll=true (with auth) to manage approvals.
    const requestUser = getOptionalRequestUser(req);
    const isAdmin = requestUser?.role === 'admin';
    if (isAdmin && (status || String(req.query.includeAll || '') === 'true')) {
      if (status && status !== 'All') {
        listings = listings.filter((b) => {
          const approval = getApprovalStatus(b);
          const verified = serializeBusiness(b).verified;
          return String(status) === approval || String(status) === verified || String(b.verified) === String(status);
        });
      }
    } else {
      listings = listings.filter((b) => isPubliclyLiveBusiness(b));
    }

    if (category && category !== 'All') {
      listings = listings.filter((b) => String(b.category || '').toLowerCase() === String(category).toLowerCase());
    }

    if (search) {
      const term = search.toLowerCase();
      listings = listings.filter(
        (b) =>
          String(b.name || '').toLowerCase().includes(term) ||
          String(b.description || '').toLowerCase().includes(term) ||
          String(b.category || '').toLowerCase().includes(term)
      );
    }

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

    res.json(listings.map(serializeBusiness).slice(0, 200));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to retrieve listings.' });
  }
});

app.get('/api/admin/businesses', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const BusinessMDL = Business();
    const listings = await BusinessMDL.find({});
    res.json(listings.map(serializeBusiness));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to retrieve admin business listings.' });
  }
});

app.get('/api/businesses/mine', authenticateToken, requireRole(['seller', 'admin']), async (req, res) => {
  try {
    const BusinessMDL = Business();
    const ownerId = String(req.user.id || req.user.userId || '');
    const business = await BusinessMDL.findOne({ ownerId });
    if (!business) return res.status(404).json({ message: 'Business profile not found.' });
    res.json({ business: serializeBusiness(business) });
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving business profile.' });
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

    const requestUser = getOptionalRequestUser(req);
    const isAdmin = requestUser?.role === 'admin';
    const isOwner = requestUser && String(business.ownerId) === String(requestUser.id || requestUser.userId);
    if (!isPubliclyLiveBusiness(business) && !isAdmin && !isOwner) {
      return res.status(404).json({ message: 'Business profile not found.' });
    }

    const products = await ProductMDL.find({ businessId: req.params.id });
    const services = await ServiceMDL.find({ businessId: req.params.id });
    const reviews = await ReviewMDL.find({ businessId: req.params.id, targetType: 'business' });

    res.json({
      business: serializeBusiness(business),
      products,
      services,
      reviews,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving business details.' });
  }
});

app.post('/api/businesses', authenticateToken, requireRole(['seller', 'admin']), upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'cover', maxCount: 1 }, { name: 'document', maxCount: 1 }, { name: 'qr', maxCount: 1 }]), async (req, res) => {
  try {
    const { name, category, subcategory, location, price, description, phone, contactEmail, website, hours, latitude, longitude, registrationNumber, panVatNumber, deliveryAvailable, offeringType, isOpen, deliveryRadiusKm } = req.body || {};
    if (!name || !category || !location || !description || !contactEmail || !phone || !hours || !offeringType) {
      return res.status(400).json({ message: 'Business name, category, Nepal location, description, email, phone, hours, and catalog type are required.' });
    }

    const PERSON_NAME_RE = /^[\p{L}]+(?:[ ][\p{L}]+)*$/u;
    const BUSINESS_EMAIL_RE = /^[A-Za-z]+@[0-9]+\.com$/i;
    const BUSINESS_HOURS_OPTIONS = [
      '07:00 - 19:00', '08:00 - 17:00', '08:00 - 18:00', '08:00 - 20:00',
      '09:00 - 17:00', '09:00 - 18:00', '09:00 - 20:00', '09:00 - 21:00',
      '10:00 - 18:00', '10:00 - 20:00', '10:00 - 22:00',
      '11:00 - 21:00', '11:00 - 23:00', '12:00 - 22:00', '16:00 - 23:00',
    ];
    const BUSINESS_CATEGORY_OPTIONS = [
      'Grocery', 'Restaurants & Food', 'Furniture', 'Gift Shop / Crafts', 'Home Services',
      'Mechanics & Repair', 'Electronics', 'Clothing & Fashion', 'Health & Beauty', 'Education',
    ];

    if (!PERSON_NAME_RE.test(String(name).trim())) {
      return res.status(400).json({ message: 'Business name can only contain letters and spaces (no numbers or special characters).' });
    }
    if (!BUSINESS_CATEGORY_OPTIONS.includes(String(category).trim())) {
      return res.status(400).json({ message: 'Please select a valid business category.' });
    }
    if (!PERSON_NAME_RE.test(String(location).trim())) {
      return res.status(400).json({ message: 'Location can only contain letters and spaces (no numbers or special characters).' });
    }
    if (!BUSINESS_EMAIL_RE.test(String(contactEmail).trim())) {
      return res.status(400).json({ message: 'Business email must be words@number.com (e.g. shop@123.com).' });
    }
    if (!/^(97|98)\d{8}$/.test(String(phone).trim())) {
      return res.status(400).json({ message: 'Phone number must be exactly 10 digits starting with 97 or 98.' });
    }
    const wordCount = String(description || '').trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 50) {
      return res.status(400).json({ message: `Business description must be at least 50 words (currently ${wordCount}).` });
    }
    const normalizedHours = BUSINESS_HOURS_OPTIONS.includes(String(hours || '').trim()) ? String(hours).trim() : null;
    if (!normalizedHours) {
      return res.status(400).json({ message: 'Please select business hours from the available options.' });
    }

    if (!['products', 'services', 'both'].includes(String(offeringType))) {
      return res.status(400).json({ message: 'A valid catalog type is required.' });
    }
    const deliveryEnabled = deliveryAvailable === true || deliveryAvailable === 'true';
    const parsedRadius = Math.round(Number(deliveryRadiusKm));
    if (deliveryEnabled && (!Number.isFinite(parsedRadius) || parsedRadius < 1 || parsedRadius > 50)) {
      return res.status(400).json({ message: 'Delivery radius must be a whole number between 1 and 50 km.' });
    }

    const hasDocument = Boolean(req.files?.document?.[0] || req.body.documentUrl);
    if (!hasDocument) {
      return res.status(400).json({ message: 'Business Certificate / Document is required. Please attach a PDF or image.' });
    }

    const ownerId = String(req.user.id || req.user.userId || '');
    if (!ownerId) {
      return res.status(401).json({ message: 'Authentication token required.' });
    }

    // Business name must be unique across all businesses
    const BusinessMDL = Business();
    const ownerBusiness = await BusinessMDL.findOne({ ownerId });
    if (ownerBusiness) {
      return res.status(409).json({ message: 'You already have a registered business. Update your existing business profile instead.' });
    }

    let existingBiz = null;
    try {
      existingBiz = await BusinessMDL.findOne({
        name: { $regex: `^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      });
    } catch (_) {
      const all = await BusinessMDL.find({});
      existingBiz = (Array.isArray(all) ? all : []).find((biz) => String(biz.name || '').trim().toLowerCase() === String(name).trim().toLowerCase()) || null;
    }
    if (existingBiz) {
      return res.status(409).json({ message: 'A business with this name already exists. Please choose a different name.' });
    }

    console.log(`[LOG] Seller ${req.user.email || ownerId} (${ownerId}) is registering business: "${name}" in category "${category}"`);

    let logoUrl = '';
    let coverUrl = '';
    let docUrl = '';
    let qrUrl = '';

    if (req.files) {
      if (req.files.logo && req.files.logo[0]) {
        logoUrl = await processImageUpload(req.files.logo[0]);
      }
      if (req.files.cover && req.files.cover[0]) {
        coverUrl = await processImageUpload(req.files.cover[0]);
      }
      if (req.files.document && req.files.document[0]) {
        docUrl = await processImageUpload(req.files.document[0]);
      }
      if (req.files.qr && req.files.qr[0]) {
        qrUrl = await processImageUpload(req.files.qr[0]);
      }
    }

    // Accept direct URLs from client-side uploads
    if (!logoUrl && req.body.logoUrl) logoUrl = req.body.logoUrl;
    if (!coverUrl && req.body.coverUrl) coverUrl = req.body.coverUrl;
    if (!docUrl && req.body.documentUrl) docUrl = req.body.documentUrl;
    if (!qrUrl && req.body.qrUrl) qrUrl = req.body.qrUrl;

    const newBusiness = await BusinessMDL.create({
      ownerId,
      name: String(name).trim(),
      category: String(category).trim(),
      subcategory: subcategory || '',
      location: locationText,
      price: price || '0',
      description: String(description).trim(),
      contactEmail: String(contactEmail || req.user.email || '').trim().toLowerCase(),
      phone: String(phone || '').trim(),
      website: website || '',
      hours: normalizedHours,
      imageUrl: logoUrl || '',
      coverUrl: coverUrl || '',
      qrUrl: qrUrl || '',
      latitude: latitude ? parseFloat(latitude) : 27.7007 + (Math.random() - 0.5) * 0.05,
      longitude: longitude ? parseFloat(longitude) : 85.3001 + (Math.random() - 0.5) * 0.05,
      approvalStatus: 'pending',
      verified: 'pending',
      isVerified: false,
      approvedAt: null,
      approvedBy: null,
      rejectionReason: '',
      documents: docUrl ? [docUrl] : [],
      rating: 0,
      reviewCount: 0,
      registrationNumber: registrationNumber || '',
      panVatNumber: panVatNumber || '',
      deliveryAvailable: deliveryAvailable === 'true' || deliveryAvailable === true,
      isOpen: isOpen === 'true' || isOpen === true,
      deliveryRadiusKm: deliveryEnabled ? parsedRadius : (Number.isFinite(parsedRadius) && parsedRadius > 0 ? parsedRadius : 5),
      visitorsCount: 0,
      offeringType: offeringType || 'both',
    });

    console.log(`[SUCCESS] Business registered: "${name}" (ID: ${newBusiness._id}) by seller ${ownerId} with status: pending. Business will persist until admin verification or permanent deletion.`);

    res.status(201).json({ success: true, business: serializeBusiness(newBusiness) });
  } catch (err) {
    console.error('Business registration failed:', err && (err.stack || err.message || err));
    if (err && err.name === 'ValidationError') {
      const firstError = Object.values(err.errors || {})[0];
      return res.status(400).json({ message: firstError?.message || 'Business details failed validation.' });
    }
    res.status(500).json({ message: 'Failed to register business.' });
  }
});

app.put('/api/businesses/:id', authenticateToken, requireRole(['seller', 'admin']), upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'cover', maxCount: 1 }, { name: 'document', maxCount: 1 }, { name: 'qr', maxCount: 1 }]), async (req, res) => {
  try {
    const BusinessMDL = Business();
    const biz = await BusinessMDL.findById(req.params.id);
    if (!biz) return res.status(404).json({ message: 'Business not found.' });

    if (String(biz.ownerId) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized profile edit.' });
    }

    const resetStatusOnResubmission = req.user.role === 'seller' && ['rejected', 'revision_requested', 'pending'].includes(String(biz.approvalStatus || ''));

    const removeLogo = req.body.removeLogo === 'true' || req.body.removeLogo === true;
    let logoUrl = req.body.logoUrl || '';
    let coverUrl = req.body.coverUrl || '';
    let docUrl = req.body.documentUrl || '';
    let qrUrl = req.body.qrUrl || '';

    if (req.files) {
      if (req.files.logo && req.files.logo[0]) {
        logoUrl = await processImageUpload(req.files.logo[0]);
      }
      if (req.files.cover && req.files.cover[0]) {
        coverUrl = await processImageUpload(req.files.cover[0]);
      }
      if (req.files.document && req.files.document[0]) {
        docUrl = await processImageUpload(req.files.document[0]);
      }
      if (req.files.qr && req.files.qr[0]) {
        qrUrl = await processImageUpload(req.files.qr[0]);
      }
    }

    const editableFields = [
      'name', 'category', 'subcategory', 'location', 'price', 'description',
      'contactEmail', 'phone', 'website', 'hours', 'latitude', 'longitude',
      'registrationNumber', 'panVatNumber', 'deliveryAvailable', 'offeringType',
      'isOpen', 'manualOpenOverride', 'deliveryRadiusKm',
    ];
    const updateData = Object.fromEntries(editableFields
      .filter((field) => req.body[field] !== undefined)
      .map((field) => [field, req.body[field]]));
    if (typeof updateData.deliveryAvailable !== 'undefined') {
      updateData.deliveryAvailable = updateData.deliveryAvailable === 'true' || updateData.deliveryAvailable === true;
    }
    if (typeof updateData.isOpen !== 'undefined') {
      updateData.isOpen = updateData.isOpen === 'true' || updateData.isOpen === true;
    }
    if (typeof updateData.manualOpenOverride !== 'undefined') {
      updateData.manualOpenOverride = updateData.manualOpenOverride === 'true' || updateData.manualOpenOverride === true;
    }
    if (typeof updateData.deliveryRadiusKm !== 'undefined') {
      updateData.deliveryRadiusKm = Number(updateData.deliveryRadiusKm || 5);
    }
    delete updateData.removeLogo;
    delete updateData.logoUrl;
    delete updateData.coverUrl;
    delete updateData.documentUrl;
    delete updateData.qrUrl;

    if (removeLogo || (logoUrl && logoUrl !== biz.imageUrl)) {
      if (biz.imageUrl && biz.imageUrl.includes('cloudinary.com')) {
        const publicId = extractPublicIdFromUrl(biz.imageUrl);
        if (publicId && cloudinary) {
          cloudinary.uploader.destroy(publicId, { resource_type: 'auto' }).catch(console.error);
        }
      }
    }

    if (removeLogo) {
      updateData.imageUrl = '';
    } else if (logoUrl) {
      updateData.imageUrl = logoUrl;
    }
    
    if (coverUrl && coverUrl !== biz.coverUrl) {
      if (biz.coverUrl && biz.coverUrl.includes('cloudinary.com')) {
        const publicId = extractPublicIdFromUrl(biz.coverUrl);
        if (publicId && cloudinary) {
          cloudinary.uploader.destroy(publicId, { resource_type: 'auto' }).catch(console.error);
        }
      }
      updateData.coverUrl = coverUrl;
    } else if (coverUrl === biz.coverUrl) {
      updateData.coverUrl = coverUrl;
    }

    if (docUrl && docUrl !== (biz.documents && biz.documents[0])) {
      if (biz.documents && biz.documents[0] && biz.documents[0].includes('cloudinary.com')) {
        const publicId = extractPublicIdFromUrl(biz.documents[0]);
        if (publicId && cloudinary) {
          cloudinary.uploader.destroy(publicId, { resource_type: 'auto' }).catch(console.error);
        }
      }
      updateData.documents = [docUrl];
    } else if (docUrl === (biz.documents && biz.documents[0])) {
      updateData.documents = [docUrl];
    }

    if (qrUrl && qrUrl !== biz.qrUrl) {
      if (biz.qrUrl && biz.qrUrl.includes('cloudinary.com')) {
        const publicId = extractPublicIdFromUrl(biz.qrUrl);
        if (publicId && cloudinary) {
          cloudinary.uploader.destroy(publicId, { resource_type: 'auto' }).catch(console.error);
        }
      }
      updateData.qrUrl = qrUrl;
    } else if (qrUrl === biz.qrUrl) {
      updateData.qrUrl = qrUrl;
    }

    if (resetStatusOnResubmission) {
      updateData.approvalStatus = 'pending';
      updateData.verified = 'pending';
      updateData.isVerified = false;
      updateData.approvedAt = null;
      updateData.approvedBy = null;
      updateData.rejectionReason = '';
      updateData.revisionStatus = 'resubmitted';
      updateData.revisionReason = '';
      updateData.revisionRequestedAt = null;
      updateData.revisionRequestedBy = null;
    }

    const updated = await BusinessMDL.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ success: true, business: serializeBusiness(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update business.' });
  }
});

// Admin approves business & sets verification badge
app.put('/api/businesses/:id/verify', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { status, rejectionReason = '' } = req.body;
    const approvalStatus = status === 'verified' ? 'approved' : status;
    if (!['pending', 'approved', 'rejected', 'suspended'].includes(approvalStatus)) {
      return res.status(400).json({ message: 'Invalid approval status.' });
    }
    const BusinessMDL = Business();
    const biz = await BusinessMDL.findById(req.params.id);
    if (!biz) return res.status(404).json({ message: 'Business not found.' });

    const updated = await BusinessMDL.findByIdAndUpdate(req.params.id, {
      approvalStatus,
      verified: approvalStatus === 'approved' ? 'verified' : approvalStatus,
      isVerified: approvalStatus === 'approved',
      approvedAt: approvalStatus === 'approved' ? new Date() : null,
      approvedBy: approvalStatus === 'approved' ? String(req.user.id || req.user.userId) : null,
      rejectionReason: approvalStatus === 'rejected' ? String(rejectionReason || '') : '',
    }, { new: true });

    // Send notification to business owner
    try {
      const NotificationMDL = Notification();
      let notificationTitle = 'Business Status Updated';
      let notificationMsg = `Your business "${biz.name}" status has been updated to ${status}.`;

      if (approvalStatus === 'approved') {
        notificationTitle = 'Business Approved';
        notificationMsg = `Congratulations! Your business "${biz.name}" has been verified and approved by the admin. You now have full access to the seller dashboard.`;
      } else if (approvalStatus === 'rejected') {
        notificationTitle = 'Business Declined';
        notificationMsg = `Your business "${biz.name}" registration was declined by the administrator. Please update your details and resubmit for approval.`;
      } else if (status === 'suspended') {
        notificationTitle = 'Business Suspended';
        notificationMsg = `Your business "${biz.name}" has been suspended by the administrator. Please contact support.`;
      }

      await NotificationMDL.create({
        userId: String(biz.ownerId),
        title: notificationTitle,
        message: notificationMsg,
        type: 'admin'
      });
      const socketIo = req.app.get('io');
      if (socketIo) socketIo.to(`user:${biz.ownerId}`).emit('new_notification');
    } catch (notifErr) {
      console.error('Failed to create notification', notifErr);
    }

    res.json({ success: true, business: serializeBusiness(updated) });
  } catch (err) {
    res.status(500).json({ message: 'Action failed.' });
  }
});

// Admin deletes business account and all associated data
app.delete('/api/businesses/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    // Verify admin role is set
    if (req.user.role !== 'admin') {
      console.warn(`[SECURITY] Non-admin user ${req.user.id} attempted to delete business ${req.params.id}`);
      return res.status(403).json({ message: 'Only administrators can delete businesses.' });
    }

    const BusinessMDL = Business();
    const ProductMDL = Product();
    const ServiceMDL = Service();
    const ReviewMDL = Review();
    const BookingMDL = Booking();
    const AuditLogMDL = AuditLog();

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

    // Log audit trail for admin deletion
    console.log(`[AUDIT] Admin ${req.user.email} (ID: ${req.user.id}) is deleting business "${biz.name}" (ID: ${bizId})`);

    // Record cascading deletions for audit trail
    let deletionStats = {
      business: 1,
      products: 0,
      services: 0,
      reviews: 0,
      bookings: 0
    };

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
      const prodResult = await ProductMDL.deleteMany({ businessId: bizId });
      deletionStats.products = prodResult.deletedCount || 0;
    } catch (err) {
      if (ProductMDL.collection) {
        const prodResult = await ProductMDL.collection.deleteMany({ businessId: bizId });
        deletionStats.products = prodResult.deletedCount || 0;
      } else {
        throw err;
      }
    }

    // Clean up associated services
    try {
      const svcResult = await ServiceMDL.deleteMany({ businessId: bizId });
      deletionStats.services = svcResult.deletedCount || 0;
    } catch (err) {
      if (ServiceMDL.collection) {
        const svcResult = await ServiceMDL.collection.deleteMany({ businessId: bizId });
        deletionStats.services = svcResult.deletedCount || 0;
      } else {
        throw err;
      }
    }

    // Clean up associated reviews
    try {
      const revResult = await ReviewMDL.deleteMany({ businessId: bizId });
      deletionStats.reviews = revResult.deletedCount || 0;
    } catch (err) {
      if (ReviewMDL.collection) {
        const revResult = await ReviewMDL.collection.deleteMany({ businessId: bizId });
        deletionStats.reviews = revResult.deletedCount || 0;
      } else {
        throw err;
      }
    }

    // Clean up associated bookings
    try {
      const bkResult = await BookingMDL.deleteMany({ businessId: bizId });
      deletionStats.bookings = bkResult.deletedCount || 0;
    } catch (err) {
      if (BookingMDL.collection) {
        const bkResult = await BookingMDL.collection.deleteMany({ businessId: bizId });
        deletionStats.bookings = bkResult.deletedCount || 0;
      } else {
        throw err;
      }
    }

    // Log audit trail
    try {
      await AuditLogMDL.create({
        userId: req.user.id,
        action: 'BUSINESS_DELETED',
        details: `Admin deleted business "${biz.name}" (${bizId}). Cascade deleted: ${deletionStats.products} products, ${deletionStats.services} services, ${deletionStats.reviews} reviews, ${deletionStats.bookings} bookings.`
      });
    } catch (auditErr) {
      console.error('Failed to record audit log for business deletion:', auditErr && auditErr.message);
    }

    console.log(`[AUDIT] Business deletion completed. Stats:`, deletionStats);
    res.json({ success: true, message: 'Business and all associated data permanently deleted.', deletionStats });
  } catch (err) {
    console.error('[ERROR] Business deletion failed:', err);
    res.status(500).json({ message: 'Business deletion failed. Please try again.' });
  }
});

// ==================== CATALOG MANAGEMENT ====================

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

app.get('/api/products', async (req, res) => {
  try {
    const ProductMDL = Product();
    const BusinessMDL = Business();
    const products = await ProductMDL.find({});
    const businesses = await BusinessMDL.find({});
    const liveBusinessIds = new Set(
      businesses.filter((b) => isPubliclyLiveBusiness(b)).map((b) => String(b._id))
    );
    const liveProducts = (Array.isArray(products) ? products : []).filter((product) =>
      liveBusinessIds.has(String(product.businessId))
    );
    res.json(liveProducts.slice(0, 200));
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving products.' });
  }
});

app.get('/api/services', async (req, res) => {
  try {
    const ServiceMDL = Service();
    const BusinessMDL = Business();
    const services = await ServiceMDL.find({});
    const businesses = await BusinessMDL.find({});
    const liveBusinessIds = new Set(
      businesses.filter((b) => isPubliclyLiveBusiness(b)).map((b) => String(b._id))
    );
    const liveServices = (Array.isArray(services) ? services : []).filter((service) =>
      liveBusinessIds.has(String(service.businessId))
    );
    res.json(liveServices.slice(0, 200));
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving services.' });
  }
});

app.post('/api/products', authenticateToken, requireRole(['seller', 'admin']), upload.single('image'), async (req, res) => {
  try {
    const { businessId, name, category, subcategory, description, price, discount, stock, sku, brand } = req.body;
    const ProductMDL = Product();
    let imgUrl = '';

    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      return res.status(400).json({ message: 'Product name is required.' });
    }

    const BusinessMDL = Business();
    const business = await BusinessMDL.findById(businessId);
    if (!business) {
      return res.status(404).json({ message: 'Business not found.' });
    }

    // Security Check: Business Ownership
    if (req.user.role !== 'admin' && String(business.ownerId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Access denied: You do not own this business.' });
    }

    if (business.offeringType === 'services') {
      return res.status(400).json({ message: 'This business is configured to offer services only. Products cannot be added.' });
    }

    // Validate no negative numbers
    const parsedPrice = parseFloat(price);
    const parsedDiscount = discount ? parseFloat(discount) : 0;
    const parsedStock = stock ? parseInt(stock) : 0;
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ message: 'Product price cannot be negative.' });
    }
    if (parsedDiscount < 0 || parsedDiscount > 100) {
      return res.status(400).json({ message: 'Discount must be between 0 and 100.' });
    }
    if (parsedStock < 0) {
      return res.status(400).json({ message: 'Stock quantity cannot be negative.' });
    }

    const allProducts = await ProductMDL.find({ businessId });
    const existingProduct = allProducts.find(p => p.name.toLowerCase() === normalizedName.toLowerCase());

    if (existingProduct) {
      return res.status(409).json({ message: 'A product with this name already exists for this business.' });
    }

    const productAccessMessage = businessAccessDenial(business, req.user);
    if (productAccessMessage) return res.status(403).json({ message: productAccessMessage });

    if (req.file) {
      imgUrl = await processImageUpload(req.file);
    }

    if (!imgUrl && req.body.imageUrl) imgUrl = req.body.imageUrl;

    const newProd = await ProductMDL.create({
      businessId,
      name,
      category,
      subcategory: subcategory || '',
      description,
      price: parsedPrice,
      discount: parsedDiscount,
      stock: parsedStock,
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
    const { price, discount, stock } = req.body;
    if (price !== undefined && parseFloat(price) < 0) return res.status(400).json({ message: 'Product price cannot be negative.' });
    if (discount !== undefined && (parseFloat(discount) < 0 || parseFloat(discount) > 100)) return res.status(400).json({ message: 'Discount must be between 0 and 100.' });
    if (stock !== undefined && parseInt(stock) < 0) return res.status(400).json({ message: 'Stock quantity cannot be negative.' });

    const ProductMDL = Product();
    const product = await ProductMDL.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    const BusinessMDL = Business();
    const business = await BusinessMDL.findById(product.businessId);
    if (req.user.role !== 'admin' && (!business || String(business.ownerId) !== String(req.user.id))) {
      return res.status(403).json({ message: 'Access denied: You do not own this product or business.' });
    }
    const productUpdateMessage = businessAccessDenial(business, req.user);
    if (productUpdateMessage) return res.status(403).json({ message: productUpdateMessage });

    const updated = await ProductMDL.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, product: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update product.' });
  }
});

app.delete('/api/products/:id', authenticateToken, requireRole(['seller', 'admin']), async (req, res) => {
  try {
    const ProductMDL = Product();
    const product = await ProductMDL.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found.' });

    const BusinessMDL = Business();
    const business = await BusinessMDL.findById(product.businessId);
    if (req.user.role !== 'admin' && (!business || String(business.ownerId) !== String(req.user.id))) {
      return res.status(403).json({ message: 'Access denied: You do not own this product or business.' });
    }
    const productDeleteMessage = businessAccessDenial(business, req.user);
    if (productDeleteMessage) return res.status(403).json({ message: productDeleteMessage });

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
    const normalizedName = String(name || '').trim();

    if (!normalizedName) {
      return res.status(400).json({ message: 'Service name is required.' });
    }

    const BusinessMDL = Business();
    const business = await BusinessMDL.findById(businessId);
    if (!business) {
      return res.status(404).json({ message: 'Business not found.' });
    }

    // Security Check: Business Ownership
    if (req.user.role !== 'admin' && String(business.ownerId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Access denied: You do not own this business.' });
    }

    if (business.offeringType === 'products') {
      return res.status(400).json({ message: 'This business is configured to offer products only. Services cannot be added.' });
    }

    // Validate no negative numbers
    const parsedServicePrice = parseFloat(price);
    const parsedDuration = (duration !== undefined && duration !== null && duration !== '') ? parseInt(duration) : 60;
    if (isNaN(parsedServicePrice) || parsedServicePrice < 0) {
      return res.status(400).json({ message: 'Service price cannot be negative.' });
    }
    if (isNaN(parsedDuration) || parsedDuration <= 0) {
      return res.status(400).json({ message: 'Service duration must be a positive number.' });
    }

    const existingService = await ServiceMDL.findOne({
      businessId,
      name: { $regex: `^${escapeRegExp(normalizedName)}$`, $options: 'i' },
    });

    if (existingService) {
      return res.status(409).json({ message: 'A service with this name already exists for this business.' });
    }

    const serviceAccessMessage = businessAccessDenial(business, req.user);
    if (serviceAccessMessage) return res.status(403).json({ message: serviceAccessMessage });

    const newServ = await ServiceMDL.create({
      businessId,
      name,
      description,
      price: parsedServicePrice,
      duration: parsedDuration,
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
    const service = await ServiceMDL.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found.' });

    const BusinessMDL = Business();
    const business = await BusinessMDL.findById(service.businessId);
    if (req.user.role !== 'admin' && (!business || String(business.ownerId) !== String(req.user.id))) {
      return res.status(403).json({ message: 'Access denied: You do not own this service or business.' });
    }
    const serviceUpdateMessage = businessAccessDenial(business, req.user);
    if (serviceUpdateMessage) return res.status(403).json({ message: serviceUpdateMessage });

    const updated = await ServiceMDL.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, service: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update service.' });
  }
});

app.delete('/api/services/:id', authenticateToken, requireRole(['seller', 'admin']), async (req, res) => {
  try {
    const ServiceMDL = Service();
    const service = await ServiceMDL.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Service not found.' });

    const BusinessMDL = Business();
    const business = await BusinessMDL.findById(service.businessId);
    if (req.user.role !== 'admin' && (!business || String(business.ownerId) !== String(req.user.id))) {
      return res.status(403).json({ message: 'Access denied: You do not own this service or business.' });
    }
    const serviceDeleteMessage = businessAccessDenial(business, req.user);
    if (serviceDeleteMessage) return res.status(403).json({ message: serviceDeleteMessage });

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
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Missing order details.' });
    }

    // Resolve businessId — try from request, then from cart items, then from the DB product record
    let normalizedBusinessId = String(businessId || items[0]?.businessId || items[0]?.business?.id || items[0]?.sellerId || items[0]?.vendorId || '').trim();

    // If still empty, look up the first product in DB and get its businessId
    if (!normalizedBusinessId && items.length > 0) {
      try {
        const ProductMDL2 = Product();
        const firstItemId = String(items[0]?.id || '');
        if (firstItemId) {
          const dbProduct = await ProductMDL2.findById(firstItemId);
          if (dbProduct && dbProduct.businessId) {
            normalizedBusinessId = String(dbProduct.businessId);
          }
        }
      } catch (_) {}
    }
    const normalizedAddress = deliveryAddress || {
      name: req.body.name || '',
      email: req.body.email || '',
      phone: req.body.phone || '',
      location: req.body.location || '',
      address: req.body.address || '',
      method: req.body.deliveryMethod || 'delivery',
    };

    if (!normalizedAddress.name || !normalizedAddress.phone || (!normalizedAddress.address && (normalizedAddress.method || 'delivery') === 'delivery')) {
      return res.status(400).json({ message: 'Please complete your delivery information.' });
    }

    const personName = String(normalizedAddress.name || '').trim();
    if (!/^[\p{L}]+(?:[ ][\p{L}]+)*$/u.test(personName) || personName.length < 2) {
      return res.status(400).json({
        message: 'Full name can only contain letters and spaces (no numbers or special characters).',
        errors: { name: 'Full name can only contain letters and spaces (no numbers or special characters).' },
      });
    }

    const deliveryEmail = String(normalizedAddress.email || '').trim();
    if (!deliveryEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deliveryEmail)) {
      return res.status(400).json({
        message: 'A valid email address is required for delivery details.',
        errors: { email: 'A valid email address is required.' },
      });
    }

    if (!/^(97|98)\d{8}$/.test(String(normalizedAddress.phone).trim())) {
      return res.status(400).json({ message: 'Phone number must be exactly 10 digits starting with 97 or 98.' });
    }

    const place = String(normalizedAddress.location || normalizedAddress.city || '').trim();
    if (!place || !isNepalPlace(place)) {
      return res.status(400).json({
        message: 'Location / City must be a place in Nepal (e.g. Kathmandu, Pokhara, Thamel).',
        errors: { city: 'Location / City must be a place in Nepal.' },
      });
    }

    if ((normalizedAddress.method || 'delivery') === 'delivery') {
      const street = String(normalizedAddress.address || '').trim();
      if (street.length < 5) {
        return res.status(400).json({
          message: 'Street address / landmark is required.',
          errors: { address: 'Street address / landmark is required.' },
        });
      }
    }

    const ProductMDL = Product();
    const ServiceMDL = Service();
    const CouponMDL = Coupon();
    const OrderMDL = Order();
    const UserMDL = User();

    // Verify stock / availability and calculate subtotal
    let subtotal = 0;
    for (let item of items) {
      const itemId = String(item.id || '');
      const isService = Boolean(item.type === 'service' || item.serviceId || item.kind === 'service');

      if (isService) {
        // Try DB lookup, fall back to cart price
        let servicePrice = Number(item.price || 0);
        try {
          const service = await ServiceMDL.findById(itemId);
          if (service) servicePrice = Number(service.price || servicePrice);
        } catch (_) {}
        subtotal += servicePrice * Number(item.quantity || 1);
        continue;
      }

      // Try DB lookup for product stock check
      let unitPrice = Number(item.price || 0);
      try {
        const product = await ProductMDL.findById(itemId);
        if (product) {
          if (product.stock < item.quantity) {
            return res.status(400).json({ message: `Insufficient stock for "${product.name}". Only ${product.stock} units available.` });
          }
          unitPrice = product.price - (product.price * (product.discount || 0)) / 100;
        }
      } catch (_) {}
      subtotal += unitPrice * Number(item.quantity || 1);
    }

    // Apply Coupon
    let discount = 0;
    if (promoCode) {
      const coupon = await CouponMDL.findOne({ code: promoCode.toUpperCase(), active: true });
      if (coupon) {
        const expiry = coupon.expiryDate ? new Date(`${coupon.expiryDate}T23:59:59`) : null;
        const isExpired = expiry && expiry < new Date();
        if (!isExpired) {
          discount = (subtotal * coupon.discountPercent) / 100;
          if (discount > coupon.maxDiscount) discount = coupon.maxDiscount;
        }
      }
    }

    const deliveryFee = 70; // NPR 70 flat delivery
    const tax = parseFloat((subtotal * 0.13).toFixed(2)); // 13% VAT
    const total = parseFloat((subtotal + deliveryFee + tax - discount).toFixed(2));

    // Deduct Stock for products only
    for (let item of items) {
      const isService = Boolean(item.type === 'service' || item.serviceId || item.kind === 'service');
      if (isService) continue;
      try {
        const product = await ProductMDL.findById(String(item.id || ''));
        if (product && product.stock >= item.quantity) {
          await ProductMDL.findByIdAndUpdate(item.id, { $inc: { stock: -item.quantity } });
        }
      } catch (_) {}
    }

    // Add Loyalty points (+10 for order)
    const buyer = await UserMDL.findById(req.user.id);
    await UserMDL.findByIdAndUpdate(req.user.id, { loyaltyPoints: (buyer.loyaltyPoints || 0) + 10 });

    // Create Order
    const newOrder = await OrderMDL.create({
      customerId: req.user.id,
      businessId: normalizedBusinessId,
      items: items.map((item) => ({
        ...item,
        businessId: item.businessId || item.business?.id || item.sellerId || item.vendorId || normalizedBusinessId,
      })),
      subtotal,
      deliveryFee,
      tax,
      discount,
      total,
      status: 'placed',
      paymentMethod: paymentMethod || 'COD',
      // Mark new orders as pending until payment confirmation.
      paymentStatus: 'pending',
      deliveryAddress: {
        ...normalizedAddress,
        location: normalizedAddress.location || '',
      },
      deliveryRiderId: '',
      deliveryOtp: Math.floor(1000 + Math.random() * 9000).toString(), // 4-digit OTP
      deliveryProof: '',
      trackingHistory: [{ status: 'placed', time: new Date().toISOString(), note: 'Order placed by customer.' }],
    });

    res.status(201).json({ success: true, order: newOrder });

    // ⚡ Real-time: notify the specific seller (business owner) and all admins
    const socketIo = req.app.get('io');
    if (socketIo) {
      // Notify the owner of the business that received the order
      if (normalizedBusinessId) {
        try {
          const BusinessMDL = Business();
          const biz = await BusinessMDL.findById(normalizedBusinessId);
          if (biz && biz.ownerId) {
            socketIo.to(`user:${biz.ownerId}`).emit('new_order', newOrder);
          }
        } catch (_) {}
      }
      // Broadcast to all admin role connections too
      socketIo.to(`role:admin`).emit('new_order', newOrder);
    }
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

// Create Stripe Checkout Session (test mode). Returns session url to redirect client.
app.post('/api/payment/create-session', authenticateToken, async (req, res) => {
  try {
    if (!stripe) return res.status(501).json({ message: 'Stripe not configured on server.' });
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ message: 'orderId required.' });

    const OrderMDL = Order();
    const order = await OrderMDL.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    // Convert NPR to USD for Stripe test payments (approx conversion)
    const usdAmount = Math.max(1, Math.round((order.total / 130) * 100)); // in cents

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `UdyogConnect Order ${order._id}` },
            unit_amount: usdAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: { orderId: order._id },
      success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/payment-success?session_id={CHECKOUT_SESSION_ID}&orderId=${order._id}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/checkout?canceled=1`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe session error', err);
    res.status(500).json({ message: 'Failed to create Stripe session.' });
  }
});

// Verify Stripe Checkout Session and update order payment status
app.post('/api/payment/verify-session', authenticateToken, async (req, res) => {
  try {
    if (!stripe) return res.status(501).json({ message: 'Stripe not configured on server.' });
    const { sessionId, orderId } = req.body;
    if (!sessionId || !orderId) return res.status(400).json({ message: 'sessionId and orderId required.' });

    const sess = await stripe.checkout.sessions.retrieve(sessionId);
    if (!sess) return res.status(404).json({ message: 'Session not found.' });

    const paid = sess.payment_status === 'paid' || sess.payment_status === 'complete';
    if (paid) {
      const OrderMDL = Order();
      await OrderMDL.findByIdAndUpdate(orderId, { paymentStatus: 'paid' });
      return res.json({ success: true, paid: true });
    }
    res.json({ success: false, paid: false, status: sess.payment_status });
  } catch (err) {
    console.error('Stripe verify error', err);
    res.status(500).json({ message: 'Failed to verify Stripe session.' });
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
      const myBizs = await BusinessMDL.find({ ownerId: String(req.user.id || req.user.userId) });
      const myBizIds = myBizs.map((b) => String(b._id));
      const groups = await Promise.all(myBizIds.map((businessId) => OrderMDL.find({ businessId })));
      orders = groups.flat();
    } else {
      orders = await OrderMDL.find({ customerId: req.user.id });
    }

    // Sort newest first
    orders = orders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 200);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve orders.' });
  }
});

// GET single order by ID
app.get('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const OrderMDL = Order();
    const order = await OrderMDL.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve order.' });
  }
});

app.put('/api/orders/:id/cancel', authenticateToken, async (req, res) => {
  try {
    const OrderMDL = Order();
    const order = await OrderMDL.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (req.user.role !== 'admin' && String(order.customerId) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only cancel your own orders.' });
    }
    if (!['placed', 'accepted', 'pending'].includes(order.status)) {
      return res.status(400).json({ message: 'This order can no longer be cancelled.' });
    }

    const trackingHistory = [...(order.trackingHistory || []), {
      status: 'cancelled',
      time: new Date().toISOString(),
      note: 'Cancelled by customer.',
    }];
    const updated = await OrderMDL.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', trackingHistory },
      { new: true }
    );
    res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to cancel order.' });
  }
});

app.put('/api/orders/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status, note } = req.body;
    const OrderMDL = Order();
    const order = await OrderMDL.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const trackingHistory = [...(order.trackingHistory || []), { status, time: new Date().toISOString(), note: note || `Order updated to ${status}.` }];

    const updated = await OrderMDL.findByIdAndUpdate(
      req.params.id,
      { status, trackingHistory },
      { new: true }
    );
    res.json({ success: true, order: updated });

    // ⚡ Real-time: notify the customer that their order status changed
    const socketIo = req.app.get('io');
    if (socketIo && order.customerId) {
      socketIo.to(`user:${order.customerId}`).emit('order_status_update', {
        orderId: req.params.id,
        status,
        note: note || `Your order has been updated to: ${status}`,
      });
    }

    // Send email notification to business owner when order is accepted by seller
    try {
      if (status === 'accepted' || status === 'preparing') {
        const BusinessMDL = Business();
        const biz = await BusinessMDL.findById(order.businessId);
        if (biz && biz.contactEmail) {
          const subject = `Order ${String(order._id).slice(-8).toUpperCase()} — ${status}`;
          const html = `<p>Hi ${biz.name || 'Business'},</p>
            <p>The order <strong>${order._id}</strong> has been updated to <strong>${status}</strong>.</p>
            <p>Customer: ${order.deliveryAddress?.name || '—'} (${order.deliveryAddress?.phone || '—'})</p>
            <p>Items: ${order.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}</p>
            <p>Total: NPR ${order.total}</p>
            <p>View orders in your dashboard to manage it.</p>`;
          await sendMail({ to: biz.contactEmail, from: process.env.SMTP_FROM || process.env.SMTP_USER, subject, html });
        }
      }
    } catch (err) { console.warn('Order status email failed', err && err.message); }
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
    // Fix: string comparison for booking businessId
    const myBizIds = myBizs.map((b) => String(b._id));
    const allBookings = await BookingMDL.find({});
    bookings = allBookings.filter((bk) => myBizIds.includes(String(bk.businessId)));
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

    // Send email when booking is accepted/confirmed
    try {
      if (updates.status && (updates.status === 'confirmed' || updates.status === 'pending')) {
        const booking = await BookingMDL.findById(req.params.id);
        const BusinessMDL = Business();
        const biz = await BusinessMDL.findById(booking.businessId);
        if (biz && biz.contactEmail) {
          const subject = `Booking ${String(booking._id).slice(-8).toUpperCase()} — ${booking.status}`;
          const html = `<p>Hi ${biz.name || 'Business'},</p>
            <p>The booking <strong>${booking._id}</strong> for service <strong>${booking.serviceId}</strong> has been updated to <strong>${booking.status}</strong>.</p>
            <p>Customer: ${booking.customerId}</p>
            <p>Date: ${booking.date} · Time: ${booking.timeSlot}</p>`;
          await sendMail({ to: biz.contactEmail, from: process.env.SMTP_FROM || process.env.SMTP_USER, subject, html });
        }
      }
    } catch (err) { console.warn('Booking email failed', err && err.message); }
  } catch (err) {
    res.status(500).json({ message: 'Booking update failed.' });
  }
});

// ==================== DELIVERY MODULE APIS ====================

app.get('/api/delivery/pending', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const OrderMDL = Order();
    // Orders prepared and ready to dispatch
    const pendingDeliveries = await OrderMDL.find({ status: 'preparing', deliveryRiderId: '' });
    res.json(pendingDeliveries);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load deliveries.' });
  }
});

// Delivery Module - assign rider (admin or seller can assign)
app.put('/api/delivery/:id/assign', authenticateToken, requireRole(['admin', 'seller']), async (req, res) => {
  try {
    const { riderId } = req.body;
    const OrderMDL = Order();
    const order = await OrderMDL.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const assignedRider = riderId || req.user.id;
    const trackingHistory = [...(order.trackingHistory || []), {
      status: 'dispatched',
      time: new Date().toISOString(),
      note: 'Order dispatched for delivery.',
    }];

    const updated = await OrderMDL.findByIdAndUpdate(
      req.params.id,
      { deliveryRiderId: assignedRider, status: 'dispatched', trackingHistory },
      { new: true }
    );
    res.json({ success: true, order: updated });

    // ⚡ Notify customer that order is on the way
    const socketIo = req.app.get('io');
    if (socketIo && order.customerId) {
      socketIo.to(`user:${order.customerId}`).emit('order_status_update', {
        orderId: req.params.id,
        status: 'dispatched',
        note: 'Your order is on the way! 🚴 Check your delivery OTP in Order Tracking.',
      });
    }
  } catch (err) {
    res.status(500).json({ message: 'Delivery assignment failed.' });
  }
});

// Delivery Module - complete delivery with OTP (admin or seller)
app.put('/api/delivery/:id/complete', authenticateToken, requireRole(['admin', 'seller']), async (req, res) => {
  try {
    const { otp, proof } = req.body;
    const OrderMDL = Order();
    const order = await OrderMDL.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (String(order.deliveryOtp) !== String(otp)) {
      return res.status(400).json({ message: `Invalid OTP. Expected ${order.deliveryOtp}.` });
    }

    const trackingHistory = [...(order.trackingHistory || []), {
      status: 'completed',
      time: new Date().toISOString(),
      note: 'Order delivered and OTP verified.',
    }];

    const updated = await OrderMDL.findByIdAndUpdate(
      req.params.id,
      {
        status: 'completed',
        paymentStatus: 'paid',
        deliveryProof: proof || 'OTP Confirmed',
        trackingHistory,
      },
      { new: true }
    );
    res.json({ success: true, order: updated });

    // ⚡ Notify customer that order is completed
    const socketIo = req.app.get('io');
    if (socketIo && order.customerId) {
      socketIo.to(`user:${order.customerId}`).emit('order_status_update', {
        orderId: req.params.id,
        status: 'completed',
        note: 'Your order has been delivered! Thank you for ordering. ✅',
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Delivery confirmation failed.' });
  }
});

// ==================== REVIEW SYSTEM ====================

app.put('/api/admin/reviews/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { reported } = req.body;
    const ReviewMDL = Review();
    const review = await ReviewMDL.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });

    const updated = await ReviewMDL.findByIdAndUpdate(req.params.id, { reported: Boolean(reported) }, { new: true });
    res.json({ success: true, review: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update review moderation state.' });
  }
});

app.get('/api/admin/support-tickets', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const SupportTicketMDL = db.SupportTicket || require('./db').SupportTicket();
    const tickets = await SupportTicketMDL.find({});
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load support tickets.' });
  }
});

app.post('/api/support-tickets', authenticateToken, async (req, res) => {
  try {
    const { category = 'general', subject, message, priority = 'medium' } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ message: 'Subject and message are required.' });
    }

    const SupportTicketMDL = db.SupportTicket || require('./db').SupportTicket();
    const UserMDL = User();
    const user = await UserMDL.findById(req.user.id);

    const ticket = await SupportTicketMDL.create({
      userId: req.user.id,
      userName: user?.name || 'Customer',
      email: user?.email || '',
      category,
      subject,
      message,
      status: 'open',
      priority,
      resolution: '',
    });

    const socketIo = req.app.get('io');
    if (socketIo) {
      socketIo.to('role:admin').emit('new_notification', { type: 'support_ticket', ticket });
    }

    res.status(201).json({ success: true, ticket });
  } catch (err) {
    res.status(500).json({ message: 'Failed to submit support ticket.' });
  }
});

app.put('/api/admin/support-tickets/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { status, resolution } = req.body;
    const SupportTicketMDL = db.SupportTicket || require('./db').SupportTicket();
    const updated = await SupportTicketMDL.findByIdAndUpdate(req.params.id, { status, resolution: resolution || '' }, { new: true });
    if (!updated) return res.status(404).json({ message: 'Support ticket not found.' });

    const socketIo = req.app.get('io');
    if (socketIo && updated.userId) {
      socketIo.to(`user:${updated.userId}`).emit('support_ticket_update', updated);
    }

    res.json({ success: true, ticket: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update support ticket.' });
  }
});

app.get('/api/reviews', async (req, res) => {
  try {
    const ReviewMDL = Review();
    const reviews = await ReviewMDL.find({});
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 50);
    const recent = (Array.isArray(reviews) ? reviews : [])
      .sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0))
      .slice(0, limit);
    res.json(recent);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve reviews.' });
  }
});

app.get('/api/reviews/mine', authenticateToken, async (req, res) => {
  try {
    const ReviewMDL = Review();
    const reviews = await ReviewMDL.find({ customerId: req.user.id });
    const sorted = [...reviews].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load reviews.' });
  }
});

app.put('/api/reviews/:id', authenticateToken, async (req, res) => {
  try {
    const ReviewMDL = Review();
    const review = await ReviewMDL.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });
    if (String(review.customerId) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You can only edit your own reviews.' });
    }

    const updates = {};
    if (req.body.rating !== undefined) updates.rating = parseInt(req.body.rating, 10);
    if (req.body.comment !== undefined) updates.comment = String(req.body.comment).trim();
    const updated = await ReviewMDL.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json({ success: true, review: updated });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update review.' });
  }
});

app.delete('/api/reviews/:id', authenticateToken, async (req, res) => {
  try {
    const ReviewMDL = Review();
    const review = await ReviewMDL.findById(req.params.id);
    if (!review) return res.status(404).json({ message: 'Review not found.' });
    if (String(review.customerId) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You can only delete your own reviews.' });
    }
    await ReviewMDL.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete review.' });
  }
});

app.post('/api/reviews', authenticateToken, validateReviewPayload, upload.single('image'), async (req, res) => {
  try {
    const { businessId, targetId, targetType, rating, comment } = req.body;
    const ReviewMDL = Review();
    const BusinessMDL = Business();
    const UserMDL = User();

    // Prevent business owners from reviewing their own business or products
    if (businessId) {
      const biz = await BusinessMDL.findById(businessId);
      if (biz && String(biz.ownerId) === String(req.user.id)) {
        return res.status(403).json({ message: 'You cannot review your own business or products.' });
      }
    }

    let imgUrl = '';
    if (req.file) {
      imgUrl = processImageUpload(req.file);
    }

    const buyer = await UserMDL.findById(req.user.id);

    const newReview = await ReviewMDL.create({
      customerId: req.user.id,
      customerName: buyer ? buyer.name : 'Valued Customer',
      businessId,
      targetId: targetId || businessId,
      targetType: targetType || 'business',
      rating: parseInt(rating),
      comment: String(comment).trim(),
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

// GET /api/users — list all users (for chat contact list); returns safe fields only
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const UserMDL = User();
    const users = await UserMDL.find({});
    // Return only safe public fields
    const safe = users.map((u) => ({
      _id: u._id,
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      profilePicture: u.profilePicture || '',
      online: onlineUsers.has(String(u._id)),
    }));
    res.json(safe);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

app.get('/api/chat/presence', authenticateToken, (req, res) => {
  res.json({ onlineUserIds: Array.from(onlineUsers.keys()) });
});

app.get('/api/chat/:receiverId', authenticateToken, async (req, res) => {
  try {
    const UserMDL = User();
    const receiver = await UserMDL.findById(req.params.receiverId);
    if (!receiver) return res.status(404).json({ message: 'Chat recipient not found.' });
    const validConversation = (req.user.role === 'seller' && receiver.role === 'customer')
      || (req.user.role === 'customer' && receiver.role === 'seller');
    if (!validConversation) return res.status(403).json({ message: 'Only sellers and customers can chat with each other.' });
    const ChatMDL = Chat();
    const msgs = await ChatMDL.find({});
    // Filter messages between sender and receiver in either direction
    const filtered = msgs
      .filter(
        (m) =>
          (String(m.senderId) === String(req.user.id) && String(m.receiverId) === String(req.params.receiverId)) ||
          (String(m.senderId) === String(req.params.receiverId) && String(m.receiverId) === String(req.user.id))
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
    const UserMDL = User();
    const receiver = await UserMDL.findById(receiverId);
    if (!receiver) return res.status(404).json({ message: 'Chat recipient not found.' });
    const validConversation = (req.user.role === 'seller' && receiver.role === 'customer')
      || (req.user.role === 'customer' && receiver.role === 'seller');
    if (!validConversation) return res.status(403).json({ message: 'Only sellers and customers can chat with each other.' });
    const ChatMDL = Chat();
    let imgUrl = '';
    if (req.file) {
      imgUrl = await processImageUpload(req.file);
    }

    const newMsg = await ChatMDL.create({
      senderId: req.user.id,
      receiverId,
      message: message || '',
      type: imgUrl ? 'image' : 'text',
      mediaUrl: imgUrl || (await Promise.resolve(imgUrl)),
    });

    // ⚡ Emit the new message in real-time to the receiver's private room
    const socketIo = req.app.get('io');
    if (socketIo) {
      socketIo.to(`user:${receiverId}`).emit('new_message', newMsg);
      // Also notify the sender's own room so multi-tab/device sync works
      socketIo.to(`user:${req.user.id}`).emit('new_message', newMsg);
    }

    res.status(201).json(newMsg);
  } catch (err) {
    console.error(err);
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

    const businesses = (await BusinessMDL.find({})).filter((b) => isPubliclyLiveBusiness(b));
    const liveBusinessIds = new Set(businesses.map((b) => String(b._id)));
    const products = (await ProductMDL.find({})).filter((p) => liveBusinessIds.has(String(p.businessId)));

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
// Location-based recommendations
app.get('/api/ai/recommendations', authenticateToken, async (req, res) => {
  try {
    const BusinessMDL = Business();
    const ProductMDL = Product();
    const ServiceMDL = Service();
    const OrderMDL = Order();
    const ReviewMDL = Review();

    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const viewedProductIds = String(req.query.viewedProductIds || '').split(',').filter(Boolean);
    const viewedBusinessIds = String(req.query.viewedBusinessIds || '').split(',').filter(Boolean);

    // Determine if we have enough user activity for personalized recommendations
    const myOrders = await OrderMDL.find({ customerId: req.user.id, status: 'completed' });
    const activityCount = myOrders.length + viewedProductIds.length + viewedBusinessIds.length;
    const hasSufficientData = activityCount >= 3; // simple threshold

    // Load raw data — only admin-approved businesses are recommendable.
    const allBusinesses = await BusinessMDL.find({});
    const businesses = allBusinesses.filter((b) => isPubliclyLiveBusiness(b));
    const liveBusinessIds = new Set(businesses.map((b) => String(b._id)));
    const products = (await ProductMDL.find({})).filter((p) => liveBusinessIds.has(String(p.businessId)));
    const services = (await ServiceMDL.find({})).filter((s) => liveBusinessIds.has(String(s.businessId)));

    // Helper to compute average rating from reviews
    const calculateAverageRating = (revs) => {
      const count = revs.length;
      if (count === 0) return { average: 0, count };
      const total = revs.reduce((s, r) => s + r.rating, 0);
      return { average: Math.round((total / count) * 10) / 10, count };
    };

    // Enrich businesses and products with live rating data
    const enrichWithRating = async (items, type) => {
      return Promise.all(items.map(async (item) => {
        const revFilter = type === 'business' ? { businessId: item._id } : { targetId: item._id, targetType: type };
        const revs = await ReviewMDL.find(revFilter);
        const { average, count } = calculateAverageRating(revs);
        return { ...item, rating: average, reviewCount: count };
      }));
    };
    const businessesRated = await enrichWithRating(businesses, 'business');
    const productsRated = await enrichWithRating(products, 'product');
    const servicesRated = services; // services have no rating

    // Distance helper (assumes calculateDistance function exists globally)
    const withDistance = (list) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return list;
      return list.map((b) => {
        const dist = calculateDistance(lat, lng, b.latitude, b.longitude);
        return { ...b, distanceVal: dist, distance: dist !== null ? `${dist} km` : 'Nearby' };
      });
    };

    const nearby = withDistance(businessesRated)
      .filter((b) => b.distanceVal == null || b.distanceVal <= 15)
      .sort((a, b) => (a.distanceVal ?? 999) - (b.distanceVal ?? 999))
      .slice(0, 6);

    const popularNearYou = [...nearby].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6);

    // Base generic recommendations (used when not enough data)
    let recommendedBizs = [...businessesRated].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6);
    let recommendedProds = [];
    let recommendedServices = servicesRated.filter((s) => s.availability !== false).slice(0, 6);

    // Personalized recommendation logic – only when we have enough activity
    if (hasSufficientData) {
      const itemsBought = myOrders.flatMap((o) => o.items || []);
      if (itemsBought.length > 0) {
        const firstItemName = itemsBought[0].name;
        const matchingProd = productsRated.find((p) => p.name === firstItemName);
        if (matchingProd) {
          // Product recommendations based on the category of the first purchased item
          recommendedProds = productsRated.filter((p) => p.category === matchingProd.category && p._id.toString() !== matchingProd._id.toString()).slice(0, 6);
          // Business recommendations based on matching category
          recommendedBizs = businessesRated.filter((b) => b.category === matchingProd.category)
            .concat(recommendedBizs)
            .filter((b, i, arr) => arr.findIndex((x) => x._id.toString() === b._id.toString()) === i)
            .slice(0, 6);
        }
      }
    }

    // Fallbacks for products when personalized list is empty
    if (recommendedProds.length === 0) {
      recommendedProds = productsRated.filter((p) => p.discount > 0).slice(0, 6);
    }
    if (recommendedProds.length === 0) {
      recommendedProds = productsRated.slice(0, 6);
    }

    const viewedProducts = productsRated.filter((p) => viewedProductIds.includes(String(p._id)));
    const viewedCategories = new Set(viewedProducts.map((p) => p.category).filter(Boolean));
    const becauseYouViewed = viewedCategories.size
      ? productsRated.filter((p) => viewedCategories.has(p.category) && !viewedProductIds.includes(String(p._id))).slice(0, 6)
      : productsRated.slice(0, 6);

    const youMayAlsoLike = productsRated
      .filter((p) => !recommendedProds.some((r) => r._id.toString() === p._id.toString()))
      .slice(0, 6);

    const viewedBusinesses = businessesRated.filter((b) => viewedBusinessIds.includes(String(b._id)));

    res.json({
      businesses: recommendedBizs,
      products: recommendedProds,
      services: recommendedServices,
      nearby,
      popularNearYou,
      becauseYouViewed,
      youMayAlsoLike,
      viewedBusinesses,
      personalized: hasSufficientData,
    });
  } catch (err) {
    console.error(err);
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
    const ridersCount = 0;
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
    const now = new Date();
    const activeCoupons = coupons.filter((coupon) => {
      if (!coupon.active) return false;
      if (!coupon.expiryDate) return true;
      const expiry = new Date(`${coupon.expiryDate}T23:59:59`);
      return expiry >= now;
    });
    res.json(activeCoupons);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve coupons.' });
  }
});

// Admin requests more info from a business owner (attach message & send notification)
app.post('/api/admin/businesses/:id/request-info', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { message } = req.body;
    const BusinessMDL = Business();
    const NotificationMDL = Notification();
    const biz = await BusinessMDL.findById(req.params.id);
    if (!biz) return res.status(404).json({ message: 'Business not found.' });

    const revisionMessage = String(message || 'Please provide additional documents or details for your business verification.').trim();
    const ownerId = biz.ownerId;
    await NotificationMDL.create({
      userId: String(ownerId),
      title: 'Admin: Revision requested',
      message: revisionMessage,
      type: 'admin',
      read: false,
    });

    const updated = await BusinessMDL.findByIdAndUpdate(req.params.id, {
      approvalStatus: 'revision_requested',
      verified: 'pending',
      isVerified: false,
      approvedAt: null,
      approvedBy: null,
      rejectionReason: '',
      revisionStatus: 'requested',
      revisionReason: revisionMessage,
      revisionRequestedAt: new Date(),
      revisionRequestedBy: String(req.user.id),
    }, { new: true });

    res.json({ success: true, business: serializeBusiness(updated) });
  } catch (err) {
    console.error('Request info error', err);
    res.status(500).json({ message: 'Failed to request information from business.' });
  }
});

// Notifications API
app.post('/api/notifications', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can send announcements.' });
    }
    const { title, message } = req.body;
    const NotificationMDL = Notification();
    const UserMDL = User;
    
    // Broadcast to all active demo users or all users in DB
    const users = await UserMDL.find({});
    for (const u of users) {
      await NotificationMDL.create({
        userId: String(u._id),
        title: title || 'Admin Announcement',
        message,
        type: 'admin',
        read: false
      });
    }
    
    const io = req.app.get('io');
    if (io) {
      users.forEach((u) => io.to(`user:${u._id}`).emit('new_notification'));
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to send announcement.' });
  }
});
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const NotificationMDL = Notification();
    const list = await NotificationMDL.find({ userId: String(req.user.id) });
    list.sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));
    res.json(list.slice(0, 100));
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve notifications.' });
  }
});

app.put('/api/notifications/read', authenticateToken, async (req, res) => {
  try {
    const NotificationMDL = Notification();
    const list = await NotificationMDL.find({ userId: String(req.user.id) });
    for (let n of list) {
      await NotificationMDL.findByIdAndUpdate(n._id, { read: true });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update notifications.' });
  }
});

// ==================== ADMIN: CATEGORY MANAGEMENT ====================

app.get('/api/categories', async (req, res) => {
  try {
    const CategoryMDL = Category();
    const list = await CategoryMDL.find({});
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve categories.' });
  }
});

app.post('/api/categories', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Category name is required.' });

    const CategoryMDL = Category();
    const existing = await CategoryMDL.findOne({ name });
    if (existing) return res.status(400).json({ message: 'Category already exists.' });

    const newCat = await CategoryMDL.create({ name, description: description || '' });
    res.status(201).json({ success: true, category: newCat });
  } catch (err) {
    res.status(500).json({ message: 'Category creation failed.' });
  }
});

app.put('/api/categories/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { name, description } = req.body;
    const CategoryMDL = Category();
    const updated = await CategoryMDL.findByIdAndUpdate(req.params.id, { name, description });
    res.json({ success: true, category: updated });
  } catch (err) {
    res.status(500).json({ message: 'Category update failed.' });
  }
});

app.delete('/api/categories/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const CategoryMDL = Category();
    await CategoryMDL.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Category deletion failed.' });
  }
});


// ==================== ADMIN: USER MANAGEMENT ====================

app.get('/api/admin/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const UserMDL = User();
    const users = await UserMDL.find({});
    // Exclude password hashes from list
    const safeUsers = users.map(({ password, ...u }) => u);
    res.json(safeUsers);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve users.' });
  }
});

app.put('/api/admin/users/:id/status', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { suspended } = req.body;
    const UserMDL = User();
    const user = await UserMDL.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Suspended for 1 year or unlocked
    let lockUntil = suspended ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null;
    await UserMDL.findByIdAndUpdate(req.params.id, { lockUntil, failedLoginAttempts: suspended ? 99 : 0 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update user status.' });
  }
});

app.delete('/api/admin/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const UserMDL = User();
    await UserMDL.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete user account.' });
  }
});


// ==================== ADMIN: SYSTEM CONFIGURATION ====================

app.get('/api/admin/settings', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const SystemSettingMDL = SystemSetting();
    const settings = await SystemSettingMDL.find({});
    const settingsMap = {};
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });
    res.json(settingsMap);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve system settings.' });
  }
});

app.put('/api/admin/settings', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { taxRate, deliveryFee, commissionRate, paymentMethods } = req.body;
    const SystemSettingMDL = SystemSetting();

    if (taxRate !== undefined) {
      const setting = await SystemSettingMDL.findOne({ key: 'taxRate' });
      await SystemSettingMDL.findByIdAndUpdate(setting._id, { value: parseFloat(taxRate) });
    }
    if (deliveryFee !== undefined) {
      const setting = await SystemSettingMDL.findOne({ key: 'deliveryFee' });
      await SystemSettingMDL.findByIdAndUpdate(setting._id, { value: parseFloat(deliveryFee) });
    }
    if (commissionRate !== undefined) {
      const setting = await SystemSettingMDL.findOne({ key: 'commissionRate' });
      await SystemSettingMDL.findByIdAndUpdate(setting._id, { value: parseFloat(commissionRate) });
    }
    if (paymentMethods !== undefined) {
      const setting = await SystemSettingMDL.findOne({ key: 'paymentMethods' });
      await SystemSettingMDL.findByIdAndUpdate(setting._id, { value: paymentMethods });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update system settings.' });
  }
});

// Health Endpoint
app.get('/api/health', (req, res) => {
  const isDbConnected = getIsMongo() && mongoose.connection.readyState === 1;
  res.json({
    success: true,
    server: 'ok',
    database: isDbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Serve client index.html fallback for SPA routing (must be defined last)
if (fs.existsSync(clientDist)) {
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err.message || err);
  
  if (res.headersSent) {
    return next(err);
  }

  // Determine standard error properties
  const statusCode = err.status || err.statusCode || 500;
  const errorCode = err.code || 'SERVER_ERROR';
  
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Server is temporarily unavailable. Please try again.',
    errorCode: errorCode
  });
});

// Initialize database and start server (use httpServer for Socket.IO support)
// Export app and server start so tests can import without auto-listening
module.exports = {
  app,
  httpServer,
  startServer: async () => {
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.JWT_SECRET) {
        console.warn('WARNING: JWT_SECRET is missing. Authentication will fail until this is set in Render Environment Variables.');
      }
      if (!process.env.MONGODB_URI) {
        console.warn('WARNING: MONGODB_URI is missing. Database connection will fail until this is set in Render Environment Variables.');
      }
    }
    await connectDb();
    const actualPort = await getAvailablePort(port);
    return new Promise((resolve) => {
      httpServer.listen(actualPort, () => {
        console.log(`UdyogConnect running on http://localhost:${actualPort}`);
        console.log(`isMongo: ${getIsMongo()}`);
        resolve(actualPort);
      });
    });
  }
};

// If run directly, start the server
if (require.main === module) {
  (async () => {
    try {
      await module.exports.startServer();
    } catch (err) {
      console.error('Failed to start server:', err && err.message);
      process.exit(1);
    }
  })();
}
