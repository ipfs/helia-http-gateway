# helia-docker

Docker images for Helia.

## Purpose

This container image hosts helia in a node container. It implements [HTTP IPFS-gateway API](https://docs.ipfs.tech/concepts/ipfs-gateway/#gateway-types) and responds to the incoming requests using helia to fetch the content from IPFS.

## Run Using Docker Compose

```sh
$ docker-compose up
```

## Run Using Docker

### Build
```sh
$ docker build . --tag helia
```

Pass the explicit platform when building on a Mac.

```sh
$ docker build . --tag helia --platform linux/arm64
```

### Running

```sh
$ docker run -it -p 8080:8080 -e DEBUG="helia-server" helia
```

## Supported Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `DEBUG` | Debug level | `''`|
| `PORT` | Port to listen on | `8080` |
| `HOST` | Host to listen on | `0.0.0.0` |

## Author

- [whizzzkid](https://github.com/whizzzkid)
