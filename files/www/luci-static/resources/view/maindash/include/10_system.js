'use strict';
'require baseclass';
'require rpc';
'require fs';
'require network';

var callLuciVersion = rpc.declare({
	object: 'luci',
	method: 'getVersion'
});

var callSetLocaltime = rpc.declare({
	object: 'luci',
	method: 'setLocaltime',
	params: [ 'localtime' ],
	expect: { result: 0 }
});

var callSystemBoard = rpc.declare({
	object: 'system',
	method: 'board'
});

var callSystemInfo = rpc.declare({
	object: 'system',
	method: 'info'
});

var callCpuUsage = rpc.declare({
	object: 'system',
	method: 'cpu'
});


function infoBox(label, value) {
	return E('div', {
		'class': 'system-infobox'
	}, [
		E('div', { 'class': 'system-infobox-label' }, [ label ]),
		E('div', { 'class': 'system-infobox-value' }, [
			(value != null) ? value : '?'
		])
	]);
}

return baseclass.extend({
	title: ' ',

	load: function() {
		return Promise.all([
			L.resolveDefault(callSystemBoard(), {}),
			L.resolveDefault(callSystemInfo(), {}),
			L.resolveDefault(callLuciVersion(), { revision: _('unknown version'), branch: 'LuCI' }),
			fs.exec('/bin/sh', ['-c', "top -bn1 | grep 'CPU:'"]),
			network.getDevices()
		]);
	},

	render: function(data) {
	callSetLocaltime(Math.floor(Date.now() / 1000));
		var boardinfo   = data[0] || {},
		    systeminfo  = data[1] || {},
		    luciversion = data[2] || {},
		    cpuTop = data[3] || {},
		    devices = data[4] || []; // قائمة الأجهزة

		var mem = L.isObject(systeminfo.memory) ? systeminfo.memory : {};
		var root = L.isObject(systeminfo.root)   ? systeminfo.root   : {};

		var cpuUsageFromTop = null;

		if (cpuTop && cpuTop.stdout) {
			var cpuLine = cpuTop.stdout.split("\n")[0];
			var idleMatch = cpuLine.match(/(\d+)%\s*idle/);

			if (idleMatch) {
				var idle = parseFloat(idleMatch[1]);
				var cpuUsage = (100 - idle).toFixed(2);
				cpuUsageFromTop = `${cpuUsage}%`;  
			} else {
				cpuUsageFromTop = 'غير معروف';
			}
		} else {
			cpuUsageFromTop = 'غير معروف';
		}
var datestr = null;
if (systeminfo.localtime) {
    var date = new Date((systeminfo.localtime + (new Date().getTimezoneOffset() * 60)) * 1000);
    // تعديل الوقت حسب المنطقة الزمنية الخاصة بالنظام
    var timeZoneOffset = date.getTimezoneOffset();
    var adjustedDate = new Date(date.getTime() - (timeZoneOffset * 60000)); // تعديل التاريخ حسب المنطقة الزمنية
    datestr = '%04d-%02d-%02d %02d:%02d:%02d'.format(
        date.getFullYear(),
        date.getMonth() + 1,
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds()
    );
}


		var memAvail = null;
		if (mem.available != null) {
			memAvail = mem.available;
		}
		else if (mem.total && mem.free != null && mem.buffered != null) {
			memAvail = mem.free + mem.buffered;
		}

		var memText = null;
		if (memAvail != null && mem.total) {
			var memAvailMB = Math.round(memAvail / 1024 / 1024);
			var memPcAvail = Math.floor((100 * memAvail) / mem.total);
			memText = memAvailMB + 'MB (' + memPcAvail + '%)';
		}

		var rootAvail = null;
		if (root.available != null) {
			rootAvail = root.available;
		}
		else if (root.total != null && root.used != null) {
			rootAvail = root.total - root.used;
		}

		var storageText = null;
		if (rootAvail != null && root.total) {
			var rootAvailMB = Math.round(rootAvail / 1024);
			var storagePcAvail = Math.floor((100 * rootAvail) / root.total);
			storageText = '%dMB (%d%%)'.format(rootAvailMB, storagePcAvail);
		}

		var uptimeStr = systeminfo.uptime ? '%t'.format(systeminfo.uptime) : null;

		var fwVersion = null;
		if (L.isObject(boardinfo.release)) {
			fwVersion = boardinfo.release.version ||
			            boardinfo.release.revision ||
			            boardinfo.release.description;
		}
		else if (luciversion && luciversion.revision) {
			fwVersion = luciversion.revision;
		}

		// استخراج معلومات البردج (br-lan) من الأجهزة
		var bridgeInfo = devices.find(device => device.device === "br-lan") || {};

		var ipAddress = bridgeInfo.dev.ipaddrs && bridgeInfo.dev.ipaddrs[0] ? bridgeInfo.dev.ipaddrs[0].split('/')[0] : 'غير معروف';
		var macAddress = bridgeInfo.dev.macaddr || 'غير معروف';
		var txRate = bridgeInfo.dev.stats ? (bridgeInfo.dev.stats.tx_bytes / 1024 / 1024).toFixed(2) + ' MB' : 'غير معروف';
		var rxRate = bridgeInfo.dev.stats ? (bridgeInfo.dev.stats.rx_bytes / 1024 / 1024).toFixed(2) + ' MB' : 'غير معروف';

		var row1 = E('div', {
			'style': 'display:flex;flex-wrap:wrap;margin:-0.5em 0 1em'
		}, [
			infoBox('اسم الجهاز', boardinfo.hostname),
			infoBox('الموديل', boardinfo.model),
			infoBox('إصدار النظام', fwVersion)
			
		]);
var totalData = 'غير معروف';
if (bridgeInfo.dev.stats) {
    var totalTxRxBytes = (bridgeInfo.dev.stats.tx_bytes + bridgeInfo.dev.stats.rx_bytes) / 1024 / 1024; // بالميجابايت
    totalData = totalTxRxBytes.toFixed(2) + ' MB';
}

		var row2 = E('div', {
			'style': 'display:flex;flex-wrap:wrap;margin:-0.5em 0'
		}, [infoBox('IP ', ipAddress),
			infoBox('MAC ', macAddress),
			infoBox('إجمالي البيانات ', totalData)
]); 

		var header = document.querySelector('header.bg-primary .container');
		if (header) {
			var cpuInfo = document.getElementById('cpuInfo');
			var memoryInfo = document.getElementById('memoryInfo');
			var uptimeInfo = document.getElementById('uptimeInfo');
			var dateInfo = document.getElementById('dateInfo');
			var storageInfo = document.getElementById('storageInfo'); 

			if (!cpuInfo) {
				cpuInfo = document.createElement('div');
				cpuInfo.id = 'cpuInfo';
				cpuInfo.className = 'system-info';
				header.appendChild(cpuInfo);
			}
			if (!memoryInfo) {
				memoryInfo = document.createElement('div');
				memoryInfo.id = 'memoryInfo';
				memoryInfo.className = 'system-info';
				header.appendChild(memoryInfo);
			}
			if (!uptimeInfo) {
				uptimeInfo = document.createElement('div');
				uptimeInfo.id = 'uptimeInfo';
				uptimeInfo.className = 'system-info';
				header.appendChild(uptimeInfo);
			}
			if (!dateInfo) {
				dateInfo = document.createElement('div');
				dateInfo.id = 'dateInfo';
				dateInfo.className = 'system-info';
				header.appendChild(dateInfo);
			}
			if (!storageInfo) { 
				storageInfo = document.createElement('div');
				storageInfo.id = 'storageInfo';
				storageInfo.className = 'system-info';
				header.appendChild(storageInfo);
			}

			cpuInfo.innerHTML = `🖥️ المعالج: ${cpuUsageFromTop || 'غير معروف'}`;
			memoryInfo.innerHTML = `💾 الذاكرة المتاحة: ${memText || 'غير معروف'}`;
			uptimeInfo.innerHTML = `⏱️ مدة التشغيل: ${uptimeStr || 'غير معروف'}`;
			dateInfo.innerHTML = `📅 التاريخ المحلي: ${datestr || 'غير معروف'}`;
			storageInfo.innerHTML = `💽 التخزين المتاح: ${storageText || 'غير معروف'}`;
		}

		var passwordAlert = document.querySelector('.alert-message.error');
		if (passwordAlert) {
			passwordAlert.style.display = 'none';
		}

		return E('div', {}, [ row1, row2 ]);
	}
});
