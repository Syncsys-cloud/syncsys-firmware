#!/bin/bash
# =================================================================
# SyncSys.cloud OS - DIY Script Part 2 (Performance + Arabic + Branding)
# =================================================================

echo "🚀 SyncSys.cloud OS Builder - Applying customizations..."

# 1. Set Default Hostname
sed -i 's/OpenWrt/SyncSys-Router/g' package/base-files/files/bin/config_generate
sed -i 's/ImmortalWrt/SyncSys-Router/g' package/base-files/files/bin/config_generate

# 2. Apply SyncSys.cloud Brand in /etc/openwrt_release
sed -i 's/DISTRIB_ID=.*/DISTRIB_ID="SyncSys.cloud"/' package/base-files/files/etc/openwrt_release
sed -i 's/DISTRIB_RELEASE=.*/DISTRIB_RELEASE="v3.0-LTS"/' package/base-files/files/etc/openwrt_release
sed -i 's/DISTRIB_DESCRIPTION=.*/DISTRIB_DESCRIPTION="SyncSys.cloud OS Enterprise Edition v3.0 (25.12)"/' package/base-files/files/etc/openwrt_release

# 3. Copy Custom Terminal Banner
if [ -f "$GITHUB_WORKSPACE/files/etc/banner" ]; then
    cp -f "$GITHUB_WORKSPACE/files/etc/banner" package/base-files/files/etc/banner
fi

# 4. FORCE FULL ARABIC AS DEFAULT SYSTEM LANGUAGE
sed -i "s/option lang 'auto'/option lang 'ar'/g" package/feeds/luci/luci-base/root/etc/config/luci 2>/dev/null || true
sed -i "s/option lang 'auto'/option lang 'ar'/g" feeds/luci/modules/luci-base/root/etc/config/luci 2>/dev/null || true

# 5. Set Default Timezone to GMT+3 (Asia/Riyadh)
sed -i "s/'UTC'/'Asia\/Riyadh'/g" package/base-files/files/bin/config_generate
sed -i "s/'UTC0'/'AST-3'/g" package/base-files/files/bin/config_generate

# 6. Set Default Theme to Argon (remove bootstrap)
sed -i 's/luci-theme-bootstrap/luci-theme-argon/g' feeds/luci/collections/luci/Makefile 2>/dev/null || true

# 7. Unlock Maximum Wi-Fi Transmit Power
sed -i 's/country=US/country=00/g' package/kernel/mac80211/files/lib/wifi/mac80211.sh 2>/dev/null || true

# 8. Force compile Arabic + English language
echo "CONFIG_LUCI_LANG_ar=y" >> .config
echo "CONFIG_LUCI_LANG_en=y" >> .config

# 9. Copy ALL branding/overlay files into the build
if [ -d "$GITHUB_WORKSPACE/files" ]; then
    echo "📂 Copying SyncSys branding files..."
    cp -rf "$GITHUB_WORKSPACE/files/"* files/ 2>/dev/null || mkdir -p files && cp -rf "$GITHUB_WORKSPACE/files/"* files/
    echo "✅ Branding files copied to firmware overlay"
fi

# 10. Performance: Default WiFi settings (higher performance)
cat >> files/etc/uci-defaults/99-syncsys-wifi <<'WIFI_EOF'
#!/bin/sh
# SyncSys.cloud WiFi Performance Defaults
uci batch <<EOF
set wireless.radio0.country='SA'
set wireless.radio0.channel='auto'
set wireless.radio0.htmode='HT40'
set wireless.radio0.noscan='1'
set wireless.radio0.disabled='0'
set wireless.radio1.country='SA'
set wireless.radio1.channel='auto'
set wireless.radio1.htmode='VHT80'
set wireless.radio1.disabled='0'

set wireless.default_radio0.ssid='SyncSys-Cloud'
set wireless.default_radio0.encryption='psk2'
set wireless.default_radio0.key='SyncSys2026'

set wireless.default_radio1.ssid='SyncSys-Cloud-5G'
set wireless.default_radio1.encryption='psk2'
set wireless.default_radio1.key='SyncSys2026'
EOF
uci commit wireless
wifi reload
WIFI_EOF
chmod +x files/etc/uci-defaults/99-syncsys-wifi

# 11. Performance: System tuning
cat >> files/etc/uci-defaults/98-syncsys-performance <<'PERF_EOF'
#!/bin/sh
# SyncSys.cloud Performance Tuning

# Enable zram swap for better performance on 128MB RAM
if [ -e /dev/zram0 ]; then
    echo lz4 > /sys/block/zram0/comp_algorithm 2>/dev/null
    echo 64M > /sys/block/zram0/disksize 2>/dev/null
    mkswap /dev/zram0 2>/dev/null
    swapon /dev/zram0 2>/dev/null
fi

# Network performance
sysctl -w net.core.default_qdisc=fq_codel 2>/dev/null
sysctl -w net.ipv4.tcp_congestion_control=bbr 2>/dev/null || true
sysctl -w net.core.somaxconn=1024 2>/dev/null
sysctl -w net.core.netdev_max_backlog=2000 2>/dev/null
sysctl -w net.ipv4.tcp_fastopen=3 2>/dev/null
sysctl -w net.ipv4.tcp_mtu_probing=1 2>/dev/null

# DNS performance
sysctl -w net.ipv4.tcp_timestamps=1 2>/dev/null
sysctl -w net.ipv4.tcp_sack=1 2>/dev/null

# Set LuCI to dark mode by default
uci -c /etc/config set argon.@global[0].mode='dark' 2>/dev/null || true
uci -c /etc/config commit argon 2>/dev/null || true
PERF_EOF
chmod +x files/etc/uci-defaults/98-syncsys-performance

# 11b. Set root password at BUILD TIME via shadow file overlay
echo "🔑 Setting root password..."
ROOT_HASH=$(openssl passwd -1 -salt SyncSys root 2>/dev/null)
if [ -n "$ROOT_HASH" ]; then
    mkdir -p files/etc
    echo "root:${ROOT_HASH}:0:0:99999:7:::" > files/etc/shadow
    chmod 600 files/etc/shadow
    echo "✅ Root password 'root' baked into firmware shadow file"
else
    # Fallback: set via uci-defaults (runs on first boot)
    cat > files/etc/uci-defaults/97-syncsys-passwd <<'PASSWD_EOF'
#!/bin/sh
(echo "root"; echo "root") | passwd root
PASSWD_EOF
    chmod +x files/etc/uci-defaults/97-syncsys-passwd
    echo "⚠️ Root password will be set on first boot via uci-defaults"
fi

# 12. Performance: Persistent sysctl
mkdir -p files/etc/sysctl.d
cat > files/etc/sysctl.d/99-syncsys-perf.conf <<'SYSCTL_EOF'
# SyncSys.cloud Performance Sysctl
net.core.default_qdisc=fq_codel
net.core.somaxconn=1024
net.core.netdev_max_backlog=2000
net.ipv4.tcp_fastopen=3
net.ipv4.tcp_mtu_probing=1
net.ipv4.tcp_timestamps=1
net.ipv4.tcp_sack=1
vm.swappiness=60
vm.dirty_ratio=30
vm.dirty_background_ratio=5
SYSCTL_EOF

echo "✅ SyncSys.cloud OS customizations applied successfully!"
