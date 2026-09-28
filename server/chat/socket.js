const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/generateToken');
const { User } = require('../db');
const { loadConversationForUser, sid } = require('./service');

/**
 * Attach secure conversation socket handlers.
 * onlineUsers: Map<userId, connectionCount>
 */
function registerChatSockets(io, onlineUsers) {
  // Strengthen auth: prefer verified JWT; reject chat joins without identity.
  io.use((socket, next) => {
    if (socket.userId) return next();
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next();
    try {
      const decoded = jwt.verify(token, getJwtSecret());
      socket.userId = decoded.id || decoded.userId || null;
      socket.userRole = decoded.role || null;
    } catch (_) {
      socket.userId = null;
      socket.userRole = null;
    }
    return next();
  });

  io.on('connection', (socket) => {
    if (socket.userId) {
      // Update lastSeen on connect
      const UserMDL = User();
      UserMDL.findByIdAndUpdate(sid(socket.userId), { lastSeen: new Date().toISOString() }).catch(() => {});
    }

    socket.on('chat:join', async (payload = {}, ack) => {
      const respond = typeof ack === 'function' ? ack : () => {};
      try {
        if (!socket.userId) {
          respond({ ok: false, message: 'Authentication required.' });
          return;
        }
        const conversationId = sid(payload.conversationId);
        if (!conversationId) {
          respond({ ok: false, message: 'conversationId required.' });
          return;
        }

        const user = { id: socket.userId, userId: socket.userId, role: socket.userRole };
        const result = await loadConversationForUser(user, conversationId);
        if (!result.ok) {
          respond({ ok: false, message: result.message, status: result.status });
          return;
        }

        // Leave previous conversation rooms for this socket (except user/role rooms)
        for (const room of socket.rooms) {
          if (String(room).startsWith('conversation:')) {
            socket.leave(room);
          }
        }

        const room = `conversation:${conversationId}`;
        socket.join(room);
        socket.activeConversationId = conversationId;
        respond({ ok: true, room });
      } catch (error) {
        respond({ ok: false, message: 'Could not join conversation.' });
      }
    });

    socket.on('chat:leave', (payload = {}) => {
      const conversationId = sid(payload.conversationId || socket.activeConversationId);
      if (conversationId) socket.leave(`conversation:${conversationId}`);
      socket.activeConversationId = null;
    });

    socket.on('chat:typing', async (payload = {}) => {
      try {
        if (!socket.userId) return;
        const conversationId = sid(payload.conversationId);
        if (!conversationId) return;

        const user = { id: socket.userId, userId: socket.userId, role: socket.userRole };
        const result = await loadConversationForUser(user, conversationId);
        if (!result.ok) return;

        socket.to(`conversation:${conversationId}`).emit('chat:typing', {
          conversationId,
          userId: sid(socket.userId),
          role: socket.userRole,
          isTyping: Boolean(payload.isTyping),
        });
      } catch (_) {
        // ignore
      }
    });

    socket.on('disconnect', () => {
      if (!socket.userId) return;
      const UserMDL = User();
      UserMDL.findByIdAndUpdate(sid(socket.userId), { lastSeen: new Date().toISOString() }).catch(() => {});
    });
  });
}

module.exports = { registerChatSockets };
