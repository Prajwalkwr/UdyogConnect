Developer Quick Start

To avoid Vite proxy `ECONNREFUSED` errors when calling `/api`, start both the backend and frontend together from the project root.

1) Install dependencies (from project root):

```bash
npm install
cd client
npm install
cd server
npm install
cd ..
```

2) Start both dev servers (recommended):

```bash
# from project root
npm run dev
```

This runs the client vite server and the node server concurrently (see `package.json` scripts).

Notes
- The Vite dev server proxies `/api` requests to `http://127.0.0.1:3000` by default. If you run the client without starting the server, you'll see `ECONNREFUSED` errors.
- If you prefer to run only the client, set the `VITE_API_URL` env var to point to a running backend, e.g. `http://localhost:3000`.

Examples
- Run client only (with explicit API url):

```bash
# from client folder
set VITE_API_URL=http://localhost:3000
npm run dev
```

- Run server only:

```bash
cd server
npm start
```

If you'd like, I can add a convenience `start-dev.ps1` or `dev.bat` to run both servers on Windows.
