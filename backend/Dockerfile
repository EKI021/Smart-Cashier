FROM node:22-slim

WORKDIR /app

# Salin manifest dulu supaya layer cache npm ci tidak perlu diulang
# setiap kali hanya kode yang berubah.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 4001

# Healthcheck sederhana -- dipakai orchestrator (docker/K8s) untuk tahu
# kontainer sudah siap menerima trafik.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
