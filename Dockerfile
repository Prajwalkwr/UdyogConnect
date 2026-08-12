### Stage 1: Build client
FROM node:18-alpine AS client-builder
WORKDIR /app
COPY client/package.json client/package-lock.json ./client/
WORKDIR /app/client
RUN npm ci
COPY client/ ./
RUN npm run build

### Stage 2: Build server
FROM node:18-alpine AS server
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY server/ ./server/
COPY --from=client-builder /app/client/dist ./client/dist
COPY db.js .
COPY migrate.js .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server/server.js"]
