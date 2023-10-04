FROM node:20-alpine

RUN apk update
RUN apk add build-base cmake git libressl-dev

WORKDIR /app

COPY . .
RUN npm install
RUN npm run build
EXPOSE 8080
CMD [ "npm", "start" ]
