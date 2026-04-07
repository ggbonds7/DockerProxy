ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE}

RUN apk add --no-cache docker-cli python3 py3-paramiko

WORKDIR /app

COPY package*.json ./
RUN rm -rf package-lock.json node_modules && npm install

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
