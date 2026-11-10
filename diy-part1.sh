#!/bin/bash
# ==============================================================================
# SyncSys.cloud OS - DIY Script Part 1 (Pre-Feeds & Hardware Target Injection)
# Runs inside the ImmortalWrt source root directory BEFORE feeds & defconfig
# ==============================================================================
set -e

echo "🔧 [DIY-Part1] Injecting Qihoo 360T6GS (ramips/mt7621) hardware support..."

DTS_FILE="target/linux/ramips/dts/mt7621_qihoo_360t6gs.dts"
MK_FILE="target/linux/ramips/image/mt7621.mk"
NET_FILE="target/linux/ramips/mt7621/base-files/etc/board.d/02_network"
LED_FILE="target/linux/ramips/mt7621/base-files/etc/board.d/01_leds"

# 1. Create the Device Tree Source (DTS) for Qihoo 360T6GS (MT7621AT + MT7915E + 128MB NAND)
if [ ! -f "$DTS_FILE" ]; then
cat << 'DTS_EOF' > "$DTS_FILE"
// SPDX-License-Identifier: GPL-2.0-or-later OR MIT

#include "mt7621.dtsi"

#include <dt-bindings/gpio/gpio.h>
#include <dt-bindings/input/input.h>

/ {
	compatible = "qihoo,360t6gs", "mediatek,mt7621-soc";
	model = "Qihoo 360T6GS";

	aliases {
		led-boot = &led_status_green;
		led-failsafe = &led_status_red;
		led-running = &led_status_green;
		led-upgrade = &led_status_red;
		label-mac-device = &gmac0;
	};

	chosen {
		bootargs = "console=ttyS0,115200";
	};

	leds {
		compatible = "gpio-leds";

		led_status_red: status_red {
			label = "red:status";
			gpios = <&gpio 14 GPIO_ACTIVE_LOW>;
		};

		led_status_green: status_green {
			label = "green:status";
			gpios = <&gpio 13 GPIO_ACTIVE_LOW>;
		};
	};

	keys {
		compatible = "gpio-keys";

		reset {
			label = "reset";
			gpios = <&gpio 18 GPIO_ACTIVE_LOW>;
			linux,code = <KEY_RESTART>;
		};
	};
};

&nand {
	status = "okay";

	partitions {
		compatible = "fixed-partitions";
		#address-cells = <1>;
		#size-cells = <1>;

		partition@0 {
			label = "Bootloader";
			reg = <0x0 0x80000>;
			read-only;
		};

		partition@80000 {
			label = "u-boot-env";
			reg = <0x80000 0x40000>;
		};

		factory: partition@c0000 {
			label = "Factory";
			reg = <0xc0000 0x40000>;
			read-only;
		};

		partition@100000 {
			label = "Config";
			reg = <0x100000 0x40000>;
		};

		partition@140000 {
			label = "config";
			reg = <0x140000 0x80000>;
		};

		partition@1c0000 {
			label = "factory";
			reg = <0x1c0000 0x40000>;
			read-only;
		};

		partition@200000 {
			label = "kernel";
			reg = <0x200000 0x400000>;
		};

		partition@600000 {
			label = "ubi";
			reg = <0x600000 0x7400000>;
		};
	};
};

&pcie {
	status = "okay";
};

&pcie1 {
	wifi@0,0 {
		compatible = "mediatek,mt76";
		reg = <0x0000 0 0 0 0>;
		mediatek,mtd-eeprom = <&factory 0x0>;
	};
};

&gmac0 {
	nvmem-cells = <&macaddr_factory_4>;
	nvmem-cell-names = "mac-address";
};

&switch0 {
	ports {
		port@0 {
			status = "okay";
			label = "wan";
		};

		port@1 {
			status = "okay";
			label = "lan1";
		};

		port@2 {
			status = "okay";
			label = "lan2";
		};

		port@3 {
			status = "okay";
			label = "lan3";
		};
	};
};

&factory {
	compatible = "nvmem-cells";
	#address-cells = <1>;
	#size-cells = <1>;

	macaddr_factory_4: macaddr@4 {
		reg = <0x4 0x6>;
	};
};
DTS_EOF
    echo "  ✓ Created $DTS_FILE"
fi

# 2. Add Device/qihoo_360t6gs block to target/linux/ramips/image/mt7621.mk
if [ -f "$MK_FILE" ] && ! grep -q "define Device/qihoo_360t6gs" "$MK_FILE"; then
cat << 'MK_EOF' >> "$MK_FILE"

define Device/qihoo_360t6gs
  $(Device/dsa-migration)
  $(Device/uimage-lzma-loader)
  BLOCKSIZE := 128k
  PAGESIZE := 2048
  KERNEL_SIZE := 4096k
  UBINIZE_OPTS := -E 5
  IMAGE_SIZE := 118784k
  IMAGES += factory.bin
  IMAGE/factory.bin := append-kernel | pad-to $$(KERNEL_SIZE) | append-ubi
  IMAGE/sysupgrade.bin := sysupgrade-tar | append-metadata
  DEVICE_VENDOR := Qihoo
  DEVICE_MODEL := 360T6GS
  DEVICE_PACKAGES := kmod-mt7915e kmod-mt7915-firmware uboot-envtools
endef
TARGET_DEVICES += qihoo_360t6gs
MK_EOF
    echo "  ✓ Added Device/qihoo_360t6gs to $MK_FILE"
fi

# 3. Register DSA switch ports (lan1..lan3 + wan) in 02_network
if [ -f "$NET_FILE" ] && ! grep -q "qihoo,360t6gs" "$NET_FILE"; then
    sed -i 's/xiaomi,mi-router-cr6609)/qihoo,360t6gs|\\\n\txiaomi,mi-router-cr6609)/' "$NET_FILE"
    echo "  ✓ Registered qihoo,360t6gs switch layout in $NET_FILE"
fi

# 4. Register WAN LED in 01_leds
if [ -f "$LED_FILE" ] && ! grep -q "qihoo,360t6gs" "$LED_FILE"; then
    sed -i '/ramips_board_name)/a \
qihoo,360t6gs)\
\tucidef_set_led_netdev "wan" "wan link" "red:status" "wan"\
\t;;' "$LED_FILE"
    echo "  ✓ Registered qihoo,360t6gs WAN LED in $LED_FILE"
fi

echo "✅ [DIY-Part1] Completed successfully."