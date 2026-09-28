const { User, Business, Conversation, Order, Product } = require('../db');

function sid(value) {
  return String(value || '').trim();
}

async function getSellerBusiness(userId) {
  const BusinessMDL = Business();
  if (!BusinessMDL) return null;
  return BusinessMDL.findOne({ ownerId: sid(userId) });
}

async function getSellerBusinesses(userId) {
  const BusinessMDL = Business();
  if (!BusinessMDL) return [];
  const rows = await BusinessMDL.find({ ownerId: sid(userId) });
  return Array.isArray(rows) ? rows : [];
}

/**
 * Authorization for conversation access.
 * Customers: only their own conversations.
 * Sellers: only conversations for businesses they own.
 * Admins: only reported conversations (moderation).
 */
async function canAccessConversation(user, conversation, { allowReportedAdmin = true } = {}) {
  if (!user || !conversation) return { ok: false, status: 403, message: 'Forbidden.' };

  const userId = sid(user.id || user.userId);
  const role = user.role;

  if (role === 'customer') {
    if (sid(conversation.customerId) !== userId) {
      return { ok: false, status: 403, message: 'You cannot access this conversation.' };
    }
    return { ok: true, actor: 'customer', userId };
  }

  if (role === 'seller') {
    const businesses = await getSellerBusinesses(userId);
    const ownedIds = new Set(businesses.map((b) => sid(b._id)));
    if (!ownedIds.has(sid(conversation.businessId))) {
      return { ok: false, status: 403, message: 'You cannot access this conversation.' };
    }
    const business = businesses.find((b) => sid(b._id) === sid(conversation.businessId));
    return {
      ok: true,
      actor: 'business',
      userId,
      businessId: sid(conversation.businessId),
      business,
    };
  }

  if (role === 'admin' && allowReportedAdmin) {
    if (conversation.reportedBy || conversation.status === 'blocked') {
      return { ok: true, actor: 'admin', userId };
    }
    return { ok: false, status: 403, message: 'Admins may only access reported conversations.' };
  }

  return { ok: false, status: 403, message: 'Forbidden.' };
}

async function loadConversationForUser(user, conversationId) {
  const ConversationMDL = Conversation();
  const conversation = await ConversationMDL.findById(conversationId);
  if (!conversation) {
    return { ok: false, status: 404, message: 'Conversation not found.' };
  }
  const access = await canAccessConversation(user, conversation);
  if (!access.ok) return access;
  return { ok: true, conversation, access };
}

async function canAccessOrder(user, order) {
  if (!user || !order) return false;
  const userId = sid(user.id || user.userId);
  if (user.role === 'customer') return sid(order.customerId) === userId;
  if (user.role === 'seller') {
    const business = await getSellerBusiness(userId);
    return Boolean(business && sid(business._id) === sid(order.businessId));
  }
  return user.role === 'admin';
}

async function canAccessProduct(user, product, businessId) {
  if (!product) return false;
  if (sid(product.businessId) !== sid(businessId)) return false;
  return true;
}

async function resolveBusiness(businessId) {
  const BusinessMDL = Business();
  if (!BusinessMDL) return null;
  const id = sid(businessId);
  if (!id) return null;

  let business = await BusinessMDL.findById(id);
  if (business) return business;

  // Legacy/demo ids or mongo seeds that dropped fixed _ids
  if (id === 'cafe-xyz' || id === 'b1') {
    const nameMap = {
      'cafe-xyz': 'The Himalayan Café',
      b1: 'Bhoj Garden',
    };
    business = await BusinessMDL.findOne({ name: nameMap[id] });
    if (business) return business;
  }

  // Last resort: scan by stringified _id for mock/mongo id mismatches
  const all = await BusinessMDL.find({});
  business = (Array.isArray(all) ? all : []).find((row) => sid(row._id) === id) || null;
  return business;
}

module.exports = {
  sid,
  getSellerBusiness,
  getSellerBusinesses,
  canAccessConversation,
  loadConversationForUser,
  canAccessOrder,
  canAccessProduct,
  resolveBusiness,
  User,
  Business,
  Conversation,
  Order,
  Product,
};
