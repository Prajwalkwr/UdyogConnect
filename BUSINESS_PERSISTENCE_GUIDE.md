# Business Persistence & Admin Management Guide

## Overview
UdyogConnect ensures that all registered businesses persist permanently in the database and can only be removed by platform administrators. This document explains how the system works and provides guidelines for managing businesses.

## Data Persistence

### Storage System
- **Production (MongoDB)**: All business data is stored in MongoDB Atlas and persists indefinitely across server restarts
- **Development (Fallback)**: If MongoDB is unavailable, businesses are stored in JSON files (`server/.data/Business.json`) and persist across restarts

### Business Registration Process
1. **Seller Registers Business**: Creates a new business profile with all required details
2. **Initial Status**: `verified: 'pending'` - Business is created but awaits admin approval
3. **Data Saved**: Business record is immediately saved to the database
4. **Persistence**: Business remains in the database even if:
   - Server is restarted
   - Terminal is closed
   - Application is redeployed
   - MongoDB connection is temporarily lost

### Business Verification States
```
pending     → Initial state after registration (awaiting admin review)
verified    → Admin has approved the business (full access granted)
approved    → Alternative approval state
rejected    → Admin has declined (seller can edit and resubmit)
suspended   → Admin has temporarily disabled the business
```

## Admin-Only Operations

### Delete Business (Permanent Removal)
**Endpoint**: `DELETE /api/businesses/:id`
**Authorization**: Admin role ONLY
**Protection**: Double-verified through middleware `requireRole(['admin'])`

#### What Gets Deleted
When an admin deletes a business, the system cascades:
- ✅ Business profile record
- ✅ All associated products
- ✅ All associated services
- ✅ All associated reviews
- ✅ All associated bookings
- ⚠️ Orders are NOT deleted (audit trail preserved)

#### Audit Logging
Every deletion is logged with:
- Admin email and ID
- Business name and ID
- Timestamp
- Deletion statistics (products, services, reviews, bookings deleted)
- Full audit trail in `AuditLog` collection

### Update Verification Status
**Endpoint**: `PUT /api/businesses/:id/verify`
**Authorization**: Admin role ONLY
**Statuses**: `pending`, `verified`, `approved`, `rejected`, `suspended`

#### Automatic Notifications
When status changes:
- Seller receives notification in their dashboard
- Real-time Socket.io event triggers notification update
- Email sent to business contact email

### Seller-Initiated Resubmission
When a seller edits a **rejected** or **suspended** business:
- Status automatically resets to `pending`
- Business goes back to admin review queue
- Previous admin decision is overridden

**NOTE**: Sellers CANNOT reset a `verified` business status. Only admins can change verification states.

## Security Features

### Authorization Middleware
```javascript
// Only admins can delete businesses
app.delete('/api/businesses/:id', authenticateToken, requireRole(['admin']), ...)

// Only admins can verify/suspend businesses
app.put('/api/businesses/:id/verify', authenticateToken, requireRole(['admin']), ...)
```

### Admin Verification Check
- Extra double-check in deletion endpoint verifies `req.user.role === 'admin'`
- Prevents unauthorized deletions even if middleware bypassed
- Security logs all attempted unauthorized access

## Verification & Monitoring

### Health Check Endpoint
**Endpoint**: `GET /api/health/status`
**Response**:
```json
{
  "status": "ok",
  "database": {
    "type": "MongoDB (Production)",
    "connected": true,
    "businessCount": 42
  },
  "message": "Database connected. Business data will PERSIST across server restarts."
}
```

### Admin Persistence Check
**Endpoint**: `GET /api/admin/businesses/persistence-check`
**Authorization**: Admin role ONLY
**Response**: Lists all businesses with verification status and persistence details

#### Usage Example
```bash
# Check if all businesses are persisted
curl -H "Authorization: Bearer {token}" \
  http://localhost:3000/api/admin/businesses/persistence-check
```

## Troubleshooting

### Problem: Business Disappeared After Restart
**Possible Causes**:
1. **MongoDB Connection Failed**: Check `MONGODB_URI` in `.env`
2. **Seller Accidentally Edited While Rejected**: Resets to `pending`
3. **Admin Deleted**: Check audit logs for deletion

**Solution**:
1. Verify MongoDB connection: `GET /api/health/status`
2. Check admin audit logs: Review who deleted the business
3. Check business status: `GET /api/admin/businesses/persistence-check`

### Problem: Seller Can't See Their Verified Business
**Possible Causes**:
1. Business verified status not properly saved
2. Frontend not fetching latest data
3. JWT token expired

**Solution**:
1. Admin verifies business status: `PUT /api/businesses/{id}/verify` with status `verified`
2. Seller refreshes browser (Ctrl+F5)
3. Check admin persistence dashboard

### Problem: Unauthorized User Deleted Business
**Prevention**:
1. All deletions require admin JWT token AND role verification
2. Non-admin deletion attempts are logged with security warnings
3. Audit logs track all deletions

**Recovery**:
- Businesses are backed up in MongoDB
- Cannot auto-recover deleted businesses (by design - permanent deletion)
- Contact MongoDB Atlas to restore from backups if needed

## Deployment Checklist

### Before Deployment
- [ ] `MONGODB_URI` is set in production `.env`
- [ ] MongoDB IP whitelist includes your server IP
- [ ] Admin account is verified and working
- [ ] Test business registration → verification → deletion flow
- [ ] Verify health check endpoint works

### Environment Variables Required
```
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/?appName=UdyogConnect
NODE_ENV=production
JWT_SECRET=your_secure_secret
```

### Post-Deployment Tests
```bash
# 1. Check database connection
GET /api/health/status

# 2. Verify admin can see all businesses
GET /api/admin/businesses/persistence-check

# 3. Create test business as seller
POST /api/businesses

# 4. Verify business persists
GET /api/businesses

# 5. Test admin deletion (get business ID first)
DELETE /api/businesses/{id}

# 6. Confirm deletion and audit log
GET /api/admin/businesses/persistence-check
```

## Best Practices

### For Admins
1. ✅ Always review audit logs before deleting businesses
2. ✅ Use persistence check dashboard to monitor data
3. ✅ Keep backups of important business data
4. ✅ Use "suspended" status instead of deletion for temporary blocks
5. ❌ Don't delete businesses without reviewing seller's details

### For Sellers
1. ✅ Provide accurate business information during registration
2. ✅ Monitor verification status in seller dashboard
3. ✅ If rejected, read feedback and resubmit with corrections
4. ✅ Once verified, business remains active indefinitely
5. ❌ Don't edit business profile to reset verification status

### For Developers
1. ✅ Always check `getIsMongo()` before assuming MongoDB
2. ✅ Use AuditLog for all admin operations
3. ✅ Verify authorization in both middleware AND endpoint logic
4. ✅ Log important business operations for debugging
5. ✅ Test both MongoDB and JSON file storage modes

## API Reference

### GET /api/health/status
Health check endpoint to verify database connection and business count.

### GET /api/admin/businesses/persistence-check
List all businesses with persistence status (admin only).

### POST /api/businesses
Create a new business (seller).

### PUT /api/businesses/:id/verify
Update business verification status (admin only).

### DELETE /api/businesses/:id
Delete business and all associated data (admin only).

## Support
For issues or questions about business persistence:
1. Check health endpoint: `/api/health/status`
2. Review admin persistence dashboard: `/api/admin/businesses/persistence-check`
3. Check browser console for errors
4. Review server logs for detailed error messages
5. Contact platform administrator

---

**Last Updated**: 2026-09-01
**System**: UdyogConnect v1.0
**Database**: MongoDB + JSON Fallback
