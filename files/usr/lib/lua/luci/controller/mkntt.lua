module("luci.controller.mkntt", package.seeall)

local http  = require "luci.http"
local sys   = require "luci.sys"
local util  = require "luci.util"
local jsonc = require "luci.jsonc"
local fs    = require "nixio.fs"

-- Keep paths explicit and defensive (avoid nil -> fs.access errors)
local MKNTT = "/usr/libexec/mkntt/mkntt.sh"

local function exists(p)
  return (type(p) == "string" and #p > 0 and fs.access(p)) and true or false
end

local function reply_raw_json(raw)
  http.prepare_content("application/json")
  raw = raw or ""
  raw = raw:gsub("^%s+", ""):gsub("%s+$", "")
  if raw:sub(1,1) ~= "{" then
    raw = '{"ok":false,"error":"non_json","raw":' .. jsonc.stringify(raw) .. '}'
  end
  http.write(raw)
end

local function q(v)
  return util.shellquote(v or "")
end

local function f(k)
  return http.formvalue(k)
end

local function add_opt(args, key, flag)
  local v = f(key)
  if v and #v > 0 then
    args[#args+1] = flag
    args[#args+1] = v
  end
end

local function add_bool(args, key, flag)
  if f(key) == "1" then
    args[#args+1] = flag
  end
end

local function exec_script(path, args)
  if not exists(path) then
    return '{"ok":false,"error":"missing_script","path":' .. jsonc.stringify(path or "") .. '}'
  end
  local cmd = q(path)
  for i = 1, #args do
    cmd = cmd .. " " .. q(args[i])
  end
  -- scripts already return JSON; keep stderr away
  local out = sys.exec(cmd .. " 2>/dev/null")
  return out
end

local function exec_mkntt(subcmd, args)
  local a = { subcmd }
  for i = 1, #args do a[#a+1] = args[i] end
  return exec_script(MKNTT, a)
end

function index()

  entry({"admin","almalaki-app","mkntt"}, view("mkntt/mkntt"), _("MKNTT [ أدوات الشبكة ]"), 50).dependent = true
  entry({"admin","almalaki-app","mkntt","pingstart"},  call("action_ping_start")).leaf = true
  entry({"admin","almalaki-app","mkntt","pingpoll"},   call("action_ping_poll")).leaf = true
  entry({"admin","almalaki-app","mkntt","pingstop"},   call("action_ping_stop")).leaf = true

  entry({"admin","almalaki-app","mkntt","tracestart"}, call("action_trace_start")).leaf = true
  entry({"admin","almalaki-app","mkntt","tracepoll"},  call("action_trace_poll")).leaf = true
  entry({"admin","almalaki-app","mkntt","tracestop"},  call("action_trace_stop")).leaf = true
end

-- ===== Ping =====
function action_ping_start()
  local args = {}

  -- required
  args[#args+1] = "--host";   args[#args+1] = (f("host") or "")
  args[#args+1] = "--family"; args[#args+1] = (f("family") or "auto")

  add_opt(args, "count", "--count")
  add_opt(args, "size", "--size")
  add_opt(args, "interval", "--interval")
  add_opt(args, "ttl", "--ttl")
  add_opt(args, "source", "--source")
  add_opt(args, "wait", "--wait")
  add_opt(args, "deadline", "--deadline")
  add_opt(args, "pattern", "--pattern")
  add_bool(args, "adaptive", "--adaptive")

  local out = exec_mkntt("ping_start", args)
  reply_raw_json(out)
end

function action_ping_poll()
  local sid = f("sid") or ""
  local since = tonumber(f("since") or "0") or 0
  local limit = tonumber(f("limit") or "200") or 200
  if limit < 1 then limit = 200 end
  if limit > 600 then limit = 600 end

  local args = {"--sid", sid, "--since", tostring(since), "--limit", tostring(limit)}
  local out = exec_mkntt("ping_poll", args)
  reply_raw_json(out)
end

function action_ping_stop()
  local sid = f("sid") or ""
  local args = {"--type", "ping", "--sid", sid}
  local out = exec_mkntt("stop", args)
  reply_raw_json(out)
end

-- ===== Traceroute =====
function action_trace_start()
  local args = {}

  args[#args+1] = "--host";   args[#args+1] = (f("host") or "")
  args[#args+1] = "--family"; args[#args+1] = (f("family") or "auto")

  add_bool(args, "dont_fragment", "--dont-fragment")
  add_bool(args, "show_ttl", "--show-ttl")
  add_bool(args, "numeric", "--numeric")
  add_bool(args, "bypass", "--bypass")
  add_bool(args, "verbose", "--verbose")

  add_opt(args, "first_ttl", "--first-ttl")
  add_opt(args, "max_ttl", "--max-ttl")
  add_opt(args, "probes", "--probes")
  add_opt(args, "port", "--port")
  add_opt(args, "tos", "--tos")
  add_opt(args, "wait", "--wait")
  add_opt(args, "source", "--source")
  add_opt(args, "iface", "--iface")
  add_opt(args, "pause", "--pause")
  add_opt(args, "bytes", "--bytes")

  local out = exec_mkntt("trace_start", args)
  reply_raw_json(out)
end

function action_trace_poll()
  local sid = f("sid") or ""
  local since = tonumber(f("since") or "0") or 0
  local limit = tonumber(f("limit") or "200") or 200
  if limit < 1 then limit = 200 end
  if limit > 600 then limit = 600 end

  local args = {"--sid", sid, "--since", tostring(since), "--limit", tostring(limit)}
  local out = exec_mkntt("trace_poll", args)
  reply_raw_json(out)
end

function action_trace_stop()
  local sid = f("sid") or ""
  local args = {"--type", "trace", "--sid", sid}
  local out = exec_mkntt("stop", args)
  reply_raw_json(out)
end
