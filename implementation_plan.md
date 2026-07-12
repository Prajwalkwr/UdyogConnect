# Implementation Plan - Currency Update & Triple Dashboard Authentication System

This plan outlines the changes required to change the currency representation from dollars ($) to Rupees (Rs/रु) across the entire application and implement a secure, fully featured 3-Role (Customer, Business Owner, Admin) onboarding, verification, and dashboard redirection system.

## default Credentials & Accounts

The system will seed and support the following default accounts for testing:
1. **Admin Account** (Direct Database Creation only, no Sign Up):
   - **Email**: `admin@marketplace.com`
   - **Password**: `password`
2. **Customer Account** (Sign Up available):
   - **Email**: `customer@udyog.np`
   - **Password**: `password`
3. **Business Owner (Seller) Account** (Sign Up available):
   - **Email**: `seller@udyog.np`
   - **Password**: `password`

---

## User Review Required

> [!IMPORTANT]
> - Existing mock users in `.data/User.json` will be updated to support the verification and lockout schemas.
> - The business owner onboarding flow will restrict dashboard access until the admin updates their status to `Approved`.
> - All prices will switch to Rupees (`Rs.` / `रु`) with no division conversion.

---

## Proposed Changes

### Database Layer

#### [MODIFY] [db.js](file:///c:/Users/prajw/OneDrive/Desktop/UdyogConnect/server/db.js) (and root [db.js](file:///c:/Users/prajw/OneDrive/Desktop/UdyogConnect/db.js))
- Update user schema fields:
  - `isVerified`: default `false` (set `true` for seed users)
  - `verificationOtp`: string
  - `failedLoginAttempts`: number, default `0`
  - `lockUntil`: date string, default `null`
  - `resetOtp`: string
- Update business schema fields:
  - `verified`: enum `['pending', 'approved', 'rejected']`, default `'pending'`
  - `logoUrl`: string
  - `coverUrl`: string
  - `registrationNumber`: string
  - `panVatNumber`: string
  - `deliveryAvailable`: boolean, default `true`
  - `visitorsCount`: number, default `0`
  - `commissionRate`: number, default `10` (default 10% commission)
- Initialize seed data:
  - Update `admin@marketplace.com` (currently `admin@udyog.np`, change email and verify fields).
  - Update other seed users to have `isVerified: true`.

---

### Backend API Layer

#### [MODIFY] [server.js](file:///c:/Users/prajw/OneDrive/Desktop/UdyogConnect/server/server.js) (and root [server.js](file:///c:/Users/prajw/OneDrive/Desktop/UdyogConnect/server.js))
- **Role Registration `/api/auth/register`**:
  - Customer: Name, Email, Phone, Password, Confirm Password.
  - Business Owner: Name, Email, Phone, Password. (They don't fill business details here).
  - Set `isVerified: false` and generate `verificationOtp`.
- **Role Login `/api/auth/login`**:
  - Support login by Email OR Phone number + Password.
  - Check account lockout (`failedLoginAttempts` / `lockUntil`).
  - Block login if `isVerified === false`.
- **Verification `/api/auth/verify` & Forgot Password `/api/auth/forgot-password` / `/api/auth/reset-password`**:
  - Verification OTP checks.
  - Forgot/reset password logic.
- **Onboard Business `/api/businesses`**:
  - Create a business listing with status `pending` for the logged-in Business Owner.
  - Fields: `name`, `category`, `location` (Address), `description`, `imageUrl` (Logo), `coverUrl`, `registrationNumber`, `panVatNumber`, `hours`, `deliveryAvailable`.
- **Admin Verification `/api/businesses/:id/verify`**:
  - Admin approves (`approved`), rejects (`rejected`), or suspends a business listing.
- **Commission & Tax Settings `/api/admin/settings`**:
  - Add API endpoints to set system settings: commission rates, tax rates (default 13%), delivery charges (default 70).

---

### Frontend Components

#### [MODIFY] [AuthModal.jsx](file:///c:/Users/prajw/OneDrive/Desktop/UdyogConnect/client/src/components/AuthModal.jsx) (and root copy)
- Update login inputs to label "Email or Phone".
- Adjust Registration:
  - Customer registration: Name, Email, Phone, Password, Confirm Password.
  - Business Owner registration: Name, Email, Phone, Password.
- Implement UI for:
  - Account Verification OTP screen (triggered after signup or when logging in unverified).
  - Forgot Password/Reset flow with OTP.
  - Simple math CAPTCHA after 2 failed attempts.
  - "Remember Me" checkbox on login.

#### [MODIFY] [Navbar.jsx](file:///c:/Users/prajw/OneDrive/Desktop/UdyogConnect/client/src/components/Navbar.jsx) (and root copy)
- Change Currency text options to `NPR` and `Rs` (remove USD references).

#### [MODIFY] [App.jsx](file:///c:/Users/prajw/OneDrive/Desktop/UdyogConnect/client/src/App.jsx) (and root copy)
- Default currency to `NPR`. Update navigation paths to handle dashboards dynamically based on approval status.

#### [MODIFY] [Marketplace.jsx](file:///c:/Users/prajw/OneDrive/Desktop/UdyogConnect/client/src/components/Marketplace.jsx) & [DetailsModal.jsx](file:///c:/Users/prajw/OneDrive/Desktop/UdyogConnect/client/src/components/DetailsModal.jsx) (and root copies)
- Format prices in `रु` or `Rs.` with no conversion.

#### [MODIFY] [CartCheckout.jsx](file:///c:/Users/prajw/OneDrive/Desktop/UdyogConnect/client/src/components/CartCheckout.jsx) (and root copy)
- Format checkout charges using system config values (tax %, delivery fee).

#### [MODIFY] [CustomerDashboard.jsx](file:///c:/Users/prajw/OneDrive/Desktop/UdyogConnect/client/src/components/CustomerDashboard.jsx) (and root copy)
- Reorganize sections matching:
  - **Home**: Browse/Search, Categories, Featured.
  - **Orders**: Current, History, Track.
  - **Wishlist**: Saved products, Favorite businesses.
  - **Profile**: Edit address/payment, Change password.
  - **Reviews**: Write and view reviews.

#### [MODIFY] [SellerDashboard.jsx](file:///c:/Users/prajw/OneDrive/Desktop/UdyogConnect/client/src/components/SellerDashboard.jsx) (and root copy)
- Onboarding mode: Show if business status is not `approved`. Displays Registration Form with logo/cover file uploads and Reg/PAN inputs.
- Verification Pending / Rejected modes: Show message if pending or rejected.
- Seller dashboard workspace (only for Approved owners):
  - **Dashboard**: Total Sales, Total Orders, Revenue, Visitors.
  - **Products/Services**: Add, Edit, Delete, Update Stock, Categories.
  - **Orders**: View, Accept, Reject, Mark Ready, Mark Completed.
  - **Customers**: List, Messages.
  - **Reviews**: View Ratings, Reply to Reviews.
  - **Discounts**: Coupons, Flash Sales, Promotions.
  - **Reports**: Daily, Monthly, Best Selling.
  - **Profile**: Edit Details, Hours, Contact, Password.

#### [MODIFY] [AdminDashboard.jsx](file:///c:/Users/prajw/OneDrive/Desktop/UdyogConnect/client/src/components/AdminDashboard.jsx) (and root copy)
- Admin dashboard workspace:
  - **Dashboard**: Total Users, Total Businesses, Total Orders, Revenue, Pending Approvals.
  - **User Management**: View Customers, Suspend Customers, Delete Accounts.
  - **Business Management**: Approve, Reject, Suspend, Verify Documents.
  - **Category Management**: Add, Edit, Delete.
  - **Order Management**: Monitor, Resolve Disputes, Process Refunds.
  - **Payment Management**: Transactions, Commission Settings, Refund Requests.
  - **Reports**: Sales, Business, User reports.
  - **Content Management**: Banners, Featured, Announcements.
  - **Settings**: System configuration, Tax, Delivery charges, Payment methods.

---

## Verification Plan

### Automated Tests
- Run `npm test` or `vitest run` to verify core functions.

### Manual Verification
- Test all three logins with default credentials.
- Test Business Owner onboarding and verify that dashboard is locked until Admin approves.
- Test Admin dashboard tools (verify documents, adjust commission/tax, monitor orders, manage categories).
