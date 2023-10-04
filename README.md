# helia-docker

Docker images for Helia.

## Purpose

This container image hosts helia in a node container. It implements [HTTP IPFS-gateway API](https://docs.ipfs.tech/concepts/ipfs-gateway/#gateway-types) and responds to the incoming requests using helia to fetch the content from IPFS.

## Building

```sh
$ docker build . --tag helia
```

Pass the explicit platform when building on a Mac.

```sh
$ docker build . --tag helia --platform linux/arm64
```

## Running

```sh
$ docker run -it -p 8080:8080 helia
```

## Author

- [whizzzkid](https://github.com/whizzzkid)
