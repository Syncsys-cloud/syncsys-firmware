# Copyright(c) 2025, ALMalaki Openwrt Systems. All rights reserved.
#
# arch/generic.sh — الوحدة الاحتياطية لأي معمارية بلا وحدة مخصصة
#
# لا تعرّف أي حقائق ثابتة؛ يعتمد mkspec.sh على القراءة الحية
# ثم قاعدة البيانات المرجعية db/devices.json.
#
# لإضافة معمارية جديدة أنشئ ملفًا باسم الهدف مع استبدال "/" بـ "_":
#   mediatek/filogic  ->  arch/mediatek_filogic.sh
#   qualcommax/ipq807x -> arch/qualcommax_ipq807x.sh
# وعرّف ما يلزم من الدوال:
#   arch_cpu_cur_freq_mhz / arch_cpu_max_freq_mhz
#   arch_soc_name
#   arch_switch_info        (يطبع "model|ports")
#   arch_crypto_engine
#   arch_extra_json         (أقسام JSON إضافية)

:
