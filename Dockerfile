# Build the client with the full dependency tree, then ship a runtime image that
# carries only what the server needs.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm install
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/
COPY server/package.json server/
# The server has no build step, so production dependencies are enough here.
RUN npm install --omit=dev --workspace server --include-workspace-root
COPY shared/ shared/
COPY server/ server/
COPY --from=build /app/client/dist client/dist
EXPOSE 3000
CMD ["node", "server/src/index.js"]
