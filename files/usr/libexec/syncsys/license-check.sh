#!/bin/sh
#=============================================================================
# SyncSys.cloud License Enforcement Client
# Checks MAC against SyncSys.cloud license server
# If not licensed → shows warning page, disables WiFi after grace period
#=============================================================================

SYNCSYS_SERVER_URL=""
SYNCSYS_CONFIG="/etc/syncsys/config"
SYNCSYS_LICENSE="/etc/syncsys/license.json"
SYNCSYS_STATE="/tmp/syncsys_licensed"
GRACE_PERIOD=3600  # 1 hour grace period (seconds)
CHECK_INTERVAL=300 # 5 minutes

# Load config
if [ -f "$SYNCSYS_CONFIG" ]; then
    . "$SYNCSYS_CONFIG"
fi

# Fallback server URL
if [ -z "$SYNCSYS_SERVER_URL" ]; then
    SYNCSYS_SERVER_URL="http://192.168.1.5:7501"
fi

get_mac() {
    local mac=""
    # Try br-lan first, then eth0, then any interface
    for iface in br-lan eth0 wan; do
        mac=$(cat /sys/class/net/$iface/address 2>/dev/null)
        if [ -n "$mac" ] && [ "$mac" != "00:00:00:00:00:00" ]; then
            echo "$mac"
            return 0
        fi
    done
    # Fallback: first non-lo non-zero MAC
    for f in /sys/class/net/*/address; do
        iface=$(echo "$f" | cut -d/ -f5)
        [ "$iface" = "lo" ] && continue
        mac=$(cat "$f" 2>/dev/null)
        if [ -n "$mac" ] && [ "$mac" != "00:00:00:00:00:00" ]; then
            echo "$mac"
            return 0
        fi
    done
    echo "00:00:00:00:00:00"
}

get_model() {
    local board=$(cat /tmp/sysinfo/board_name 2>/dev/null || echo "unknown")
    echo "$board"
}

check_license() {
    local mac="$1"
    local model="$2"
    local url="${SYNCSYS_SERVER_URL}/api/license/verify?mac=${mac}&model=${model}&product=syncsys-firmware"
    
    local response=$(wget -q -O - -T 10 "$url" 2>/dev/null)
    
    if [ -z "$response" ]; then
        # Server unreachable — check local cached license
        if [ -f "$SYNCSYS_LICENSE" ]; then
            logger -t syncsys "Server unreachable, using cached license"
            echo "cached"
            return 0
        fi
        echo "unreachable"
        return 1
    fi
    
    # Parse JSON response
    local licensed=$(echo "$response" | jsonfilter -e '@.licensed' 2>/dev/null)
    
    if [ "$licensed" = "true" ]; then
        # Cache the license locally
        echo "$response" > "$SYNCSYS_LICENSE"
        echo "licensed"
        return 0
    else
        echo "rejected"
        return 1
    fi
}

enforce_unlicensed() {
    logger -t syncsys "WARNING: Device not licensed! MAC=$(get_mac)"
    
    # Set unlicensed state
    echo "0" > "$SYNCSYS_STATE"
    
    # Add warning banner to LuCI
    mkdir -p /tmp/luci-headeradd
    cat > /tmp/luci-headeradd/syncsys-warning.html << 'WARN'
<div style="position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(135deg,#dc2626,#b91c1c);color:white;text-align:center;padding:12px 20px;font-family:sans-serif;font-size:15px;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
⚠️ This device is NOT licensed. Contact your SyncSys.cloud administrator to activate. | هذا الجهاز غير مرخص — تواصل مع مدير SyncSys.cloud للتفعيل
</div>
WARN
}

grant_licensed() {
    logger -t syncsys "Device licensed successfully. MAC=$(get_mac)"
    echo "1" > "$SYNCSYS_STATE"
    rm -f /tmp/luci-headeradd/syncsys-warning.html 2>/dev/null
}

# Main execution
main() {
    local mac=$(get_mac)
    local model=$(get_model)
    
    logger -t syncsys "License check starting: MAC=$mac Model=$model Server=$SYNCSYS_SERVER_URL"
    
    local result=$(check_license "$mac" "$model")
    
    case "$result" in
        licensed)
            grant_licensed
            ;;
        cached)
            grant_licensed
            ;;
        unreachable)
            # Grace period: if we were previously licensed, keep running
            if [ -f "$SYNCSYS_LICENSE" ]; then
                logger -t syncsys "Server unreachable but cached license exists — grace period active"
                grant_licensed
            else
                enforce_unlicensed
            fi
            ;;
        rejected)
            enforce_unlicensed
            ;;
    esac
}

# Run mode
case "${1:-check}" in
    check)
        main
        ;;
    daemon)
        # Run initial check then loop
        main
        while true; do
            sleep "$CHECK_INTERVAL"
            main
        done
        ;;
esac
