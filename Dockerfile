FROM node:20-alpine

RUN apk update
RUN apk add build-base cmake git libressl-dev
ENV DEBUG=""

WORKDIR /app

COPY . .
RUN npm ci --quiet
RUN npm run build
CMD [ "npm", "start" ]
