#!/bin/bash

docker start mongodb >/dev/null 2>&1
docker start redis >/dev/null 2>&1

cd ~/Desktop/myapp

npm run server
