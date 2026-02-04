# YTScribe Production Dockerfile
# Multi-stage build for optimized image size

# ============================================================
# Stage 1: Install dependencies for both backend and frontend
# ============================================================
FROM oven/bun:1 AS deps

WORKDIR /app

# Copy package files for dependency installation
COPY package.json bun.lock ./
COPY frontend/package.json ./frontend/

# Install backend dependencies
RUN bun install --frozen-lockfile

# Install frontend dependencies
WORKDIR /app/frontend
RUN bun install --frozen-lockfile

# ============================================================
# Stage 2: Build the frontend
# ============================================================
FROM oven/bun:1 AS frontend-builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules

# Copy source files
COPY frontend ./frontend

# Build the frontend
WORKDIR /app/frontend
RUN bun run build

# ============================================================
# Stage 3: Production runtime
# ============================================================
FROM oven/bun:1-slim AS runtime

# Install system dependencies required at runtime
# - yt-dlp: for downloading YouTube videos
# - ffmpeg: for audio extraction and processing
# - python3: required by yt-dlp
# - ca-certificates: for HTTPS requests
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp via pip (more up-to-date than apt)
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copy backend dependencies and source
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY src ./src
COPY drizzle.config.ts ./
COPY tsconfig.json ./

# Copy built frontend
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY frontend/package.json ./frontend/

# Create data directory for SQLite database and downloads
RUN mkdir -p /app/data/downloads

# Environment variables with defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=/app/data/ytscribe.db

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the backend server
# Note: The frontend SSR server should be started separately or via a process manager
CMD ["bun", "run", "src/server.ts"]
