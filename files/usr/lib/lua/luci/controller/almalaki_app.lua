-- Copyright(c) 2025, ALMalaki Openwrt Systems. All rights reserved.
-- AL-MALAKI OPEWNWRT TEAM < almalakiopenwrt@gmail.com> 
-- Copyright (c) 2025-2026. All Rights Reserved.

module("luci.controller.almalaki_app", package.seeall)

function index()
    local root = entry({"admin", "almalaki-app"}, firstchild(), _("[تطبيق الملكي] MKAPP"), 60)
    root.dependent = false
    --root.acl_depends = { "luci-app-almalaki-app" }
    root.icon = "system"
end
