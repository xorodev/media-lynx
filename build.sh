#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt

echo "Descargando entorno JavaScript para el soporte de yt-dlp."
NODE_VERSION=v18.16.0
curl -sOL https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz
tar -xJf node-$NODE_VERSION-linux-x64.tar.xz
mv node-$NODE_VERSION-linux-x64 node-js
rm node-$NODE_VERSION-linux-x64.tar.xz
echo "Entorno JavaScript configurado con éxito."