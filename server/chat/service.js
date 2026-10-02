const {
  User,
  Business,
  Conversation,
  Order,
  Product,
  Message,
  Notification,
} = require('../db');
const {
  sid,
  getSellerBusiness,
  getSellerBusinesses,
  canAccessConversation,
  loadConversationForUser,
  canAccessOrder,
  resolveBusiness,
} = require('./access');

const USER_MESSAGE_TYPES = new Set(['text', 'image', 'file', 'product', 'order']);
const MAX_MESSAGE_LENGTH = 4000;

function previewText(messageType, message) {
  if (messageType === 'image') return '📷 Image';
  if (messageType === 'file') return '📎 File';
  if (messageType === 'product') return '📦 Product';
  if (messageType === 'order') return '🧾 Order';
  if (messageType === 'system') return message || 'System update';
  const text = String(message || '').trim();
  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

async function findConversationPair(customerId, businessId) {
  const ConversationMDL = Conversation();
  return ConversationMDL.findOne({
    customerId: sid(customerId),
    businessId: sid(businessId),
  });
}

async function getOrCreateConversation(customerId, businessId) {
  const existing = await findConversationPair(customerId, businessId);
  if (existing) {
    if (existing.status === 'archived') {
      const ConversationMDL = Conversation();
      return ConversationMDL.findByIdAndUpdate(existing._id, { status: 'active' }, { new: true }) || existing;
    }
    return existing;
  }

  const ConversationMDL = Conversation();
  try {
    return await ConversationMDL.create({
      customerId: sid(customerId),
      businessId: sid(businessId),
      lastMessage: '',
      lastMessageAt: null,
      customerUnreadCount: 0,
      businessUnreadCount: 0,
      status: 'active',
    });
  } catch (error) {
    // Unique index race: another request created it first.
    const raced = await findConversationPair(customerId, businessId);
    if (raced) return raced;
    throw error;
  }
}

async function enrichConversation(conversation, viewerRole, onlineUsers) {
  const UserMDL = User();
  const BusinessMDL = Business();
  const customer = await UserMDL.findById(conversation.customerId);
  const business = await BusinessMDL.findById(conversation.businessId);
  const ownerOnline = business?.ownerId ? onlineUsers?.has?.(sid(business.ownerId)) : false;
  const customerOnline = onlineUsers?.has?.(sid(conversation.customerId));

  return {
    _id: conversation._id,
    customerId: conversation.customerId,
    businessId: conversation.businessId,
    lastMessage: conversation.lastMessage || '',
    lastMessageAt: conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt,
    customerUnreadCount: Number(conversation.customerUnreadCount || 0),
    businessUnreadCount: Number(conversation.businessUnreadCount || 0),
    status: conversation.status || 'active',
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    unreadCount: viewerRole === 'customer'
      ? Number(conversation.customerUnreadCount || 0)
      : Number(conversation.businessUnreadCount || 0),
    customer: customer ? {
      _id: customer._id,
      name: customer.name,
      profilePicture: customer.profilePicture || '',
      lastSeen: customer.lastSeen || null,
      online: Boolean(customerOnline),
    } : { _id: conversation.customerId, name: 'Customer', profilePicture: '', online: false },
    business: business ? {
      _id: business._id,
      name: business.name,
      imageUrl: business.imageUrl || business.logoUrl || '',
      category: business.category || '',
      subcategory: business.subcategory || '',
      verified: business.verified === 'verified' || business.approvalStatus === 'approved' || business.verified === true,
      ownerId: business.ownerId,
      lastSeen: null,
      online: Boolean(ownerOnline),
    } : { _id: conversation.businessId, name: 'Business', imageUrl: '', category: '', verified: false, online: false },
  };
}

async function listConversationsForUser(user, { q = '', status = 'active' } = {}, onlineUsers) {
  const ConversationMDL = Conversation();
  const userId = sid(user.id || user.userId);
  let rows = [];

  if (user.role === 'customer') {
    rows = await ConversationMDL.find({ customerId: userId });
  } else if (user.role === 'seller') {
    const businesses = await getSellerBusinesses(userId);
    if (!businesses.length) return [];
    const ownedIds = new Set(businesses.map((b) => sid(b._id)));
    const all = await ConversationMDL.find({});
    rows = all.filter((c) => ownedIds.has(sid(c.businessId)));
  } else if (user.role === 'admin') {
    rows = (await ConversationMDL.find({})).filter((c) => c.reportedBy || c.status === 'blocked');
  } else {
    return [];
  }

  rows = rows.filter((c) => {
    if (status === 'all') return true;
    if (status === 'archived') {
      return user.role === 'customer' ? c.customerArchived : c.businessArchived || c.status === 'archived';
    }
    if (user.role === 'customer' && c.customerArchived) return false;
    if (user.role === 'seller' && c.businessArchived) return false;
    return (c.status || 'active') !== 'archived';
  });

  rows.sort((a, b) => new Date(b.lastMessageAt || b.updatedAt || 0) - new Date(a.lastMessageAt || a.updatedAt || 0));

  const enriched = [];
  for (const row of rows) {
    const item = await enrichConversation(row, user.role === 'seller' ? 'business' : user.role, onlineUsers);
    if (q) {
      const needle = q.toLowerCase();
      const hay = `${item.customer?.name || ''} ${item.business?.name || ''} ${item.lastMessage || ''}`.toLowerCase();
      if (!hay.includes(needle)) continue;
    }
    enriched.push(item);
  }
  return enriched;
}

async function listMessages(conversationId, { before, limit = 40 } = {}) {
  const MessageMDL = Message();
  const all = await MessageMDL.find({ conversationId: sid(conversationId) });
  let sorted = all.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (before) {
    const beforeTime = new Date(before).getTime();
    sorted = sorted.filter((m) => new Date(m.createdAt).getTime() < beforeTime);
  }
  const slice = sorted.slice(Math.max(0, sorted.length - limit));
  return {
    messages: slice,
    hasMore: sorted.length > limit,
  };
}

async function createMessage({
  user,
  conversation,
  access,
  message = '',
  messageType = 'text',
  attachmentUrl = '',
  productId = '',
  orderId = '',
  clientMessageId = '',
  io,
  onlineUsers,
}) {
  if (conversation.status === 'blocked') {
    return { ok: false, status: 403, message: 'This conversation is blocked.' };
  }

  const MessageMDL = Message();
  const ConversationMDL = Conversation();
  const NotificationMDL = Notification();
  const UserMDL = User();
  const BusinessMDL = Business();

  const cleanClientId = sid(clientMessageId);
  if (cleanClientId) {
    const existing = (await MessageMDL.find({ conversationId: sid(conversation._id) }))
      .find((m) => sid(m.clientMessageId) === cleanClientId);
    if (existing) {
      return { ok: true, message: existing, duplicate: true };
    }
  }

  let type = messageType || 'text';
  if (!USER_MESSAGE_TYPES.has(type)) {
    return { ok: false, status: 400, message: 'Unsupported message type.' };
  }
  let body = String(message || '').trim();
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, status: 400, message: `Messages can be at most ${MAX_MESSAGE_LENGTH} characters.` };
  }
  let attach = sid(attachmentUrl);
  let safeProductId = '';
  let safeOrderId = '';

  if (type === 'product') {
    const ProductMDL = Product();
    const product = await ProductMDL.findById(sid(productId));
    if (!product || sid(product.businessId) !== sid(conversation.businessId)) {
      return { ok: false, status: 403, message: 'Invalid product for this conversation.' };
    }
    safeProductId = sid(product._id);
    body = body || product.name;
  }

  if (type === 'order') {
    const OrderMDL = Order();
    const order = await OrderMDL.findById(sid(orderId));
    if (!order || !(await canAccessOrder(user, order))) {
      return { ok: false, status: 403, message: 'Invalid order for this conversation.' };
    }
    if (sid(order.businessId) !== sid(conversation.businessId) || sid(order.customerId) !== sid(conversation.customerId)) {
      return { ok: false, status: 403, message: 'Order does not belong to this conversation.' };
    }
    safeOrderId = sid(order._id);
    body = body || `Order #${safeOrderId}`;
  }

  if (type === 'image' || type === 'file') {
    if (!attach) return { ok: false, status: 400, message: 'Attachment URL required.' };
  }

  if (type === 'text' && !body) {
    return { ok: false, status: 400, message: 'Message cannot be empty.' };
  }

  const isCustomer = access.actor === 'customer';
  const business = await BusinessMDL.findById(conversation.businessId);
  const receiverId = isCustomer ? sid(business?.ownerId) : sid(conversation.customerId);
  if (!receiverId) {
    return { ok: false, status: 400, message: 'Unable to resolve message recipient.' };
  }

  const senderId = sid(user.id || user.userId);
  const senderRole = isCustomer ? 'customer' : 'seller';

  let saved;
  try {
    saved = await MessageMDL.create({
      conversationId: sid(conversation._id),
      senderId,
      senderRole,
      receiverId,
      message: body,
      messageType: type,
      attachmentUrl: attach,
      productId: safeProductId,
      orderId: safeOrderId,
      clientMessageId: cleanClientId,
      isRead: false,
      readAt: null,
      deliveredAt: onlineUsers?.has?.(receiverId) ? new Date().toISOString() : null,
    });
  } catch (error) {
    if (cleanClientId) {
      const raced = (await MessageMDL.find({ conversationId: sid(conversation._id) }))
        .find((m) => sid(m.clientMessageId) === cleanClientId);
      if (raced) return { ok: true, message: raced, duplicate: true };
    }
    throw error;
  }

  const preview = previewText(type, body);
  const unreadUpdate = isCustomer
    ? {
        lastMessage: preview,
        lastMessageAt: saved.createdAt,
        businessUnreadCount: Number(conversation.businessUnreadCount || 0) + 1,
        status: 'active',
        customerArchived: false,
        businessArchived: false,
      }
    : {
        lastMessage: preview,
        lastMessageAt: saved.createdAt,
        customerUnreadCount: Number(conversation.customerUnreadCount || 0) + 1,
        status: 'active',
        customerArchived: false,
        businessArchived: false,
      };

  await ConversationMDL.findByIdAndUpdate(conversation._id, unreadUpdate);

  const senderName = isCustomer
    ? ((await UserMDL.findById(senderId))?.name || 'Customer')
    : (business?.name || 'Business');

  try {
    await NotificationMDL.create({
      userId: receiverId,
      title: `New message from ${senderName}`,
      message: preview,
      type: 'chat',
      read: false,
      conversationId: sid(conversation._id),
      link: isCustomer ? `/business?tab=messages&c=${conversation._id}` : `/customer/messages?c=${conversation._id}`,
    });
  } catch (_) {
    // Non-fatal
  }

  if (io) {
    const room = `conversation:${sid(conversation._id)}`;
    io.to(room).emit('chat:message', saved);
    io.to(`user:${receiverId}`).emit('chat:message', saved);
    io.to(`user:${receiverId}`).emit('new_notification', { type: 'chat', conversationId: sid(conversation._id) });
    io.to(`user:${receiverId}`).emit('chat:unread', {
      conversationId: sid(conversation._id),
      unreadDelta: 1,
    });
    if (saved.deliveredAt) {
      io.to(room).emit('chat:delivered', { messageId: saved._id, conversationId: sid(conversation._id) });
    }
  }

  return { ok: true, message: saved };
}

async function markConversationRead(user, conversation, access, io) {
  const MessageMDL = Message();
  const ConversationMDL = Conversation();
  const userId = sid(user.id || user.userId);
  const all = await MessageMDL.find({ conversationId: sid(conversation._id) });
  const now = new Date().toISOString();
  const unread = all.filter((m) => sid(m.receiverId) === userId && !m.isRead);

  for (const msg of unread) {
    await MessageMDL.findByIdAndUpdate(msg._id, { isRead: true, readAt: now });
  }

  const patch = access.actor === 'customer'
    ? { customerUnreadCount: 0 }
    : { businessUnreadCount: 0 };
  await ConversationMDL.findByIdAndUpdate(conversation._id, patch);

  if (io && unread.length) {
    const room = `conversation:${sid(conversation._id)}`;
    io.to(room).emit('chat:read', {
      conversationId: sid(conversation._id),
      readerId: userId,
      messageIds: unread.map((m) => m._id),
      readAt: now,
    });
  }

  return { ok: true, marked: unread.length };
}

async function getUnreadTotals(user) {
  const ConversationMDL = Conversation();
  const userId = sid(user.id || user.userId);
  let rows = [];
  if (user.role === 'customer') {
    rows = await ConversationMDL.find({ customerId: userId });
    return rows.reduce((sum, c) => sum + Number(c.customerUnreadCount || 0), 0);
  }
  if (user.role === 'seller') {
    const businesses = await getSellerBusinesses(userId);
    if (!businesses.length) return 0;
    const ownedIds = new Set(businesses.map((b) => sid(b._id)));
    const all = await ConversationMDL.find({});
    rows = all.filter((c) => ownedIds.has(sid(c.businessId)));
    return rows.reduce((sum, c) => sum + Number(c.businessUnreadCount || 0), 0);
  }
  return 0;
}

module.exports = {
  previewText,
  getOrCreateConversation,
  findConversationPair,
  enrichConversation,
  listConversationsForUser,
  listMessages,
  createMessage,
  markConversationRead,
  getUnreadTotals,
  loadConversationForUser,
  canAccessConversation,
  resolveBusiness,
  getSellerBusiness,
  getSellerBusinesses,
  sid,
};
