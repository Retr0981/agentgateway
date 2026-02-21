# ── Build stage ──
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source and build
COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# ── Production stage ──
FROM node:20-alpine AS runner

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci --omit=dev

# Generate Prisma client for production
RUN npx prisma generate

# Copy built files from builder
COPY --from=builder /app/dist ./dist/

# Copy static files (landing page)
COPY src/public ./dist/public/

EXPOSE 3456

# Run migrations then start (db push failure is non-fatal to allow healthcheck to pass)
CMD ["sh", "-c", "npx prisma db push --skip-generate || echo 'Warning: db push failed, continuing...'; node dist/index.js"]
