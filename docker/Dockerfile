# Multi-stage build for ESP32 RoIP Server
# Stage 1: Builder
FROM node:18-alpine AS builder

LABEL maintainer="ESP32 RoIP Team"
LABEL description="Multi-stage Dockerfile for ESP32 RoIP Server"

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Copy package files
COPY roip-server/package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Stage 2: Runtime
FROM node:18-alpine

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    tini \
    dumb-init \
    curl \
    ca-certificates

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy built modules from builder
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package*.json ./

# Copy application code
COPY roip-server/src ./src
COPY roip-server/config ./config

# Create data directory
RUN mkdir -p /app/data && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Expose ports
# 5060/UDP: SIP signaling
# 10000-10100/UDP: RTP media streams
# 8080: REST API
# 8081: WebSocket server
EXPOSE 5060/udp 10000-10100/udp 8080 8081

# Use tini as PID 1 to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["node", "src/server.js"]
