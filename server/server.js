const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Prevent the server from crashing on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Exception:', err && (err.stack || err.message));
});
process.on('unhandledRejection', (reason) => {
  console.error('CRITICAL: Unhandled Rejection:', reason && (reason.stack || reason.message || reason));
});

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { generateToken, getJwtSecret, assertJwtSecretConfigured } = require('./utils/generateToken');
const { authenticateToken, resolveSession, forgetPasswordChange } = require('./middleware/authMiddleware');
const {
  securityHeaders, uploadHeaders, sanitizeRequest, rateLimit, byUserOrIp, clientIp, corsOrigin, isProduction,
} = require('./middleware/security');
const { detectFileType, isImageBuffer, IMAGE_MIMES } = require('./utils/fileType');
const { requireRole } = require('./middleware/roleMiddleware');
const { isNepalPlace } = require('./utils/nepalPlaces');
const { connectDb, db, getIsMongo, isBlockedDemoAccount, User, Business, Product, Service, Order, Booking, Review, Report, Chat, Notification, Coupon, AuditLog, Category, SystemSetting, PaymentCredential, EsewaPayment } = require('./db');
const { createEsewaRoutes } = require('./payments/esewaRoutes');
const { createOrderLifecycleRoutes, sanitizeOrderFor, generateDeliveryOtp } = require('./orders/lifecycle');
const { createReportRoutes } = require('./moderation/reports');
const { createConversationRoutes } = require('./chat/routes');
const { registerChatSockets } = require('./chat/socket');
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
const { evaluateBookingAvailability, getNepalParts, ACTIVE_BOOKING_STATUSES } = require('./booking/availability');
const { createBillingRoutes } = require('./billing/routes');
const { createHomeRoutes } = require('./home/routes');
const { recordActivity, buildHomeFeed } = require('./home/feedService');
const { createAiRoutes } = require('./ai/routes');
const { buildSuggestions } = require('./suggestions');
const { validateAddressList } = require('./deliveryAddress');
const { createPasswordResetRoutes, SENSITIVE_USER_FIELDS } = require('./auth/passwordReset');
const { POLICY_VERSION, LOGIN_HISTORY_LIMIT } = require('./legal/policy');
const billing = require('./billing/service');
const { roundMoney, VAT_RATE } = require('./billing/billData');
const { isBillEmailConfigured } = require('./utils/sendBillEmail');
const { sendEmail, isEmailConfigured, escapeHtml, EMAIL_PATTERN } = require('./utils/mailer');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
// The app reads the root .env; also accept the Gmail bill mail settings from server/.env
// without pulling in its other values (e.g. a local MONGODB_URI).
try {
  const serverEnvPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(serverEnvPath)) {
    const serverEnv = dotenv.parse(fs.readFileSync(serverEnvPath));
    for (const key of ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'GMAIL_FROM_NAME', 'EMAIL_SERVICE', 'EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_SECURE', 'EMAIL_USER', 'EMAIL_PASS', 'EMAIL_PASSWORD', 'EMAIL_FROM', 'BREVO_API_KEY', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_BASE_URL']) {
      if (!process.env[key] && serverEnv[key]) process.env[key] = serverEnv[key];
    }
  }
} catch (err) {
  console.warn('Could not read server/.env:', err.message);
}

const app = express();
app.disable('x-powered-by');
// Behind Render (and Vercel's /api rewrite) the client address arrives in X-Forwarded-For;
// rate limits need the real client IP rather than the proxy's.
if (process.env.TRUST_PROXY || process.env.RENDER) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 2);
}
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS) || 1500;
// Logs only slow or failing requests (or every request with LOG_REQUESTS=true). Query strings are
// dropped because they can carry locations, search terms and reset tokens.
app.use((req, res, next) => {
  const startHrTime = process.hrtime();
  res.on('finish', () => {
    const elapsedHrTime = process.hrtime(startHrTime);
    const elapsedMs = elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6;
    if (process.env.LOG_REQUESTS !== 'true' && elapsedMs < SLOW_REQUEST_MS && res.statusCode < 500) return;
    const loggedPath = req.path.replace(/(\/reset-password\/verify\/)[^/?#]+/, '$1[redacted]');
    console.log(`[HTTP] ${req.method} ${loggedPath} ${res.statusCode} - ${elapsedMs.toFixed(0)} ms`);
  });
  next();
});
app.use(securityHeaders);
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
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_ENPOINT_WEBHOOK_SECRET_KEY || '';
let stripe = null;
let stripeMode = 'off';
if (STRIPE_SECRET && STRIPE_SECRET !== 'mock') {
  try {
    const Stripe = require('stripe');
    stripe = Stripe(STRIPE_SECRET);
    stripeMode = 'live';
  } catch (err) {
    console.error('Failed to load stripe module', err);
  }
} else if (process.env.NODE_ENV !== 'production') {
  // Development-only simulated Stripe: never enabled in production, where it would
  // let unpaid card orders be marked as paid.
  stripeMode = 'mock';
  stripe = {
    checkout: {
      sessions: {
        create: async (data) => {
          return { url: data.success_url.replace('{CHECKOUT_SESSION_ID}', `mock_sess_${data.metadata.orderId}`) };
        },
        retrieve: async (id) => {
          const orderId = String(id).replace(/^mock_sess_/, '');
          return { id, payment_status: 'paid', metadata: { orderId }, payment_intent: `mock_pi_${orderId}` };
        }
      }
    }
  };
}

const STRIPE_NPR_PER_USD = 130;
const stripeAmountCents = (order) => Math.max(1, Math.round((Number(order.total) / STRIPE_NPR_PER_USD) * 100));

const resolveClientUrl = (req) => {
  const configured = process.env.CLIENT_URL || process.env.FRONTEND_URL;
  if (configured) return configured.replace(/\/$/, '');
  const origin = String(req.headers.origin || '');
  return /^https?:\/\/[^\s/]+$/.test(origin) ? origin : 'http://localhost:5174';
};

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

  if (cloudinaryUrl && !looksLikePlaceholder(cloudinaryUrl)) {
    // Parse CLOUDINARY_URL only — do not overwrite with empty discrete vars.
    cloudinary.config({ cloudinary_url: cloudinaryUrl, secure: true });
  } else if (
    !looksLikePlaceholder(cloudName)
    && !looksLikePlaceholder(apiKey)
    && !looksLikePlaceholder(apiSecret)
  ) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }

  const cfg = cloudinary.config();
  cloudinaryConfigured = Boolean(cfg?.cloud_name && cfg?.api_key && cfg?.api_secret);
  if (cloudinaryConfigured) {
    console.log(`[Cloudinary] Ready (cloud: ${cfg.cloud_name})`);
  } else {
    console.warn('[Cloudinary] Not configured — service photos will use local /uploads storage.');
  }
} catch (e) {
  console.warn('Cloudinary package not available. Falling back to local /uploads storage.');
}

app.use(cors({ origin: corsOrigin }));

// Stripe webhook: needs the raw body for signature verification, so it is registered before express.json().
app.post('/api/payment/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  if (stripeMode !== 'live' || !STRIPE_WEBHOOK_SECRET) {
    return res.status(501).json({ message: 'Stripe webhook is not configured.' });
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.warn('Stripe webhook signature verification failed:', err.message);
    return res.status(400).json({ message: 'Invalid webhook signature.' });
  }

  try {
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) {
      const session = event.data.object;
      const orderId = String(session.metadata?.orderId || '');
      if (session.payment_status === 'paid' && billing.isValidOrderId(orderId)) {
        const order = await billing.loadOrder(orderId);
        if (!order) {
          console.warn(`Stripe webhook: order ${orderId} not found.`);
        } else if (session.amount_total !== stripeAmountCents(order) || String(session.currency).toLowerCase() !== 'usd') {
          console.error(`Stripe webhook: amount mismatch for order ${orderId} (${session.amount_total} ${session.currency}).`);
        } else {
          await billing.finalizeCardPayment({ orderId, transactionId: session.payment_intent, sessionId: session.id });
        }
      }
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook processing failed:', err.message);
    // Non-2xx makes Stripe retry; finalizeCardPayment is idempotent so retries are safe.
    return res.status(500).json({ message: 'Webhook processing failed.' });
  }
});

// Only endpoints that accept base64 images need large JSON bodies; everything else is capped at 1 MB.
const LARGE_JSON_PATHS = new Set(['/api/upload/image-base64', '/api/admin/hero-image']);
const needsLargeJson = (reqPath) => LARGE_JSON_PATHS.has(reqPath) || /^\/api\/services(\/[^/]+)?$/.test(reqPath);
const largeJson = express.json({ limit: '15mb' });
const smallJson = express.json({ limit: '1mb' });
app.use((req, res, next) => (needsLargeJson(req.path) ? largeJson : smallJson)(req, res, next));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(sanitizeRequest);

// Every API route shares a generous per-IP ceiling; sensitive routes add their own stricter limits.
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_PER_MINUTE) || 300,
}));

const ensureDbReady = async (req, res, next) => {
  try {
    if (!db.User || !db.Business || !db.Conversation || !db.Message) {
      await connectDb();
    }
  } catch (err) {
    console.warn('DB bootstrap warning:', err && err.message);
  }
  next();
};
app.use(ensureDbReady);

// ─── Email helper ────────────────────────────────────────────────────────────
// Uses the shared mailer (Brevo, Gmail App Password or SMTP). Recipients are never logged.
if (!isEmailConfigured()) {
  console.warn('Email is not configured. Set BREVO_API_KEY, or GMAIL_USER and GMAIL_APP_PASSWORD, to enable email notifications.');
}

async function sendMail({ to, subject, html, text } = {}) {
  if (process.env.NODE_ENV === 'test' || !isEmailConfigured()) return false;
  try {
    await sendEmail({ to, subject, html, text });
    return true;
  } catch (err) {
    console.error('Failed to send email:', err && err.code ? err.code : 'unknown error');
    return false;
  }
}

// ─── Socket.IO real-time setup ────────────────────────────────────────────────
const io = new SocketIOServer(httpServer, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 1e6,
  transports: ['websocket', 'polling'],
});
const onlineUsers = new Map();

// Middleware: authenticate socket connections via JWT token in handshake
io.use(async (socket, next) => {
  socket.userId = null;
  socket.userRole = null;
  socket.authChecked = true;
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  // Unauthenticated connections are allowed for broadcast-only rooms.
  if (!token) return next();
  try {
    const decoded = jwt.verify(String(token), getJwtSecret(), { algorithms: ['HS256'] });
    const session = await resolveSession(decoded);
    if (session.user) {
      socket.userId = session.user.id || null;
      socket.userRole = session.user.role || null;
    }
  } catch {
    // Invalid token: continue as a guest.
  }
  return next();
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

// Expose io + presence map so routes / chat handlers can use them
app.set('io', io);
app.set('onlineUsers', onlineUsers);
registerChatSockets(io, onlineUsers);
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

const getOptionalRequestUser = async (req) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader && String(authHeader).split(' ')[1];
    if (!token) return null;
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    const session = await resolveSession(decoded);
    return session.user || null;
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
  const esewaEnabled = Boolean(plain.paymentSettings?.isConnected && plain.paymentSettings?.merchantCode);

  return {
    ...plain,
    paymentSettings: { provider: 'eSewa', isConnected: esewaEnabled },
    esewaEnabled,
    approvalStatus,
    isVerified: approvalStatus === 'approved',
    verified: normalizedVerified,
    reviewCount,
    // Never show a seeded demo rating when the business has no reviews yet.
    rating: reviewCount > 0 ? Number(plain.rating || 0) : 0,
    imageUrl: plain.imageUrl || plain.logoUrl || plain.logo || plain.image || '',
  };
};

// Verification documents, tax IDs and moderation notes are visible only to the owner and admins.
const PRIVATE_BUSINESS_FIELDS = [
  'documents', 'documentUrl', 'registrationNumber', 'panVatNumber',
  'rejectionReason', 'revisionReason', 'revisionRequestedBy', 'revisionRequestedAt',
  'approvedBy', 'commissionRate',
];

const serializePublicBusiness = (business) => {
  const serialized = serializeBusiness(business);
  for (const field of PRIVATE_BUSINESS_FIELDS) delete serialized[field];
  return serialized;
};

const canSeePrivateBusinessFields = (business, requestUser) => Boolean(
  requestUser && (
    requestUser.role === 'admin'
    || String(business?.ownerId) === String(requestUser.id || requestUser.userId)
  )
);

const idempotencyStore = new Map();
const IDEMPOTENCY_STORE_MAX = 5000;

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
  // Bounded so a flood of unique keys can't exhaust memory; the oldest entries go first.
  for (const key of idempotencyStore.keys()) {
    if (idempotencyStore.size < IDEMPOTENCY_STORE_MAX) break;
    idempotencyStore.delete(key);
  }

  // Runs before authentication, so scope replays to the caller's credentials rather than req.user.
  const authHeader = String(req.headers.authorization || '');
  const caller = authHeader
    ? require('crypto').createHash('sha256').update(authHeader).digest('hex').slice(0, 32)
    : (req.ip || 'anonymous');
  const cacheKey = `${method}:${req.path}:${caller}:${String(idempotencyKey).slice(0, 128)}`;
  const cached = idempotencyStore.get(cacheKey);
  if (cached) {
    return cached.isJson
      ? res.status(cached.statusCode).json(cached.body)
      : res.status(cached.statusCode).send(cached.body);
  }

  // res.json() calls res.send() internally; keep the original object so replays aren't double-encoded.
  let storedViaJson = false;
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      storedViaJson = true;
      idempotencyStore.set(cacheKey, { statusCode: res.statusCode || 200, body, isJson: true, expiresAt: Date.now() + 10 * 60 * 1000 });
    }
    return originalJson(body);
  };

  const originalSend = res.send.bind(res);
  res.send = (body) => {
    if (!storedViaJson && res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyStore.set(cacheKey, { statusCode: res.statusCode || 200, body, isJson: false, expiresAt: Date.now() + 10 * 60 * 1000 });
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

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 5, fields: 60, fieldSize: 2 * 1024 * 1024, parts: 70 },
});

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', uploadHeaders, express.static(uploadsDir, { dotfiles: 'deny', index: false }));

const uploadError = (message) => Object.assign(new Error(message), { status: 400, expose: true });

// Runs after multer: rejects any file whose bytes are not an allowed image (or PDF for pdfFields).
const checkUploadedFiles = ({ pdfFields = [] } = {}) => (req, res, next) => {
  const files = [req.file, ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat())].filter(Boolean);
  for (const file of files) {
    const detected = detectFileType(file.buffer);
    const allowPdf = pdfFields.includes(file.fieldname);
    if (!detected || !(IMAGE_MIMES.has(detected.mime) || (allowPdf && detected.mime === 'application/pdf'))) {
      return res.status(400).json({
        message: allowPdf ? 'Please upload a JPG, PNG, WEBP or PDF file.' : 'Please upload a JPG, PNG, WEBP or GIF image.',
      });
    }
  }
  return next();
};
const uploadSingle = (field) => [upload.single(field), checkUploadedFiles()];
const businessUploads = [
  upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'cover', maxCount: 1 }, { name: 'document', maxCount: 1 }, { name: 'qr', maxCount: 1 }]),
  checkUploadedFiles({ pdfFields: ['document'] }),
];

const saveBufferLocally = (file, detected) => {
  const filename = `svc-${Date.now()}-${require('crypto').randomBytes(6).toString('hex')}${detected.ext}`;
  fs.writeFileSync(path.join(uploadsDir, filename), file.buffer);
  return `/uploads/${filename}`;
};

// Upload helper using cloudinary uploader stream
const uploadBufferToCloudinary = (buffer, filename = 'upload', folder = 'udyogconnect') => {
  return new Promise((resolve, reject) => {
    if (!cloudinary || !cloudinaryConfigured) return reject(new Error('Cloudinary not configured'));
    const options = { folder, resource_type: 'image' };
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

/**
 * Stores an uploaded image (or, with allowPdf, a PDF document) and returns its URL.
 * The type is checked from the file's bytes, never from its name or the browser's MIME type.
 * Prefers Cloudinary; falls back to local /uploads so images always display.
 */
const processImageUpload = async (file, { allowPdf = false } = {}) => {
  if (!file?.buffer) return '';
  if (file.buffer.length > MAX_UPLOAD_BYTES) throw uploadError('Files must be under 8MB.');
  const detected = detectFileType(file.buffer);
  const allowed = detected && (isImageBuffer(file.buffer) || (allowPdf && detected.mime === 'application/pdf'));
  if (!allowed) {
    throw uploadError(allowPdf ? 'Please upload a JPG, PNG, WEBP or PDF file.' : 'Please upload a JPG, PNG, WEBP or GIF image.');
  }
  if (cloudinaryConfigured && cloudinary) {
    try {
      return await uploadBufferToCloudinary(file.buffer, path.parse(String(file.originalname || 'upload')).name);
    } catch (err) {
      console.error('Cloudinary upload failed, falling back to local uploads/', err.message || err);
    }
  }
  try {
    return saveBufferLocally(file, detected);
  } catch (err) {
    console.error('Local image save failed, falling back to base64', err.message || err);
    return `data:${detected.mime};base64,${file.buffer.toString('base64')}`;
  }
};

/** Per-account limit for a write action: `max` requests every `minutes` minutes. */
const writeLimiter = (name, max, minutes) => rateLimit({
  windowMs: minutes * 60 * 1000,
  max,
  key: (req) => `${name}:${byUserOrIp(req)}`,
  message: 'You are doing that too often. Please wait a moment and try again.',
});

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(process.env.UPLOAD_RATE_LIMIT) || 60,
  key: byUserOrIp,
  message: 'Too many uploads. Please wait a few minutes and try again.',
});

// Provide a signing endpoint for client-side direct uploads
app.post('/api/cloudinary/sign', authenticateToken, uploadLimiter, async (req, res) => {
  try {
    if (!cloudinaryConfigured || !cloudinary) {
      return res.status(501).json({ message: 'Cloudinary not configured.' });
    }
    const cfg = cloudinary.config();
    if (!cfg?.api_key || !cfg?.api_secret || !cfg?.cloud_name) {
      return res.status(501).json({ message: 'Cloudinary not configured.' });
    }
    const timestamp = Math.floor(Date.now() / 1000);
    // The folder is fixed so a signature can't be reused to write anywhere else in the Cloudinary account.
    const folder = 'udyogconnect';
    const params = { timestamp, folder };
    const signature = cloudinary.utils.api_sign_request(params, cfg.api_secret);
    res.json({
      signature,
      timestamp,
      folder,
      api_key: cfg.api_key,
      cloud_name: cfg.cloud_name,
    });
  } catch (err) {
    console.error('Signing failed', err);
    res.status(500).json({ message: 'Signing failed.' });
  }
});

// Dedicated image upload — returns a public URL (Cloudinary or /uploads/...)
app.post('/api/upload/image', authenticateToken, uploadLimiter, uploadSingle('image'), async (req, res) => {
  try {
    const file = req.file || (Array.isArray(req.files) ? req.files[0] : null);
    if (!file) {
      return res.status(400).json({ message: 'Image file is required. Please choose a JPG or PNG photo.' });
    }
    const url = await processImageUpload(file);
    if (!url) {
      return res.status(500).json({ message: 'Image upload failed.' });
    }
    res.status(201).json({ success: true, url, imageUrl: url });
  } catch (err) {
    if (err.expose) return res.status(err.status || 400).json({ message: err.message });
    console.error('Image upload failed:', err && err.message);
    res.status(500).json({ message: 'Image upload failed.' });
  }
});

// JSON/base64 upload fallback (avoids multipart/multer issues)
app.post('/api/upload/image-base64', authenticateToken, uploadLimiter, async (req, res) => {
  try {
    const { dataUrl, fileName = 'photo.jpg' } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return res.status(400).json({ message: 'Image data is required.' });
    }
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
    if (!match) {
      return res.status(400).json({ message: 'Invalid image data.' });
    }
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) {
      return res.status(400).json({ message: 'Empty image data.' });
    }
    const url = await processImageUpload({ buffer, originalname: String(fileName).slice(0, 120) });
    if (!url) {
      return res.status(500).json({ message: 'Image upload failed.' });
    }
    res.status(201).json({ success: true, url, imageUrl: url });
  } catch (err) {
    if (err.expose) return res.status(err.status || 400).json({ message: err.message });
    console.error('Base64 image upload failed:', err && err.message);
    res.status(500).json({ message: 'Image upload failed.' });
  }
});

// Delete asset by public_id. Admin only: a public_id alone doesn't prove who owns the image.
app.post('/api/cloudinary/delete', authenticateToken, requireRole(['admin']), async (req, res) => {
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
  app.use(express.static(clientDist, { dotfiles: 'deny' }));
}

// Conversation-based customer ↔ business messaging (private per customer+business pair)
app.use('/api/conversations', createConversationRoutes({ processImageUpload }));
app.use('/api/orders', createBillingRoutes());
app.use('/api', createHomeRoutes({
  isLiveBusiness: (business) => isPubliclyLiveBusiness(business),
  serializeBusiness: (business) => serializePublicBusiness(business),
  getOptionalUser: (req) => getOptionalRequestUser(req),
}));
app.use('/api', createAiRoutes({
  models: { Business, Product, Service, Order, Booking, User, Review },
  getIsMongo,
  isLiveBusiness: (business) => isPubliclyLiveBusiness(business),
  getApprovalStatus: (business) => getApprovalStatus(business),
  buildHomeFeed,
  serializeBusiness: (business) => serializePublicBusiness(business),
}));

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

const BUSINESS_OFFERING_TYPES = ['products', 'services', 'both'];

const normalizeIdentifier = (value) => String(value ?? '').trim().toLowerCase().slice(0, 254);
const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  key: (req) => `${clientIp(req)}|${normalizeIdentifier(req.body?.email || req.body?.username || req.body?.user)}`,
  message: 'Too many sign-in attempts. Please wait 15 minutes and try again.',
});
const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many sign-in attempts from this network. Please wait and try again.',
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many accounts created from this network. Please try again later.',
});
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  key: (req) => `${clientIp(req)}|${normalizeIdentifier(req.body?.email)}`,
  message: 'Too many verification attempts. Please wait 15 minutes and try again.',
});

// Activation codes are shown in API responses only during local development. In production
// they are emailed, so knowing someone's email address is never enough to activate the account.
const exposeOtpInResponse = () => !isProduction();

// Sent in the background so a slow email provider never delays sign-up or login.
const sendVerificationOtpEmail = (user, otp) => {
  if (process.env.NODE_ENV === 'test' || !isEmailConfigured()) return;
  sendEmail({
    to: user.email,
    subject: 'Your UdyogConnect activation code',
    text: `Your UdyogConnect activation code is ${otp}. If you did not create an account, you can ignore this email.`,
  }).catch((err) => {
    console.warn('Activation email could not be sent:', err && err.code ? err.code : 'unknown error');
  });
};

app.post('/api/auth/register', registerLimiter, validateRegistration, async (req, res) => {
  try {
    const { name, email, password, confirmPassword, phone, role, businessOfferingType } = req.body;

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
    const verificationOtp = registrationDefaults.isVerified ? '' : require('crypto').randomInt(100000, 1000000).toString();

    const newUser = await UserMDL.create({
      name,
      email,
      password: hashedPassword,
      phone: phone || '',
      role: userRole,
      ...(userRole === 'seller'
        ? { businessOfferingType: BUSINESS_OFFERING_TYPES.includes(businessOfferingType) ? businessOfferingType : 'both' }
        : {}),
      loyaltyPoints: 0,
      profilePicture: '',
      addresses: [],
      paymentMethods: [],
      wishlist: { products: [], services: [], businesses: [] },
      twoFactorEnabled: false,
      loginHistory: [],
      termsAcceptedAt: new Date(),
      termsVersion: POLICY_VERSION,
      isVerified: registrationDefaults.isVerified,
      verificationOtp: registrationDefaults.isVerified ? '' : verificationOtp,
      failedLoginAttempts: 0,
      lockUntil: null,
      resetOtp: '',
    });

    console.log('User registered:', String(newUser._id));

    if (verificationOtp) sendVerificationOtpEmail(newUser, verificationOtp);

    const responsePayload = {
      success: true,
      isVerified: !!newUser.isVerified,
      message: registrationDefaults.isVerified ? 'Registration completed. You can now sign in immediately.' : 'Registration completed. Check your email for the activation code.',
      email: newUser.email,
    };
    if (newUser.verificationOtp && exposeOtpInResponse()) responsePayload.otp = newUser.verificationOtp;

    // When OTP is not required, return a session so the client can finish signup in one step.
    if (newUser.isVerified) {
      const token = generateToken(newUser);
      responsePayload.token = token;
      responsePayload.user = {
        ...toSafeUser(newUser),
        id: newUser._id,
        businessStatus: 'none',
        businessMessage: '',
        onboardingPending: userRole === 'seller',
      };
    }

    res.status(201).json(responsePayload);
  } catch (err) {
    if (err && err.code === 11000) {
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

app.post('/api/auth/login', loginIpLimiter, loginAccountLimiter, validateLogin, async (req, res) => {
  try {
    const body = req.body || {};
    const identifier = String(body.email || body.username || body.user || '').trim().slice(0, 254);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Email/phone and password are required.' });
    }

    const UserMDL = User();
    let user = await UserMDL.findOne({ email: identifier.toLowerCase() });
    if (!user) {
      user = await UserMDL.findOne({ phone: identifier });
    }

    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }
    if (isBlockedDemoAccount(user.email)) {
      return res.status(403).json({ message: 'Demo accounts are disabled on the live site.' });
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

    // Account state is only revealed after the password is proven, so it can't be used to probe emails.
    if (user.status === 'suspended') {
      return res.status(403).json({ message: 'Your account has been suspended. Please contact support.' });
    }

    if (!user.isVerified) {
      if (getRegistrationUserDefaults().isVerified) {
        // Activation codes are not required on this deployment; the correct password is enough.
        await UserMDL.findByIdAndUpdate(user._id, { isVerified: true, verificationOtp: '' });
      } else {
        let otp = user.verificationOtp;
        if (!otp) {
          otp = require('crypto').randomInt(100000, 1000000).toString();
          await UserMDL.findByIdAndUpdate(user._id, { verificationOtp: otp });
        }
        sendVerificationOtpEmail(user, otp);
        return res.status(400).json({
          requireVerification: true,
          ...(exposeOtpInResponse() ? { otp } : {}),
          message: 'Account verification required. Enter the activation code we emailed you.',
          email: user.email,
        });
      }
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
    const updatedHistory = [
      ...(user.loginHistory || []),
      { timestamp: new Date().toISOString(), ip: req.ip, agent: String(req.headers['user-agent'] || '').slice(0, 200) },
    ].slice(-LOGIN_HISTORY_LIMIT);
    await UserMDL.findByIdAndUpdate(user._id, { loginHistory: updatedHistory });

    const AuditLogMDL = AuditLog();
    await AuditLogMDL.create({ userId: user._id, action: 'LOGIN', details: 'User logged in successfully' });

    const token = generateToken(user);
    res.json({
      success: true,
      token,
      user: {
        ...toSafeUser(user),
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
app.post('/api/auth/verify', verifyLimiter, async (req, res) => {
  try {
    const email = normalizeIdentifier(req.body?.email);
    const otp = String(req.body?.otp ?? '').trim();
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });

    const UserMDL = User();
    const user = await UserMDL.findOne({ email });
    // Same answer for unknown emails and wrong codes, so this can't be used to discover accounts.
    if (!user || !user.verificationOtp || String(user.verificationOtp) !== otp) {
      return res.status(400).json({ message: 'Invalid email or activation code.' });
    }

    await UserMDL.findByIdAndUpdate(user._id, { isVerified: true, verificationOtp: '' });
    res.json({ success: true, message: 'Account activated successfully. You can now login.' });
  } catch (err) {
    res.status(500).json({ message: 'Verification failed.' });
  }
});

app.use('/api/auth', createPasswordResetRoutes());



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

const ALL_OPENING_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const normalizeOpeningDays = (days, { defaultAll = true } = {}) => {
  const list = Array.isArray(days)
    ? days
    : (typeof days === 'string' && days.trim()
      ? (() => {
          const parsed = parseMaybeJson(days, null);
          if (Array.isArray(parsed)) return parsed;
          return String(days).split(',');
        })()
      : []);
  const normalized = [...new Set(
    list
      .map((day) => String(day || '').trim().toLowerCase().slice(0, 3))
      .filter((day) => ALL_OPENING_DAYS.includes(day))
  )];
  if (!normalized.length && defaultAll) return [...ALL_OPENING_DAYS];
  return normalized;
};

const toSafeUser = (user) => {
  if (!user) return null;
  const safeUser = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  for (const field of SENSITIVE_USER_FIELDS) delete safeUser[field];
  delete safeUser.loginHistory;
  return safeUser;
};

app.put('/api/auth/profile', authenticateToken, (req, res, next) => {
  const contentType = String(req.headers['content-type'] || '');
  if (contentType.includes('multipart/form-data')) {
    return authProfileUpload(req, res, (err) => (err ? next(err) : checkUploadedFiles()(req, res, next)));
  }
  return next();
}, async (req, res) => {
  try {
    const UserMDL = User();
    const user = await UserMDL.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Profile not found.' });

    const updates = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (name.length < 2 || name.length > 80) {
        return res.status(400).json({ message: 'Name must be between 2 and 80 characters.' });
      }
      updates.name = name;
    }
    if (req.body.phone !== undefined) {
      const rawPhone = String(req.body.phone || '').trim();
      const unchanged = rawPhone === String(user.phone || '');
      const phone = unchanged ? rawPhone : rawPhone.replace(/[\s-]/g, '');
      if (phone && !unchanged && !/^(97|98)\d{8}$/.test(phone)) {
        return res.status(400).json({ message: 'Enter a valid 10-digit Nepal mobile number (starting with 97 or 98).' });
      }
      if (phone && !unchanged) {
        const taken = await UserMDL.findOne({ phone });
        if (taken && String(taken._id) !== String(user._id)) {
          return res.status(409).json({ message: 'This phone number is already registered.' });
        }
      }
      updates.phone = phone;
    }
    if (req.body.email) {
      const email = String(req.body.email).trim().toLowerCase();
      if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
        return res.status(400).json({ message: 'Enter a valid email address.' });
      }
      if (email !== String(user.email || '').toLowerCase()) {
        const taken = await UserMDL.findOne({ email });
        if (taken && String(taken._id) !== String(user._id)) {
          return res.status(409).json({ message: 'An account with this email already exists.' });
        }
      }
      updates.email = email;
    }
    if (req.body.addresses !== undefined) {
      const checked = validateAddressList(parseMaybeJson(req.body.addresses, null));
      if (checked.error) return res.status(400).json({ message: checked.error });
      updates.addresses = checked.addresses;
    }
    if (req.body.wishlist !== undefined) {
      const nextWishlist = parseMaybeJson(req.body.wishlist, user.wishlist || { products: [], services: [], businesses: [] });
      const toIdList = (items) => (Array.isArray(items) ? items : [])
        .slice(0, 500)
      .map((item) => String(item?._id || item?.id || item || '').trim().slice(0, 64))
        .filter(Boolean);
      updates.wishlist = {
        products: toIdList(nextWishlist.products),
        services: toIdList(nextWishlist.services),
        businesses: toIdList(nextWishlist.businesses),
      };
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
      .slice(0, 500)
      .map((item) => String(item?._id || item?.id || item || '').trim().slice(0, 64))
      .filter(Boolean);

    const wishlist = {
      products: toIdList(incoming.products),
      services: toIdList(incoming.services),
      businesses: toIdList(incoming.businesses),
    };

    const previouslySaved = new Set(toIdList(user.wishlist?.businesses));
    const updated = await UserMDL.findByIdAndUpdate(req.user.id, { wishlist }, { new: true });
    // Awaited so the home feed's "Recent Activity" is up to date when the client refetches.
    await Promise.all(wishlist.businesses.filter((id) => !previouslySaved.has(id)).map((businessId) => (
      recordActivity({ type: 'wishlist_add', userId: String(req.user.id), businessId }).catch(() => {})
    )));
    res.json({ success: true, wishlist, user: toSafeUser(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Unable to update wishlist.' });
  }
});

app.put('/api/auth/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required.' });
    }
    if (newPassword.length > 128) {
      return res.status(400).json({ message: 'New password must be at most 128 characters.' });
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
    // Signs out every other session; this device gets a fresh token below.
    const updatedUser = await UserMDL.findByIdAndUpdate(
      req.user.id,
      { password: hashedPassword, passwordChangedAt: new Date(), failedLoginAttempts: 0 },
      { new: true }
    );
    forgetPasswordChange(req.user.id);
    res.json({ success: true, message: 'Password updated.', token: generateToken(updatedUser || user) });
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
    let databaseReachable = true;
    
    try {
      const BusinessMDL = Business();
      businessCount = await BusinessMDL.countDocuments({});
    } catch (err) {
      databaseReachable = false;
      console.error('Health check database query failed:', err && err.message);
    }

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: {
        type: mongoConnected ? 'MongoDB (Production)' : 'JSON File Storage (Development)',
        connected: databaseReachable,
        businessCount: businessCount
      },
      message: mongoConnected 
        ? 'Database connected. Business data will PERSIST across server restarts.' 
        : 'Using file-based storage. Business data will persist if saved to JSON files.'
    });
  } catch (err) {
    console.error('Health check failed:', err && err.message);
    res.status(500).json({ status: 'error', message: 'Health check failed' });
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
    console.error('Persistence check failed:', err && err.message);
    res.status(500).json({ status: 'error', message: 'Failed to check business persistence' });
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
    const requestUser = await getOptionalRequestUser(req);
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

    res.json(listings
      .map((b) => (canSeePrivateBusinessFields(b, requestUser) ? serializeBusiness(b) : serializePublicBusiness(b)))
      .slice(0, 200));
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

    const requestUser = await getOptionalRequestUser(req);
    const isAdmin = requestUser?.role === 'admin';
    const isOwner = requestUser && String(business.ownerId) === String(requestUser.id || requestUser.userId);
    if (!isPubliclyLiveBusiness(business) && !isAdmin && !isOwner) {
      return res.status(404).json({ message: 'Business profile not found.' });
    }

    const products = await ProductMDL.find({ businessId: req.params.id });
    const servicesRaw = await ServiceMDL.find({ businessId: req.params.id });
    const reviews = await ReviewMDL.find({ businessId: req.params.id, targetType: 'business' });
    const services = (Array.isArray(servicesRaw) ? servicesRaw : []).map((service) => {
      const plain = typeof service?.toObject === 'function' ? service.toObject() : { ...service };
      const imageUrl = plain.imageUrl || plain.image || (Array.isArray(plain.images) ? plain.images[0] : '') || '';
      return { ...plain, imageUrl, images: plain.images?.length ? plain.images : (imageUrl ? [imageUrl] : []) };
    });

    res.json({
      business: isAdmin || isOwner ? serializeBusiness(business) : serializePublicBusiness(business),
      products,
      services,
      reviews,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving business details.' });
  }
});

/** "You may also like": products and services from other live businesses of the same kind. */
app.get('/api/businesses/:id/suggestions', async (req, res) => {
  try {
    const business = await Business().findById(req.params.id);
    if (!business) return res.status(404).json({ message: 'Business profile not found.' });

    const [businesses, products, services] = await Promise.all([
      Business().find({}),
      Product().find({}),
      Service().find({}),
    ]);
    const { items } = buildSuggestions({
      business: typeof business.toObject === 'function' ? business.toObject() : business,
      businesses,
      products,
      services,
      isLive: isPubliclyLiveBusiness,
      distanceKm: (a, b) => calculateDistance(a.latitude, a.longitude, b.latitude, b.longitude),
    });
    res.json({ items });
  } catch (err) {
    if (err?.name === 'CastError') return res.status(404).json({ message: 'Business profile not found.' });
    console.error('Suggestions error:', err);
    res.status(500).json({ message: 'Could not load suggestions.' });
  }
});

app.post('/api/businesses', authenticateToken, requireRole(['seller', 'admin']), businessUploads, async (req, res) => {
  try {
    const { name, category, subcategory, location, price, description, phone, contactEmail, website, hours, openingTime, closingTime, latitude, longitude, registrationNumber, panVatNumber, deliveryAvailable, offeringType, isOpen, deliveryRadiusKm, openingDays } = req.body || {};
    const composedHours = (openingTime && closingTime)
      ? `${String(openingTime).trim()} - ${String(closingTime).trim()}`
      : String(hours || '').trim();
    if (!name || !category || !location || !description || !contactEmail || !phone || !composedHours || !offeringType) {
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
    const HOURS_RANGE_RE = /^\d{1,2}:\d{2}\s*(AM|PM)?\s*[-–]\s*\d{1,2}:\d{2}\s*(AM|PM)?$/i;

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
    const normalizedHours = BUSINESS_HOURS_OPTIONS.includes(composedHours) || HOURS_RANGE_RE.test(composedHours)
      ? composedHours
      : null;
    if (!normalizedHours) {
      return res.status(400).json({ message: 'Please set valid business opening and closing times.' });
    }
    const openTime = String(openingTime || composedHours.split(/\s*[-–]\s*/)[0] || '').trim();
    const closeTime = String(closingTime || composedHours.split(/\s*[-–]\s*/)[1] || '').trim();

    if (!BUSINESS_OFFERING_TYPES.includes(String(offeringType))) {
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

    let catalogType = String(offeringType);
    if (req.user.role === 'seller') {
      const owner = await User().findById(ownerId);
      if (BUSINESS_OFFERING_TYPES.includes(owner?.businessOfferingType)) catalogType = owner.businessOfferingType;
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
        docUrl = await processImageUpload(req.files.document[0], { allowPdf: true });
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
      location: String(location).trim(),
      price: price || '0',
      description: String(description).trim(),
      contactEmail: String(contactEmail || req.user.email || '').trim().toLowerCase(),
      phone: String(phone || '').trim(),
      website: website || '',
      hours: normalizedHours,
      openingTime: openTime,
      closingTime: closeTime,
      openingDays: normalizeOpeningDays(openingDays),
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
      offeringType: catalogType,
    });

    console.log(`Business registered: ${newBusiness._id} (pending approval)`);

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

app.put('/api/businesses/:id', authenticateToken, requireRole(['seller', 'admin']), businessUploads, async (req, res) => {
  try {
    const BusinessMDL = Business();
    const biz = await BusinessMDL.findById(req.params.id);
    if (!biz) return res.status(404).json({ message: 'Business not found.' });

    if (String(biz.ownerId) !== String(req.user.id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized profile edit.' });
    }

    const isOpenSwitchOnly = Object.keys(req.body || {}).every((key) => key === 'manualOpenOverride');
    const resetStatusOnResubmission = req.user.role === 'seller' && !isOpenSwitchOnly
      && ['rejected', 'revision_requested', 'pending'].includes(String(biz.approvalStatus || ''));

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
        docUrl = await processImageUpload(req.files.document[0], { allowPdf: true });
      }
      if (req.files.qr && req.files.qr[0]) {
        qrUrl = await processImageUpload(req.files.qr[0]);
      }
    }

    const editableFields = [
      'name', 'category', 'subcategory', 'location', 'price', 'description',
      'contactEmail', 'phone', 'website', 'hours', 'openingDays', 'latitude', 'longitude',
      'registrationNumber', 'panVatNumber', 'deliveryAvailable', 'offeringType',
      'isOpen', 'manualOpenOverride', 'deliveryRadiusKm',
      'holidays', 'blockedDates', 'minBookingNoticeMinutes', 'maxAdvanceBookingDays', 'bookingSlotIntervalMinutes',
      'openingTime', 'closingTime',
    ];
    const updateData = Object.fromEntries(editableFields
      .filter((field) => req.body[field] !== undefined)
      .map((field) => [field, req.body[field]]));
    if (typeof updateData.deliveryAvailable !== 'undefined') {
      updateData.deliveryAvailable = updateData.deliveryAvailable === 'true' || updateData.deliveryAvailable === true;
    }
    if (typeof updateData.offeringType !== 'undefined' && !BUSINESS_OFFERING_TYPES.includes(String(updateData.offeringType))) {
      return res.status(400).json({ message: 'Choose Products, Services, or both.' });
    }
    if (typeof updateData.isOpen !== 'undefined') {
      updateData.isOpen = updateData.isOpen === 'true' || updateData.isOpen === true;
    }
    if (typeof updateData.manualOpenOverride !== 'undefined') {
      const raw = updateData.manualOpenOverride;
      if (raw === null || raw === '' || raw === 'null' || raw === 'auto') {
        updateData.manualOpenOverride = null;
        updateData.manualOverrideAt = null;
      } else {
        updateData.manualOpenOverride = raw === 'true' || raw === true;
        updateData.manualOverrideAt = new Date();
      }
    }
    if (typeof updateData.deliveryRadiusKm !== 'undefined') {
      updateData.deliveryRadiusKm = Number(updateData.deliveryRadiusKm || 5);
    }
    if (typeof updateData.openingDays !== 'undefined') {
      updateData.openingDays = normalizeOpeningDays(updateData.openingDays, { defaultAll: false });
      if (!updateData.openingDays.length) {
        return res.status(400).json({ message: 'Select at least one opening day.' });
      }
    }
    if (typeof updateData.holidays !== 'undefined') {
      updateData.holidays = parseMaybeJson(updateData.holidays, []);
    }
    if (typeof updateData.blockedDates !== 'undefined') {
      updateData.blockedDates = parseMaybeJson(updateData.blockedDates, []);
    }
    if (typeof updateData.minBookingNoticeMinutes !== 'undefined') {
      updateData.minBookingNoticeMinutes = Math.max(0, Number(updateData.minBookingNoticeMinutes) || 0);
    }
    if (typeof updateData.maxAdvanceBookingDays !== 'undefined') {
      updateData.maxAdvanceBookingDays = Math.max(1, Number(updateData.maxAdvanceBookingDays) || 1);
    }
    if (typeof updateData.bookingSlotIntervalMinutes !== 'undefined') {
      updateData.bookingSlotIntervalMinutes = Math.max(5, Number(updateData.bookingSlotIntervalMinutes) || 30);
    }
    if (typeof updateData.openingTime !== 'undefined' || typeof updateData.closingTime !== 'undefined') {
      const open = String(updateData.openingTime ?? req.body.openingTime ?? '').trim();
      const close = String(updateData.closingTime ?? req.body.closingTime ?? '').trim();
      if (open && close) {
        updateData.openingTime = open;
        updateData.closingTime = close;
        updateData.hours = `${open} - ${close}`;
      }
    }
    if (typeof updateData.hours === 'string' && updateData.hours.trim()) {
      updateData.hours = updateData.hours.trim();
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
    if (typeof updateData.offeringType !== 'undefined' && updateData.offeringType !== biz.offeringType) {
      await User().findByIdAndUpdate(biz.ownerId, { businessOfferingType: updateData.offeringType })
        .catch((syncErr) => console.warn('Could not sync seller catalog type:', syncErr?.message || syncErr));
    }
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
    console.log(`[AUDIT] Admin ${req.user.id} is deleting business ${bizId}`);

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
    const liveProducts = (Array.isArray(products) ? products : []).filter((product) => {
      if (!liveBusinessIds.has(String(product.businessId))) return false;
      if (!product?.name || /^Product [A-Z]$/i.test(String(product.name))) return false;
      if (product.availability === false) return false;
      return true;
    });
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
    const liveServices = (Array.isArray(services) ? services : [])
      .filter((service) => liveBusinessIds.has(String(service.businessId)))
      .map((service) => {
        const plain = typeof service?.toObject === 'function' ? service.toObject() : { ...service };
        const imageUrl = plain.imageUrl || plain.image || (Array.isArray(plain.images) ? plain.images[0] : '') || '';
        return { ...plain, imageUrl, images: plain.images?.length ? plain.images : (imageUrl ? [imageUrl] : []) };
      });
    res.json(liveServices.slice(0, 200));
  } catch (err) {
    res.status(500).json({ message: 'Error retrieving services.' });
  }
});

app.post('/api/products', authenticateToken, requireRole(['seller', 'admin']), uploadSingle('image'), validateProductPayload, async (req, res) => {
  try {
    const { businessId, name, category, subcategory, description, price, discount, stock, sku, brand } = req.body;
    const ProductMDL = Product();
    let imgUrl = '';

    const normalizedName = String(name || '').trim();
    const normalizedBrand = String(brand || '').trim();

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

    const parsedPrice = parseFloat(price);
    const parsedDiscount = discount === undefined || discount === null || discount === '' ? 0 : parseFloat(discount);
    const parsedStock = parseInt(stock, 10);

    const allProducts = await ProductMDL.find({ businessId });
    const existingProduct = allProducts.find(p => String(p.name || '').toLowerCase() === normalizedName.toLowerCase());

    if (existingProduct) {
      return res.status(409).json({ message: 'A product with this name already exists for this business.' });
    }

    const productAccessMessage = businessAccessDenial(business, req.user);
    if (productAccessMessage) return res.status(403).json({ message: productAccessMessage });

    if (req.file) {
      imgUrl = await processImageUpload(req.file);
    }

    if (!imgUrl && req.body.imageUrl) imgUrl = String(req.body.imageUrl).trim();
    if (!imgUrl) {
      return res.status(400).json({ message: 'Product image is required.' });
    }

    const newProd = await ProductMDL.create({
      businessId,
      name: normalizedName,
      category,
      subcategory: subcategory || '',
      description,
      price: parsedPrice,
      discount: parsedDiscount,
      stock: parsedStock,
      sku: sku || `SKU-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      brand: normalizedBrand,
      images: [imgUrl],
      availability: true,
    });

    res.status(201).json({ success: true, product: newProd });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create product.' });
  }
});

app.put('/api/products/:id', authenticateToken, requireRole(['seller', 'admin']), uploadSingle('image'), async (req, res) => {
  try {
    const { name, brand, price, discount, stock, description, category, imageUrl } = req.body;

    if (name !== undefined) {
      const nameErr = (() => {
        const trimmed = String(name || '').trim();
        if (!trimmed) return 'Product name is required.';
        if (trimmed.length < 2) return 'Product name must be at least 2 characters.';
        if (!/^[\p{L}0-9]+(?:[ ][\p{L}0-9]+)*$/u.test(trimmed)) {
          return 'Product name can only contain letters and spaces (no special characters). Up to 2 numbers are allowed.';
        }
        if (!/\p{L}/u.test(trimmed)) return 'Product name must include letters.';
        if ((trimmed.match(/\d/g) || []).length > 2) return 'Product name can include at most 2 numbers.';
        return '';
      })();
      if (nameErr) return res.status(400).json({ message: nameErr });
    }

    if (brand !== undefined) {
      const brandErr = (() => {
        const trimmed = String(brand || '').trim();
        if (!trimmed) return 'Brand is required.';
        if (trimmed.length < 2) return 'Brand must be at least 2 characters.';
        if (!/^[\p{L}0-9]+(?:[ ][\p{L}0-9]+)*$/u.test(trimmed)) {
          return 'Brand can only contain letters and spaces (no special characters). Up to 2 numbers are allowed.';
        }
        if (!/\p{L}/u.test(trimmed)) return 'Brand must include letters.';
        if ((trimmed.match(/\d/g) || []).length > 2) return 'Brand can include at most 2 numbers.';
        return '';
      })();
      if (brandErr) return res.status(400).json({ message: brandErr });
    }

    if (price !== undefined && price !== '') {
      const parsedPrice = parseFloat(price);
      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Product price cannot be negative.' });
      }
    }
    if (discount !== undefined && discount !== '') {
      const parsedDiscount = parseFloat(discount);
      if (Number.isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
        return res.status(400).json({ message: 'Discount must be between 0 and 100.' });
      }
    }
    if (stock !== undefined && stock !== '') {
      const parsedStock = parseInt(stock, 10);
      if (Number.isNaN(parsedStock) || !Number.isInteger(parsedStock) || parsedStock < 0) {
        return res.status(400).json({ message: 'Stock quantity cannot be negative.' });
      }
    }

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

    const updates = { ...req.body };
    delete updates.image;
    delete updates.images;

    if (name !== undefined) updates.name = String(name).trim();
    if (brand !== undefined) updates.brand = String(brand).trim();
    if (price !== undefined && price !== '') updates.price = parseFloat(price);
    if (discount !== undefined && discount !== '') updates.discount = parseFloat(discount);
    if (stock !== undefined && stock !== '') updates.stock = parseInt(stock, 10);
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;

    let nextImage = '';
    if (req.file) {
      nextImage = await processImageUpload(req.file);
    } else if (imageUrl) {
      nextImage = String(imageUrl).trim();
    }
    if (nextImage) {
      updates.images = [nextImage];
    } else if (!Array.isArray(product.images) || product.images.length === 0) {
      return res.status(400).json({ message: 'Product image is required.' });
    }

    const updated = await ProductMDL.findByIdAndUpdate(req.params.id, updates, { new: true });
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

app.post('/api/services', authenticateToken, requireRole(['seller', 'admin']), uploadSingle('image'), async (req, res) => {
  try {
    const { businessId, name, description, price, duration, slots, staff, homeService, availableFrom, availableTo, imageUrl } = req.body;
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
    const parsedDuration = (duration !== undefined && duration !== null && duration !== '') ? parseInt(duration, 10) : 60;
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

    let imgUrl = '';
    try {
      if (req.file) {
        imgUrl = await processImageUpload(req.file);
      }
    } catch (uploadErr) {
      console.error('Service image upload failed:', uploadErr);
    }
    if (!imgUrl && imageUrl) imgUrl = String(imageUrl).trim();

    const parsedSlots = Array.isArray(slots)
      ? slots
      : (typeof slots === 'string' && slots.trim()
        ? slots.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
        : []);

    const newServ = await ServiceMDL.create({
      businessId,
      name,
      description,
      price: parsedServicePrice,
      duration: parsedDuration,
      availableFrom: String(availableFrom || '').trim(),
      availableTo: String(availableTo || '').trim(),
      slots: parsedSlots,
      staff: Array.isArray(staff) ? staff : ['Regular Staff'],
      homeService: homeService === 'true' || homeService === true,
      imageUrl: imgUrl || '',
      images: imgUrl ? [imgUrl] : [],
      availability: true,
    });

    res.status(201).json({ success: true, service: newServ });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create service.' });
  }
});

app.put('/api/services/:id', authenticateToken, requireRole(['seller', 'admin']), uploadSingle('image'), async (req, res) => {
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

    const payload = { ...req.body };
    if (payload.duration !== undefined) {
      const parsedDuration = parseInt(payload.duration, 10);
      if (isNaN(parsedDuration) || parsedDuration <= 0) {
        return res.status(400).json({ message: 'Service duration must be a positive number.' });
      }
      payload.duration = parsedDuration;
    }
    if (payload.price !== undefined) {
      const parsedPrice = parseFloat(payload.price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: 'Service price cannot be negative.' });
      }
      payload.price = parsedPrice;
    }
    if (typeof payload.slots === 'string') {
      payload.slots = payload.slots.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    }
    if (payload.availableFrom !== undefined) payload.availableFrom = String(payload.availableFrom || '').trim();
    if (payload.availableTo !== undefined) payload.availableTo = String(payload.availableTo || '').trim();
    if (payload.homeService !== undefined) {
      payload.homeService = payload.homeService === 'true' || payload.homeService === true;
    }

    let nextImage = '';
    try {
      if (req.file) {
        nextImage = await processImageUpload(req.file);
      } else if (payload.imageUrl) {
        nextImage = String(payload.imageUrl).trim();
      }
    } catch (uploadErr) {
      console.error('Service image update failed:', uploadErr);
    }
    delete payload.image;
    if (nextImage) {
      payload.imageUrl = nextImage;
      payload.images = [nextImage];
    } else {
      delete payload.imageUrl;
      delete payload.images;
    }

    const updated = await ServiceMDL.findByIdAndUpdate(req.params.id, payload, { new: true });
    res.json({ success: true, service: updated });
  } catch (err) {
    console.error(err);
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

const CHECKOUT_BILL_WAIT_MS = 5000;
const MAX_CHECKOUT_ITEMS = 50;
const MAX_ITEM_QUANTITY = 100;
const CHECKOUT_WORDS_REGEX = /^[\p{L}\p{M}]+(?: [\p{L}\p{M}]+)*$/u;
const CHECKOUT_GMAIL_REGEX = /^[a-z][a-z0-9]*@gmail\.com$/;
const toPlain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);
const findByIdSafe = async (model, id) => {
  try {
    return toPlain(await model.findById(id));
  } catch (_) {
    return null;
  }
};

const checkoutResponse = (order, extra = {}) => ({
  success: true,
  order,
  bill: billing.billSummary(order),
  requiresPayment: order.paymentMethod === 'Card' && order.paymentStatus !== 'paid',
  ...extra,
});

const checkoutError = (status, message, errors) => ({ ok: false, status, body: errors ? { message, errors } : { message } });

/**
 * Validates the delivery details and prices the cart from the database. The browser only supplies
 * item ids and quantities; every amount on the order is computed here.
 */
async function prepareCheckout(body = {}) {
  const { businessId, items, promoCode, deliveryAddress } = body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return checkoutError(400, 'Missing order details.');
  }
  if (items.length > MAX_CHECKOUT_ITEMS) {
    return checkoutError(400, `An order can contain at most ${MAX_CHECKOUT_ITEMS} items.`);
  }

  let normalizedBusinessId = String(businessId || '').trim();
  const normalizedAddress = deliveryAddress || {
    name: body.name || '',
    email: body.email || '',
    phone: body.phone || '',
    location: body.location || '',
    address: body.address || '',
    method: body.deliveryMethod || 'delivery',
  };

  const rejectDelivery = (field, message) => checkoutError(400, message, { [field]: message });
  const personName = String(normalizedAddress.name || '').trim().replace(/ {2,}/g, ' ');
  const deliveryEmail = String(normalizedAddress.email || '').trim().toLowerCase();
  const deliveryPhone = String(normalizedAddress.phone || '').trim();
  const place = String(normalizedAddress.location || normalizedAddress.city || '').trim().replace(/ {2,}/g, ' ');
  const street = String(normalizedAddress.address || '').trim().replace(/ {2,}/g, ' ');

  if (!personName || !deliveryEmail || !deliveryPhone || !place || !street) {
    return checkoutError(400, 'Please complete all delivery details.');
  }
  if (personName.length < 2 || !CHECKOUT_WORDS_REGEX.test(personName)) {
    return rejectDelivery('name', 'Full name can only contain letters and spaces (no numbers or special characters).');
  }
  if (!CHECKOUT_GMAIL_REGEX.test(deliveryEmail)) {
    return rejectDelivery('email', 'Enter a valid Gmail address using only letters and numbers.');
  }
  if (!/^(97|98)\d{8}$/.test(deliveryPhone)) {
    return rejectDelivery('phone', 'Phone number must be exactly 10 digits starting with 97 or 98.');
  }
  if (!CHECKOUT_WORDS_REGEX.test(place)) {
    return rejectDelivery('city', 'Location can only contain letters and spaces (no numbers or special characters).');
  }
  if (!isNepalPlace(place)) {
    return rejectDelivery('city', 'Location / City must be a place in Nepal (e.g. Kathmandu, Pokhara, Thamel).');
  }
  if (street.length < 3 || !CHECKOUT_WORDS_REGEX.test(street)) {
    return rejectDelivery('address', 'Street / landmark can only contain letters and spaces (no numbers or special characters).');
  }

  const ProductMDL = Product();
  const ServiceMDL = Service();

  // Prices, names and business come only from the database; the cart supplies ids and quantities.
  const resolvedItems = [];
  for (const item of items) {
    const itemId = String(item?.id || item?._id || '').trim();
    const quantity = Number(item?.quantity);
    if (!itemId || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
      return checkoutError(400, 'Each cart item needs a valid quantity.');
    }
    const isService = Boolean(item.type === 'service' || item.serviceId || item.kind === 'service');
    const record = await findByIdSafe(isService ? ServiceMDL : ProductMDL, itemId);
    if (!record || record.availability === false) {
      return checkoutError(400, `"${String(item.name || 'An item').slice(0, 80)}" is no longer available. Please remove it from your cart.`);
    }
    if (!isService && record.stock !== undefined && record.stock !== null && Number(record.stock) < quantity) {
      return checkoutError(400, `Insufficient stock for "${record.name}". Only ${record.stock} units available.`);
    }
    const basePrice = Number(record.price) || 0;
    const unitPrice = roundMoney(isService ? basePrice : basePrice - (basePrice * (Number(record.discount) || 0)) / 100);
    resolvedItems.push({
      id: String(record._id),
      type: isService ? 'service' : 'product',
      name: String(record.name || 'Item'),
      unitPrice,
      price: unitPrice,
      quantity,
      lineTotal: roundMoney(unitPrice * quantity),
      image: (Array.isArray(record.images) && record.images[0]) || record.imageUrl || '',
      businessId: String(record.businessId || ''),
    });
  }
  normalizedBusinessId = resolvedItems[0].businessId || normalizedBusinessId;
  if (!normalizedBusinessId) {
    return checkoutError(400, 'Could not determine the business for this order.');
  }
  const orderBusiness = await findByIdSafe(Business(), normalizedBusinessId);
  resolvedItems.forEach((item) => {
    if (!item.businessId) item.businessId = normalizedBusinessId;
    item.seller = item.businessId === normalizedBusinessId ? (orderBusiness?.name || '') : '';
  });
  const subtotal = roundMoney(resolvedItems.reduce((sum, item) => sum + item.lineTotal, 0));

  let discount = 0;
  if (promoCode) {
    const coupon = await Coupon().findOne({ code: String(promoCode).toUpperCase(), active: true });
    if (coupon) {
      const expiry = coupon.expiryDate ? new Date(`${coupon.expiryDate}T23:59:59`) : null;
      const isExpired = expiry && expiry < new Date();
      if (!isExpired) {
        discount = (subtotal * coupon.discountPercent) / 100;
        if (discount > coupon.maxDiscount) discount = coupon.maxDiscount;
      }
    }
  }

  discount = roundMoney(Math.min(discount, subtotal));
  const deliveryMethod = normalizedAddress.method === 'pickup' ? 'pickup' : 'delivery';
  const deliveryFee = deliveryMethod === 'delivery' ? 70 : 0; // NPR 70 flat delivery
  const tax = roundMoney((subtotal + deliveryFee - discount) * VAT_RATE); // 13% VAT
  const total = roundMoney(subtotal + deliveryFee + tax - discount);

  return {
    ok: true,
    businessId: normalizedBusinessId,
    business: orderBusiness,
    items: resolvedItems,
    subtotal,
    discount,
    deliveryFee,
    tax,
    total,
    deliveryAddress: {
      name: personName,
      email: deliveryEmail,
      phone: deliveryPhone,
      location: place,
      address: street,
      method: deliveryMethod,
    },
  };
}

/** Saves an order for a priced checkout: deducts product stock, adds loyalty points and creates the record. */
async function persistCheckoutOrder(customerId, prepared, fields) {
  const ProductMDL = Product();
  const UserMDL = User();
  for (const item of prepared.items) {
    if (item.type === 'service') continue;
    try {
      const product = await ProductMDL.findById(item.id);
      if (product && product.stock >= item.quantity) {
        await ProductMDL.findByIdAndUpdate(item.id, { $inc: { stock: -item.quantity } });
      }
    } catch (_) {}
  }

  const buyer = await UserMDL.findById(customerId);
  await UserMDL.findByIdAndUpdate(customerId, { loyaltyPoints: ((buyer && buyer.loyaltyPoints) || 0) + 10 });

  const { trackingHistory, ...orderFields } = fields;
  const created = await Order().create({
    customerId,
    businessId: prepared.businessId,
    items: prepared.items,
    subtotal: prepared.subtotal,
    deliveryFee: prepared.deliveryFee,
    tax: prepared.tax,
    discount: prepared.discount,
    total: prepared.total,
    status: 'placed',
    deliveryAddress: prepared.deliveryAddress,
    deliveryRiderId: '',
    // The delivery OTP is generated when the business dispatches the order.
    deliveryOtp: '',
    deliveryProof: '',
    trackingHistory: trackingHistory || [{ status: 'placed', time: new Date().toISOString(), note: 'Order placed by customer.' }],
    ...orderFields,
  });
  return toPlain(created);
}

/** Real-time notice to the business owner and admins that a new order arrived. */
async function notifyNewOrder(ioInstance, order) {
  if (!ioInstance || !order) return;
  try {
    const biz = await findByIdSafe(Business(), order.businessId);
    if (biz && biz.ownerId) ioInstance.to(`user:${biz.ownerId}`).emit('new_order', sanitizeOrderFor(order, 'seller'));
  } catch (_) {}
  ioInstance.to('role:admin').emit('new_order', sanitizeOrderFor(order, 'admin'));
}

app.post('/api/checkout', authenticateToken, writeLimiter('checkout', 20, 10), async (req, res) => {
  try {
    const { items, paymentMethod } = req.body || {};
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Missing order details.' });
    }

    const method = String(paymentMethod || 'COD');
    if (method === 'eSewa') {
      return res.status(400).json({ message: 'eSewa payments start from /api/checkout/esewa.' });
    }
    const allowedMethods = ['COD', 'QR', ...(stripe ? ['Card'] : [])];
    if (!allowedMethods.includes(method)) {
      return res.status(400).json({ message: 'Unsupported payment method.' });
    }

    const customerId = String(req.user.id || req.user.userId || '');
    const checkoutKey = String(req.get('Idempotency-Key') || '').trim().slice(0, 128);
    const OrderMDL = Order();

    // COD / QR orders are confirmed now, so the bill is issued immediately (payment shown as pending).
    // Card orders are billed only after Stripe confirms the payment. issueBill is idempotent.
    const withBill = async (order) => {
      if (order.billNumber || order.paymentMethod === 'Card') return order;
      const billResult = await billing.issueBill(order._id, { waitMs: CHECKOUT_BILL_WAIT_MS });
      return billResult.order || order;
    };

    // Same key = same checkout attempt (double click, network retry): return the original order.
    const findExistingCheckout = async () => (checkoutKey ? toPlain(await OrderMDL.findOne({ customerId, checkoutKey })) : null);
    const existingOrder = await findExistingCheckout();
    if (existingOrder) {
      return res.status(200).json(checkoutResponse(await withBill(existingOrder), { duplicate: true }));
    }

    const prepared = await prepareCheckout(req.body || {});
    if (!prepared.ok) return res.status(prepared.status).json(prepared.body);

    const createOrder = async () => {
      const duplicate = await findExistingCheckout();
      if (duplicate) return { order: duplicate, duplicate: true };
      try {
        const order = await persistCheckoutOrder(customerId, prepared, {
          paymentMethod: method,
          // Mark new orders as pending until payment confirmation.
          paymentStatus: 'pending',
          ...(checkoutKey ? { checkoutKey } : {}),
        });
        return { order, duplicate: false };
      } catch (err) {
        const existing = err && err.code === 11000 ? await findExistingCheckout() : null;
        if (existing) return { order: existing, duplicate: true };
        throw err;
      }
    };

    const { order: placedOrder, duplicate } = checkoutKey
      ? await withBookingSlotLock(`checkout:${customerId}:${checkoutKey}`, createOrder)
      : await createOrder();
    if (duplicate) {
      return res.status(200).json(checkoutResponse(await withBill(placedOrder), { duplicate: true }));
    }

    const newOrder = await withBill(placedOrder);
    res.status(201).json(checkoutResponse(newOrder));
    notifyNewOrder(req.app.get('io'), newOrder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Checkout transaction failed.' });
  }
});

app.use(['/api/checkout/esewa', '/api/payment/esewa'], writeLimiter('esewa', 30, 10));
app.use(createEsewaRoutes({
  authenticateToken,
  requireRole,
  billing,
  models: { Business, PaymentCredential, EsewaPayment, Order },
  prepareCheckout,
  persistCheckoutOrder,
  notifyNewOrder,
  resolveClientUrl,
}));

app.use(createOrderLifecycleRoutes({ authenticateToken, requireRole, billing, Order, Business, Product }));

// Public payment capabilities for the checkout UI (no secrets).
app.get('/api/payment/config', (req, res) => {
  res.json({ stripeEnabled: Boolean(stripe), stripeMode, billEmailConfigured: isBillEmailConfigured() });
});

// Manual payment confirmation (e.g. a business confirming a QR transfer it received).
// Customers cannot mark their own orders as paid.
app.post('/api/payment/confirm', authenticateToken, requireRole(['admin', 'seller']), async (req, res) => {
  try {
    const { orderId, status } = req.body || {};
    if (!['pending', 'paid', 'refunded'].includes(status)) {
      return res.status(400).json({ message: 'Invalid payment status.' });
    }
    const order = await billing.loadOrder(orderId);
    const access = order ? await billing.resolveOrderAccess(req.user, order) : null;
    if (!order || !['admin', 'seller'].includes(access)) return res.status(404).json({ message: 'Order not found.' });
    if (status === 'refunded' && access !== 'admin') {
      return res.status(403).json({ message: 'Only an admin can mark an order as refunded.' });
    }
    if (['Card', 'eSewa'].includes(order.paymentMethod) && access !== 'admin') {
      return res.status(403).json({ message: 'Online payments are confirmed automatically by the payment provider.' });
    }
    if (order.paymentStatus === 'paid' && status !== 'paid' && access !== 'admin') {
      return res.status(403).json({ message: 'This order is already paid. Only an admin can change its payment status.' });
    }
    if (status === 'refunded' && order.paymentStatus !== 'paid') {
      return res.status(409).json({ message: 'Only a paid order can be marked as refunded.' });
    }

    const OrderMDL = Order();
    const update = { paymentStatus: status };
    if (status === 'paid' && order.paymentStatus !== 'paid') {
      update.paidAt = new Date();
      update.trackingHistory = [...(order.trackingHistory || []), { status: 'paid', time: new Date().toISOString(), note: `Payment confirmed by ${access}.` }];
    }
    const updated = toPlain(await OrderMDL.findByIdAndUpdate(order._id, update, { returnDocument: 'after' }));

    if (status === 'paid') await billing.issueBill(order._id);
    res.json({ success: true, order: updated });
  } catch (err) {
    console.error('Payment confirmation failed', err && err.message);
    res.status(500).json({ message: 'Payment confirmation failed.' });
  }
});

// Create Stripe Checkout Session (test mode). Returns session url to redirect client.
app.post('/api/payment/create-session', authenticateToken, async (req, res) => {
  try {
    if (!stripe) return res.status(501).json({ message: 'Stripe not configured on server.' });
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ message: 'orderId required.' });

    const order = await billing.loadOrder(orderId);
    if (!order || String(order.customerId) !== String(req.user.id)) return res.status(404).json({ message: 'Order not found.' });
    if (order.paymentMethod !== 'Card') return res.status(400).json({ message: 'This order is not a card payment order.' });
    if (order.paymentStatus === 'paid') return res.status(409).json({ message: 'This order is already paid.' });
    if (order.status === 'cancelled') return res.status(409).json({ message: 'This order was cancelled.' });

    const clientUrl = resolveClientUrl(req);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `UdyogConnect Order ${order._id}` },
            // Convert NPR to USD for Stripe test payments (approx conversion), in cents
            unit_amount: stripeAmountCents(order),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      client_reference_id: String(order._id),
      customer_email: order.deliveryAddress?.email || undefined,
      metadata: { orderId: String(order._id) },
      success_url: `${clientUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}&orderId=${order._id}`,
      cancel_url: `${clientUrl}/checkout?canceled=1`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe session error', err);
    res.status(500).json({ message: 'Failed to create Stripe session.' });
  }
});

// Verify Stripe Checkout Session and update order payment status
app.post('/api/payment/verify-session', authenticateToken, writeLimiter('payment-verify', 30, 10), async (req, res) => {
  try {
    if (!stripe) return res.status(501).json({ message: 'Stripe not configured on server.' });
    const { sessionId, orderId } = req.body || {};
    if (!sessionId || !orderId) return res.status(400).json({ message: 'sessionId and orderId required.' });

    const order = await billing.loadOrder(orderId);
    if (!order || String(order.customerId) !== String(req.user.id)) return res.status(404).json({ message: 'Order not found.' });

    // Revisiting the success page must not re-run payment processing or resend anything.
    if (order.paymentStatus === 'paid') {
      const { order: billed } = await billing.issueBill(order._id);
      const current = billed || order;
      return res.json({ success: true, paid: true, order: current, bill: billing.billSummary(current) });
    }

    const sess = await stripe.checkout.sessions.retrieve(String(sessionId));
    if (!sess) return res.status(404).json({ message: 'Session not found.' });
    if (String(sess.metadata?.orderId || '') !== String(order._id)) {
      return res.status(400).json({ message: 'This payment session does not belong to this order.' });
    }
    if (stripeMode === 'live' && (sess.amount_total !== stripeAmountCents(order) || String(sess.currency).toLowerCase() !== 'usd')) {
      console.error(`Stripe verify: amount mismatch for order ${order._id} (${sess.amount_total} ${sess.currency}).`);
      return res.status(400).json({ message: 'Payment amount does not match the order total.' });
    }

    const paid = sess.payment_status === 'paid';
    if (paid) {
      const result = await billing.finalizeCardPayment({
        orderId: order._id,
        transactionId: sess.payment_intent,
        sessionId: sess.id || sessionId,
        waitMs: CHECKOUT_BILL_WAIT_MS,
      });
      const current = result.order || order;
      return res.json({ success: true, paid: true, order: current, bill: billing.billSummary(current) });
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
    const access = req.user.role === 'admin' ? 'admin' : req.user.role === 'seller' ? 'seller' : 'customer';
    res.json(orders.map((order) => sanitizeOrderFor(order, access)));
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve orders.' });
  }
});

// GET single order by ID
app.get('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const order = await billing.loadOrder(req.params.id);
    const access = order ? await billing.resolveOrderAccess(req.user, order) : null;
    if (!order || !access) return res.status(404).json({ message: 'Order not found.' });
    res.json(sanitizeOrderFor(order, access));
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
    const order = await billing.loadOrder(req.params.id);
    const access = order ? await billing.resolveOrderAccess(req.user, order) : null;
    if (!order || !access) return res.status(404).json({ message: 'Order not found.' });
    if (!['admin', 'seller'].includes(access)) {
      return res.status(403).json({ message: 'Only the business or an admin can update this order.' });
    }
    if (!['placed', 'accepted', 'preparing', 'dispatched', 'completed', 'cancelled', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid order status.' });
    }
    if (access !== 'admin' && ['completed', 'cancelled', 'rejected'].includes(String(order.status)) && status !== order.status) {
      return res.status(409).json({ message: `This order is already ${order.status} and can no longer be changed.` });
    }
    const safeNote = typeof note === 'string' ? note.trim().slice(0, 500) : '';

    const trackingHistory = [...(order.trackingHistory || []), { status, time: new Date().toISOString(), note: safeNote || `Order updated to ${status}.` }];
    const statusUpdate = { status, trackingHistory };
    if (status === 'dispatched' && order.status !== 'dispatched') {
      Object.assign(statusUpdate, { deliveryOtp: generateDeliveryOtp(), deliveryOtpAttempts: 0, dispatchedAt: new Date() });
    }

    const updated = await OrderMDL.findByIdAndUpdate(
      req.params.id,
      statusUpdate,
      { new: true }
    );
    res.json({ success: true, order: sanitizeOrderFor(updated, access) });

    // ⚡ Real-time: notify the customer that their order status changed
    const socketIo = req.app.get('io');
    if (socketIo && order.customerId) {
      socketIo.to(`user:${order.customerId}`).emit('order_status_update', {
        orderId: req.params.id,
        status,
        note: safeNote || `Your order has been updated to: ${status}`,
      });
    }

    // Send email notification to business owner when order is accepted by seller
    try {
      if (status === 'accepted' || status === 'preparing') {
        const BusinessMDL = Business();
        const biz = await BusinessMDL.findById(order.businessId);
        if (biz && biz.contactEmail) {
          const subject = `Order ${String(order._id).slice(-8).toUpperCase()} — ${status}`;
          const html = `<p>Hi ${escapeHtml(biz.name || 'Business')},</p>
            <p>The order <strong>${escapeHtml(order._id)}</strong> has been updated to <strong>${escapeHtml(status)}</strong>.</p>
            <p>Customer: ${escapeHtml(order.deliveryAddress?.name || '—')} (${escapeHtml(order.deliveryAddress?.phone || '—')})</p>
            <p>Items: ${(order.items || []).map((i) => `${escapeHtml(i.name)} (x${escapeHtml(i.quantity)})`).join(', ')}</p>
            <p>Total: NPR ${escapeHtml(order.total)}</p>
            <p>View orders in your dashboard to manage it.</p>`;
          await sendMail({ to: biz.contactEmail, subject, html });
        }
      }
    } catch (err) { console.warn('Order status email failed', err && err.message); }
  } catch (err) {
    res.status(500).json({ message: 'Status update failed.' });
  }
});

const bookingSlotLocks = new Map();
const withBookingSlotLock = async (lockKey, fn) => {
  const key = String(lockKey);
  while (bookingSlotLocks.get(key)) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  bookingSlotLocks.set(key, true);
  try {
    return await fn();
  } finally {
    bookingSlotLocks.delete(key);
  }
};

app.get('/api/bookings/availability', async (req, res) => {
  try {
    const { businessId, serviceId, date, staffMember } = req.query || {};
    if (!businessId || !serviceId || !date) {
      return res.status(400).json({ message: 'businessId, serviceId, and date are required.' });
    }

    const BusinessMDL = Business();
    const ServiceMDL = Service();
    const BookingMDL = Booking();
    const business = await BusinessMDL.findById(businessId);
    if (!business) return res.status(404).json({ message: 'Business not found.' });
    const service = await ServiceMDL.findById(serviceId);
    if (!service || String(service.businessId) !== String(businessId)) {
      return res.status(404).json({ message: 'Service not found.' });
    }

    const existingBookings = (await BookingMDL.find({ businessId, date }))
      .filter((b) => ACTIVE_BOOKING_STATUSES.has(String(b.status || 'pending').toLowerCase()));

    const result = evaluateBookingAvailability({
      business,
      service,
      date: String(date),
      staffMember: staffMember || '',
      existingBookings,
    });

    return res.status(result.ok ? 200 : result.status).json({
      success: result.ok,
      code: result.code,
      message: result.message,
      slots: result.slots,
      minDate: result.minDate || getNepalParts().dateKey,
      maxDate: result.maxDate || null,
      duration: result.duration || Number(service.duration || 60),
      settings: result.settings,
      nepalNow: result.nepalNow,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load booking availability.' });
  }
});

app.post('/api/bookings', authenticateToken, writeLimiter('bookings', 20, 10), async (req, res) => {
  try {
    const { businessId, serviceId, date, timeSlot, staffMember, homeService } = req.body || {};
    if (!businessId || !serviceId || !date || !timeSlot) {
      return res.status(400).json({ message: 'Missing booking details.', code: 'MISSING_FIELDS' });
    }

    const BusinessMDL = Business();
    const ServiceMDL = Service();
    const BookingMDL = Booking();
    const UserMDL = User();
    const business = await BusinessMDL.findById(businessId);
    if (!business) return res.status(404).json({ message: 'Business not found.' });
    const service = await ServiceMDL.findById(serviceId);
    if (!service || String(service.businessId) !== String(businessId)) {
      return res.status(404).json({ message: 'Service not found.' });
    }

    const customer = await UserMDL.findById(req.user.id);
    const customerName = customer?.name || req.user.name || 'Customer';
    const customerEmail = customer?.email || req.user.email || '';
    const customerPhone = customer?.phone || '';

    const lockKey = `${businessId}:${date}:${String(timeSlot).trim()}:${staffMember || 'any'}`;
    const created = await withBookingSlotLock(lockKey, async () => {
      const existingBookings = await BookingMDL.find({ businessId, date });
      const evaluation = evaluateBookingAvailability({
        business,
        service,
        date: String(date),
        timeSlot: String(timeSlot),
        staffMember: staffMember || '',
        existingBookings,
      });

      if (!evaluation.ok) {
        const error = new Error(evaluation.message);
        error.status = evaluation.status;
        error.code = evaluation.code;
        error.slots = evaluation.slots;
        throw error;
      }

      // Duplicate booking by same customer for same service/time
      const duplicate = existingBookings.find((b) => (
        ACTIVE_BOOKING_STATUSES.has(String(b.status || 'pending').toLowerCase())
        && String(b.customerId) === String(req.user.id)
        && String(b.serviceId) === String(serviceId)
        && String(b.timeSlot).toLowerCase() === String(evaluation.normalizedTimeSlot).toLowerCase()
      ));
      if (duplicate) {
        const error = new Error('You already have a booking for this service at this time.');
        error.status = 409;
        error.code = 'DUPLICATE_BOOKING';
        throw error;
      }

      return BookingMDL.create({
        customerId: req.user.id,
        customerName,
        customerEmail,
        customerPhone,
        businessId,
        businessName: business.name || '',
        serviceId,
        serviceName: service.name || 'Service',
        servicePrice: Number(service.price || 0),
        date: String(date),
        timeSlot: evaluation.normalizedTimeSlot,
        durationMinutes: evaluation.duration,
        startAt: evaluation.startAt,
        endAt: evaluation.endAt,
        staffMember: staffMember || 'Any available staff',
        status: 'pending',
        homeService: homeService === 'true' || homeService === true,
        reminderSent: false,
        timezone: 'Asia/Kathmandu',
      });
    });

    // Notify business owner immediately
    try {
      const NotificationMDL = Notification();
      const ownerId = String(business.ownerId || '');
      if (ownerId && NotificationMDL) {
        await NotificationMDL.create({
          userId: ownerId,
          title: 'New service booking',
          message: `${customerName} booked "${service.name}" on ${created.date} at ${created.timeSlot}.`,
          type: 'booking',
          read: false,
          link: '/business?tab=bookings',
        });
      }
      const socketIo = req.app.get('io');
      if (socketIo && ownerId) {
        socketIo.to(`user:${ownerId}`).emit('new_notification', {
          type: 'booking',
          bookingId: created._id,
        });
        socketIo.to(`user:${ownerId}`).emit('new_booking', created);
      }
    } catch (notifErr) {
      console.error('Booking owner notification failed:', notifErr.message || notifErr);
    }

    // Confirm to customer
    try {
      const NotificationMDL = Notification();
      if (NotificationMDL) {
        await NotificationMDL.create({
          userId: String(req.user.id),
          title: 'Booking requested',
          message: `Your booking for "${service.name}" at ${business.name || 'the business'} on ${created.date} at ${created.timeSlot} is pending confirmation.`,
          type: 'booking',
          read: false,
          link: '/customer',
        });
      }
      const socketIo = req.app.get('io');
      if (socketIo) {
        socketIo.to(`user:${req.user.id}`).emit('new_notification', { type: 'booking' });
      }
    } catch (custNotifErr) {
      console.error('Booking customer notification failed:', custNotifErr.message || custNotifErr);
    }

    res.status(201).json({ success: true, booking: created });
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({
        message: err.message,
        code: err.code,
        slots: err.slots || undefined,
      });
    }
    console.error(err);
    res.status(500).json({ message: 'Booking failed.' });
  }
});

app.get('/api/bookings', authenticateToken, async (req, res) => {
  try {
    const BookingMDL = Booking();
    const UserMDL = User();
    const ServiceMDL = Service();
    const BusinessMDL = Business();
    const ownerKey = String(req.user.id || req.user.userId || '');
    let bookings = [];

    if (req.user.role === 'admin') {
      bookings = await BookingMDL.find({});
    } else if (req.user.role === 'seller') {
      // Same ownership pattern as /api/orders so sellers always see their bookings
      const myBizs = await BusinessMDL.find({ ownerId: ownerKey });
      const myBizIds = myBizs.map((b) => String(b._id));
      if (myBizIds.length === 0) {
        bookings = [];
      } else {
        const groups = await Promise.all(myBizIds.map((businessId) => BookingMDL.find({ businessId })));
        bookings = groups.flat();
      }
    } else {
      bookings = await BookingMDL.find({ customerId: ownerKey });
    }

    // Enrich older bookings missing denormalized fields
    const enriched = await Promise.all((Array.isArray(bookings) ? bookings : []).map(async (bk) => {
      const plain = typeof bk?.toObject === 'function' ? bk.toObject() : { ...bk };
      if (!plain.customerName && plain.customerId) {
        const customer = await UserMDL.findById(plain.customerId);
        plain.customerName = customer?.name || 'Customer';
        plain.customerEmail = plain.customerEmail || customer?.email || '';
        plain.customerPhone = plain.customerPhone || customer?.phone || '';
      }
      if (!plain.serviceName && plain.serviceId) {
        const service = await ServiceMDL.findById(plain.serviceId);
        plain.serviceName = service?.name || 'Service';
        plain.servicePrice = plain.servicePrice || Number(service?.price || 0);
        plain.durationMinutes = plain.durationMinutes || Number(service?.duration || 60);
      }
      if (!plain.businessName && plain.businessId) {
        const biz = await BusinessMDL.findById(plain.businessId);
        plain.businessName = biz?.name || 'Business';
      }
      return plain;
    }));

    // Newest first
    enriched.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to load bookings.' });
  }
});

app.put('/api/bookings/:id', authenticateToken, async (req, res) => {
  try {
    const { status, date, timeSlot, staffMember } = req.body || {};
    const BookingMDL = Booking();
    const bookingId = String(req.params.id || '').trim();
    const booking = await BookingMDL.findById(bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found.' });

    const actorId = String(req.user.id || req.user.userId || '');
    const BusinessMDL = Business();
    const business = await BusinessMDL.findById(booking.businessId);
    const isOwner = Boolean(business && String(business.ownerId) === actorId);
    const isCustomer = String(booking.customerId) === actorId;
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isCustomer && !isAdmin) {
      return res.status(403).json({ message: 'Not allowed to update this booking.' });
    }

    const updates = {};
    if (status !== undefined && status !== null && String(status).trim() !== '') {
      const nextStatus = String(status).trim().toLowerCase();
      const allowed = ['pending', 'confirmed', 'completed', 'cancelled', 'rejected'];
      if (!allowed.includes(nextStatus)) {
        return res.status(400).json({ message: 'Invalid booking status.' });
      }
      // Business owners/admins can confirm/decline even if they also created the booking.
      // Customers (non-owners) may only cancel.
      if (!isOwner && !isAdmin) {
        if (nextStatus !== 'cancelled') {
          return res.status(403).json({ message: 'Customers can only cancel bookings.' });
        }
      }
      updates.status = nextStatus;
    }

    if (date || timeSlot) {
      const ServiceMDL = Service();
      const service = await ServiceMDL.findById(booking.serviceId);
      if (!service) return res.status(404).json({ message: 'Service not found.' });
      const nextDate = String(date || booking.date);
      const nextSlot = String(timeSlot || booking.timeSlot);
      const lockKey = `${booking.businessId}:${nextDate}:${nextSlot}:${staffMember || booking.staffMember || 'any'}`;
      await withBookingSlotLock(lockKey, async () => {
        const existingBookings = await BookingMDL.find({ businessId: booking.businessId, date: nextDate });
        const evaluation = evaluateBookingAvailability({
          business,
          service,
          date: nextDate,
          timeSlot: nextSlot,
          staffMember: staffMember || booking.staffMember || '',
          existingBookings,
          excludeBookingId: booking._id,
        });
        if (!evaluation.ok) {
          const error = new Error(evaluation.message);
          error.status = evaluation.status;
          error.code = evaluation.code;
          throw error;
        }
        updates.date = nextDate;
        updates.timeSlot = evaluation.normalizedTimeSlot;
        updates.durationMinutes = evaluation.duration;
        updates.startAt = evaluation.startAt;
        updates.endAt = evaluation.endAt;
        if (staffMember) updates.staffMember = staffMember;
      });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No booking changes provided.' });
    }

    const previousStatus = booking.status;
    const updated = await BookingMDL.findByIdAndUpdate(bookingId, updates, { new: true });
    if (!updated) {
      return res.status(404).json({ message: 'Booking not found.' });
    }
    res.json({ success: true, booking: updated });

    try {
      if (updates.status && String(updates.status) !== String(previousStatus)) {
        const NotificationMDL = Notification();
        const serviceLabel = updated.serviceName || 'your service';
        const bizLabel = updated.businessName || business?.name || 'the business';
        const statusLabel = String(updates.status);
        const customerId = String(updated.customerId || '');
        const ownerId = String(business?.ownerId || '');

        if (NotificationMDL && customerId) {
          const customerTitles = {
            confirmed: 'Booking confirmed',
            rejected: 'Booking declined',
            cancelled: 'Booking cancelled',
            completed: 'Booking completed',
            pending: 'Booking updated',
          };
          await NotificationMDL.create({
            userId: customerId,
            title: customerTitles[statusLabel] || 'Booking updated',
            message: `Your booking for "${serviceLabel}" at ${bizLabel} on ${updated.date} at ${updated.timeSlot} is now ${statusLabel}.`,
            type: 'booking',
            read: false,
            link: '/customer',
          });
        }

        // If customer cancelled, alert the business owner
        if (NotificationMDL && ownerId && statusLabel === 'cancelled' && isCustomer && !isOwner) {
          await NotificationMDL.create({
            userId: ownerId,
            title: 'Booking cancelled',
            message: `${updated.customerName || 'A customer'} cancelled "${serviceLabel}" on ${updated.date} at ${updated.timeSlot}.`,
            type: 'booking',
            read: false,
            link: '/business?tab=bookings',
          });
        }

        const socketIo = req.app.get('io');
        if (socketIo) {
          if (customerId) {
            socketIo.to(`user:${customerId}`).emit('new_notification', { type: 'booking', bookingId: updated._id });
            socketIo.to(`user:${customerId}`).emit('booking_updated', updated);
          }
          if (ownerId) {
            socketIo.to(`user:${ownerId}`).emit('new_notification', { type: 'booking', bookingId: updated._id });
            socketIo.to(`user:${ownerId}`).emit('booking_updated', updated);
          }
        }
      }
    } catch (notifErr) {
      console.error('Booking status notification failed:', notifErr.message || notifErr);
    }

    try {
      if (updates.status && (updates.status === 'confirmed' || updates.status === 'pending')) {
        const latest = updated;
        if (business && business.contactEmail) {
          const subject = `Booking ${String(latest._id).slice(-8).toUpperCase()} — ${latest.status}`;
          const html = `<p>Hi ${escapeHtml(business.name || 'Business')},</p>
            <p>The booking <strong>${escapeHtml(latest._id)}</strong> for service <strong>${escapeHtml(latest.serviceName || latest.serviceId)}</strong> has been updated to <strong>${escapeHtml(latest.status)}</strong>.</p>
            <p>Customer: ${escapeHtml(latest.customerName || latest.customerId)}</p>
            <p>Date: ${escapeHtml(latest.date)} · Time: ${escapeHtml(latest.timeSlot)}</p>`;
          await sendMail({ to: business.contactEmail, subject, html });
        }
      }
    } catch (mailErr) {
      console.error('Booking mail failed:', mailErr.message);
    }
  } catch (err) {
    console.error('Booking update failed:', err);
    if (res.headersSent) return;
    if (err?.status) {
      return res.status(err.status).json({ message: err.message, code: err.code });
    }
    res.status(500).json({ message: 'Status update failed.' });
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
    const order = await billing.loadOrder(req.params.id);
    const access = order ? await billing.resolveOrderAccess(req.user, order) : null;
    if (!order || !['admin', 'seller'].includes(access)) return res.status(404).json({ message: 'Order not found.' });

    const assignedRider = riderId || req.user.id;
    const trackingHistory = [...(order.trackingHistory || []), {
      status: 'dispatched',
      time: new Date().toISOString(),
      note: 'Order dispatched for delivery.',
    }];

    const dispatchUpdate = { deliveryRiderId: assignedRider, status: 'dispatched', trackingHistory };
    if (order.status !== 'dispatched') {
      Object.assign(dispatchUpdate, { deliveryOtp: generateDeliveryOtp(), deliveryOtpAttempts: 0, dispatchedAt: new Date() });
    }
    const updated = await OrderMDL.findByIdAndUpdate(req.params.id, dispatchUpdate, { new: true });
    res.json({ success: true, order: sanitizeOrderFor(updated, req.user.role === 'admin' ? 'admin' : 'seller') });

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
    const order = await billing.loadOrder(req.params.id);
    const access = order ? await billing.resolveOrderAccess(req.user, order) : null;
    if (!order || !['admin', 'seller'].includes(access)) return res.status(404).json({ message: 'Order not found.' });
    if (order.status !== 'dispatched') {
      return res.status(409).json({ message: 'Only orders that are out for delivery can be completed.' });
    }
    if ((Number(order.deliveryOtpAttempts) || 0) >= 5) {
      return res.status(429).json({ message: 'Too many wrong OTP attempts. Ask the customer to confirm with "Order Received".' });
    }

    if (!order.deliveryOtp || String(order.deliveryOtp) !== String(otp || '').trim()) {
      await OrderMDL.findByIdAndUpdate(req.params.id, { deliveryOtpAttempts: (Number(order.deliveryOtpAttempts) || 0) + 1 });
      return res.status(400).json({ message: 'Invalid OTP.' });
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
        deliveredAt: new Date(),
        trackingHistory,
      },
      { new: true }
    );
    res.json({ success: true, order: sanitizeOrderFor(updated, access) });

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

app.use(createReportRoutes({ authenticateToken, requireRole, Report, Review, Business, User, AuditLog }));

app.get('/api/admin/support-tickets', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const SupportTicketMDL = db.SupportTicket || require('./db').SupportTicket();
    const tickets = await SupportTicketMDL.find({});
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load support tickets.' });
  }
});

const SUPPORT_TICKET_PRIORITIES = ['low', 'medium', 'high'];
const supportTicketLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  key: byUserOrIp,
  message: 'You have sent several support requests recently. Please wait before sending another.',
});

app.post('/api/support-tickets', authenticateToken, supportTicketLimiter, async (req, res) => {
  try {
    const rawPriority = String(req.body?.priority || 'medium').trim().toLowerCase();
    const category = String(req.body?.category || 'general').trim().slice(0, 50) || 'general';
    const priority = SUPPORT_TICKET_PRIORITIES.includes(rawPriority) ? rawPriority : 'medium';
    const subject = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();
    if (!subject || !message) {
      return res.status(400).json({ message: 'Subject and message are required.' });
    }
    if (subject.length > 150 || message.length > 5000) {
      return res.status(400).json({ message: 'Subject must be at most 150 characters and message at most 5000 characters.' });
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
    const status = String(req.body?.status || '').trim();
    if (!['open', 'in-progress', 'resolved'].includes(status)) {
      return res.status(400).json({ message: 'Invalid ticket status.' });
    }
    const resolution = String(req.body?.resolution || '').trim().slice(0, 5000);
    const SupportTicketMDL = db.SupportTicket || require('./db').SupportTicket();
    const updated = await SupportTicketMDL.findByIdAndUpdate(req.params.id, { status, resolution }, { new: true });
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

const averageRating = (reviews) => {
  const ratings = reviews.map((r) => Number(r.rating)).filter((n) => n >= 1 && n <= 5);
  if (!ratings.length) return { rating: 0, reviewCount: 0 };
  return {
    rating: parseFloat((ratings.reduce((sum, n) => sum + n, 0) / ratings.length).toFixed(1)),
    reviewCount: ratings.length,
  };
};

/** A business's rating and review count always come from its real business reviews. */
const recalculateBusinessRating = async (businessId) => {
  if (!businessId) return;
  try {
    const reviews = await Review().find({ businessId, targetType: 'business' });
    await Business().findByIdAndUpdate(businessId, averageRating(Array.isArray(reviews) ? reviews : []));
  } catch (err) {
    console.warn('Rating recalculation skipped:', err && err.message);
  }
};

// Demo reviews older builds wrote into every new database; they are not from real customers.
const SEEDED_DEMO_REVIEWS = {
  r_v1: 'Excellent food, traditional tastes are amazing! Love the Newari platter.',
  r_v2: 'Very beautiful handmade basket. Highly recommended!',
};

const reconcileBusinessRatings = async () => {
  try {
    const ReviewMDL = Review();
    const BusinessMDL = Business();
    let reviews = await ReviewMDL.find({});
    reviews = Array.isArray(reviews) ? reviews : [];
    const seeded = reviews.filter((r) => SEEDED_DEMO_REVIEWS[String(r._id)] === r.comment);
    for (const review of seeded) await ReviewMDL.deleteOne({ _id: review._id });
    const real = reviews.filter((r) => !seeded.includes(r));

    const businesses = await BusinessMDL.find({});
    for (const business of Array.isArray(businesses) ? businesses : []) {
      const own = real.filter((r) => r.targetType === 'business' && String(r.businessId) === String(business._id));
      const next = averageRating(own);
      if (Number(business.rating || 0) !== next.rating || Number(business.reviewCount || 0) !== next.reviewCount) {
        await BusinessMDL.findByIdAndUpdate(business._id, next);
      }
    }
  } catch (err) {
    console.warn('Rating reconciliation skipped:', err && err.message);
  }
};

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
    if (req.body.rating !== undefined) {
      const rating = Number(req.body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Rating must be a whole number from 1 to 5.' });
      }
      updates.rating = rating;
    }
    if (req.body.comment !== undefined) {
      const comment = String(req.body.comment).trim();
      if (comment.length > 2000) return res.status(400).json({ message: 'Review must be at most 2000 characters.' });
      updates.comment = comment;
    }
    const updated = await ReviewMDL.findByIdAndUpdate(req.params.id, updates, { new: true });
    await recalculateBusinessRating(review.businessId);
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
    await recalculateBusinessRating(review.businessId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete review.' });
  }
});

app.post('/api/reviews', authenticateToken, writeLimiter('reviews', 10, 60), validateReviewPayload, uploadSingle('image'), async (req, res) => {
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
      imgUrl = await processImageUpload(req.file);
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

    await recalculateBusinessRating(businessId);

    res.status(201).json({ success: true, review: newReview });
  } catch (err) {
    res.status(500).json({ message: 'Failed to post review.' });
  }
});

// ==================== CHAT & AI SUPPORT CHATBOT ====================

// GET /api/users — admin-only user directory; returns safe fields only
app.get('/api/users', authenticateToken, requireRole(['admin']), async (req, res) => {
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

app.post('/api/chat', authenticateToken, writeLimiter('chat', 60, 1), uploadSingle('image'), async (req, res) => {
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
    const cleanCode = String(code).trim().toUpperCase();
    const percent = Number(discountPercent);
    const cap = Number(maxDiscount);
    if (!/^[A-Z0-9_-]{3,30}$/.test(cleanCode)) {
      return res.status(400).json({ message: 'Coupon code must be 3-30 letters, numbers, dashes or underscores.' });
    }
    if (!Number.isInteger(percent) || percent < 1 || percent > 90) {
      return res.status(400).json({ message: 'Discount must be a whole number from 1 to 90 percent.' });
    }
    if (!Number.isFinite(cap) || cap <= 0 || cap > 100000) {
      return res.status(400).json({ message: 'Maximum discount must be between 1 and 100000.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(expiryDate)) || Number.isNaN(new Date(`${expiryDate}T00:00:00`).getTime())) {
      return res.status(400).json({ message: 'Expiry date must be a valid date (YYYY-MM-DD).' });
    }

    const CouponMDL = Coupon();
    if (await CouponMDL.findOne({ code: cleanCode })) {
      return res.status(409).json({ message: 'A coupon with this code already exists.' });
    }
    const newCoupon = await CouponMDL.create({
      code: cleanCode,
      discountPercent: percent,
      maxDiscount: cap,
      expiryDate: String(expiryDate),
      active: true,
    });
    res.status(201).json({ success: true, coupon: newCoupon });
  } catch (err) {
    res.status(500).json({ message: 'Coupon creation failed.' });
  }
});

const isCouponUsable = (coupon, now = new Date()) => {
  if (!coupon || !coupon.active) return false;
  if (!coupon.expiryDate) return true;
  return new Date(`${coupon.expiryDate}T23:59:59`) >= now;
};

// The full coupon list is admin-only; shoppers check one code at a time below.
app.get('/api/admin/coupons', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const CouponMDL = Coupon();
    const coupons = await CouponMDL.find({});
    res.json(coupons.filter((coupon) => isCouponUsable(coupon)));
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve coupons.' });
  }
});

const couponCheckLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  key: byUserOrIp,
  message: 'Too many coupon attempts. Please wait a few minutes and try again.',
});

app.get('/api/coupons/validate', authenticateToken, couponCheckLimiter, async (req, res) => {
  try {
    const code = String(req.query.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,30}$/.test(code)) {
      return res.status(400).json({ message: 'Enter a valid coupon code.' });
    }
    const coupon = await Coupon().findOne({ code });
    if (!isCouponUsable(coupon)) {
      return res.status(404).json({ message: 'This coupon code is invalid or has expired.' });
    }
    res.json({
      code: coupon.code,
      discountPercent: Number(coupon.discountPercent) || 0,
      maxDiscount: Number(coupon.maxDiscount) || 0,
      expiryDate: coupon.expiryDate || null,
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not check this coupon right now.' });
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
    const title = String(req.body?.title || '').trim().slice(0, 120) || 'Admin Announcement';
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ message: 'Announcement message is required.' });
    if (message.length > 2000) return res.status(400).json({ message: 'Announcement must be at most 2000 characters.' });
    const NotificationMDL = Notification();
    const UserMDL = User();
    
    const users = await UserMDL.find({});
    for (const u of users) {
      await NotificationMDL.create({
        userId: String(u._id),
        title,
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
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!name) return res.status(400).json({ message: 'Category name is required.' });
    if (name.length > 60 || description.length > 300) {
      return res.status(400).json({ message: 'Category name must be at most 60 characters and description at most 300.' });
    }

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
    const updates = {};
    if (req.body?.name !== undefined) updates.name = String(req.body.name || '').trim();
    if (req.body?.description !== undefined) updates.description = String(req.body.description || '').trim();
    if (updates.name !== undefined && (!updates.name || updates.name.length > 60)) {
      return res.status(400).json({ message: 'Category name must be 1-60 characters.' });
    }
    if (updates.description !== undefined && updates.description.length > 300) {
      return res.status(400).json({ message: 'Category description must be at most 300 characters.' });
    }
    const CategoryMDL = Category();
    const updated = await CategoryMDL.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!updated) return res.status(404).json({ message: 'Category not found.' });
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
    res.json(users.map(toSafeUser));
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve users.' });
  }
});

app.put('/api/admin/users/:id/status', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const suspended = req.body?.suspended === true || req.body?.suspended === 'true';
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ message: 'You cannot suspend your own admin account.' });
    }
    const UserMDL = User();
    const user = await UserMDL.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // status is what blocks access; lockUntil is kept so the admin list shows the state as before.
    const lockUntil = suspended ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() : null;
    await UserMDL.findByIdAndUpdate(req.params.id, {
      status: suspended ? 'suspended' : 'active',
      lockUntil,
      failedLoginAttempts: 0,
    });
    forgetPasswordChange(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update user status.' });
  }
});

// Older builds suspended accounts only through a one-year login lock, which a password reset clears.
const migrateLegacySuspensions = async () => {
  try {
    const UserMDL = User();
    const users = await UserMDL.find({});
    const now = Date.now();
    for (const user of Array.isArray(users) ? users : []) {
      const legacySuspended = user.status !== 'suspended'
        && Number(user.failedLoginAttempts || 0) >= 99
        && user.lockUntil && new Date(user.lockUntil).getTime() > now;
      if (legacySuspended) await UserMDL.findByIdAndUpdate(user._id, { status: 'suspended' });
    }
  } catch (err) {
    console.warn('Suspension migration skipped:', err && err.message);
  }
};

// ADMIN_EMAILS (server environment only) lets the owner grant admin to their own existing
// accounts, since the published demo admin is disabled on the live site.
const promoteConfiguredAdmins = async () => {
  const emails = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => EMAIL_PATTERN.test(email) && !isBlockedDemoAccount(email));
  if (!emails.length) return;
  try {
    const UserMDL = User();
    let promoted = 0;
    for (const email of emails) {
      const user = await UserMDL.findOne({ email });
      if (user && user.role !== 'admin') {
        await UserMDL.findByIdAndUpdate(user._id, { role: 'admin' });
        forgetPasswordChange(user._id);
        promoted += 1;
      }
    }
    if (promoted) console.log(`ADMIN_EMAILS: granted admin to ${promoted} account(s).`);
  } catch (err) {
    console.warn('ADMIN_EMAILS promotion skipped:', err && err.message);
  }
};

app.delete('/api/admin/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ message: 'You cannot delete your own admin account.' });
    }
    const UserMDL = User();
    await UserMDL.deleteOne({ _id: req.params.id });
    forgetPasswordChange(req.params.id);
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
    const { taxRate, deliveryFee, commissionRate, paymentMethods } = req.body || {};
    const SystemSettingMDL = SystemSetting();
    const updates = {};

    const numberSetting = (value, label, min, max) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        throw Object.assign(new Error(`${label} must be a number from ${min} to ${max}.`), { status: 400, expose: true });
      }
      return parsed;
    };
    if (taxRate !== undefined) updates.taxRate = numberSetting(taxRate, 'Tax rate', 0, 100);
    if (commissionRate !== undefined) updates.commissionRate = numberSetting(commissionRate, 'Commission rate', 0, 100);
    if (deliveryFee !== undefined) updates.deliveryFee = numberSetting(deliveryFee, 'Delivery fee', 0, 100000);
    if (paymentMethods !== undefined) {
      const list = Array.isArray(paymentMethods) ? paymentMethods : [];
      updates.paymentMethods = list.map((method) => String(method || '').trim().slice(0, 30)).filter(Boolean).slice(0, 10);
    }

    for (const [key, value] of Object.entries(updates)) {
      await SystemSettingMDL.findOneAndUpdate({ key }, { $set: { key, value } }, { upsert: true, new: true });
    }

    res.json({ success: true });
  } catch (err) {
    if (err.expose) return res.status(err.status || 400).json({ message: err.message });
    res.status(500).json({ message: 'Failed to update system settings.' });
  }
});

// ==================== SITE APPEARANCE: HOME HERO IMAGE ====================

const HERO_IMAGE_KEY = 'heroImage';
const HERO_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const isSafeHeroImageUrl = (value) => (
  typeof value === 'string'
  && value.length <= 2048
  && !/[\s"'\\<>]/.test(value)
  && (/^https?:\/\/[^/]+/i.test(value) || /^\/uploads\/[A-Za-z0-9._-]+$/.test(value))
);

const readHeroImage = async () => {
  const setting = await SystemSetting().findOne({ key: HERO_IMAGE_KEY });
  const value = setting?.value;
  return isSafeHeroImageUrl(value) ? value : '';
};

app.get('/api/site/hero', async (req, res) => {
  try {
    res.json({ heroImage: await readHeroImage() });
  } catch (err) {
    res.json({ heroImage: '' });
  }
});

app.put('/api/admin/hero-image', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    let heroImage = typeof req.body?.heroImage === 'string' ? req.body.heroImage.trim() : '';
    const SystemSettingMDL = SystemSetting();

    if (!heroImage) {
      await SystemSettingMDL.deleteOne({ key: HERO_IMAGE_KEY });
      return res.json({ success: true, heroImage: '' });
    }

    const dataMatch = heroImage.match(/^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,(.+)$/i);
    if (dataMatch) {
      const buffer = Buffer.from(dataMatch[2], 'base64');
      if (!buffer.length) return res.status(400).json({ message: 'Empty image data.' });
      if (buffer.length > HERO_IMAGE_MAX_BYTES) return res.status(400).json({ message: 'Image must be under 8MB.' });
      const ext = dataMatch[1].split('/')[1].replace('jpeg', 'jpg');
      heroImage = await processImageUpload({ buffer, originalname: `hero.${ext}`, mimetype: dataMatch[1] });
    }

    if (!isSafeHeroImageUrl(heroImage)) {
      return res.status(400).json({ message: 'Use an uploaded image or a valid https:// image link.' });
    }

    await SystemSettingMDL.findOneAndUpdate(
      { key: HERO_IMAGE_KEY },
      { $set: { key: HERO_IMAGE_KEY, value: heroImage } },
      { upsert: true, new: true }
    );
    res.json({ success: true, heroImage });
  } catch (err) {
    if (err.expose) return res.status(err.status || 400).json({ message: err.message });
    console.error('Hero image update failed:', err && err.message);
    res.status(500).json({ message: 'Failed to update the home page picture.' });
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

// Unknown API routes get a JSON 404 instead of the website's HTML page.
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'This API endpoint does not exist.', errorCode: 'NOT_FOUND' });
});

// Serve client index.html fallback for SPA routing (must be defined last)
if (fs.existsSync(clientDist)) {
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const UPLOAD_ERROR_MESSAGES = {
  LIMIT_FILE_SIZE: 'Files must be under 8MB.',
  LIMIT_FILE_COUNT: 'Too many files in one upload.',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field in the upload.',
  LIMIT_FIELD_VALUE: 'One of the form fields is too large.',
  LIMIT_FIELD_COUNT: 'Too many form fields.',
  LIMIT_PART_COUNT: 'Too many parts in the upload.',
};

// Global error handler: internal details are logged on the server, never sent to the browser.
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  let status = Number(err?.status || err?.statusCode) || 500;
  let message = '';
  if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = UPLOAD_ERROR_MESSAGES[err.code] || 'Invalid file upload.';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    message = 'Invalid request body.';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    message = 'This request is too large.';
  } else if (err?.name === 'CastError') {
    status = 400;
    message = 'Invalid id.';
  } else if (err?.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors || {})[0]?.message || 'Some details are invalid.';
  } else if (err?.code === 11000) {
    status = 409;
    message = 'This record already exists.';
  }
  if (status < 400 || status > 599) status = 500;

  if (status >= 500) {
    console.error(`Unhandled error on ${req.method} ${req.path}:`, err?.stack || err?.message || err);
    message = 'Something went wrong on our side. Please try again.';
  } else if (!message) {
    message = err?.expose !== false && err?.message ? String(err.message).slice(0, 300) : 'The request could not be processed.';
  }

  res.status(status).json({
    success: false,
    message,
    errorCode: status >= 500 ? 'SERVER_ERROR' : (typeof err?.code === 'string' ? err.code : 'REQUEST_ERROR'),
  });
});

// Initialize database and start server (use httpServer for Socket.IO support)
// Export app and server start so tests can import without auto-listening
module.exports = {
  app,
  httpServer,
  promoteConfiguredAdmins,
  startServer: async () => {
    assertJwtSecretConfigured();
    if (isProduction()) {
      if (!process.env.MONGODB_URI) {
        console.warn('WARNING: MONGODB_URI is missing. Database connection will fail until this is set in Render Environment Variables.');
      }
    }
    await connectDb();
    await reconcileBusinessRatings();
    await migrateLegacySuspensions();
    await promoteConfiguredAdmins();
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
