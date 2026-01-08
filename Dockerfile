# Build Stage
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./
RUN npm install --production
COPY server/ ./
COPY --from=build /app/dist ./public
EXPOSE 8080
CMD ["node", "index.js"]
