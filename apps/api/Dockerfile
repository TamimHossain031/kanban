# ─── deps: install everything, build native modules, generate Prisma client ──
FROM node:20-alpine AS deps
WORKDIR /app
# argon2 is a native module (build tools); openssl is needed by Prisma engines.
RUN apk add --no-cache python3 make g++ openssl
COPY package.json package-lock.json* ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate

# ─── build: compile TypeScript → dist ────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── runner: lean-ish runtime (keeps prisma CLI + ts-node for migrate & seed) ─
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# openssl so Prisma detects libssl 3.0 and uses the bundled musl engine.
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json tsconfig.json ./
# node:alpine ships a non-root `node` user; give it ownership so Prisma can
# touch its engine cache if it ever needs to.
RUN chown -R node:node /app
USER node
EXPOSE 4000
# migrate + seed + serve. `migrate deploy` waits for a healthy DB (compose).
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/main"]
