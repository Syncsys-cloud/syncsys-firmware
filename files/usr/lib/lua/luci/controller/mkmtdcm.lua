-- Copyright(c) 2025, ALMalaki Openwrt Systems. All rights reserved.
-- AL-MALAKI OPEWNWRT TEAM < almalakiopenwrt@gmail.com>
-- Copyright (c) 2025-2026. All Rights Reserved.

module("luci.controller.mkmtdcm", package.seeall)

local fs    = require "nixio.fs"
local http  = require "luci.http"
local dsp   = require "luci.dispatcher"
local tpl   = require "luci.template"
local sys   = require "luci.sys"
local jsonc = require "luci.jsonc"

-- Display only (UI info)
local CFG  = "/etc/modules.d/70-mt7915_common_mu"
local MOD  = "mt7915e"

-- Core executable (ELF)
local CORE = "/usr/libexec/mkmtdcm/mkmtdcm-core"

function index()
	entry({"admin", "almalaki-app", "mkmtdcm"}, call("action_txpower"), "MKPDC [ درايفر كنترول ]", 50).dependent = true
end

local function clamp_num(v)
	local n = tonumber(v) or 0
	if n < 0 then n = 0 end
	if n > 14 then n = 14 end
	return tostring(n)
end

local function core_available()
	return fs.access(CORE) and fs.stat(CORE, "type") == "reg" and fs.access(CORE, "x")
end

local function core_exec(cmd)
	-- Always suppress stderr in UI
	return sys.exec(cmd .. " 2>/dev/null") or ""
end

local function core_get()
	-- Default safe values
	local cur = { pow7915_2g = "0", pow7915_5g = "0", line = "" }

	if not core_available() then
		return cur, nil, "CORE_NOT_FOUND"
	end

	local out = core_exec(CORE .. " get")
	local obj = out and jsonc.parse(out) or nil

	if type(obj) == "table" then
		cur.pow7915_2g = tostring(obj.pow7915_2g or cur.pow7915_2g)
		cur.pow7915_5g = tostring(obj.pow7915_5g or cur.pow7915_5g)
		cur.line       = tostring(obj.line or cur.line or "")
		return cur, obj, nil
	end

	return cur, nil, "BAD_JSON"
end

local function core_call(action, v2, v5)
	if not core_available() then
		return nil, nil, "CORE_NOT_FOUND"
	end

	local cmd = string.format("%s %s %d %d",
		CORE,
		action,
		tonumber(v2) or 0,
		tonumber(v5) or 0
	)

	local out = core_exec(cmd)
	local obj = out and jsonc.parse(out) or nil

	return obj, out, nil
end

function action_txpower()
	local msg, err = nil, nil

	-- Handle POST (save/apply)
	if http.formvalue("save") or http.formvalue("apply_action") then
		local new2   = clamp_num(http.formvalue("pow7915_2g") or "0")
		local new5   = clamp_num(http.formvalue("pow7915_5g") or "0")
		local action = http.formvalue("apply_action") or "save_only"

		-- Read current values from core (no-change optimization)
		local cur, _, get_err = core_get()
		if get_err == nil then
			if new2 == tostring(cur.pow7915_2g or "0") and new5 == tostring(cur.pow7915_5g or "0") then
				http.redirect(dsp.build_url("admin", "almalaki-app", "mkmtdcm") .. "?m=nochange")
				return
			end
		end

		-- Map UI actions to core actions
		local core_action = "set"
		if action == "save_reload" then
			core_action = "apply"
		elseif action == "save_reboot" then
			core_action = "save_reboot"
		else
			core_action = "set" -- save_only (default)
		end

		local obj, raw, call_err = core_call(core_action, new2, new5)

		-- If core missing/broken
		if call_err == "CORE_NOT_FOUND" then
			http.redirect(dsp.build_url("admin", "almalaki-app", "mkmtdcm") .. "?m=core_missing")
			return
		end

		-- Parse status
		local ok = (type(obj) == "table" and tostring(obj.status or "") == "ok")

		if core_action == "apply" then
			http.redirect(dsp.build_url("admin", "almalaki-app", "mkmtdcm") .. (ok and "?m=applied" or "?m=applied_fail"))
			return
		elseif core_action == "save_reboot" then
			http.redirect(dsp.build_url("admin", "almalaki-app", "mkmtdcm") .. (ok and "?m=rebooting" or "?m=reboot_fail"))
			return
		else
			http.redirect(dsp.build_url("admin", "almalaki-app", "mkmtdcm") .. (ok and "?m=saved" or "?m=save_fail"))
			return
		end
	end

	-- GET: read current values
	local cur, _, get_err = core_get()

	-- Messages based on query arg
	local m = http.formvalue("m")
	if m == "nochange" then
		msg = "لا يوجد تغيير في القيم. لم يتم حفظ أي شيء."
	elseif m == "saved" then
		msg = "تم حفظ القيم بنجاح."
	elseif m == "save_fail" then
		err = "تعذر حفظ القيم. تحقق من صلاحيات النظام أو سجل النظام."
	elseif m == "applied" then
		msg = "تم الحفظ وتطبيق القيم مباشرة بنجاح."
	elseif m == "applied_fail" then
		err = "تم الحفظ لكن تعذر تطبيقها مباشرة. أعد التشغيل أو جرّب لاحقًا."
	elseif m == "rebooting" then
		msg = "تم الحفظ. جاري إعادة تشغيل الجهاز..."
	elseif m == "reboot_fail" then
		err = "تم الحفظ لكن تعذر تنفيذ إعادة التشغيل تلقائياً."
	elseif m == "core_missing" then
		err = "ملف التنفيذ غير موجود:."
	elseif get_err == "CORE_NOT_FOUND" then
		err = "ملف التنفيذ غير موجود:."
	elseif get_err == "BAD_JSON" then
		err = "تعذر قراءة نتيجة Core (JSON غير صالح)."
	end

	-- Provide a reasonable 'line' fallback for UI
	if (cur.line == nil or cur.line == "") then
		cur.line = string.format("%s pow7915_2g=%s pow7915_5g=%s", MOD, cur.pow7915_2g or "0", cur.pow7915_5g or "0")
	end

	tpl.render("almalaki/mtdcm", {
		cfg_path    = CFG,
		pow7915_2g  = cur.pow7915_2g,
		pow7915_5g  = cur.pow7915_5g,
		line        = cur.line,
		msg         = msg,
		err         = err
	})
end
