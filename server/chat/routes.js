const express = require('express');
const multer = require('multer');
const { authenticateToken } = require('../middleware/authMiddleware');
const { AuditLog } = require('../db');
const {
  sid,
  getOrCreateConversation,
  enrichConversation,
  listConversationsForUser,
  listMessages,
  createMessage,
  markConversationRead,
  getUnreadTotals,
  loadConversationForUser,
  resolveBusiness,
} = require('./service');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function createConversationRoutes({ processImageUpload } = {}) {
  const router = express.Router();

  const getOnlineUsers = (req) => req.app.get('onlineUsers') || new Map();
  const getIo = (req) => req.app.get('io');

  // POST /api/conversations  { businessId } — customer starts/opens chat with a business
  router.post('/', authenticateToken, async (req, res) => {
    try {
      if (req.user.role !== 'customer') {
        return res.status(403).json({ message: 'Only customers can start a business chat.' });
      }

      // Never trust customerId from body — always use authenticated user.
      const customerId = sid(req.user.id || req.user.userId);
      const businessId = sid(req.body?.businessId);
      if (!businessId) return res.status(400).json({ message: 'businessId is required.' });

      const business = await resolveBusiness(businessId);
      if (!business) return res.status(404).json({ message: 'Business not found.' });

      const conversation = await getOrCreateConversation(customerId, business._id);
      const enriched = await enrichConversation(conversation, 'customer', getOnlineUsers(req));
      return res.status(200).json({ conversation: enriched });
    } catch (error) {
      console.error('Create conversation failed:', error);
      return res.status(500).json({ message: 'Could not open conversation.' });
    }
  });

  // GET /api/conversations
  router.get('/', authenticateToken, async (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const status = String(req.query.status || 'active');
      const list = await listConversationsForUser(req.user, { q, status }, getOnlineUsers(req));
      const unreadTotal = await getUnreadTotals(req.user);
      return res.json({ conversations: list, unreadTotal });
    } catch (error) {
      console.error('List conversations failed:', error);
      return res.status(500).json({ message: 'Could not load conversations.' });
    }
  });

  // GET /api/conversations/unread-count
  router.get('/unread-count', authenticateToken, async (req, res) => {
    try {
      const unreadTotal = await getUnreadTotals(req.user);
      return res.json({ unreadTotal });
    } catch (error) {
      return res.status(500).json({ message: 'Could not load unread count.' });
    }
  });

  // Admin: view reported conversation (audited) — must be before :conversationId
  router.get('/admin/reported/:conversationId', authenticateToken, async (req, res) => {
    try {
      if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only.' });
      const result = await loadConversationForUser(req.user, req.params.conversationId);
      if (!result.ok) return res.status(result.status).json({ message: result.message });

      try {
        const AuditMDL = AuditLog();
        await AuditMDL.create({
          userId: sid(req.user.id || req.user.userId),
          action: 'admin_view_reported_conversation',
          details: `Admin viewed reported conversation: ${req.params.conversationId}. Reason: ${result.conversation.reportReason || 'n/a'}`,
        });
      } catch (_) {}

      const payload = await listMessages(result.conversation._id, { limit: 50 });
      return res.json({ conversation: result.conversation, ...payload });
    } catch (error) {
      return res.status(500).json({ message: 'Could not load reported conversation.' });
    }
  });

  // GET /api/conversations/:conversationId
  router.get('/:conversationId', authenticateToken, async (req, res) => {
    try {
      const result = await loadConversationForUser(req.user, req.params.conversationId);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      const enriched = await enrichConversation(
        result.conversation,
        result.access.actor === 'business' ? 'business' : result.access.actor,
        getOnlineUsers(req)
      );
      return res.json({ conversation: enriched });
    } catch (error) {
      return res.status(500).json({ message: 'Could not load conversation.' });
    }
  });

  // GET /api/conversations/:conversationId/messages?before=&limit=
  router.get('/:conversationId/messages', authenticateToken, async (req, res) => {
    try {
      const result = await loadConversationForUser(req.user, req.params.conversationId);
      if (!result.ok) return res.status(result.status).json({ message: result.message });

      const limit = Math.min(50, Math.max(10, Number(req.query.limit) || 40));
      const before = req.query.before || null;
      const payload = await listMessages(result.conversation._id, { before, limit });
      return res.json(payload);
    } catch (error) {
      console.error('List messages failed:', error);
      return res.status(500).json({ message: 'Could not load messages.' });
    }
  });

  // POST /api/conversations/:conversationId/messages
  router.post(
    '/:conversationId/messages',
    authenticateToken,
    upload.single('attachment'),
    async (req, res) => {
      try {
        const result = await loadConversationForUser(req.user, req.params.conversationId);
        if (!result.ok) return res.status(result.status).json({ message: result.message });

        let attachmentUrl = sid(req.body?.attachmentUrl);
        let messageType = sid(req.body?.messageType) || 'text';

        if (req.file) {
          const mime = String(req.file.mimetype || '');
          if (!mime.startsWith('image/') && !mime.startsWith('application/pdf')) {
            return res.status(400).json({ message: 'Only images or PDF files are allowed.' });
          }
          if (typeof processImageUpload === 'function') {
            attachmentUrl = await processImageUpload(req.file);
          } else {
            attachmentUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
          }
          messageType = mime.startsWith('image/') ? 'image' : 'file';
        }

        const created = await createMessage({
          user: req.user,
          conversation: result.conversation,
          access: result.access,
          message: req.body?.message || '',
          messageType,
          attachmentUrl,
          productId: req.body?.productId || '',
          orderId: req.body?.orderId || '',
          clientMessageId: req.body?.clientMessageId || req.headers['x-idempotency-key'] || '',
          io: getIo(req),
          onlineUsers: getOnlineUsers(req),
        });

        if (!created.ok) return res.status(created.status).json({ message: created.message });
        return res.status(created.duplicate ? 200 : 201).json({ message: created.message, duplicate: Boolean(created.duplicate) });
      } catch (error) {
        console.error('Send message failed:', error);
        return res.status(500).json({ message: 'Could not send message.' });
      }
    }
  );

  // PATCH /api/conversations/:conversationId/read
  router.patch('/:conversationId/read', authenticateToken, async (req, res) => {
    try {
      const result = await loadConversationForUser(req.user, req.params.conversationId);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      const marked = await markConversationRead(req.user, result.conversation, result.access, getIo(req));
      return res.json(marked);
    } catch (error) {
      return res.status(500).json({ message: 'Could not mark messages as read.' });
    }
  });

  // PATCH /api/conversations/:conversationId/archive
  router.patch('/:conversationId/archive', authenticateToken, async (req, res) => {
    try {
      const result = await loadConversationForUser(req.user, req.params.conversationId);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      const { Conversation } = require('../db');
      const ConversationMDL = Conversation();
      const archive = req.body?.archive !== false;
      const patch = result.access.actor === 'customer'
        ? { customerArchived: archive }
        : { businessArchived: archive };
      const updated = await ConversationMDL.findByIdAndUpdate(result.conversation._id, patch, { new: true });
      return res.json({ conversation: updated });
    } catch (error) {
      return res.status(500).json({ message: 'Could not update conversation.' });
    }
  });

  // POST /api/conversations/:conversationId/block
  router.post('/:conversationId/block', authenticateToken, async (req, res) => {
    try {
      const result = await loadConversationForUser(req.user, req.params.conversationId);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      const { Conversation } = require('../db');
      const ConversationMDL = Conversation();
      const updated = await ConversationMDL.findByIdAndUpdate(
        result.conversation._id,
        { status: 'blocked', blockedBy: sid(req.user.id || req.user.userId) },
        { new: true }
      );
      return res.json({ conversation: updated });
    } catch (error) {
      return res.status(500).json({ message: 'Could not block conversation.' });
    }
  });

  // POST /api/conversations/:conversationId/report
  router.post('/:conversationId/report', authenticateToken, async (req, res) => {
    try {
      const result = await loadConversationForUser(req.user, req.params.conversationId);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      const reason = String(req.body?.reason || '').trim().slice(0, 500);
      if (!reason) return res.status(400).json({ message: 'Report reason is required.' });

      const { Conversation } = require('../db');
      const ConversationMDL = Conversation();
      const reporterId = sid(req.user.id || req.user.userId);
      const updated = await ConversationMDL.findByIdAndUpdate(
        result.conversation._id,
        {
          reportedBy: reporterId,
          reportReason: reason,
          reportedAt: new Date().toISOString(),
        },
        { new: true }
      );

      try {
        const AuditMDL = AuditLog();
        await AuditMDL.create({
          userId: reporterId,
          action: 'conversation_report',
          details: `Conversation ${result.conversation._id}: ${reason}`,
        });
      } catch (_) {}

      return res.json({ conversation: updated });
    } catch (error) {
      return res.status(500).json({ message: 'Could not report conversation.' });
    }
  });

  return router;
}

module.exports = { createConversationRoutes };
