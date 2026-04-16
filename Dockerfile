# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
# Note: This generates the 'dist' folder for the frontend
RUN npm run build

# Stage 2: Runtime
FROM node:20-slim

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --production

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
# Copy server source (since we use tsx to run it)
COPY --from=builder /app/server.ts ./
# Copy any other necessary files (like supabase config if it's a file, but here it's env vars)
# If you have a firebase-applet-config.json or similar, uncomment:
# COPY --from=builder /app/firebase-applet-config.json ./

# Expose the port the app runs on
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the server
# We use tsx to run the server.ts file directly as configured in your package.json
CMD ["npm", "run", "dev"]
