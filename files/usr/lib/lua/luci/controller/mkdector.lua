-- Copyright(c) 2025, ALMalaki Openwrt Systems. All rights reserved.
-- AL-MALAKI OPEWNWRT TEAM < almalakiopenwrt@gmail.com> 
-- Copyright (c) 2025-2026. All Rights Reserved.

module("luci.controller.mkdector", package.seeall)

function index()
    local e = entry({"admin", "almalaki-app", "mkdector"}, view("mkdector/mkdector"), _("MKDEC [المساعد البرمجي]"), 60)
    e.icon = "services"
    e.acl_depends = { "mkdector" }
end
