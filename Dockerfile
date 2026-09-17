FROM node:20-alpine

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm install

COPY server/prisma ./server/prisma
RUN cd server && npx prisma generate

COPY server/ ./server/
