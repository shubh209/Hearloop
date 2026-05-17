# hearloop/apps/api/Dockerfile

FROM node:20-alpine AS base
WORKDIR /app

# --- deps: install only what the API workspace needs ---
FROM base AS deps
# Copy all workspace manifests so npm can resolve the workspace graph
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
COPY packages/db/package*.json ./packages/db/
# Install only API + its workspace deps (skips web build tools)
RUN npm install --workspace=apps/api --workspace=packages/db --ignore-scripts

# --- builder: compile TypeScript ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=apps/api

# --- runner: minimal production image ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy compiled output and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
