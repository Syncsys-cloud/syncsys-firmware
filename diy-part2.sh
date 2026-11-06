#!/bin/bash
# =================================================================
# SyncSys.cloud OS - DIY Script Part 2 (Custom Branding & Settings)
# =================================================================

# 1. Modify Default IP Address (Default: 192.168.1.1)
sed -i 's/192.168.1.1/192.168.1.1/g' package/base-files/files/bin/config_generate

# 2. Set Default Hostname
sed -i 's/OpenWrt/SyncSys-Router/g' package/base-files/files/bin/config_generate

# 3. Apply SyncSys.cloud Brand in /etc/openwrt_release
sed -i 's/DISTRIB_ID=.*/DISTRIB_ID="SyncSys.cloud"/' package/base-files/files/etc/openwrt_release
sed -i 's/DISTRIB_RELEASE=.*/DISTRIB_RELEASE="v1.0-LTS"/' package/base-files/files/etc/openwrt_release
sed -i 's/DISTRIB_DESCRIPTION=.*/DISTRIB_DESCRIPTION="SyncSys.cloud OS Enterprise Edition"/' package/base-files/files/etc/openwrt_release

# 4. Copy Custom Terminal Banner
if [ -f "$GITHUB_WORKSPACE/files/etc/banner" ]; then
    cp -f "$GITHUB_WORKSPACE/files/etc/banner" package/base-files/files/etc/banner
fi

# 5. Set Default Theme to Argon
sed -i 's/luci-theme-bootstrap/luci-theme-argon/g' feeds/luci/collections/luci/Makefile 2>/dev/null || true

# 6. Set Default Language to Arabic and English
echo "CONFIG_LUCI_LANG_ar=y" >> .config
echo "CONFIG_LUCI_LANG_en=y" >> .config
