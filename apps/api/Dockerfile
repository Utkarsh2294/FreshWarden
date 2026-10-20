FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --ignore-scripts
COPY apps/api apps/api
ENV NODE_ENV=production
ENV HOST=0.0.0.0
USER node
EXPOSE 5000
CMD ["node", "apps/api/src/server.js"]
