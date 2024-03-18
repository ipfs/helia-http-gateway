#!/usr/bin/env bash

# This is needed to fix node-datachannel on M1 Macs.
# Only for this arch [node-datachannel] is built as shared library with openssl 1.1
# see https://github.com/murat-dogan/node-datachannel/issues/178#issuecomment-2004585706 for more info

# https://www.openssl.org/source/old/1.1.1/index.html for list of tarballs

OPEN_SSL_VERSION="1.1.1w"
# work in tmpdir
TMP_DIR=$(mktemp -d)
cd $TMP_DIR
wget https://www.openssl.org/source/old/1.1.1/openssl-${OPEN_SSL_VERSION}.tar.gz

mkdir /opt/openssl
tar xfvz openssl-1.1.1w.tar.gz --directory /opt/openssl

export LD_LIBRARY_PATH=/opt/openssl/lib
cd /opt/openssl/openssl-${OPEN_SSL_VERSION}
./config --prefix=/opt/openssl --openssldir=/opt/openssl/ssl


make
make test
make install

fdfind ".*libcrypto\..*" /opt/openssl
