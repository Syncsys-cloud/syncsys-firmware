#!/bin/sh
# ====================================================================
# SyncSys.cloud ACS & License Client Agent
# Communicates with SyncSysAcsServer (.NET Backend on Port 7501/7547)
# ====================================================================

CONFIG="/etc/config/syncsys"
STATUS_FILE="/tmp/syncsys_cloud.json"

get_mac() {
	local mac=""
	for iface in eth0 br-lan eth1 ra0 wlan0; do
		if [ -f "/sys/class/net/$iface/address" ]; then
			mac=$(cat "/sys/class/net/$iface/address" 2>/dev/null)
			[ -n "$mac" -a "$mac" != "00:00:00:00:00:00" ] && break
		fi
	done
	echo "$mac" | tr 'A-Z' 'a-z'
}

get_model() {
	local m=""
	if command -v ubus >/dev/null 2>&1; then
		m=$(ubus call system board 2>/dev/null | jsonfilter -e '@.model' 2>/dev/null)
	fi
	[ -z "$m" -a -f /tmp/sysinfo/model ] && m=$(cat /tmp/sysinfo/model 2>/dev/null)
	[ -z "$m" ] && m="SyncSys-Router"
	echo "$m"
}

get_ip() {
	local ip=""
	ip=$(ip -4 addr show br-lan 2>/dev/null | grep -o 'inet [0-9.]*' | cut -d' ' -f2)
	[ -z "$ip" ] && ip="192.168.1.1"
	echo "$ip"
}

run_check() {
	local enabled server_url client_id interval
	enabled=$(uci -q get syncsys.main.enabled || echo "1")
	[ "$enabled" != "1" ] && return 0

	server_url=$(uci -q get syncsys.main.server_url || echo "http://192.168.1.23:7501")
	client_id=$(uci -q get syncsys.main.client_id || echo "1")

	local mac=$(get_mac)
	local model=$(get_model)
	local local_ip=$(get_ip)
	local now=$(date '+%Y-%m-%d %H:%M:%S')

	[ -z "$mac" ] && return 1

	# 1. Contact .NET License Activation API
	local enc_model=$(echo "$model" | sed 's/ /%20/g')
	local api_url="${server_url}/api/license/activate?mac=${mac}&model=${enc_model}&clientId=${client_id}"

	local resp=$(curl -s -m 6 "$api_url" 2>/dev/null)

	if [ -n "$resp" ] && echo "$resp" | grep -q '"success":true'; then
		# Activated & Active
		cat > "$STATUS_FILE" <<EOF
{
  "connected": true,
  "status": "Active",
  "mac": "$mac",
  "model": "$model",
  "ip": "$local_ip",
  "server": "$server_url",
  "last_checkin": "$now"
}
EOF
		# Keep local apps permanently licensed
		mkdir -p /etc/mkapp
		touch /etc/mkapp/.mkdash_licensed
		[ -f /usr/libexec/mkdash/mkdash-verify ] && chmod +x /usr/libexec/mkdash/mkdash-verify
	else
		# Check if server is unreachable or device blacklisted
		local is_blacklisted=$(curl -s -m 5 "${server_url}/api/devices/filter?search=${mac}" 2>/dev/null | grep -i '"licenseStatus":"Revoked"')
		if [ -n "$is_blacklisted" ]; then
			cat > "$STATUS_FILE" <<EOF
{
  "connected": true,
  "status": "Revoked",
  "mac": "$mac",
  "model": "$model",
  "ip": "$local_ip",
  "server": "$server_url",
  "last_checkin": "$now"
}
EOF
		else
			# Server offline or unreachable currently
			cat > "$STATUS_FILE" <<EOF
{
  "connected": false,
  "status": "Offline (Cached License)",
  "mac": "$mac",
  "model": "$model",
  "ip": "$local_ip",
  "server": "$server_url",
  "last_checkin": "$now"
}
EOF
		fi
	fi
}

# Main loop
while true; do
	run_check
	sleep_sec=$(uci -q get syncsys.main.interval || echo "60")
	[ "$sleep_sec" -lt 15 ] 2>/dev/null && sleep_sec=60
	sleep "$sleep_sec"
done

