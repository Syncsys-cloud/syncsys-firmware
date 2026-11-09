module("luci.controller.mkrsptt", package.seeall)

local http  = require "luci.http"
local sys   = require "luci.sys"
local jsonc = require "luci.jsonc"
local util  = require "luci.util"
local dt    = require "luci.cbi.datatypes"

-- Native protected core (ELF)
local CORE = "/usr/libexec/mkrsptt/mkrsptt-core"

local function core_exec(args)
  return sys.exec(CORE .. " " .. args .. " 2>/dev/null")
end

local function core_json(args)
  local out = core_exec(args)
  return jsonc.parse(out or ""), out
end

local function reply_raw_json(raw)
  http.prepare_content("application/json")
  http.write(raw or "{\"ok\":false,\"error\":\"empty\"}")
end

local PIDFILE = "/var/run/mkrsptt_client.pid"
local LOGFILE = "/tmp/mkrsptt_client.log"

local function reply(t)
  http.prepare_content("application/json")
  http.write(jsonc.stringify(t))
end

local function readfile(path, max)
  local f = io.open(path, "r")
  if not f then return nil end
  local d = f:read(max or 1024*1024)
  f:close()
  return d
end

local function pid()
  local p = readfile(PIDFILE, 64)
  if not p then return nil end
  p = p:gsub("%s+","")
  if #p == 0 then return nil end
  return p
end

local function running_local()
  local p = pid()
  if not p then return false end
  return (sys.call("kill -0 " .. util.shellquote(p) .. " >/dev/null 2>&1") == 0)
end

local function tail_log(n)
  n = tonumber(n) or 200
  if n < 1 then n = 200 end
  if n > 600 then n = 600 end
  return sys.exec("tail -n " .. n .. " " .. util.shellquote(LOGFILE) .. " 2>/dev/null") or ""
end

-- ====== simple validators (do not over-restrict, but keep sane) ======
local function ok_sized(v)  -- accepts 123, 123K, 123M, 123G (case-insensitive)
  if not v or #v == 0 then return true end
  return v:match("^[0-9]+[kKmMgG]?$") ~= nil
end

local function ok_text(v, max)
  if not v or #v == 0 then return true end
  if #v > (max or 64) then return false end
  return v:match("^[%w%._%-]+$") ~= nil
end

-- ==== Remote LuCI session helpers (Device #2) ====
local function cookiefile_for(ip)
  return "/tmp/mkrsptt_" .. (ip:gsub("[^0-9%.]","_")) .. ".cookie"
end

local function curl_exec(cmd)
  return sys.exec(cmd .. " 2>/dev/null")
end

local function luci_login(ip, user, pass)
  local cj = cookiefile_for(ip)
  sys.call("rm -f " .. util.shellquote(cj))

  local url = "http://" .. ip .. "/cgi-bin/luci/?luci_username=" .. util.urlencode(user) ..
              "&luci_password=" .. util.urlencode(pass or "")

  local cmd = "curl -sS -L -c " .. util.shellquote(cj) .. " -X POST " .. util.shellquote(url) .. " >/dev/null"
  local rc = sys.call(cmd)
  if rc ~= 0 then return nil, "login_failed" end
  return cj, nil
end

local function luci_get_token_from_agent_page(ip, cj)
  local url = "http://" .. ip .. "/cgi-bin/luci/admin/almalaki-app/mkrsptt"
  local html = curl_exec("curl -sS -L -b " .. util.shellquote(cj) .. " " .. util.shellquote(url))
  local tok = (html or ""):match([["token"%s*:%s*"([a-fA-F0-9]+)"]])
  if not tok or #tok ~= 32 then
    return nil, "faildlogin_not_found"
  end
  return tok:lower(), nil
end

local function luci_post_form(ip, cj, path, formdata)
  local url = "http://" .. ip .. path
  local cmd = "curl -sS -L -b " .. util.shellquote(cj) ..
              " -H " .. util.shellquote("Content-Type: application/x-www-form-urlencoded") ..
              " --data " .. util.shellquote(formdata) .. " " .. util.shellquote(url)
  return curl_exec(cmd)
end

local function remote_start_server(ip, user, pass, port)
  local cj, e = luci_login(ip, user, pass)
  if not cj then return nil, e end

  local token, e2 = luci_get_token_from_agent_page(ip, cj)
  if not token then return nil, e2 end

  local out = luci_post_form(ip, cj, "/cgi-bin/luci/admin/almalaki-app/mkrsptt/startc",
    "token=" .. token .. "&port=" .. tostring(port)
  )

  local j = jsonc.parse(out or "")
  if not j or j.ok ~= true then
    return nil, "remote_start_failed", out
  end
  return j, nil, nil
end

local function remote_stop_server(ip, user, pass)
  local cj, e = luci_login(ip, user, pass)
  if not cj then return nil, e end

  local token, e2 = luci_get_token_from_agent_page(ip, cj)
  if not token then return nil, e2 end

  local out = luci_post_form(ip, cj, "/cgi-bin/luci/admin/almalaki-app/mkrsptt/stopc",
    "token=" .. token
  )

  local j = jsonc.parse(out or "")
  if not j or j.ok ~= true then
    return nil, "remote_stop_failed", out
  end
  return j, nil, nil
end
--CL_Section
local PIDCFILE = "/var/run/mkrsptt.pid"
local LOGCFILE = "/tmp/mkrsptt.log"

local function replyc(t)
  http.prepare_content("application/json")
  http.write(jsonc.stringify(t))
end

local function readfilec(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local d = f:read("*a")
  f:close()
  return d
end

local function pidc()
  local p = readfilec(PIDCFILE)
  if not p then return nil end
  p = p:gsub("%s+","")
  if #p == 0 then return nil end
  return p
end

local function runningc()
  local p = pidc()
  if not p then return false end
  return (sys.call("kill -0 " .. util.shellquote(p) .. " >/dev/null 2>&1") == 0)
end

local function tailc(n)
  n = tonumber(n) or 120
  if n < 1 then n = 120 end
  if n > 400 then n = 400 end
  return sys.exec("tail -n " .. n .. " " .. util.shellquote(LOGCFILE) .. " 2>/dev/null") or ""
end
--endCL_sec
function index()
  entry({"admin","almalaki-app","mkrsptt"}, view("mkrsptt/mkrsptt"), _("MKAST [إختبار السرعة]"), 60).dependent = true
  entry({"admin","almalaki-app","mkrsptt","start"},  call("action_start")).leaf = true
  entry({"admin","almalaki-app","mkrsptt","stop"},   call("action_stop")).leaf = true
  entry({"admin","almalaki-app","mkrsptt","status"}, call("action_status")).leaf = true
  entry({"admin","almalaki-app","mkrsptt","log"},    call("action_log")).leaf = true
  entry({"admin","almalaki-app","mkrsptt","poll"},   call("action_poll")).leaf = true

  --CL_Section
  entry({"admin","almalaki-app","mkrsptt","startc"},  call("action_startc")).leaf = true
  entry({"admin","almalaki-app","mkrsptt","stopc"},   call("action_stopc")).leaf = true
  entry({"admin","almalaki-app","mkrsptt","statusc"}, call("action_statusc")).leaf = true
  entry({"admin","almalaki-app","mkrsptt","logc"},    call("action_logc")).leaf = true
  --end
end

function action_start()
  local ip2      = (http.formvalue("ip2") or ""):gsub("%s+","")
  local user2    = http.formvalue("user") or ""
  local pass2    = http.formvalue("pass") or ""   -- مسموح فارغة
  local port     = tonumber(http.formvalue("port") or "5201") or 5201

  local proto    = http.formvalue("proto") or "tcp"
  local reverse  = (http.formvalue("reverse") == "1")
  local bidir    = (http.formvalue("bidir") == "1")
  local parallel = tonumber(http.formvalue("parallel") or "1") or 1

  local format   = http.formvalue("format") or ""
  local interval = http.formvalue("interval") or ""
  local verbose  = (http.formvalue("verbose") == "1")
  local jsonout  = (http.formvalue("json") == "1")

  local mode     = http.formvalue("mode") or "time"
  local duration = tonumber(http.formvalue("duration") or "10") or 10
  local bytes    = http.formvalue("bytes") or ""
  local blockcnt = http.formvalue("blockcount") or ""
  local omit     = http.formvalue("omit") or ""

  local bind     = http.formvalue("bind") or ""
  local binddev  = http.formvalue("binddev") or ""
  local cport    = http.formvalue("cport") or ""
  local cto      = http.formvalue("connect_timeout") or ""

  local window   = http.formvalue("window") or ""
  local mss      = http.formvalue("mss") or ""
  local nodelay  = (http.formvalue("nodelay") == "1")
  local cc       = http.formvalue("congestion") or ""
  local zc       = (http.formvalue("zerocopy") == "1")

  local bitrate  = http.formvalue("bitrate") or "50M"
  local dontfrag = (http.formvalue("dontfrag") == "1")

  local ipver    = http.formvalue("ipver") or "any"
  local title    = http.formvalue("title") or ""

  -- validation
  if ipver == "6" then
    if not dt.ip6addr(ip2) then return reply({ ok=false, error="invalid_ip2_ipv6" }) end
  else
    if not dt.ip4addr(ip2) then
      if ipver == "4" then return reply({ ok=false, error="invalid_ip2_ipv4" }) end
      if not dt.ip6addr(ip2) then return reply({ ok=false, error="invalid_ip2" }) end
    end
  end

  if #user2 == 0 then return reply({ ok=false, error="missing_username" }) end
  if port < 1 or port > 65535 then return reply({ ok=false, error="invalid_port" }) end
  if parallel < 1 then parallel = 1 end
  if parallel > 16 then parallel = 16 end

  if format ~= "" and not format:match("^[kKmMgGtTKMG]$") then
    return reply({ ok=false, error="invalid_format" })
  end
  if interval ~= "" and (not interval:match("^[0-9]+$") or tonumber(interval) < 1 or tonumber(interval) > 60) then
    return reply({ ok=false, error="invalid_interval" })
  end

  if omit ~= "" and (not omit:match("^[0-9]+$") or tonumber(omit) < 0 or tonumber(omit) > 60) then
    return reply({ ok=false, error="invalid_omit" })
  end

  if mode == "bytes" and not ok_sized(bytes) then return reply({ ok=false, error="invalid_bytes" }) end
  if mode == "blockcount" and not ok_sized(blockcnt) then return reply({ ok=false, error="invalid_blockcount" }) end
  if mode == "time" then
    if duration < 1 or duration > 3600 then return reply({ ok=false, error="invalid_duration" }) end
  end

  if window ~= "" and not ok_sized(window) then return reply({ ok=false, error="invalid_window" }) end
  if mss ~= "" and not mss:match("^[0-9]+$") then return reply({ ok=false, error="invalid_mss" }) end
  if cc ~= "" and not ok_text(cc, 32) then return reply({ ok=false, error="invalid_congestion" }) end
  if binddev ~= "" and not ok_text(binddev, 32) then return reply({ ok=false, error="invalid_binddev" }) end
  if cport ~= "" and (not cport:match("^[0-9]+$") or tonumber(cport) < 1 or tonumber(cport) > 65535) then
    return reply({ ok=false, error="invalid_cport" })
  end
  if cto ~= "" and (not cto:match("^[0-9]+$") or tonumber(cto) < 100 or tonumber(cto) > 60000) then
    return reply({ ok=false, error="invalid_connect_timeout" })
  end
  if title ~= "" and #title > 64 then return reply({ ok=false, error="invalid_title" }) end
  -- stop previous client (core)
  core_exec("client reset")

  -- remote start server
  local rj, err, raw = remote_start_server(ip2, user2, pass2, port)
  if not rj then
    local hint = (err == "login_failed") and "Check Device #2 LuCI credentials / reachability"
              or (err == "token_not_found") and "Agent page token not found (check luci-app-mkrsptt installed on Device #2)"
              or nil
    return reply({ ok=false, error=err, hint=hint, remote_raw=raw })
  end

  -- build iperf3 client cmd
  local cmd = { "iperf3", "-c", ip2, "-p", tostring(port) }

  -- ensure live log updates when redirected to file
  cmd[#cmd+1] = "--forceflush"

  if ipver == "4" then cmd[#cmd+1] = "-4" end
  if ipver == "6" then cmd[#cmd+1] = "-6" end

  if format ~= "" then cmd[#cmd+1] = "-f"; cmd[#cmd+1] = format end
  if interval ~= "" then cmd[#cmd+1] = "-i"; cmd[#cmd+1] = interval end
  if verbose then cmd[#cmd+1] = "-V" end
  if jsonout then cmd[#cmd+1] = "-J" end

  if bind ~= "" then cmd[#cmd+1] = "-B"; cmd[#cmd+1] = bind end
  if binddev ~= "" then cmd[#cmd+1] = "--bind-dev"; cmd[#cmd+1] = binddev end
  if cport ~= "" then cmd[#cmd+1] = "--cport"; cmd[#cmd+1] = cport end
  if cto ~= "" then cmd[#cmd+1] = "--connect-timeout"; cmd[#cmd+1] = cto end

  if omit ~= "" then cmd[#cmd+1] = "-O"; cmd[#cmd+1] = omit end
  cmd[#cmd+1] = "-P"; cmd[#cmd+1] = tostring(parallel)

  if reverse then cmd[#cmd+1] = "-R" end
  if bidir then cmd[#cmd+1] = "--bidir" end

  if mode == "bytes" and bytes ~= "" then
    cmd[#cmd+1] = "-n"; cmd[#cmd+1] = bytes
  elseif mode == "blockcount" and blockcnt ~= "" then
    cmd[#cmd+1] = "-k"; cmd[#cmd+1] = blockcnt
  else
    cmd[#cmd+1] = "-t"; cmd[#cmd+1] = tostring(duration)
  end

  if title ~= "" then cmd[#cmd+1] = "-T"; cmd[#cmd+1] = title end

  if proto == "udp" then
    cmd[#cmd+1] = "-u"
    if bitrate and #bitrate > 0 then cmd[#cmd+1] = "-b"; cmd[#cmd+1] = bitrate end
    if dontfrag then cmd[#cmd+1] = "--dont-fragment" end
  else
    if window ~= "" then cmd[#cmd+1] = "-w"; cmd[#cmd+1] = window end
    if mss ~= "" then cmd[#cmd+1] = "-M"; cmd[#cmd+1] = mss end
    if nodelay then cmd[#cmd+1] = "-N" end
    if cc ~= "" then cmd[#cmd+1] = "-C"; cmd[#cmd+1] = cc end
    if zc then cmd[#cmd+1] = "-Z" end
  end
  -- execute via core (protected ELF)
  local full = ""
  for _,v in ipairs(cmd) do full = full .. " " .. util.shellquote(v) end
  local cj, raw = core_json("client start --" .. full)
  if not cj or cj.ok ~= true then
    return reply({ ok=false, error="client_start_failed", raw=raw })
  end

  cj.remote = rj
  reply(cj)
end

function action_stop()
  local ip2   = (http.formvalue("ip2") or ""):gsub("%s+","")
  local user2 = http.formvalue("user") or ""
  local pass2 = http.formvalue("pass") or ""
  core_exec("client stop")

  local remote = nil
  if (#user2 > 0) and (dt.ip4addr(ip2) or dt.ip6addr(ip2)) then
    local rj, err, raw = remote_stop_server(ip2, user2, pass2)
    remote = rj or { ok=false, error=err, raw=raw }
  end

  reply({ ok=true, msg="stopped", remote=remote })
end

function action_status()
  reply_raw_json(core_exec("client status"))
end

function action_log()
  local n = tonumber(http.formvalue("n") or "250") or 250
  reply_raw_json(core_exec("client log " .. tostring(n)))
end

function action_poll()
  local n = tonumber(http.formvalue("n") or "120") or 120
  reply_raw_json(core_exec("client poll " .. tostring(n)))
end

--CL_Section
function action_startc()
  local port = tonumber(http.formvalue("port") or "5201") or 5201
  reply_raw_json(core_exec("server start " .. tostring(port)))
end

function action_stopc()
  reply_raw_json(core_exec("server stop"))
end

function action_statusc()
  reply_raw_json(core_exec("server status"))
end

function action_logc()
  local n = tonumber(http.formvalue("n") or "120") or 120
  reply_raw_json(core_exec("server log " .. tostring(n)))
end
--endCL_Sec