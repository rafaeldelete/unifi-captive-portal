# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all files
COPY . .

# Build frontend
RUN npm run build

# Production stage
FROM node:22-slim

WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Copy server files
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/tsconfig.json ./

# Set environment to production
ENV NODE_ENV=production

# Expose port 3000
EXPOSE 3000

# Start the server using node's native TS support (Node 22.6+)
CMD ["node", "--experimental-strip-types", "server.ts"]
