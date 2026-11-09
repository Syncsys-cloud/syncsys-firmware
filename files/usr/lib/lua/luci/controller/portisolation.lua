module("luci.controller.portisolation", package.seeall)

local http = require "luci.http"
local jsonc = require "luci.jsonc"
local sys = require "luci.sys"
local nixiofs = require "nixio.fs"
local uci = require("luci.model.uci").cursor()

function index()
	if not nixiofs.access("/etc/config/portisolation") then
		return
	end

	entry({"admin", "almalaki-app", "port-isolation", "status_json"}, call("action_status_json")).leaf = true
	entry({"admin", "almalaki-app", "port-isolation", "insights_json"}, call("action_insights_json")).leaf = true
	entry({"admin", "almalaki-app", "port-isolation", "presets_json"}, call("action_presets_json")).leaf = true
	entry({"admin", "almalaki-app", "port-isolation", "preset_apply"}, call("action_preset_apply")).leaf = true
	entry({"admin", "almalaki-app", "port-isolation", "config_export"}, call("action_config_export")).leaf = true
	entry({"admin", "almalaki-app", "port-isolation", "config_import"}, call("action_config_import")).leaf = true
	entry({"admin", "almalaki-app", "port-isolation", "service_action"}, call("action_service_action")).leaf = true
	entry({"admin", "almalaki-app", "port-isolation", "loopd_json"}, call("action_loopd_json")).leaf = true
	entry({"admin", "almalaki-app", "port-isolation", "loopd_action"}, call("action_loopd_action")).leaf = true
end

local function split_words(value)
	local out = {}

	if not value or value == "" then
		return out
	end

	for item in tostring(value):gmatch("%S+") do
		out[#out + 1] = item
	end

	return out
end

local function get_list(config, section, option)
	return uci:get_list(config, section, option) or {}
end

local function is_on(value)
	return tostring(value or "0") == "1"
end

local function join_list(list, fallback)
	if not list or #list == 0 then
		return fallback or "-"
	end

	return table.concat(list, ", ")
end

local function glob_to_pattern(glob)
	local pattern = tostring(glob or "")
	pattern = pattern:gsub("([%^%$%(%)%%%.%[%]%+%-])", "%%%1")
	pattern = pattern:gsub("%*", ".*")
	pattern = pattern:gsub("%?", ".")
	return "^" .. pattern .. "$"
end

local function matches_any(item, exact, patterns)
	for _, token in ipairs(exact or {}) do
		if item == token then
			return true
		end
	end

	for _, token in ipairs(patterns or {}) do
		if item:match(glob_to_pattern(token)) then
			return true
		end
	end

	return false
end

local function read_applied_roles()
	local data = nixiofs.readfile("/tmp/portisolation.roles")
	if not data or data == "" then
		return nil
	end

	local roles = {}
	local found = false
	for line in data:gmatch("[^\r\n]+") do
		local port, role = line:match("^(%S+)%s+(%S+)$")
		if port and role and port ~= "bridge" then
			roles[port] = role
			found = true
		end
	end

	return found and roles or nil
end

local function role_for_port(cfg, port)
	if matches_any(port, cfg.uplink_ports, cfg.uplink_patterns) then
		return "uplink"
	elseif matches_any(port, cfg.downlink_ports, cfg.downlink_patterns) then
		return "downlink"
	elseif matches_any(port, cfg.backhaul_ports, cfg.backhaul_patterns) then
		return "backhaul"
	elseif matches_any(port, cfg.trusted_ports, cfg.trusted_patterns) then
		return "trusted"
	elseif (#cfg.access_ports > 0 or #cfg.access_patterns > 0) and matches_any(port, cfg.access_ports, cfg.access_patterns) then
		return "access"
	end

	return "access"
end

local function list_dir(path)
	local out = {}

	if not nixiofs.access(path) then
		return out
	end

	for name in nixiofs.dir(path) do
		out[#out + 1] = name
	end

	table.sort(out)
	return out
end

local function append_issue(bucket, severity, message)
	bucket[severity][#bucket[severity] + 1] = message
end

local function collect_exact_role_overlap(cfg)
	local seen = {}
	local collisions = {}
	local groups = {
		uplink = cfg.uplink_ports,
		downlink = cfg.downlink_ports,
		backhaul = cfg.backhaul_ports,
		trusted = cfg.trusted_ports,
		access = cfg.access_ports,
	}

	for role, list in pairs(groups) do
		for _, item in ipairs(list or {}) do
			if seen[item] and seen[item] ~= role then
				collisions[#collisions + 1] = string.format("%s بين %s و%s", item, seen[item], role)
			else
				seen[item] = role
			end
		end
	end

	return collisions
end

local function build_profile_info(mode)
	local profiles = {
		ap_simple = {
			title = "AP بسيط",
			hint = "سيناريو وصول عادي مع uplink رئيسي واحد وعزل عملاء سلكي ولاسلكي.",
		},
		ap_vlan = {
			title = "AP مع VLAN",
			hint = "مناسب عندما تكون شبكات العملاء أو أقسام الواي فاي مرتبطة بأسماء غير lan التقليدية.",
		},
		ap_wds = {
			title = "AP مع WDS Backhaul",
			hint = "يعزل العملاء ويستثني الربط الخلفي اللاسلكي WDS من سياسة العميل.",
		},
		ap_mesh = {
			title = "AP مع Mesh Backhaul",
			hint = "مناسب لبيئات Mesh التي يجب أن تبقي backhaul ضمن البنية الخلفية لا ضمن منافذ الوصول.",
		},
		custom = {
			title = "وضع مخصص",
			hint = "للتوزيع اليدوي الكامل للأدوار بين uplink وbackhaul وtrusted وaccess.",
		},
	}

	return profiles[mode] or {
		title = "وضع غير معروف",
		hint = "لا توجد توصية خاصة لهذا الوضع.",
	}
end

local function build_config_snapshot()
	local cfg = {
		enabled = uci:get("portisolation", "main", "enabled") or "0",
		mode = uci:get("portisolation", "main", "mode") or "ap_simple",
		bridge = uci:get("portisolation", "main", "bridge") or "br-lan",
		bridge_section = uci:get("portisolation", "main", "bridge_section") or "lan",
		enforce_port_isolation = uci:get("portisolation", "main", "enforce_port_isolation") or "1",
		wireless_client_isolation = uci:get("portisolation", "main", "wireless_client_isolation") or "1",
		wifi_auto_detect = uci:get("portisolation", "main", "wifi_auto_detect") or "1",
		wifi_backhaul_auto_detect = uci:get("portisolation", "main", "wifi_backhaul_auto_detect") or "1",
		manage_tc = uci:get("portisolation", "main", "manage_tc") or "0",
		loop_guard_enabled = uci:get("portisolation", "main", "loop_guard_enabled") or "1",
		loop_guard_mode = uci:get("portisolation", "main", "loop_guard_mode") or "stp_bpdu_guard",
		monitor_enabled = uci:get("portisolation", "main", "monitor_enabled") or "1",
		monitor_interval = uci:get("portisolation", "main", "monitor_interval") or "20",
		auto_reapply = uci:get("portisolation", "main", "auto_reapply") or "1",
		loopd_enabled = uci:get("portisolation", "main", "loopd_enabled") or "1",
		probe_interval_ms = uci:get("portisolation", "main", "probe_interval_ms") or "300",
		probe_uplink = uci:get("portisolation", "main", "probe_uplink") or "0",
		punish_cooldown = uci:get("portisolation", "main", "punish_cooldown") or "60",
		punish_cooldown_max = uci:get("portisolation", "main", "punish_cooldown_max") or "900",
		probation_hold = uci:get("portisolation", "main", "probation_hold") or "30",
		stable_reset = uci:get("portisolation", "main", "stable_reset") or "300",
		fdb_flap_threshold = uci:get("portisolation", "main", "fdb_flap_threshold") or "0",
		topology_watch = uci:get("portisolation", "main", "topology_watch") or "1",
		drift_watch = uci:get("portisolation", "main", "drift_watch") or "1",
		stp_event_watch = uci:get("portisolation", "main", "stp_event_watch") or "1",
		uplink_ports = get_list("portisolation", "main", "uplink_ports"),
		uplink_patterns = get_list("portisolation", "main", "uplink_patterns"),
		downlink_ports = get_list("portisolation", "main", "downlink_ports"),
		downlink_patterns = get_list("portisolation", "main", "downlink_patterns"),
		backhaul_ports = get_list("portisolation", "main", "backhaul_ports"),
		backhaul_patterns = get_list("portisolation", "main", "backhaul_patterns"),
		trusted_ports = get_list("portisolation", "main", "trusted_ports"),
		trusted_patterns = get_list("portisolation", "main", "trusted_patterns"),
		access_ports = get_list("portisolation", "main", "access_ports"),
		access_patterns = get_list("portisolation", "main", "access_patterns"),
		wifi_client_networks = get_list("portisolation", "main", "wifi_client_networks"),
		wifi_ap_sections = get_list("portisolation", "main", "wifi_ap_sections"),
		wifi_backhaul_sections = get_list("portisolation", "main", "wifi_backhaul_sections"),
	}

	cfg.bridge_ports = list_dir("/sys/class/net/" .. cfg.bridge .. "/brif")

	return cfg
end

local function build_insights()
	local cfg = build_config_snapshot()
	local profile = build_profile_info(cfg.mode)
	local diagnostics = {
		errors = {},
		warnings = {},
		recommendations = {},
	}
	local role_map = {}
	local overlap = collect_exact_role_overlap(cfg)

	if cfg.bridge == "" then
		append_issue(diagnostics, "errors", "اسم البردج غير محدد.")
	elseif is_on(cfg.enabled) and not nixiofs.access("/sys/class/net/" .. cfg.bridge) then
		append_issue(diagnostics, "errors", "البردج المحدد غير موجود حاليًا على النظام: " .. cfg.bridge)
	end

	if cfg.bridge_section == "" then
		append_issue(diagnostics, "errors", "قسم الشبكة في UCI غير محدد.")
	end

	if is_on(cfg.enabled) and #cfg.uplink_ports == 0 and #cfg.uplink_patterns == 0 then
		append_issue(diagnostics, "warnings", "لا يوجد uplink معرف صراحة. هذا يرفع خطر عزل مسار الرفع بالخطأ.")
	end

	if is_on(cfg.enabled) and not is_on(cfg.enforce_port_isolation) and not is_on(cfg.wireless_client_isolation) then
		append_issue(diagnostics, "warnings", "الخدمة مفعلة لكن العزل السلكي واللاسلكي كلاهما معطلان، لذا الأثر العملي محدود جدًا.")
	end

	if is_on(cfg.wireless_client_isolation) and not is_on(cfg.wifi_auto_detect) and #cfg.wifi_ap_sections == 0 then
		append_issue(diagnostics, "warnings", "عزل Wi-Fi مفعل لكن الاكتشاف التلقائي معطل ولا توجد أقسام AP محددة يدويًا.")
	end

	if (cfg.mode == "ap_wds" or cfg.mode == "ap_mesh") and not is_on(cfg.wifi_backhaul_auto_detect)
		and #cfg.backhaul_ports == 0 and #cfg.backhaul_patterns == 0 and #cfg.wifi_backhaul_sections == 0 then
		append_issue(diagnostics, "warnings", "الوضع يعتمد على backhaul لكن لا توجد منافذ أو أقسام backhaul معرفة يدويًا.")
	end

	if is_on(cfg.manage_tc) and sys.call("command -v tc >/dev/null 2>&1") ~= 0 then
		append_issue(diagnostics, "warnings", "إدارة TC مفعلة لكن الأمر tc غير متوفر على الجهاز.")
	end

	if is_on(cfg.monitor_enabled) and tonumber(cfg.monitor_interval or "0") == 0 then
		append_issue(diagnostics, "errors", "فاصل المراقبة الدوري يجب أن يكون أكبر من صفر.")
	end

	if is_on(cfg.enabled) and not is_on(cfg.loopd_enabled) then
		append_issue(diagnostics, "warnings", "الكشف النشط loopd معطّل — لن تُكتشف القفلات خلف الأجهزة غير المُدارة.")
	end

	if is_on(cfg.loopd_enabled) then
		if tonumber(cfg.punish_cooldown or "0") > tonumber(cfg.punish_cooldown_max or "0") then
			append_issue(diagnostics, "errors", "قيمة تهدئة العقوبة أكبر من سقفها (punish_cooldown > punish_cooldown_max).")
		end
		if tonumber(cfg.stable_reset or "0") < tonumber(cfg.probation_hold or "0") then
			append_issue(diagnostics, "warnings", "مدة الاستقرار قبل إعادة التهدئة أقل من مدة المراقبة (stable_reset < probation_hold).")
		end
	end

	for _, item in ipairs(overlap) do
		append_issue(diagnostics, "warnings", "يوجد تداخل في تعريف الأدوار: " .. item)
	end

	if #cfg.bridge_ports == 0 and is_on(cfg.enabled) then
		append_issue(diagnostics, "warnings", "لم يتم رصد أي منفذ داخل البردج حاليًا. قد يكون البردج غير مكتمل أو لم ينهض بعد.")
	end

	if cfg.mode == "custom" and #cfg.access_ports == 0 and #cfg.access_patterns == 0 then
		append_issue(diagnostics, "recommendations", "في الوضع المخصص يفضل تعريف access_ports أو access_patterns لتقليل الغموض.")
	end

	if is_on(cfg.monitor_enabled) and not is_on(cfg.auto_reapply) then
		append_issue(diagnostics, "recommendations", "المراقبة تعمل بدون auto_reapply. هذا مناسب للرصد فقط لكنه لا يصحح الحالة تلقائيًا.")
	end

	local applied_roles = read_applied_roles()
	for _, port in ipairs(cfg.bridge_ports) do
		local role = (applied_roles and applied_roles[port]) or role_for_port(cfg, port)
		role_map[#role_map + 1] = port .. ":" .. role
	end

	return {
		profile = {
			id = cfg.mode,
			title = profile.title,
			hint = profile.hint,
		},
		summary = {
			enabled = cfg.enabled,
			bridge = cfg.bridge,
			bridge_section = cfg.bridge_section,
			uplinks = join_list(cfg.uplink_ports, "غير محدد صراحة"),
			backhauls = join_list(cfg.backhaul_ports, "لا يوجد"),
			trusted = join_list(cfg.trusted_ports, "لا يوجد"),
			access_mode = (#cfg.access_ports > 0 or #cfg.access_patterns > 0) and "محدد يدويًا" or "افتراضي",
			wireless_clients = is_on(cfg.wireless_client_isolation) and "مفعل" or "معطل",
			wireless_detection = is_on(cfg.wifi_auto_detect) and "تلقائي" or "يدوي",
			backhaul_detection = is_on(cfg.wifi_backhaul_auto_detect) and "تلقائي" or "يدوي",
			monitor = is_on(cfg.monitor_enabled) and ("مفعل كل " .. tostring(cfg.monitor_interval) .. " ثانية") or "معطل",
			loop_guard = is_on(cfg.loop_guard_enabled) and cfg.loop_guard_mode or "معطل",
			tc = is_on(cfg.manage_tc) and "مفعل" or "معطل",
			role_map = role_map,
			bridge_ports = cfg.bridge_ports,
			expected_behavior = is_on(cfg.enforce_port_isolation)
				and "منافذ access ستعزل عن بعضها مع إبقاء uplink/backhaul/trusted خارج العزل."
				or "العزل السلكي معطل، لذا سيبقى الأثر الأساسي على طبقة Wi-Fi أو المراقبة فقط.",
		},
		diagnostics = diagnostics,
	}
end

local function read_key_value_file(path)
	local out = {}
	local data = nixiofs.readfile(path)
	if not data then
		return out
	end

	for line in data:gmatch("[^\r\n]+") do
		local k, v = line:match("^([^=]+)=(.*)$")
		if k then
			out[k] = v
		end
	end

	return out
end

local function read_key_value_text(data)
	local out = {}

	if not data or data == "" then
		return out
	end

	for line in tostring(data):gmatch("[^\r\n]+") do
		local k, v = line:match("^([^=]+)=(.*)$")
		if k and k ~= "--status-file--" then
			out[k] = v
		end
	end

	return out
end

local function ensure_ui_integrity()
	local marker = "__PI_VERIFY_RC__"
	local output = sys.exec("/usr/libexec/portisolation/portisolation-verify-ui 2>&1; printf '" .. marker .. "%s' $?")
	local rc = tonumber(output:match(marker .. "(%d+)$") or "1")

	if rc == 0 then
		return true
	end

	output = output:gsub(marker .. "%d+$", "")

	http.status(500, "Integrity Check Failed")
	http.prepare_content("application/json")
	http.write(jsonc.stringify({
		ok = false,
		error = "ui_integrity_failed",
		detail = output
	}))
	return false
end

local PRESET_LOOPD_DEFAULTS = {
	loopd_enabled = "1",
	probe_interval_ms = "300",
	probe_uplink = "0",
	punish_cooldown = "60",
	punish_cooldown_max = "900",
	probation_hold = "30",
	stable_reset = "300",
	fdb_flap_threshold = "0",
	tx_jam_limit = "8",
	gate_open_hold = "5",
	gate_rx_pps_max = "2000",
	sticky_after = "3",
	release_stagger = "3",
	suspect_hold = "25",
	recovery_skew = "45",
	shield_enabled = "1",
	shield_bcast_pps = "300",
	pause_guard = "1",
	pause_pps_max = "100",
	pause_guard_uplink = "1",
}

local function preset_catalog()
	local catalog = {
		ap_simple = {
			title = "AP بسيط",
			description = "وضع سريع لأجهزة الوصول التقليدية مع uplink واحد وعزل العملاء محليًا.",
			values = {
				mode = "ap_simple",
				enabled = "0",
				bridge = "br-lan",
				bridge_section = "lan",
				enforce_port_isolation = "1",
				wireless_client_isolation = "1",
				wifi_auto_detect = "1",
				wifi_backhaul_auto_detect = "1",
				manage_tc = "0",
				loop_guard_enabled = "1",
				loop_guard_mode = "stp_bpdu_guard",
				monitor_enabled = "1",
				auto_reapply = "1",
				topology_watch = "1",
				drift_watch = "1",
				stp_event_watch = "1",
				uplink_ports = {},
				uplink_patterns = {},
				downlink_ports = {},
				downlink_patterns = {},
				backhaul_ports = {},
				backhaul_patterns = {},
				trusted_ports = {},
				trusted_patterns = {},
				access_ports = {},
				access_patterns = {},
				wifi_client_networks = {},
				wifi_ap_sections = {},
				wifi_backhaul_sections = {},
			}
		},
		ap_vlan = {
			title = "AP مع VLAN",
			description = "مخصص لبيئات VLAN مع اكتشاف تلقائي لشبكات العملاء وعزل محلي محافظ.",
			values = {
				mode = "ap_vlan",
				enabled = "0",
				bridge = "br-lan",
				bridge_section = "lan",
				enforce_port_isolation = "1",
				wireless_client_isolation = "1",
				wifi_auto_detect = "1",
				wifi_backhaul_auto_detect = "1",
				manage_tc = "0",
				loop_guard_enabled = "1",
				loop_guard_mode = "stp_bpdu_guard",
				monitor_enabled = "1",
				auto_reapply = "1",
				topology_watch = "1",
				drift_watch = "1",
				stp_event_watch = "1",
				uplink_ports = {},
				uplink_patterns = {},
				downlink_ports = {},
				downlink_patterns = {},
				backhaul_ports = {},
				backhaul_patterns = {},
				trusted_ports = {},
				trusted_patterns = {},
				access_ports = {},
				access_patterns = {},
				wifi_client_networks = {},
				wifi_ap_sections = {},
				wifi_backhaul_sections = {},
			}
		},
		ap_wds = {
			title = "AP مع WDS",
			description = "يفصل العملاء عن بعضهم ويستثني الربط الخلفي WDS من سياسة العزل.",
			values = {
				mode = "ap_wds",
				enabled = "0",
				bridge = "br-lan",
				bridge_section = "lan",
				enforce_port_isolation = "1",
				wireless_client_isolation = "1",
				wifi_auto_detect = "1",
				wifi_backhaul_auto_detect = "1",
				manage_tc = "0",
				loop_guard_enabled = "1",
				loop_guard_mode = "stp_bpdu_guard",
				monitor_enabled = "1",
				auto_reapply = "1",
				topology_watch = "1",
				drift_watch = "1",
				stp_event_watch = "1",
				uplink_ports = {},
				uplink_patterns = {},
				downlink_ports = {},
				downlink_patterns = {},
				backhaul_ports = {},
				backhaul_patterns = {},
				trusted_ports = {},
				trusted_patterns = {},
				access_ports = {},
				access_patterns = {},
				wifi_client_networks = {},
				wifi_ap_sections = {},
				wifi_backhaul_sections = {},
			}
		},
		ap_mesh = {
			title = "AP مع Mesh",
			description = "منطلق مناسب لسيناريوهات Mesh مع إبقاء backhaul خارج عزل العملاء.",
			values = {
				mode = "ap_mesh",
				enabled = "0",
				bridge = "br-lan",
				bridge_section = "lan",
				enforce_port_isolation = "1",
				wireless_client_isolation = "1",
				wifi_auto_detect = "1",
				wifi_backhaul_auto_detect = "1",
				manage_tc = "0",
				loop_guard_enabled = "1",
				loop_guard_mode = "stp_bpdu_guard",
				monitor_enabled = "1",
				auto_reapply = "1",
				topology_watch = "1",
				drift_watch = "1",
				stp_event_watch = "1",
				uplink_ports = {},
				uplink_patterns = {},
				downlink_ports = {},
				downlink_patterns = {},
				backhaul_ports = {},
				backhaul_patterns = {},
				trusted_ports = {},
				trusted_patterns = {},
				access_ports = {},
				access_patterns = {},
				wifi_client_networks = {},
				wifi_ap_sections = {},
				wifi_backhaul_sections = {},
			}
		}
	}

	catalog.profile_balanced = {
		title = "ملف الحماية: متوازن (موصى به)",
		description = "الإعداد الافتراضي — يناسب أغلب الشوارع والأجهزة.",
		keep_roles = true,
		values = {}
	}
	catalog.profile_strict = {
		title = "ملف الحماية: صارم",
		description = "عزل نهائي أسرع وحساسية أعلى — لمن لديه دعم فني سريع.",
		keep_roles = true,
		values = {
			sticky_after = "2",
			gate_open_hold = "10",
			punish_cooldown = "120",
			pause_pps_max = "60",
			tx_jam_limit = "6",
			suspect_hold = "30",
			probe_uplink = "1"
		}
	}
	catalog.profile_relaxed = {
		title = "ملف الحماية: متساهل",
		description = "بلا فصل نهائي — تعافٍ تلقائي دائم، مناسب للخدمة الذاتية بلا زيارات فني.",
		keep_roles = true,
		values = {
			sticky_after = "0",
			punish_cooldown = "30",
			suspect_hold = "0",
			gate_open_hold = "5"
		}
	}

	for _, preset in pairs(catalog) do
		for k, v in pairs(PRESET_LOOPD_DEFAULTS) do
			if preset.values[k] == nil then
				preset.values[k] = v
			end
		end
	end

	return catalog
end

local function apply_preset_values(values, keep_roles)
	local list_options = {
		"uplink_ports", "uplink_patterns",
		"downlink_ports", "downlink_patterns",
		"backhaul_ports", "backhaul_patterns",
		"trusted_ports", "trusted_patterns",
		"access_ports", "access_patterns",
		"wifi_client_networks", "wifi_ap_sections",
		"wifi_backhaul_sections",
	}

	if not keep_roles then
		for _, opt in ipairs(list_options) do
			uci:delete("portisolation", "main", opt)
		end
	end

	for opt, value in pairs(values or {}) do
		if type(value) == "table" then
			if #value > 0 then
				uci:set_list("portisolation", "main", opt, value)
			end
		else
			uci:set("portisolation", "main", opt, tostring(value))
		end
	end

	uci:save("portisolation")
	uci:commit("portisolation")
end

local function validate_import_text(data)
	local tmpdir = "/tmp/portisolation-import"
	local tmpfile = tmpdir .. "/portisolation"
	local ok = false

	if not data or data == "" then
		return false, "empty import"
	end

	if not tostring(data):match("config%s+core%s+['\"]main['\"]") then
		return false, "missing main section"
	end

	nixiofs.mkdir(tmpdir)
	nixiofs.writefile(tmpfile, data)
	ok = (sys.call("uci -c " .. string.format("%q", tmpdir) .. " -q show portisolation >/dev/null 2>&1") == 0)
	nixiofs.remove(tmpfile)
	nixiofs.rmdir(tmpdir)

	if not ok then
		return false, "uci parse failed"
	end

	return true
end

function action_status_json()
	if not ensure_ui_integrity() then
		return
	end

	local status_file = uci:get("portisolation", "main", "status_file") or "/tmp/portisolation.status"
	local log_file = uci:get("portisolation", "main", "log_file") or "/tmp/portisolation.log"
	local service_output = sys.exec("/etc/init.d/portisolation status 2>/dev/null")
	local payload = {
		status = read_key_value_file(status_file),
		service_output = service_output,
		log_tail = sys.exec("tail -n 80 " .. string.format("%q", log_file) .. " 2>/dev/null"),
	}
	local live_status = read_key_value_text(service_output)

	for k, v in pairs(live_status) do
		payload.status[k] = v
	end

	http.prepare_content("application/json")
	http.write(jsonc.stringify(payload))
end

function action_insights_json()
	if not ensure_ui_integrity() then
		return
	end

	http.prepare_content("application/json")
	http.write(jsonc.stringify(build_insights()))
end

function action_presets_json()
	if not ensure_ui_integrity() then
		return
	end

	local out = {}

	for id, preset in pairs(preset_catalog()) do
		out[#out + 1] = {
			id = id,
			title = preset.title,
			description = preset.description,
		}
	end

	table.sort(out, function(a, b) return a.id < b.id end)

	http.prepare_content("application/json")
	http.write(jsonc.stringify({ presets = out }))
end

function action_preset_apply()
	if not ensure_ui_integrity() then
		return
	end

	local preset_id = http.formvalue("id") or ""
	local preset = preset_catalog()[preset_id]

	if not preset then
		http.status(400, "Bad Request")
		http.prepare_content("application/json")
		http.write(jsonc.stringify({ ok = false, error = "invalid preset" }))
		return
	end

	apply_preset_values(preset.values, preset.keep_roles)

	http.prepare_content("application/json")
	http.write(jsonc.stringify({
		ok = true,
		id = preset_id,
		title = preset.title,
	}))
end

function action_config_export()
	if not ensure_ui_integrity() then
		return
	end

	local data = nixiofs.readfile("/etc/config/portisolation") or ""

	http.header("Content-Disposition", 'attachment; filename="portisolation.backup"')
	http.prepare_content("text/plain; charset=utf-8")
	http.write(data)
end

function action_config_import()
	if not ensure_ui_integrity() then
		return
	end

	local data = http.formvalue("data") or ""
	local ok, err = validate_import_text(data)

	if not ok then
		http.status(400, "Bad Request")
		http.prepare_content("application/json")
		http.write(jsonc.stringify({ ok = false, error = err }))
		return
	end

	nixiofs.writefile("/etc/config/portisolation", data)

	http.prepare_content("application/json")
	http.write(jsonc.stringify({ ok = true }))
end

local function parse_loopd_status()
	local out = { bridge = "", interval_ms = "", last_event = "", ports = {} }
	local data = nixiofs.readfile("/tmp/loopd.status")

	if not data then
		return out
	end

	for line in data:gmatch("[^\r\n]+") do
		if line:match("^port=") then
			local port = {}
			for k, v in line:gmatch("(%w+)=([^%s]+)") do
				port[k] = v
			end
			if port.port then
				out.ports[#out.ports + 1] = port
			end
		else
			local k, v = line:match("^([^=]+)=(.*)$")
			if k then
				out[k] = v
			end
		end
	end

	return out
end

function action_loopd_json()
	if not ensure_ui_integrity() then
		return
	end

	http.prepare_content("application/json")
	http.write(jsonc.stringify({
		running = (sys.call("pidof loopd >/dev/null 2>&1") == 0),
		status = parse_loopd_status()
	}))
end

function action_loopd_action()
	if not ensure_ui_integrity() then
		return
	end

	local cmd = http.formvalue("cmd") or ""
	local port = http.formvalue("port") or "all"

	if cmd ~= "unpunish" and cmd ~= "refresh" then
		http.status(400, "Bad Request")
		http.prepare_content("application/json")
		http.write(jsonc.stringify({ ok = false, error = "invalid command" }))
		return
	end

	if not port:match("^[%w%.%-_]+$") then
		http.status(400, "Bad Request")
		http.prepare_content("application/json")
		http.write(jsonc.stringify({ ok = false, error = "invalid port" }))
		return
	end

	local out = sys.exec("/etc/init.d/portisolation loopd_" .. cmd .. " " .. string.format("%q", port) .. " 2>&1")

	http.prepare_content("application/json")
	http.write(jsonc.stringify({ ok = true, cmd = cmd, port = port, output = out }))
end

function action_service_action()
	if not ensure_ui_integrity() then
		return
	end

	local cmd = http.formvalue("cmd") or ""
	local allowed = {
		apply = true,
		safe_apply = true,
		confirm_safe_apply = true,
		cancel_safe_apply = true,
		safe_status = true,
		clear_log = true,
		rollback = true,
		reload = true,
		validate = true,
		check = true,
	}

	if not allowed[cmd] then
		http.status(400, "Bad Request")
		http.prepare_content("application/json")
		http.write(jsonc.stringify({ ok = false, error = "invalid command" }))
		return
	end

	local output
	local timeout = http.formvalue("timeout")
	local log_file = uci:get("portisolation", "main", "log_file") or "/tmp/portisolation.log"

	if timeout and timeout ~= "" and not tostring(timeout):match("^%d+$") then
		http.status(400, "Bad Request")
		http.prepare_content("application/json")
		http.write(jsonc.stringify({ ok = false, error = "invalid timeout" }))
		return
	end

	if cmd == "reload" then
		output = sys.exec("/etc/init.d/portisolation reload 2>&1")
	elseif cmd == "safe_apply" and timeout and timeout ~= "" then
		output = sys.exec("/etc/init.d/portisolation safe_apply " .. string.format("%q", timeout) .. " 2>&1")
	elseif cmd == "clear_log" then
		nixiofs.writefile(log_file, "")
		output = "log cleared: " .. log_file
	else
		output = sys.exec("/etc/init.d/portisolation " .. cmd .. " 2>&1")
	end

	http.prepare_content("application/json")
	http.write(jsonc.stringify({
		ok = true,
		cmd = cmd,
		output = output
	}))
end
