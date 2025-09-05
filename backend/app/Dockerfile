FROM node:20-alpine AS base

WORKDIR /app

# Copy package files
COPY backend/app/package*.json ./

# Install deps
RUN npm ci --omit=dev

# Copy rest of backend source
COPY backend/app ./

# Build
RUN npm run build

# Expose correct port (5000 is default, or use PORT env)
EXPOSE 5000

CMD ["node", "dist/index.js"]
