# ── Build stage ──
FROM node:20-alpine AS builder

# Prisma needs OpenSSL; bcrypt needs build tools on Alpine
RUN apk add --no-cache openssl python3 make g++

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

# Prisma needs OpenSSL; bcrypt needs build tools on Alpine
RUN apk add --no-cache openssl python3 make g++

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

# Create startup script
RUN printf '#!/bin/sh\necho "Running prisma db push..."\nnpx prisma db push --skip-generate 2>&1 || echo "Warning: db push failed"\necho "Starting server..."\nexec node dist/index.js\n' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 3456

CMD ["/app/start.sh"]
