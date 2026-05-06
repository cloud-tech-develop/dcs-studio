FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY server.js byteplus-signer.js presets.json .env.example ./
COPY public/ public/

ENV NODE_ENV=production
ENV PORT=3300

EXPOSE 3300

CMD ["node", "server.js"]
