FROM node:20-slim

RUN apt-get update
RUN apt-get install -y build-essential cmake git libssl-dev

WORKDIR /app

COPY . .
RUN npm install
RUN npm run build
EXPOSE 8080
CMD [ "npm", "start" ]
