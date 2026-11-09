#!/bin/sh
# Copyright(c) 2025, ALMalaki Openwrt Systems. All rights reserved.
# AL-MALAKI OPEWNWRT TEAM < almalakiopenwrt@gmail.com>
#
# mkspec.sh — جامع مواصفات الجهاز (JSON)
#
# البنية المعيارية:
#   mkspec.sh          الجامعات العامة (تعمل على كل المعماريات)
#   arch/<target>.sh   وحدة المعمارية: حقائق ثابتة وعمليات خاصة بالهدف
#   db/devices.json    قاعدة بيانات مرجعية محلية لكل جهاز (board_name)
#
# سلسلة المصادر لكل معلومة (fallback chain):
#   1) قراءة حية من النظام (sysfs / proc / dmesg / iw / iwinfo)
#   2) وحدة المعمارية
#   3) قاعدة البيانات المرجعية
#   4) "غير معروف"

JSHN=/usr/share/libubox/jshn.sh
if [ ! -r "$JSHN" ]; then
  echo '{"error":"jshn not found: /usr/share/libubox/jshn.sh"}'
  exit 0
fi
. "$JSHN"

MKSPEC_DIR="$(dirname "$(readlink -f "$0")")"
ARCH_DIR="$MKSPEC_DIR/arch"
DB_FILE="$MKSPEC_DIR/db/devices.json"
UNKNOWN="غير معروف"

# ---------------------------------------------------------------
# أدوات مساعدة
# ---------------------------------------------------------------

read1() { [ -r "$1" ] && head -n1 "$1" 2>/dev/null; }
trim() { echo "$1" | sed -e 's/^[[:space:]]\+//' -e 's/[[:space:]]\+$//'; }
hascmd() { command -v "$1" >/dev/null 2>&1; }

hex2dec() {
  h="$1"; h="${h#0x}"
  case "$h" in ''|*[!0-9a-fA-F]*) echo 0; return 0;; esac
  echo $((0x$h))
}

popcount() {
  n="$1"
  case "$n" in ''|*[!0-9]*) echo 0; return 0;; esac
  c=0
  while [ "$n" -gt 0 ] 2>/dev/null; do
    c=$((c + (n & 1)))
    n=$((n >> 1))
  done
  echo "$c"
}

num_or() { # num_or <value> <fallback>
  case "$1" in ''|*[!0-9]*) echo "$2";; *) echo "$1";; esac
}

# سجل الإقلاع (dmesg) — يُقرأ مرة واحدة ويُخزن في ملف مؤقت
BOOTLOG="/tmp/mkspec_bootlog.$$"
dmesg 2>/dev/null > "$BOOTLOG" || : > "$BOOTLOG"
cleanup() { rm -f "$BOOTLOG" /tmp/mkspec_*.$$ 2>/dev/null; }
trap cleanup EXIT

# ---------------------------------------------------------------
# كاش العتاد الدائم /etc/mkspec/hwcache
#
# الحقائق المكتشفة من سجل الإقلاع (موديل NAND، السويتش، محرك التشفير)
# تختفي عندما يدور سجل النواة أو يكون logging متوقفًا على أجهزة الخدمة.
# لذلك عند أول كشف ناجح تُحفظ في كاش دائم ويُقرأ منه لاحقًا.
# الكتابة تتم فقط عند تغيّر القيمة (حماية فلاش overlay من كتابات متكررة).
# ---------------------------------------------------------------

HWCACHE_DIR="/etc/mkspec"
HWCACHE="$HWCACHE_DIR/hwcache"

hwcache_get() { # hwcache_get <key>
  [ -r "$HWCACHE" ] || return 1
  v="$(sed -n "s/^$1='\(.*\)'\$/\1/p" "$HWCACHE" 2>/dev/null | head -n1)"
  [ -n "$v" ] || return 1
  echo "$v"
}

hwcache_set() { # hwcache_set <key> <value>
  [ -n "$2" ] || return 0
  # لا كتابة إن لم تتغير القيمة
  cur="$(hwcache_get "$1")" && [ "$cur" = "$2" ] && return 0
  mkdir -p "$HWCACHE_DIR" 2>/dev/null || return 0
  clean="$(echo "$2" | tr -d "'" )"
  {
    [ -r "$HWCACHE" ] && grep -v "^$1=" "$HWCACHE" 2>/dev/null
    printf "%s='%s'\n" "$1" "$clean"
  } > "$HWCACHE.tmp" 2>/dev/null && mv "$HWCACHE.tmp" "$HWCACHE" 2>/dev/null
}

# ---------------------------------------------------------------
# معلومات التوزيعة / الجهاز
# ---------------------------------------------------------------

[ -r /etc/openwrt_release ] && . /etc/openwrt_release 2>/dev/null
[ -r /etc/device_info ] && . /etc/device_info 2>/dev/null

BOARD="$(read1 /tmp/sysinfo/board_name)"
[ -z "$BOARD" ] && BOARD="$UNKNOWN"

get_board_model() {
  if [ -r /tmp/sysinfo/model ]; then
    read1 /tmp/sysinfo/model
  elif [ -r /sys/firmware/devicetree/base/model ]; then
    tr -d '\000' < /sys/firmware/devicetree/base/model
  else
    echo "$UNKNOWN"
  fi
}

# ---------------------------------------------------------------
# قاعدة البيانات المرجعية المحلية
# db_get <jsonfilter-path-suffix>   مثال: db_get memory.dram_type
# ---------------------------------------------------------------

DB_MATCH=0
DB_FIELDS=""

db_available() {
  [ -r "$DB_FILE" ] && hascmd jsonfilter
}

db_get() {
  db_available || return 1
  v="$(jsonfilter -i "$DB_FILE" -e "@.devices['$BOARD'].$1" 2>/dev/null)"
  [ -n "$v" ] || return 1
  echo "$v"
}

db_mark() { # db_mark <field-name>  — توثيق أن الحقل جُلب من قاعدة البيانات
  DB_FIELDS="${DB_FIELDS}${DB_FIELDS:+,}$1"
}

if db_available; then
  n="$(db_get name)" && [ -n "$n" ] && DB_MATCH=1
fi

# ---------------------------------------------------------------
# تحميل وحدة المعمارية
# الهدف ramips/mt7621 -> arch/ramips_mt7621.sh وإلا arch/generic.sh
# ---------------------------------------------------------------

ARCH_MODULE="generic"
target_id="$(echo "${DISTRIB_TARGET:-}" | tr '/' '_' | tr -cd 'a-zA-Z0-9_-')"
if [ -n "$target_id" ] && [ -r "$ARCH_DIR/$target_id.sh" ]; then
  ARCH_MODULE="$target_id"
fi
[ -r "$ARCH_DIR/$ARCH_MODULE.sh" ] && . "$ARCH_DIR/$ARCH_MODULE.sh"

# دوال الوحدة كلها اختيارية — نعرّف بدائل فارغة لغير المُعرَّف
type arch_cpu_cur_freq_mhz >/dev/null 2>&1 || arch_cpu_cur_freq_mhz() { return 1; }
type arch_cpu_max_freq_mhz >/dev/null 2>&1 || arch_cpu_max_freq_mhz() { return 1; }
type arch_soc_name         >/dev/null 2>&1 || arch_soc_name()         { return 1; }
type arch_switch_info      >/dev/null 2>&1 || arch_switch_info()      { return 1; }
type arch_crypto_engine    >/dev/null 2>&1 || arch_crypto_engine()    { return 1; }
type arch_extra_json       >/dev/null 2>&1 || arch_extra_json()       { return 0; }

# ---------------------------------------------------------------
# النظام
# ---------------------------------------------------------------

add_system() {
  json_add_object "system"
    json_add_string "Model"            "${DEVICE_PRODUCT:-$(get_board_model)}"
    json_add_string "Board_Name"       "$BOARD"
    json_add_string "Factory"          "${DEVICE_MANUFACTURER:-$UNKNOWN}"
    json_add_string "OSystem"          "${DISTRIB_ID:-$UNKNOWN}"
    json_add_string "ALMalaki_Version" "$(cat /etc/openwrt_version 2>/dev/null || echo "$UNKNOWN") LTS"
    json_add_string "Openwrt_Release"  "${DISTRIB_RELEASE:-$UNKNOWN}"
    json_add_string "TargetPlatform"   "${DISTRIB_TARGET:-$UNKNOWN}"
    json_add_string "Arch"             "${DISTRIB_ARCH:-$UNKNOWN}"
    json_add_string "Kernel"           "$(uname -r 2>/dev/null || echo "$UNKNOWN")"
    json_add_string "Hostname"         "$(cat /proc/sys/kernel/hostname 2>/dev/null || echo "$UNKNOWN")"
  json_close_object
}

# ---------------------------------------------------------------
# المعالج
# ---------------------------------------------------------------

get_soc_name() {
  # الاسم الكامل للـ SoC: سطر system type أو وحدة المعمارية أو قاعدة البيانات
  v="$(grep -m1 -E 'system type|Hardware' /proc/cpuinfo 2>/dev/null | cut -d: -f2-)"
  v="$(trim "$v")"
  [ -n "$v" ] && { echo "$v"; return; }
  arch_soc_name && return
  v="$(db_get cpu.soc)" && { db_mark "cpu.soc"; echo "$v"; return; }
  echo "$UNKNOWN"
}

get_core_model() {
  # نواة المعالج: model name / cpu model / Processor
  v="$(grep -m1 -E 'model name|cpu model|Processor' /proc/cpuinfo 2>/dev/null | cut -d: -f2-)"
  v="$(trim "$v")"
  [ -n "$v" ] && echo "$v" || echo "$UNKNOWN"
}

get_cpu_cores_threads() { # يطبع "cores threads"
  # الخيوط = عدد المعالجات المنطقية
  threads="$(grep -c '^processor' /proc/cpuinfo 2>/dev/null)"
  [ "$threads" -gt 0 ] 2>/dev/null || threads="$(nproc 2>/dev/null || echo 1)"

  # الأنوية الفيزيائية من topology (الأدق) — على MT7621 مثلًا: 2 أنوية × 2 VPE = 4 خيوط
  cores="$(cat /sys/devices/system/cpu/cpu*/topology/core_id 2>/dev/null | sort -u | wc -l)"
  cores="$(trim "$cores")"

  # احتياطي: سطور "core" في /proc/cpuinfo (MIPS)
  if ! [ "$cores" -gt 0 ] 2>/dev/null; then
    cores="$(awk -F: '/^core[[:space:]]*:/ {gsub(/[[:space:]]/,"",$2); print $2}' /proc/cpuinfo 2>/dev/null | sort -u | wc -l)"
    cores="$(trim "$cores")"
  fi

  # احتياطي أخير: قاعدة البيانات ثم عدد الخيوط
  if ! [ "$cores" -gt 0 ] 2>/dev/null; then
    cores="$(db_get cpu.cores)" && db_mark "cpu.cores" || cores="$threads"
  fi

  echo "$(num_or "$cores" 1) $(num_or "$threads" 1)"
}

get_bogomips() {
  v="$(grep -m1 -i 'bogomips' /proc/cpuinfo 2>/dev/null | cut -d: -f2-)"
  trim "$v"
}

get_isa() {
  v="$(grep -m1 -E '^isa|^Features' /proc/cpuinfo 2>/dev/null | cut -d: -f2-)"
  trim "$v"
}

# التردد بالميغاهرتز — المصدر: live ثم arch ثم db
get_cpu_freq_mhz() { # يطبع "cur max source" (يعمل داخل subshell فالمصدر يُعاد ضمن الخرج)
  cur_khz="$(read1 /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq)"
  max_khz="$(read1 /sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_max_freq)"
  if [ -n "$cur_khz" ] && [ "$cur_khz" -gt 0 ] 2>/dev/null; then
    max_khz="$(num_or "$max_khz" "$cur_khz")"
    echo "$((cur_khz / 1000)) $((max_khz / 1000)) live"
    return
  fi

  # /proc/cpuinfo: cpu MHz (بعض المعماريات)
  mhz="$(awk -F: '/cpu MHz/ {gsub(/ /,"",$2); printf "%.0f", $2; exit}' /proc/cpuinfo 2>/dev/null)"
  if [ -n "$mhz" ] && [ "$mhz" -gt 0 ] 2>/dev/null; then
    echo "$mhz $mhz live"
    return
  fi

  a="$(arch_cpu_cur_freq_mhz)" && [ -n "$a" ] && {
    m="$(arch_cpu_max_freq_mhz)"; m="$(num_or "$m" "$a")"
    echo "$a $m arch"
    return
  }

  d="$(db_get cpu.freq_mhz)" && [ -n "$d" ] && {
    echo "$d $d db"
    return
  }

  echo "0 0 none"
}

add_cpu_cache() {
  base="/sys/devices/system/cpu/cpu0/cache"
  json_add_array "cache"

  if [ -d "$base" ]; then
    for idx in "$base"/index*; do
      [ -d "$idx" ] || continue
      level="$(read1 "$idx/level")"
      ctype="$(read1 "$idx/type")"
      csize="$(read1 "$idx/size")"
      json_add_object
        json_add_int "level" "$(num_or "$level" 0)"
        json_add_string "type" "${ctype:-$UNKNOWN}"
        json_add_string "size" "${csize:-$UNKNOWN}"
      json_close_object
    done
  else
    # احتياطي: سجل الإقلاع (شائع على MIPS)
    tmpc="/tmp/mkspec_cache.$$"
    grep -iE 'primary (instruction|data) cache|secondary cache' "$BOOTLOG" 2>/dev/null > "$tmpc"
    while IFS= read -r line; do
      lvl=1; ctype="Unified"
      echo "$line" | grep -qi 'instruction' && ctype="Instruction"
      echo "$line" | grep -qi 'data' && ctype="Data"
      echo "$line" | grep -qi 'secondary' && { lvl=2; ctype="Unified"; }
      csize="$(echo "$line" | sed -n 's/.*cache[[:space:]]*\([0-9]\+kB\).*/\1/ip' | head -n1)"
      [ -z "$csize" ] && csize="$(echo "$line" | grep -o '[0-9]\+kB' | head -n1)"
      [ -n "$csize" ] || continue
      json_add_object
        json_add_int "level" "$lvl"
        json_add_string "type" "$ctype"
        json_add_string "size" "$csize"
      json_close_object
    done < "$tmpc"
    rm -f "$tmpc"
  fi

  json_close_array
}

add_cpu() {
  set -- $(get_cpu_cores_threads)
  cores="$1"; threads="$2"
  set -- $(get_cpu_freq_mhz)
  cur_mhz="$1"; max_mhz="$2"; freq_src="${3:-none}"
  [ "$freq_src" = "db" ] && db_mark "cpu.freq_mhz"

  json_add_object "cpu"
    json_add_string "model" "$(get_soc_name)"
    json_add_string "core_model" "$(get_core_model)"
    json_add_int "cores" "$(num_or "$cores" 1)"
    json_add_int "threads" "$(num_or "$threads" 1)"
    json_add_int "cur_freq_mhz" "$(num_or "$cur_mhz" 0)"
    json_add_int "max_freq_mhz" "$(num_or "$max_mhz" 0)"
    json_add_string "freq_source" "$freq_src"
    b="$(get_bogomips)"; [ -n "$b" ] && json_add_string "bogomips" "$b"
    i="$(get_isa)"; [ -n "$i" ] && json_add_string "isa" "$i"
    add_cpu_cache
  json_close_object
}

# ---------------------------------------------------------------
# الذاكرة — الأرقام الحية من meminfo، ومواصفات DRAM من قاعدة البيانات
# ---------------------------------------------------------------

add_memory() {
  mem_total_kb="$(awk '/^MemTotal:/ {print $2; exit}' /proc/meminfo 2>/dev/null)"
  mem_free_kb="$(awk '/^MemFree:/ {print $2; exit}' /proc/meminfo 2>/dev/null)"
  mem_avail_kb="$(awk '/^MemAvailable:/ {print $2; exit}' /proc/meminfo 2>/dev/null)"

  dram_src="none"
  dram_type="$(db_get memory.dram_type)"   && { dram_src="db"; db_mark "memory.dram_type"; }
  dram_vendor="$(db_get memory.dram_vendor)" && db_mark "memory.dram_vendor"
  dram_clock="$(db_get memory.dram_clock)"  && db_mark "memory.dram_clock"

  json_add_object "memory"
    json_add_int "mem_total_kb" "$(num_or "$mem_total_kb" 0)"
    [ -n "$mem_avail_kb" ] && json_add_int "mem_available_kb" "$mem_avail_kb"
    json_add_int "mem_free_kb" "$(num_or "$mem_free_kb" 0)"
    json_add_string "dram_type"   "${dram_type:-$UNKNOWN}"
    json_add_string "dram_vendor" "${dram_vendor:-$UNKNOWN}"
    json_add_string "dram_clock"  "${dram_clock:-$UNKNOWN}"
    json_add_string "dram_source" "$dram_src"
  json_close_object
}

# ---------------------------------------------------------------
# التخزين
# ---------------------------------------------------------------

detect_flash_chip() {
  # موديل شريحة الفلاش: سجل الإقلاع ← الكاش الدائم ← قاعدة البيانات
  m="$(grep -m1 -iE 'nand: .*(NAND|MiB)' "$BOOTLOG" 2>/dev/null | sed -e 's/^\[[^]]*\][[:space:]]*//' -e 's/^nand:[[:space:]]*//')"
  [ -z "$m" ] && m="$(grep -m1 -iE 'spi-nor.*(w25|mx25|gd25|en25|s25|xt25)' "$BOOTLOG" 2>/dev/null | sed 's/^\[[^]]*\][[:space:]]*//')"
  [ -n "$m" ] && { hwcache_set flash_chip "$m"; echo "$m"; return; }

  m="$(hwcache_get flash_chip)" && { echo "$m"; return; }
  m="$(db_get storage.chip_model)" && { db_mark "storage.chip_model"; echo "$m"; return; }
  echo "$UNKNOWN"
}

add_storage_mtd() {
  [ -r /proc/mtd ] || return 0

  mtdtmp="/tmp/mkspec_mtdarry.$$"
  outtmp="/tmp/mkspec_flasharry.$$"
  parttmp="/tmp/mkspec_parts.$$"
  : > "$mtdtmp" || return 0
  : > "$outtmp" || { rm -f "$mtdtmp"; return 0; }
  : > "$parttmp" || { rm -f "$mtdtmp" "$outtmp"; return 0; }

  first_nand=""
  while read -r line; do
    echo "$line" | grep -q '^mtd' || continue
    dev="$(echo "$line" | cut -d: -f1)"
    hexsize="$(echo "$line" | awk '{print $2}')"
    name="$(echo "$line" | sed -n 's/.*"\(.*\)".*/\1/p')"
    size="$(hex2dec "$hexsize")"
    type="$(read1 "/sys/class/mtd/$dev/type")"
    [ -z "$type" ] && type="unknown"
    [ "$type" = "nand" ] && [ -z "$first_nand" ] && first_nand="$dev"
    echo "${dev}|${type}|${size}" >> "$mtdtmp"
    echo "${dev}|${name:-?}|${size}|${type}" >> "$parttmp"
  done < /proc/mtd

  awk -F'|' '
    {
      t=$2; sz=$3;
      if (t == "") t="unknown";
      if (sz == "" || sz !~ /^[0-9]+$/) sz=0;
      section[t] += 1; total[t] += sz;
    }
    END { for (t in section) printf "%s|%d|%d\n", t, section[t], total[t]; }
  ' "$mtdtmp" > "$outtmp" 2>/dev/null

  chip="$(detect_flash_chip)"

  json_add_array "flash"
  while IFS='|' read -r t sec total_sz; do
    json_add_object
      json_add_string "type" "$t"
      json_add_int "section" "$(num_or "$sec" 0)"
      json_add_int "size_bytes" "$(num_or "$total_sz" 0)"
      json_add_string "chip_model" "$chip"
      if [ "$t" = "nand" ] && [ -n "$first_nand" ]; then
        ws="$(read1 "/sys/class/mtd/$first_nand/writesize")"
        es="$(read1 "/sys/class/mtd/$first_nand/erasesize")"
        os="$(read1 "/sys/class/mtd/$first_nand/oobsize")"
        json_add_int "page_bytes"  "$(num_or "$ws" 0)"
        json_add_int "erase_bytes" "$(num_or "$es" 0)"
        json_add_int "oob_bytes"   "$(num_or "$os" 0)"
      fi
    json_close_object
  done < "$outtmp"
  json_close_array

  json_add_array "partitions"
  while IFS='|' read -r dev name size type; do
    json_add_object
      json_add_string "dev" "$dev"
      json_add_string "name" "$name"
      json_add_int "size_bytes" "$(num_or "$size" 0)"
      json_add_string "type" "$type"
    json_close_object
  done < "$parttmp"
  json_close_array

  rm -f "$mtdtmp" "$outtmp" "$parttmp"
}

add_storage_mmc() {
  json_add_array "flash"
  for b in /sys/block/mmcblk*; do
    [ -d "$b" ] || continue
    bn="$(basename "$b")"
    case "$bn" in *boot*|*rpmb*) continue;; esac
    dev="/dev/$bn"
    [ -b "$dev" ] || continue

    size_bytes=0
    if hascmd blockdev; then
      size_bytes="$(blockdev --getsize64 "$dev" 2>/dev/null)"
    else
      blocks="$(read1 "$b/size")"
      blocks="$(num_or "$blocks" 0)"
      size_bytes=$((blocks * 512))
    fi

    model="$(read1 "$b/device/name")"
    vendor="$(read1 "$b/device/manfid")"

    json_add_object
      json_add_string "type" "mmc"
      json_add_int "section" 1
      json_add_int "size_bytes" "$(num_or "$size_bytes" 0)"
      json_add_string "chip_model" "${model:-$UNKNOWN}"
      [ -n "$vendor" ] && json_add_string "manfid" "$vendor"
    json_close_object
  done
  json_close_array
}

add_storage_ubi() {
  [ -d /sys/class/ubi/ubi0 ] || return 0
  json_add_object "ubi"
    json_add_int "total_eraseblocks" "$(num_or "$(read1 /sys/class/ubi/ubi0/total_eraseblocks)" 0)"
    json_add_int "bad_peb_count"     "$(num_or "$(read1 /sys/class/ubi/ubi0/bad_peb_count)" 0)"
    json_add_int "reserved_for_bad"  "$(num_or "$(read1 /sys/class/ubi/ubi0/reserved_for_bad)" 0)"
  json_close_object
}

add_storage() {
  json_add_object "storage"
    if [ -r /proc/mtd ]; then
      json_add_string "primary_type" "mtd"
      add_storage_mtd
    elif [ -b /dev/mmcblk0 ]; then
      json_add_string "primary_type" "mmc"
      add_storage_mmc
    else
      json_add_string "primary_type" "$UNKNOWN"
    fi
    add_storage_ubi
  json_close_object
}

# ---------------------------------------------------------------
# الحرارة — thermal zones + hwmon (تشمل حرارة شرائح الواي فاي)
# ---------------------------------------------------------------

milli_to_c() {
  v="$(num_or "$1" 0)"
  echo $((v / 1000))
}

add_temps() {
  json_add_array "temps"

  for tz in /sys/class/thermal/thermal_zone*; do
    [ -d "$tz" ] || continue
    t="$(read1 "$tz/temp")"
    [ -n "$t" ] || continue
    json_add_object
      json_add_string "sensor" "$(basename "$tz")"
      json_add_string "label" "$(read1 "$tz/type")"
      json_add_int "temp_c" "$(milli_to_c "$t")"
      json_add_string "source" "thermal"
    json_close_object
  done

  for h in /sys/class/hwmon/hwmon*; do
    [ -d "$h" ] || continue
    t="$(read1 "$h/temp1_input")"
    [ -n "$t" ] || continue
    json_add_object
      json_add_string "sensor" "$(basename "$h")"
      json_add_string "label" "$(read1 "$h/name")"
      json_add_int "temp_c" "$(milli_to_c "$t")"
      m="$(read1 "$h/temp1_max")";  [ -n "$m" ] && json_add_int "max_c"  "$(milli_to_c "$m")"
      c="$(read1 "$h/temp1_crit")"; [ -n "$c" ] && json_add_int "crit_c" "$(milli_to_c "$c")"
      th="$(read1 "$h/throttle1")"; [ -n "$th" ] && json_add_int "throttle_pct" "$(num_or "$th" 0)"
      json_add_string "source" "hwmon"
    json_close_object
  done

  json_close_array
}

# حرارة phy معين من hwmon (بالاسم مثل mt7915_phy0)
phy_temp_c() {
  phy="$1"
  for h in /sys/class/hwmon/hwmon*; do
    n="$(read1 "$h/name")"
    case "$n" in
      *"$phy")
        t="$(read1 "$h/temp1_input")"
        [ -n "$t" ] && { milli_to_c "$t"; return 0; }
        ;;
    esac
  done
  return 1
}

# ---------------------------------------------------------------
# الشبكة — السويتش + المنافذ الفيزيائية
# ---------------------------------------------------------------

detect_switch_live() {
  # كشف حي من سجل الإقلاع (DSA)
  m="$(grep -m1 -oiE 'mt753[01x]|mt7531|rtl83[0-9]+|qca8[0-9]+|ar8[0-9]+|bcm53[0-9]+' "$BOOTLOG" 2>/dev/null | head -n1)"
  [ -n "$m" ] && echo "$m" | tr 'a-z' 'A-Z'
}

add_network() {
  json_add_object "network"

    # السويتش: حي ثم الكاش الدائم ثم وحدة المعمارية ثم قاعدة البيانات
    sw_model=""
    sw_src="none"
    sw_model="$(detect_switch_live)" && [ -n "$sw_model" ] && { sw_src="live"; hwcache_set switch_model "$sw_model"; }
    if [ -z "$sw_model" ]; then
      c="$(hwcache_get switch_model)" && { sw_model="$c"; sw_src="cache"; }
    fi
    if [ -z "$sw_model" ]; then
      a="$(arch_switch_info)" && [ -n "$a" ] && { sw_model="${a%%|*}"; sw_src="arch"; }
    fi
    if [ -z "$sw_model" ]; then
      d="$(db_get network.switch_model)" && { sw_model="$d"; sw_src="db"; db_mark "network.switch_model"; }
    fi

    # عدّ المنافذ الفيزيائية الحية
    porttmp="/tmp/mkspec_ports.$$"
    : > "$porttmp"
    for p in /sys/class/net/*; do
      [ -d "$p" ] || continue
      n="$(basename "$p")"
      case "$n" in
        lo|br-*|phy*-ap*|wlan*|ifb*|tun*|tap*|gre*|sit*|ip6*|teql*|docker*|veth*) continue;;
      esac
      # منافذ فيزيائية فقط (لها جهاز أو من نوع DSA/ethernet)
      [ -e "$p/device" ] || [ -d "$p/dsa" ] || {
        case "$n" in eth*|lan*|wan*|sfp*) ;; *) continue;; esac
      }
      state="$(read1 "$p/operstate")"
      speed="$(read1 "$p/speed")"
      duplex="$(read1 "$p/duplex")"
      mac="$(read1 "$p/address")"
      echo "$n|${state:-?}|${speed:-0}|${duplex:-?}|${mac:-?}" >> "$porttmp"
    done

    port_count="$(wc -l < "$porttmp" 2>/dev/null)"
    port_count="$(num_or "$(trim "$port_count")" 0)"

    json_add_object "switch"
      json_add_string "model" "${sw_model:-$UNKNOWN}"
      json_add_string "source" "$sw_src"
      json_add_int "ports" "$port_count"
      json_add_string "type" "ethernet_switch"
    json_close_object

    json_add_array "ports"
    while IFS='|' read -r n state speed duplex mac; do
      json_add_object
        json_add_string "name" "$n"
        json_add_string "state" "$state"
        json_add_int "speed_mbps" "$(num_or "$speed" 0)"
        json_add_string "duplex" "$duplex"
        json_add_string "mac" "$mac"
      json_close_object
    done < "$porttmp"
    json_close_array

    rm -f "$porttmp"

    # محرك التشفير: سجل الإقلاع ← الكاش الدائم ← وحدة المعمارية
    ce="$(grep -m1 -oiE 'eip[0-9]+ crypto engine|safexcel|mtk[- ]crypto' "$BOOTLOG" 2>/dev/null)"
    if [ -n "$ce" ]; then
      hwcache_set crypto_engine "$ce"
    else
      ce="$(hwcache_get crypto_engine)"
    fi
    [ -z "$ce" ] && ce="$(arch_crypto_engine)"
    [ -n "$ce" ] && json_add_string "crypto_engine" "$ce"

  json_close_object
}

# ---------------------------------------------------------------
# الواي فاي
# ---------------------------------------------------------------

phy_iface() {
  # الواجهة المرتبطة بهذا الـ phy تحديدًا عبر phy80211
  # (device/net لا تصلح: أجهزة DBDC تشارك نفس جهاز PCI بين راديوين)
  for i in /sys/class/net/*; do
    [ -e "$i/phy80211" ] || continue
    n="$(basename "$(readlink -f "$i/phy80211" 2>/dev/null)")"
    [ "$n" = "$1" ] && { basename "$i"; return 0; }
  done
  return 1
}

wifi_bands_from_channels() {
  # iw phy X channels: أدق طريقة لاكتشاف الحزم وأقصى عرض قناة
  phy="$1"
  chtmp="/tmp/mkspec_ch.$$"
  iw phy "$phy" channels 2>/dev/null > "$chtmp" || { rm -f "$chtmp"; echo "|20"; return; }

  bands=""
  grep -qE '\* 2[0-9]{3}(\.[0-9])? MHz' "$chtmp" && bands="${bands}2.4,"
  grep -qE '\* 5[0-8][0-9]{2}(\.[0-9])? MHz' "$chtmp" && bands="${bands}5,"
  grep -qE '\* (59[5-9][0-9]|6[0-9]{3}|7[0-1][0-9]{2})(\.[0-9])? MHz' "$chtmp" && bands="${bands}6,"
  bands="$(echo "$bands" | sed 's/,$//')"

  maxw=20
  grep -qiE 'HT40' "$chtmp" && maxw=40
  grep -qiE 'VHT80|EHT80|80MHz' "$chtmp" && maxw=80
  grep -qiE 'VHT160|EHT160|160MHz' "$chtmp" && maxw=160
  grep -qiE 'EHT320|320MHz' "$chtmp" && maxw=320

  rm -f "$chtmp"
  echo "${bands}|${maxw}"
}

wifi_standards() {
  # المعايير: iwinfo (الأدق) ثم iw info المُخزن في $1 (ملف)
  infofile="$1"; iface="$2"

  if [ -n "$iface" ] && hascmd iwinfo; then
    hw="$(iwinfo "$iface" info 2>/dev/null | sed -n 's/.*HW Mode(s):[[:space:]]*802\.11\([^ ]*\).*/\1/p')"
    [ -n "$hw" ] && { echo "$hw"; return; }
  fi

  std=""
  grep -qi 'EHT ' "$infofile" && std="${std}be/"
  grep -qiE 'HE (Iftypes|MAC|PHY)' "$infofile" && std="${std}ax/"
  grep -qi 'VHT Capabilities' "$infofile" && std="${std}ac/"
  grep -qi 'HT Capabilities' "$infofile" && std="${std}n/"
  std="$(echo "$std" | sed 's|/$||')"
  [ -n "$std" ] && echo "$std" || echo "legacy"
}

wifi_add_features() {
  # قدرات متقدمة من iw phy info (المُخزن في ملف):
  # MIMO / MU-MIMO / SU-MIMO / Beamforming بأنواعه / TWT / OFDMA / 1024-QAM / LDPC / STBC
  infofile="$1"; txc="$2"; rxc="$3"

  has() { grep -qiE "$1" "$infofile"; }

  json_add_object "features"
    case "$txc$rxc" in
      *"$UNKNOWN"*) json_add_string "mimo" "$UNKNOWN";;
      *) json_add_string "mimo" "${txc}x${rxc}";;
    esac

    he=0
    has 'HE (Iftypes|MAC|PHY)' && he=1

    json_add_boolean "su_beamformer"  "$(has 'SU Beamformer' && echo 1 || echo 0)"
    json_add_boolean "su_beamformee"  "$(has 'SU Beamformee' && echo 1 || echo 0)"
    json_add_boolean "mu_beamformer"  "$(has 'MU Beamformer' && echo 1 || echo 0)"
    json_add_boolean "mu_beamformee"  "$(has 'MU Beamformee' && echo 1 || echo 0)"
    json_add_boolean "mu_mimo_dl"     "$(has 'DL MU-MIMO|MU Beamformer' && echo 1 || echo 0)"
    json_add_boolean "mu_mimo_ul"     "$(has 'UL MU-MIMO' && echo 1 || echo 0)"
    json_add_boolean "twt"            "$(has 'TWT (Requester|Responder)' && echo 1 || echo 0)"
    json_add_boolean "qam1024"        "$(has '1024-QAM' && echo 1 || echo 0)"
    json_add_boolean "ldpc"           "$(has 'LDPC' && echo 1 || echo 0)"
    json_add_boolean "stbc"           "$(has 'STBC' && echo 1 || echo 0)"
    # OFDMA جزء إلزامي من 802.11ax (هابط وصاعد)
    json_add_boolean "ofdma"          "$he"
  json_close_object
}

wifi_hardware_name() {
  iface="$1"
  [ -n "$iface" ] && hascmd iwinfo || return 1
  line="$(iwinfo "$iface" info 2>/dev/null | grep -m1 'Hardware:')"
  [ -n "$line" ] || return 1
  name="$(echo "$line" | sed -n 's/.*\[\(.*\)\].*/\1/p')"
  id="$(echo "$line" | sed -n 's/.*Hardware:[[:space:]]*\([^ ]*\).*/\1/p')"
  [ -n "$name" ] || return 1
  if [ -n "$id" ]; then
    echo "$name ($id)"
  else
    echo "$name"
  fi
}

add_wifi() {
  json_add_array "wifi"
  [ -d /sys/class/ieee80211 ] || { json_close_array; return 0; }

  for p in /sys/class/ieee80211/phy*; do
    [ -d "$p" ] || continue
    phy="$(basename "$p")"

    driver="$(grep -m1 '^DRIVER=' "$p/device/uevent" 2>/dev/null | cut -d= -f2)"
    [ -z "$driver" ] && driver="$UNKNOWN"

    bus="$UNKNOWN"
    if [ -L "$p/device/subsystem" ]; then
      bus="$(basename "$(readlink -f "$p/device/subsystem" 2>/dev/null)")"
    fi

    iface="$(phy_iface "$phy")"

    bw="$(wifi_bands_from_channels "$phy")"
    bands="${bw%%|*}"
    maxw="${bw##*|}"
    [ -z "$bands" ] && bands="$UNKNOWN"

    # قراءة iw phy info مرة واحدة لكل phy
    PHYINFO="/tmp/mkspec_phyinfo.$$"
    iw phy "$phy" info > "$PHYINFO" 2>/dev/null || : > "$PHYINFO"

    std="$(wifi_standards "$PHYINFO" "$iface")"

    # السلاسل من iw
    ant_line="$(grep -m1 'Available Antennas:' "$PHYINFO")"
    txmask="$(echo "$ant_line" | sed -n 's/.*TX[[:space:]]\+0x\([0-9a-fA-F]\+\).*/\1/p')"
    rxmask="$(echo "$ant_line" | sed -n 's/.*RX[[:space:]]\+0x\([0-9a-fA-F]\+\).*/\1/p')"
    txc="$UNKNOWN"; rxc="$UNKNOWN"
    [ -n "$txmask" ] && txc="$(popcount "$(hex2dec "$txmask")")"
    [ -n "$rxmask" ] && rxc="$(popcount "$(hex2dec "$rxmask")")"

    bf="no"
    grep -qiE 'beamform|TXBF' "$PHYINFO" && bf="yes"

    hwname="$(wifi_hardware_name "$iface")"

    json_add_object
      json_add_string "phy" "$phy"
      [ -n "$iface" ] && json_add_string "iface" "$iface"
      json_add_string "driver" "$driver"
      json_add_string "bus" "$bus"
      [ -n "$hwname" ] && json_add_string "hardware" "$hwname"
      pv="$(read1 "$p/device/vendor")"; [ -n "$pv" ] && json_add_string "pci_vendor" "$pv"
      pd="$(read1 "$p/device/device")"; [ -n "$pd" ] && json_add_string "pci_device" "$pd"
      json_add_string "bands" "$bands"
      json_add_string "standards" "$std"
      json_add_int "max_channel_width_mhz" "$(num_or "$maxw" 20)"
      json_add_string "tx_chains" "$txc"
      json_add_string "rx_chains" "$rxc"
      json_add_string "beamforming" "$bf"
      t="$(phy_temp_c "$phy")" && json_add_int "temp_c" "$t"
      wifi_add_features "$PHYINFO" "$txc" "$rxc"
    json_close_object

    rm -f "$PHYINFO"
  done

  json_close_array
}

# ---------------------------------------------------------------
# البيانات الوصفية
# ---------------------------------------------------------------

add_meta() {
  json_add_object "meta"
    json_add_string "arch_module" "$ARCH_MODULE"
    json_add_string "board" "$BOARD"
    json_add_boolean "db_match" "$DB_MATCH"
    json_add_array "db_fields"
    if [ -n "$DB_FIELDS" ]; then
      old_ifs="$IFS"; IFS=','
      for f in $DB_FIELDS; do
        json_add_string "" "$f"
      done
      IFS="$old_ifs"
    fi
    json_close_array
    json_add_int "generated_at" "$(date +%s 2>/dev/null || echo 0)"

    # مرجع قاعدة البيانات: معلومات لا تُقرأ حيًّا (الشرائح الفيزيائية، فئة السرعة)
    if [ "$DB_MATCH" = "1" ]; then
      json_add_object "db_ref"
        v="$(db_get name)"       && json_add_string "name" "$v"
        v="$(db_get wifi.chip)"  && json_add_string "wifi_chip" "$v"
        v="$(db_get wifi.class)" && json_add_string "wifi_class" "$v"
        v="$(db_get notes)"      && json_add_string "notes" "$v"
      json_close_object
    fi
  json_close_object
}

# ---------------------------------------------------------------
main() {
  json_init
  add_system
  add_cpu
  add_memory
  add_storage
  add_temps
  add_network
  add_wifi
  arch_extra_json
  add_meta
  json_dump
}

main "$@"
exit 0
