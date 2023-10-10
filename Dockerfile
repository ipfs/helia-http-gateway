FROM node:20-slim

RUN apt-get update
RUN apt-get install -y build-essential cmake git libssl-dev

WORKDIR /app

COPY . .
RUN npm ci --quiet
RUN npm run build
CMD [ "npm", "start" ]
