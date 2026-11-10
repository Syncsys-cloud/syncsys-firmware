-- Copyright (c) 2026 SyncSys.cloud Systems. All Rights Reserved.

module("luci.controller.syncsys_app", package.seeall)

function index()
    local root = entry({"admin", "syncsys"}, firstchild(), _("SyncSys"), 10)
    root.dependent = false
    root.icon = "brand"
end
