# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Build Next.js
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dummy env vars so next build can resolve references at compile time
ENV NEXT_PUBLIC_FIREBASE_API_KEY=build
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=build
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=build
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=build
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=build
ENV NEXT_PUBLIC_FIREBASE_APP_ID=build
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=build

RUN npm run build

# Stage 3: Production runner
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup -S app && adduser -S app -G app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static

USER app
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/api/healthz || exit 1

CMD ["node", "server.js"]
