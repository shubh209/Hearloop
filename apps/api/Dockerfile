# hearloop/apps/api/Dockerfile

FROM node:20-alpine AS base
WORKDIR /app

# --- deps: install ALL deps (including devDeps) needed to compile TypeScript ---
FROM base AS deps
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
COPY packages/db/package*.json ./packages/db/
RUN npm install --workspace=apps/api --workspace=packages/db --ignore-scripts

# --- prod-deps: install ONLY production deps for the final image ---
# Omits devDependencies (babel, jest, ts-jest, etc.) that carry transitive CVEs
# but are never used at runtime
FROM base AS prod-deps
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
COPY packages/db/package*.json ./packages/db/
RUN npm install --workspace=apps/api --workspace=packages/db \
    --ignore-scripts --omit=dev

# --- builder: compile TypeScript using full deps ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=apps/api

# --- runner: minimal production image with prod-only deps ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy prod-only node_modules (no devDeps, no build tools, fewer CVEs)
COPY --from=prod-deps /app/node_modules ./node_modules
# Copy compiled output
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
