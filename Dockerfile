FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_WS_URL=ws://127.0.0.1:8000
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S -g 1001 medikiosk && adduser -S -u 1001 -G medikiosk medikiosk
COPY --from=builder --chown=medikiosk:medikiosk /app/.next/standalone ./
COPY --from=builder --chown=medikiosk:medikiosk /app/.next/static ./.next/static
COPY --from=builder --chown=medikiosk:medikiosk /app/public ./public
USER medikiosk
EXPOSE 3000
CMD ["node", "server.js"]
