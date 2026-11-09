local fs  = require "nixio.fs"
local sys = require "luci.sys"
local http = require "luci.http"
local dispatcher = require "luci.dispatcher"

m = SimpleForm("systemupdate", "تحديث النظام", "إدارة تحديث النظام ")
m.reset = false
m.submit = false

local online = (sys.call("ping -c 1 -W 1 8.8.8.8 >/dev/null 2>&1") == 0)
local status_text = online and "🟢 متصل" or "🟥 غير متصل"
local status_color = online and "#00AA00" or "#FF0000"


local version = fs.readfile("/etc/openwrt_version") or "غير معروف"
--local device_product = fs.readfile("/etc/device_product") or "غير معروف"
--local device_product = sys.exec([[awk -F= '/DEVICE_PRODUCT/ {gsub(/["'\''[:@:\/?#\[\]!$&()*+,;=]/, "_", $2); print $2}' /etc/device_info]]):gsub("\n", "")
local device_product = sys.exec([[cat "/etc/device_info" | grep "DEVICE_PRODUCT" | cut -f 2 -d '=' | sed -e "s/['\"]//g" -e "s'[]:@/?#[!$&()*+,;=]'_'g"]]):gsub("\n", "")

--local changelog_path = "/tmp/update_changelog.txt"
--local changelog = fs.readfile(changelog_path) or "لا توجد معلومات حتى الآن ..."

local new_version_path = "/tmp/new_firmware_available"
local new_version = (fs.access(new_version_path) and fs.readfile(new_version_path)) or nil


local changelog_path = "/tmp/update_changelog.txt"
local changelog_exists = fs.access(changelog_path)
local changelog = (changelog_exists and fs.readfile(changelog_path)) or ""
local show_update_button = (changelog_exists and #changelog:gsub("%s+", "") > 0)


local s1 = m:section(SimpleSection)
s1.template = "cbi/nullsection"
s1.title = "🌐 تحديث عن بُعد عبر AL-MALAKI SERVER"
s1.description = [[
<div style="display: inline-flex;background-color: #f4f5f7;flex-wrap: wrap;padding-left: 10px;align-items: center;border-radius: 8px;padding-right: 10px;padding-top: 5px;padding-bottom: 5px; font-family: system-ui;">
    <div style="padding-inline-end: 10px;"> 
        <strong>الحالة: </strong> 
        <span id="netstatus" style="color:]] .. status_color .. [[;font-weight:bold">]] .. status_text .. [[</span>
        <button type="button" class="cbi-button cbi-button-neutral" onclick="checkStatus()">🔄 إعادة فحص</button>
    </div>

    <div style="padding-inline-end: 10px;">
        <strong>موديل الجهاز : </strong>
        <span style="font-weight:bold">]] .. device_product .. [[</span>
    </div>

    <div style="padding-inline-end: 10px;">
        <strong>إصدار النظام : </strong>
        <span style="font-weight:bold">]] .. version .. [[</span>
    </div>
</div>

<br/>

<form method="post">
  <button class="cbi-button cbi-button-action" name="check_updates" value="1" onclick="simulateProgressBar()">🔍 البحث عن التحديثات</button>
</form>
<br/>
]] ..
(show_update_button and [[
<div style="display:flex; align-items:center; gap:15px;">
  <form method="post">
   <button class="cbi-button" name="run_tr069" value="1" style="background-color:#009688; color:#fff; font-weight:bold;">
  🔰 تنزيل وتحديث النظام
	</button>
  </form>
  <div>
    <strong>📦 الإصدار الجديد : </strong>
    <span style="font-weight:bold;color: forestgreen;">]] .. (new_version or "غير متوفر") .. [[</span>
  </div>
</div>

<br/>

<div>
  <strong>🆕 ما الجديد؟</strong>
  <pre style="background: #fbf1df;border:1px solid #ccc;padding:10px;font-size: 14px;max-height: 150px;overflow:auto;color: #002794;font-weight: bolder;border-radius: 8px;font-family: system-ui;">]] .. changelog .. [[</pre>
</div>
<br/>
]] or "") ..
[[
<script>
function checkStatus() {
    fetch("]] .. dispatcher.build_url("admin", "almalaki-app", "systemupdate", "check") .. [[")
        .then(res => res.json())
        .then(data => {
            const el = document.getElementById("netstatus");
            if (data.status === "online") {
                el.textContent = "🟢 متصل";
                el.style.color = "#00AA00";
            } else {
                el.textContent = "🟥 غير متصل";
                el.style.color = "#FF0000";
            }
        });
}
</script>
<script>
function simulateProgressBar() {
  const container = document.getElementById("update-progress-container");
  const bar = document.getElementById("update-progress-bar");

  container.style.display = "block";
  bar.style.width = "0%";

  let progress = 0;
  const interval = setInterval(() => {
    if (progress >= 100) {
      clearInterval(interval);
      bar.style.width = "100%";
    } else {
      progress += 5;
      bar.style.width = progress + "%";
    }
  }, 300);
}
</script>

]]



-- 🧾 القسم السادس: حالة التحديث الحي (log)
local s5 = m:section(SimpleSection)
s5.template = "cbi/nullsection"
s5.title = ""
s5.description = [[
<div style="display: inline-flex;background-color: #f4f5f7;flex-wrap: wrap;padding-left: 10px;align-items: center;border-radius: 8px;padding-right: 10px;padding-top: 5px;padding-bottom: 5px;und;font-family: system-ui; width: 100%;">
  <strong style="padding-right: 6px;"> حالة التحديث    :    </strong>
  <pre id="fwlog" style="background:#f0f0f0; padding:10px; border:1px solid #ccc; overflow:auto; font-size:12px; width: 80%;">No Start Update</pre>
</div>
<div id="update-progress-container" style="margin-top:10px; display:none;">
  <strong>🔄 جاري تفقد التحديثات ...</strong>
  <div style="background-color:#e9ecef; border-radius: 4px; overflow:hidden; height:20px; width:100%;">
    <div id="update-progress-bar" style="height:100%; width:0%; background-color:#28a745; transition: width 0.5s;"></div>
  </div>
</div>
<script>

function updateLog() {
  fetch("]] .. dispatcher.build_url("admin", "almalaki-app", "systemupdate", "log_raw") .. [[")
    .then(r => r.text())
    .then(text => {
      document.getElementById("fwlog").textContent = text || "NoStart";
      // parse machine-friendly keys for progress
      let pct = null, sp = null, eta = null;
      if (text) {
        const m1 = text.match(/progress=(\d+(?:\.\d+)?)/);
        const m2 = text.match(/speed_kbps=(\d+)/);
        const m3 = text.match(/eta_sec=(\d+)/);
        if (m1) pct = Math.max(0, Math.min(100, parseInt(m1[1], 10)));
        if (m2) sp = parseInt(m2[1], 10);
        if (m3) eta = parseInt(m3[1], 10);
      }
      const container = document.getElementById("update-progress-container");
      const bar = document.getElementById("update-progress-bar");
      if (pct !== null) {
        container.style.display = "block";
        bar.style.width = pct + "%";
      } else {
        // hide if nothing
        container.style.display = "none";
      }
    });
}
setInterval(updateLog, 1000);
updateLog();
</script>
]]

local s4 = m:section(SimpleSection)
s4.template = "cbi/nullsection"
s4.title = "🗂️ تحديث من ملف محلي"

s4.description = [[
<form method="post" enctype="multipart/form-data" style="margin-bottom: 1em;">
  <input type="file" name="sysupgrade_file" accept=".mks" required />
  <button class="cbi-button cbi-button-neutral" name="upload" value="1">📤 رفع التحديث</button>
</form>

<form method="post">
  <button class="cbi-button cbi-button-apply" name="apply_update" value="1">♻️ بدء التحديث</button>
</form>
<br/>
]]

if http.formvalue("upload") and http.getenv("CONTENT_TYPE") then
local fileinfo = http.formvalue("sysupgrade_file")
local path = "/tmp/sysupgred.bin"
local fp = io.open(path, "w")

if not fp then
s4.description = s4.description .. [[<p style="color:red">❌ تعذر فتح ]] .. path .. [[ للكتابة!</p>]]
else
http.setfilehandler(
function(meta, chunk, eof)
if chunk then
fp:write(chunk)
end
if eof then
fp:close()
s4.description = s4.description .. [[<p style="color:green">✅ تم رفع الملف بنجاح إلى <code>]] .. path .. [[</code></p>]]
 luci.sys.call("/usr/bin/firmware_update.sh &")
end
end
)
end
end

if http.formvalue("apply_update") then
local fpath = "Firmware.mks"
local path = "/tmp/sysupgred.bin"
if fs.access(path) then
if luci.sys.call("/usr/bin/firmware_update.sh -T >/dev/null 2>&1") == 0 then
luci.sys.call("/usr/bin/firmware_update.sh -U &")
s4.description = s4.description .. [[<p style="color:blue">🚀 تم بدء التحديث بنجاح...</p>]]
else
s4.description = s4.description .. [[<p style="color:red">⚠️ ملف التحديث غير صالح!</p>]]
end
else
s4.description = s4.description .. [[<p style="color:red">❌ لم يتم العثور على الملف <code>]] .. fpath .. [[</code></p>]]
end
end

if http.formvalue("check_updates") then
    fs.remove("/tmp/check_done")
    luci.sys.call("/usr/bin/check_update.sh")
    http.redirect(dispatcher.build_url("admin", "almalaki-app", "systemupdate"))
end


if http.formvalue("run_tr069") then
    fs.remove("/tmp/update_done")
    luci.sys.call("/usr/bin/easycwmp.sh &")
    http.redirect(dispatcher.build_url("admin", "almalaki-app", "systemupdate"))
end

return m
