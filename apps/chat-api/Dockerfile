FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/inference-sdk packages/inference-sdk
COPY apps/chat-api apps/chat-api
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @olliveai/inference-sdk build
RUN pnpm --filter @olliveai/chat-api build

FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/inference-sdk packages/inference-sdk
COPY --from=builder /app/apps/chat-api apps/chat-api
COPY --from=builder /app/node_modules node_modules
WORKDIR /app/apps/chat-api
EXPOSE 3001
CMD ["node", "dist/index.js"]
