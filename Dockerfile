FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY public ./public

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_ROOT=/app/data
ENV BROWSER_PROFILE_DIR=/app/data/browser-profile
ENV BROWSER_HEADLESS=true
ENV DEFAULT_TIMEOUT_MS=15000

RUN mkdir -p /app/data/tasks /app/data/artifacts /app/data/logs /app/data/browser-profile

EXPOSE 3000

CMD ["node", "dist/server.js"]