FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/userscript/package.json packages/userscript/package.json

RUN npm install

COPY . .
RUN npm run build

EXPOSE 4317 5173

