-- Copyright(c) 2025, SyncSys.cloud OS. All rights reserved.
-- SyncSys.cloud Team < support@syncsys.cloud> 
-- Copyright (c) 2025-2026. All Rights Reserved.

module("luci.controller.mkdector", package.seeall)

function index()
    local e = entry({"admin", "syncsys", "mkdector"}, view("mkdector/mkdector"), _("مكتشف الشبكة"), 60)
    e.icon = "services"
    e.acl_depends = { "mkdector" }
end
