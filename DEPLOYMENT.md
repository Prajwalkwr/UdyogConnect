Overview

This project has a React + Vite frontend in `client/` and an Express backend in `server/` with a file-based fallback DB or MongoDB via `MONGODB_URI`.

Recommended deployment:
- Frontend: Vercel (connect GitHub repo, set project root to `/client`)
- Backend: Render or Railway (connect GitHub repo, set deploy root to `/server`)
- Database: MongoDB Atlas free tier (set `MONGODB_URI`)

Frontend (Vercel)
1. Sign in to Vercel and select "Import Project" → connect GitHub and choose `Prajwalkwr/UdyogConnect`.
2. Set the Root Directory to `client`.
3. Build Command: `npm run build` (or `vite build`).
4. Output Directory: `dist`.
5. Environment Variables (in Vercel project settings):
   - `VITE_API_URL` = `https://<your-backend-url>` (set after backend deployment)
6. Deploy. Vercel will provide a public URL like `https://your-project.vercel.app`.

Backend (Render)
1. Sign in to Render (or Railway) and create a new Web Service from GitHub repository `Prajwalkwr/UdyogConnect`.
2. Set the Root Directory to `server`.
3. Build Command: (none required) or `npm install`.
4. Start Command: `npm start` (server's `package.json` runs `node server.js`).
5. Environment Variables (add in service settings, do NOT commit these):
   - `MONGODB_URI` = `mongodb+srv://<user>:<pass>@cluster0.../udyogconnect` (from MongoDB Atlas)
   - `JWT_SECRET` = a secure random string
   - Optional: `STRIPE_SECRET_KEY`, `CLOUDINARY_*`, `SMTP_*`, `RESEND_API_KEY`
6. Deploy. Note the public HTTPS URL Render provides (e.g., `https://udyog-server.onrender.com`).

After backend is live
1. Set `VITE_API_URL` in Vercel to your backend public URL (no trailing slash).
2. Re-deploy the frontend on Vercel (or trigger a new deployment by pushing a commit).

Notes & troubleshooting
- Socket.IO and WebSocket: Render supports WebSockets. If using another host, ensure it supports WebSockets for real-time features.
- If you prefer a single-host approach, you can deploy both frontend and backend on Render by building the client during backend deploy and serving `client/dist` (server already serves `/client/dist` if present).
- Do NOT commit `.env` with secrets; use Render/Vercel environment settings.
- For local testing, copy `.env.example` to `.env` and provide values.

Automatic deploys
- Both Vercel and Render can be connected to the GitHub repo so pushes to `main` automatically deploy.

If you'd like, I can:
- Create a GitHub Actions workflow to build and deploy automatically.
- Prepare a Render/Vercel-ready `render.yaml` or `vercel.json` configuration.

