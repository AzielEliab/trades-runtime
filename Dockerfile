FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
COPY . .
RUN npm install --omit=dev
ENV NODE_ENV=production
ENV TRADES_RUNTIME_URL=https://trades-runtime.vibelock.workers.dev
CMD ["node", "cli/mcp-stdio.mjs"]
