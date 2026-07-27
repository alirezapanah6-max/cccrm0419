# Multi-stage Dockerfile for Micro CRM (Express + Prisma)

# -----------------------------------------------------------
# Stage 1: Install all dependencies
FROM node:22-alpine AS deps

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

# -----------------------------------------------------------
# Stage 2: Compile TypeScript and generate Prisma client
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Compile TypeScript (outputs to dist/)
RUN npm run build

# Generate Prisma client into src/generated/
RUN npx prisma generate

# -----------------------------------------------------------
# Stage 3: Minimal production image
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nodejs

# Copy compiled server output
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy generated Prisma client
COPY --from=builder --chown=nodejs:nodejs /app/src/generated ./src/generated

# Copy Prisma schema and migrations (needed for migrate deploy)
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

# Copy static assets
COPY --from=builder --chown=nodejs:nodejs /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/index.html ./index.html

# Copy package manifests for production install
COPY --chown=nodejs:nodejs package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy entrypoint script and make it executable
COPY --chown=nodejs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

USER nodejs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
