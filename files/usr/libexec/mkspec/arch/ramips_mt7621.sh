# Copyright(c) 2025, SyncSys.cloud OS. All rights reserved.
#
# arch/ramips_mt7621.sh — وحدة معمارية MT7621 (ramips/mt7621)
#
# حقائق ثابتة للهدف MT7621 لا يمكن قراءتها حيًّا:
#   - المعالج MIPS 1004Kc ثنائي النواة/4 خيوط بتردد ثابت 880MHz (لا يوجد cpufreq)
#   - سويتش MT7530 مدمج داخل الـ SoC (5 منافذ خارجية + منفذا CPU)
#   - محرك تشفير EIP93
#
# الدوال كلها اختيارية؛ mkspec.sh يستدعيها ضمن سلسلة المصادر:
# live -> arch -> db -> "غير معروف"

# MT7621 يعمل بتردد ثابت — لا يوجد scaling
arch_cpu_cur_freq_mhz() { echo 880; }
arch_cpu_max_freq_mhz() { echo 880; }

arch_soc_name() { echo "MediaTek MT7621"; }

# "model|external_ports"
arch_switch_info() { echo "MT7530|5"; }

arch_crypto_engine() {
  # EIP93 مدمج؛ نتحقق من تحميله فعليًا وإلا نبلّغ عن وجوده كعتاد
  if grep -qi 'eip93' "$BOOTLOG" 2>/dev/null; then
    echo "EIP93 Crypto Engine (مُفعّل)"
  else
    echo "EIP93 Crypto Engine"
  fi
}

# أقسام إضافية خاصة بالمعمارية تُضاف إلى JSON الرئيسي
arch_extra_json() {
  json_add_object "soc"
    json_add_string "family" "MediaTek MT7621"
    json_add_string "process" "40nm"
    json_add_string "core" "MIPS 1004Kc (dual-core, 4 VPE)"
    json_add_string "ddr_controller" "DDR3 16-bit"
    json_add_string "interfaces" "RGMII, PCIe x3, USB 3.0, SPI, NAND"
  json_close_object
}
