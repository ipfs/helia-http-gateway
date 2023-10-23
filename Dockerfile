FROM node:20-slim

RUN apt-get update
RUN apt-get install -y build-essential cmake git libssl-dev

WORKDIR /app

COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
RUN npm ci --quiet --only=production

COPY . .

RUN npm run build

HEALTHCHECK --interval=12s --timeout=12s --start-period=10s CMD npm run healthcheck

CMD [ "npm", "start" ]
