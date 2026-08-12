# UdyogConnect — Local Nepal Marketplace

Quick guide: run locally, run tests, build, and deploy.

Prerequisites
- Node.js (16+ recommended)
- npm

Environment
Create a `.env` at project root or within `server/` with these keys for full features:

```
MONGODB_URI=your_mongo_uri   # optional — if omitted, local JSON DB used
JWT_SECRET=your_jwt_secret
STRIPE_SECRET_KEY=sk_test_... # optional — for test card payments
CLIENT_URL=http://localhost:5173

# (Optional) Cloudinary for image hosting
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_UPLOAD_PRESET=optional_unsigned_preset_name

Direct client uploads (recommended)
- You can enable direct uploads from browser to Cloudinary for faster uploads. The server exposes `/api/cloudinary/sign` that returns a timestamp/signature. The client helper `uploadDirectToCloudinary()` (in `client/src/utils/mediaUpload.js`) uses this to upload files directly and returns a hosted URL.
- If direct upload is enabled, the client will send image URLs (`logoUrl`, `coverUrl`, `documentUrl`, `imageUrl`) to the server; the server stores those URLs in the DB.
```

Run locally (development)

```bash
# from project root
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

Run tests

```bash
npm test
```

Build production client

```bash
cd client
npm run build
# serve the static build from any static host or use `npm run preview` from root
```

Docker (build and run)

```bash
# Build image
docker build -t udyogconnect:latest .

# Run with environment variables
docker run -p 3000:3000 -e JWT_SECRET=your_jwt -e MONGODB_URI=your_mongo_uri -e STRIPE_SECRET_KEY=sk_test_xxx udyogconnect:latest
```

Or use `docker-compose` (reads `.env` in project root):

```bash
docker-compose up --build -d
```

Notes
- The Dockerfile uses a multi-stage build: it builds the React client and copies `client/dist` into the server image so Express can serve the static files.
- Ensure you set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as environment variables in production for secure payments.
Deployment notes
- The repository contains a Node/Express backend and a Vite React frontend.
- For simple deploys you can host backend on a server (Heroku, Render, DigitalOcean App Platform) and frontend on Vercel/Netlify — or host both together on a VPS.
- Recommended production steps:
  1. Build frontend: `cd client && npm run build`
  2. Serve the `client/dist` statics from Express (or configure a reverse proxy).
  3. Set environment variables on the host (JWT_SECRET, MONGODB_URI, STRIPE_SECRET_KEY).
  4. Add a Stripe webhook endpoint in `server.js` to confirm payments server-side for production.

Local demo accounts
- `admin@udyog.np` / `password`
- `seller@udyog.np` / `password`
- `customer@udyog.np` / `password`

Next recommended improvements
- Add Stripe webhooks for secure payment confirmation.
- Integrate email/SMS for OTP and admin notifications.
- Harden authentication, rate limits, and add role audits for production.

Enjoy building UdyogConnect!
