
module("luci.controller.systemupdate", package.seeall)

function index()
    entry({"admin", "syncsys", "systemupdate"}, form("systemupdate"), _("MKSUP [تحديث النظام]"), 99).dependent = true
    entry({"admin", "syncsys", "systemupdate", "check"}, call("check_internet")).leaf = true
    entry({"admin", "syncsys", "systemupdate", "log_raw"}, call("get_log_raw")).leaf = true
end

function check_internet()
    local status = (luci.sys.call("ping -c 1 -W 1 8.8.8.8 >/dev/null 2>&1") == 0) and "online" or "offline"
    luci.http.prepare_content("application/json")
    luci.http.write_json({status = status})
end

function get_log_raw()
    local fs = require "nixio.fs"
    local log = fs.readfile("/tmp/fw_status.log") or "AL-MALAKI Firmware Update process"
    luci.http.prepare_content("text/plain")
    luci.http.write(log)
end
