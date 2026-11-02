FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev && npm i --no-save tsx

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app ./
RUN mkdir -p storage && chown -R node:node storage
USER node
EXPOSE 3000
# Applique les migrations puis démarre l'application
CMD ["sh", "-c", "npx tsx scripts/migrate.mts && npx next start"]
