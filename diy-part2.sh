#!/bin/bash
# ==============================================================================
# SyncSys.cloud OS - DIY Script Part 2 (Sanitization, Branding & Safe Password)
# Runs inside the ImmortalWrt source root directory AFTER feeds install
# ==============================================================================
set -e

echo "🚀 [DIY-Part2] Applying SyncSys.cloud OS v3.1 customizations..."

# 1. Set Default Hostname in config_generate
sed -i 's/OpenWrt/SyncSys-Router/g' package/base-files/files/bin/config_generate
sed -i 's/ImmortalWrt/SyncSys-Router/g' package/base-files/files/bin/config_generate

# 2. Apply SyncSys.cloud Brand in /etc/openwrt_release
sed -i 's/DISTRIB_ID=.*/DISTRIB_ID="SyncSys.cloud"/' package/base-files/files/etc/openwrt_release
sed -i 's/DISTRIB_RELEASE=.*/DISTRIB_RELEASE="v3.1-LTS"/' package/base-files/files/etc/openwrt_release
sed -i 's/DISTRIB_DESCRIPTION=.*/DISTRIB_DESCRIPTION="SyncSys.cloud OS Enterprise Edition v3.1"/' package/base-files/files/etc/openwrt_release

# 3. Force Full Arabic as Default LuCI Language
sed -i "s/option lang 'auto'/option lang 'ar'/g" package/feeds/luci/luci-base/root/etc/config/luci 2>/dev/null || true
sed -i "s/option lang 'auto'/option lang 'ar'/g" feeds/luci/modules/luci-base/root/etc/config/luci 2>/dev/null || true
echo "CONFIG_LUCI_LANG_ar=y" >> .config
echo "CONFIG_LUCI_LANG_en=y" >> .config

# 4. Set Default Timezone to GMT+3 (Asia/Riyadh)
sed -i "s/'UTC'/'Asia\/Riyadh'/g" package/base-files/files/bin/config_generate
sed -i "s/'UTC0'/'<+03>-3'/g" package/base-files/files/bin/config_generate

# 5. Set Default Theme to Argon
sed -i 's/luci-theme-bootstrap/luci-theme-argon/g' feeds/luci/collections/luci/Makefile 2>/dev/null || true

# 6. Unlock Maximum Wi-Fi Transmit Power in mac80211
sed -i 's/country=US/country=00/g' package/kernel/mac80211/files/lib/wifi/mac80211.sh 2>/dev/null || true

# 7. Safely Set Root Password IN-PLACE in package/base-files/files/etc/shadow
# CRITICAL FIX: Never overwrite files/etc/shadow with a single line, as that
# deletes dnsmasq, network, ubus, daemon, and nobody system accounts!
echo "🔑 Baking root password safely into base-files shadow..."
ROOT_HASH=$(openssl passwd -1 -salt SyncSys root 2>/dev/null || true)
if [ -n "$ROOT_HASH" ] && [ -f "package/base-files/files/etc/shadow" ]; then
    sed -i "s|^root:[^:]*:|root:${ROOT_HASH}:|" package/base-files/files/etc/shadow
    echo "  ✓ Updated root password hash in package/base-files/files/etc/shadow"
fi

# 8. Copy Branding & Custom App Overlay Files
mkdir -p files
if [ -d "$GITHUB_WORKSPACE/files" ]; then
    echo "📂 Copying SyncSys overlay files..."
    cp -rf "$GITHUB_WORKSPACE/files/"* files/
fi

# Copy custom terminal banner into base-files if present
if [ -f "files/etc/banner" ]; then
    cp -f "files/etc/banner" package/base-files/files/etc/banner
fi

# 9. CRITICAL SANITIZATION: Remove Core OS Files That Corrupt Target Routers
echo "🧹 Sanitizing files/ overlay to prevent boot/network corruption..."

# 9a. Never allow files/etc/shadow to overwrite base-files /etc/shadow
rm -f files/etc/shadow files/etc/passwd files/etc/group

# 9b. Remove static hardware/service configs that break DSA switches, Wi-Fi, or uhttpd
for cfg in network wireless system dhcp firewall uhttpd dropbear rpcd luci; do
    rm -f "files/etc/config/${cfg}"
done

# 9c. Remove core OpenWrt init.d scripts accidentally copied from old router dumps
for init_script in \
    boot bootcount cron dnsmasq done dropbear firewall fstab gpio_switch \
    led lldpd log network odhcpd openssl packet_steering rpcd sysctl \
    sysfixtime sysntpd system ubihealthd ucitrack uhttpd umount \
    urandom_seed urngd wpad; do
    rm -f "files/etc/init.d/${init_script}"
done

# 9d. Remove precompiled system ELF binaries from files/usr/libexec/
# ImmortalWrt compiles native binaries for each target (MIPS vs ARM64).
for sys_bin in \
    base64-coreutils batctl-default brctl-bridge-utils cgi-io \
    ip-full ip-tiny logread-ubox tc-tiny; do
    rm -f "files/usr/libexec/${sys_bin}"
done

# 9e. If building for ARM64 (Qihoo 360T7) or MT7620 (MiWiFi Mini), remove
# 32-bit MT7621 MIPS ELF binaries so incompatible binaries or oversized assets
# do not break the target image.
if grep -q "CONFIG_TARGET_mediatek=y" .config; then
    echo "  -> ARM64 target detected (Qihoo 360T7): removing 32-bit MIPS ELF binaries..."
    find files/usr/libexec/ -type f -exec sh -c '
        for f do
            if file "$f" | grep -q "ELF.*MIPS"; then
                echo "     Removed MIPS ELF binary: $f"
                rm -f "$f"
            fi
        done
    ' sh {} +
elif grep -q "CONFIG_TARGET_ramips_mt7620=y" .config; then
    echo "  -> 16MB NOR target detected (Xiaomi MiWiFi Mini): trimming heavy binaries..."
    rm -rf files/usr/libexec/mkmtdcm files/usr/libexec/tx-t6
fi

# 10. Add Persistent Sysctl Tuning
mkdir -p files/etc/sysctl.d
cat << 'SYSCTL_EOF' > files/etc/sysctl.d/99-syncsys-perf.conf
net.core.default_qdisc=fq_codel
net.core.somaxconn=1024
net.core.netdev_max_backlog=2000
net.ipv4.tcp_fastopen=3
net.ipv4.tcp_mtu_probing=1
net.ipv4.tcp_timestamps=1
net.ipv4.tcp_sack=1
vm.swappiness=60
SYSCTL_EOF

# 11. Strip Windows CRLF (\r) Line Endings & Fix Permissions Across All Scripts
echo "🔧 Normalizing LF line endings and executable permissions..."
find files/ -type f \( \
    -name "*.sh" -o -name "*.lua" -o -name "*.ut" -o -name "*.js" -o \
    -name "*.json" -o -name "*.css" -o -path "*/etc/init.d/*" -o \
    -path "*/etc/uci-defaults/*" -o -path "*/etc/config/*" -o \
    -path "*/usr/libexec/rpcd/*" \
\) -exec sed -i 's/\r$//' {} +

[ -d "files/etc/init.d" ] && chmod -R 755 files/etc/init.d/
[ -d "files/etc/uci-defaults" ] && chmod -R 755 files/etc/uci-defaults/
[ -d "files/usr/libexec" ] && chmod -R 755 files/usr/libexec/

echo "✅ [DIY-Part2] SyncSys.cloud OS overlay sanitized and ready!"