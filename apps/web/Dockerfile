FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web apps/web
RUN pnpm install --frozen-lockfile || pnpm install
WORKDIR /app/apps/web
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/apps/web/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
