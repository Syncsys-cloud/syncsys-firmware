#!/bin/sh
# Copyright(c) 2025, SyncSys.cloud OS. All rights reserved.
#
# mkasc-apply.sh <band> <channel>
# يطبّق القناة على الراديو الموافق للحزمة عبر uci ثم يعيد تحميل الواي فاي.

. /usr/share/libubox/jshn.sh 2>/dev/null

band="$1"
ch="$2"

# تعقيم صارم
case "$band" in 2g|5g|6g) ;; *) echo '{"error":"bad_band"}'; exit 0;; esac
case "$ch" in ''|*[!0-9]*) echo '{"error":"bad_channel"}'; exit 0;; esac

# ابحث عن الراديو الموافق للحزمة
radio=""
for r in $(uci -q show wireless 2>/dev/null | sed -n 's/^wireless\.\([^.=]*\)=wifi-device/\1/p'); do
  b="$(uci -q get wireless.$r.band 2>/dev/null)"
  if [ "$b" = "$band" ]; then radio="$r"; break; fi
done

# احتياطي: خرائط شائعة عند غياب band
if [ -z "$radio" ]; then
  [ "$band" = "2g" ] && radio="radio0"
  [ "$band" = "5g" ] && radio="radio1"
  uci -q get "wireless.$radio" >/dev/null 2>&1 || radio=""
fi

if [ -z "$radio" ]; then
  echo '{"error":"radio_not_found"}'
  exit 0
fi

prev="$(uci -q get wireless.$radio.channel 2>/dev/null)"

uci -q set "wireless.$radio.channel=$ch" || { echo '{"error":"uci_set_failed"}'; exit 0; }
uci -q commit wireless || { echo '{"error":"uci_commit_failed"}'; exit 0; }

# إعادة تحميل الواي فاي في الخلفية (تفادي قطع جلسة rpc)
(wifi reload >/dev/null 2>&1 || /sbin/wifi up >/dev/null 2>&1) &

json_init
json_add_boolean ok 1
json_add_string radio "$radio"
json_add_string band "$band"
json_add_int channel "$ch"
json_add_string previous "${prev:-}"
json_dump
exit 0
