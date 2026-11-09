#!/bin/sh

CURRENT_VER=$(cat /etc/openwrt_version)
#LATEST_VER=$(curl -s https://updates.example.com/latest_version)
LATEST_VER="AL-MALAKI v3.4"

if [ "$CURRENT_VER" != "$LATEST_VER" ]; then
  echo "$LATEST_VER" > /tmp/new_firmware_available
else
  rm -f /tmp/new_firmware_available
fi
