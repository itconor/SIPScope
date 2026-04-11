FROM node:20-alpine AS web-build
WORKDIR /app/web-ui
COPY web-ui/package.json web-ui/package-lock.json* ./
RUN npm ci
COPY web-ui/ ./
RUN npm run build

FROM node:20-alpine AS server-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
COPY web/ ./web/
COPY scripts/ ./scripts/
RUN npx tsc && cp src/sip-patched.js dist/src/sip-patched.js

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=server-build /app/dist/ ./dist/
COPY --from=web-build /app/web-ui/dist/ ./dist/web/public/
COPY config/ ./config/

EXPOSE 5060/udp 5060/tcp 5061/tcp 8089/tcp 8080/tcp

CMD ["node", "dist/src/index.js"]
