#!/bin/bash
# =================================================================
# SyncSys.cloud OS - DIY Script Part 2 (Full Arabic Localization)
# =================================================================

# 1. Modify Default IP Address (Default: 192.168.1.1)
sed -i 's/192.168.1.1/192.168.1.1/g' package/base-files/files/bin/config_generate

# 2. Set Default Hostname
sed -i 's/OpenWrt/SyncSys-Router/g' package/base-files/files/bin/config_generate

# 3. Apply SyncSys.cloud Brand in /etc/openwrt_release
sed -i 's/DISTRIB_ID=.*/DISTRIB_ID="SyncSys.cloud"/' package/base-files/files/etc/openwrt_release
sed -i 's/DISTRIB_RELEASE=.*/DISTRIB_RELEASE="v1.0-LTS"/' package/base-files/files/etc/openwrt_release
sed -i 's/DISTRIB_DESCRIPTION=.*/DISTRIB_DESCRIPTION="SyncSys.cloud OS Enterprise Edition (النسخة العربية الكاملة)"/' package/base-files/files/etc/openwrt_release

# 4. Copy Custom Terminal Banner
if [ -f "$GITHUB_WORKSPACE/files/etc/banner" ]; then
    cp -f "$GITHUB_WORKSPACE/files/etc/banner" package/base-files/files/etc/banner
fi

# 5. FORCE FULL ARABIC AS DEFAULT SYSTEM LANGUAGE (تعريب النظام بالكامل)
sed -i "s/option lang 'auto'/option lang 'ar'/g" package/feeds/luci/luci-base/root/etc/config/luci 2>/dev/null || true
sed -i "s/option lang 'auto'/option lang 'ar'/g" feeds/luci/modules/luci-base/root/etc/config/luci 2>/dev/null || true

# 6. Set Default Timezone to GMT+3 (Asia/Riyadh)
sed -i "s/'UTC'/'Asia\/Riyadh'/g" package/base-files/files/bin/config_generate
sed -i "s/'UTC'/'AST-3'/g" package/base-files/files/bin/config_generate

# 7. Set Default Theme to Argon
sed -i 's/luci-theme-bootstrap/luci-theme-argon/g' feeds/luci/collections/luci/Makefile 2>/dev/null || true

# 8. Unlock Maximum Wi-Fi Transmit Power (30dBm / 1000mW)
sed -i 's/country=US/country=00/g' package/kernel/mac80211/files/lib/wifi/mac80211.sh 2>/dev/null || true

# 9. Force compile Arabic language dependencies
echo "CONFIG_LUCI_LANG_ar=y" >> .config
echo "CONFIG_LUCI_LANG_en=y" >> .config
