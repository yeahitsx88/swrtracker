FROM node:22-bookworm-slim
RUN npm install -g pnpm@10.30.3
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
