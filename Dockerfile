FROM node:20-alpine

RUN apk update
RUN apk add build-base cmake git libressl-dev
ARG CMAKE_CXX_FLAGS="${CMAKE_CXX_FLAGS} -fPIC"
ARG CMAKE_C_FLAGS="${CMAKE_C_FLAGS} -fPIC"

WORKDIR /app

COPY . .
RUN npm install
RUN npm run build
EXPOSE 8080
CMD [ "npm", "start" ]
