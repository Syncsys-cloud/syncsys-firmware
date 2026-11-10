#!/bin/sh
# Copyright(c) 2025, SyncSys.cloud OS. All rights reserved.
#
# mkasc-store.sh — إدارة سجل عمليات التحليل المحفوظة
#   list           سرد العمليات المحفوظة (ملخّص لكل عملية)
#   get   <id>     إخراج JSON عملية محددة
#   delete <id|all> حذف عملية أو الكل

. /usr/share/libubox/jshn.sh 2>/dev/null

DIR="/etc/mkasc/history"
CMD="$1"
ID="$2"

mkdir -p "$DIR" 2>/dev/null

# تعقيم المعرّف (طابع زمني رقمي فقط)
san_id() { printf '%s' "$1" | tr -cd '0-9'; }

case "$CMD" in
  list)
    json_init
    json_add_array "items"
    for f in $(ls -1 "$DIR"/*.json 2>/dev/null | sort -r); do
      [ -r "$f" ] || continue
      id="$(basename "$f" .json)"
      # استخرج حقولًا موجزة عبر jsonfilter (بدون تحميل الملف كاملًا للواجهة)
      gen="$(jsonfilter -i "$f" -e '@.generated_at' 2>/dev/null)"
      label="$(jsonfilter -i "$f" -e '@.label' 2>/dev/null)"
      host="$(jsonfilter -i "$f" -e '@.host' 2>/dev/null)"
      # ملخّص لكل حزمة: band:recommend:smart
      json_add_object ""
        json_add_string "id" "$id"
        json_add_int "generated_at" "${gen:-0}"
        [ -n "$label" ] && json_add_string "label" "$label"
        [ -n "$host" ] && json_add_string "host" "$host"
        json_add_array "bands"
        i=0
        while :; do
          bn="$(jsonfilter -i "$f" -e "@.bands[$i].band" 2>/dev/null)"
          [ -n "$bn" ] || break
          rec="$(jsonfilter -i "$f" -e "@.bands[$i].recommend" 2>/dev/null)"
          sm="$(jsonfilter -i "$f" -e "@.bands[$i].smart.channel" 2>/dev/null)"
          apt="$(jsonfilter -i "$f" -e "@.bands[$i].ap_total" 2>/dev/null)"
          json_add_object ""
            json_add_string "band" "$bn"
            json_add_int "recommend" "${rec:-0}"
            json_add_int "smart" "${sm:-0}"
            json_add_int "ap_total" "${apt:-0}"
          json_close_object
          i=$((i + 1))
        done
        json_close_array
      json_close_object
    done
    json_close_array
    json_dump
    ;;

  get)
    id="$(san_id "$ID")"
    f="$DIR/$id.json"
    if [ -n "$id" ] && [ -r "$f" ]; then
      cat "$f"
    else
      echo '{"error":"not_found"}'
    fi
    ;;

  delete)
    if [ "$ID" = "all" ]; then
      rm -f "$DIR"/*.json 2>/dev/null
      echo '{"ok":true,"deleted":"all"}'
    else
      id="$(san_id "$ID")"
      if [ -n "$id" ] && [ -f "$DIR/$id.json" ]; then
        rm -f "$DIR/$id.json"
        echo "{\"ok\":true,\"deleted\":\"$id\"}"
      else
        echo '{"error":"not_found"}'
      fi
    fi
    ;;

  *)
    echo '{"error":"unknown_command"}'
    ;;
esac
exit 0
