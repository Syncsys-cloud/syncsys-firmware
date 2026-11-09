'use strict';

// Copyright(c) 2025, ALMalaki Openwrt Systems. All rights reserved.
//
// يُقرأ هذا الملف من /usr/libexec (خارج luci-static) ويُقيَّم عبر الـ stub.
// ممنوع استخدام "require" هنا — تصل المتغيرات العامة من الـ stub: E, L, _
//
// واجهة MKSPC بثيم SyncSys الموحد (mks-shell / متغيرات --alm-*).

var THEME_KEY = 'alm-mks-theme';
var UNKNOWN = 'غير معروف';

/* ------------------------------------------------ أدوات ------ */

function safe(v, fb) {
	if (fb === undefined) fb = '-';
	return (v === undefined || v === null || v === '') ? fb : String(v);
}

function fmtBytes(n) {
	n = Number(n);
	if (!isFinite(n) || n <= 0) return '-';
	var u = [ 'B', 'KB', 'MB', 'GB', 'TB' ];
	var i = 0;
	while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
	return (n >= 10 || i === 0 ? n.toFixed(0) : n.toFixed(1)) + ' ' + u[i];
}

function fmtKb(kb) {
	kb = Number(kb);
	if (!isFinite(kb) || kb <= 0) return '-';
	return fmtBytes(kb * 1024);
}

var PATHS = {
	chip:    'M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM9 9h6v6H9z',
	cpu:     'M6 6h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM9 9h6v6H9zM9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2',
	ram:     'M3 8h18v8H3zM7 16v2M12 16v2M17 16v2M6 11h2M11 11h2M16 11h2',
	disk:    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
	temp:    'M14 4a2 2 0 0 0-4 0v9.5a4 4 0 1 0 4 0zM12 17a1.5 1.5 0 1 0 0 .01',
	wifi:    'M5 12.55a11 11 0 0 1 14.08 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01',
	net:     'M4 9h16v6H4zM8 15v3M16 15v3M6 9V6h12v3',
	board:   'M4 4h16v16H4zM9 9h6v6H9zM4 12h5M15 12h5M12 4v5M12 15v5',
	info:    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 16v-4M12 8h.01',
	refresh: 'M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10',
	sun:     'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
	moon:    'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
	db:      'M12 2C7.6 2 4 3.6 4 5.5v13C4 20.4 7.6 22 12 22s8-1.6 8-3.5v-13C20 3.6 16.4 2 12 2zM4 5.5C4 7.4 7.6 9 12 9s8-1.6 8-3.5M4 12c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5'
};

function svgIcon(name, size) {
	size = size || 16;
	var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', size);
	svg.setAttribute('height', size);
	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '2');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	p.setAttribute('d', PATHS[name] || PATHS.info);
	svg.appendChild(p);
	return svg;
}

/* ------------------------------------------------ الثيم ------ */

function getTheme() {
	try { return window.localStorage.getItem(THEME_KEY) || 'dark'; }
	catch (e) { return 'dark'; }
}

function setTheme(shell, theme) {
	try { window.localStorage.setItem(THEME_KEY, theme); } catch (e) {}
	shell.classList.toggle('is-dark', theme === 'dark');
	var btn = shell.querySelector('[data-mks-theme-btn]');
	if (btn) {
		while (btn.firstChild) btn.removeChild(btn.firstChild);
		btn.appendChild(svgIcon(theme === 'dark' ? 'sun' : 'moon', 18));
		btn.title = theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن';
	}
}

/* ------------------------------------------------ لبنات ------ */

function mkTable(rows) {
	// rows: [ [label, value, opts?] ]  opts: { mono:true, node:true }
	var trs = [];
	rows.forEach(function(r) {
		if (!r) return;
		var opts = r[2] || {};
		var td = E('td', { 'class': opts.mono ? 'is-mono' : '' },
			opts.node ? [ r[1] ] : [ safe(r[1], UNKNOWN) ]);
		trs.push(E('tr', {}, [ E('th', {}, [ r[0] ]), td ]));
	});
	return E('table', { 'class': 'mks-table' }, [ E('tbody', {}, trs) ]);
}

function mkPanel(title, bodyNodes, opts) {
	opts = opts || {};
	var head = [];
	if (opts.icon)
		head.push(E('span', { 'class': 'mks-p-ico' }, [ svgIcon(opts.icon, 15) ]));
	head.push(title);
	if (opts.note)
		head.push(E('span', { 'class': 'mks-h-note' }, [ opts.note ]));
	return E('div', { 'class': 'mks-panel' + (opts.full ? ' is-full' : '') }, [
		E('h3', {}, head)
	].concat(bodyNodes));
}

function mkStat(icon, label, value, sub) {
	return E('div', { 'class': 'mks-stat' }, [
		E('div', { 'class': 'mks-stat-label' }, [ svgIcon(icon, 14), label ]),
		E('strong', {}, [ safe(value, UNKNOWN) ]),
		sub ? E('small', {}, [ sub ]) : ''
	]);
}

function mkChips(items, mono) {
	return E('div', { 'class': 'mks-chip-row' },
		items.map(function(t) {
			return E('span', { 'class': 'mks-chip' + (mono ? ' is-mono' : '') }, [ t ]);
		}));
}

function mkBadge(text, kind) {
	return E('span', { 'class': 'mks-badge ' + (kind || '') }, [ text ]);
}

function tempClass(t, max, crit) {
	// عتبات نسبية إلى crit/max إن توفرت، وإلا عتبات مطلقة معقولة
	var hi = Number(crit) || Number(max) || 100;
	if (t >= hi - 10) return 'bad';
	if (t >= hi * 0.7) return 'warn';
	return 'ok';
}

/* ------------------------------------------------ الأقسام ------ */

function sectionOverview(data) {
	var sys = data.system || {}, cpu = data.cpu || {}, mem = data.memory || {};
	var stor = data.storage || {}, wifi = Array.isArray(data.wifi) ? data.wifi : [];
	var temps = Array.isArray(data.temps) ? data.temps : [];

	var flashTotal = 0;
	(stor.flash || []).forEach(function(f) { flashTotal += Number(f.size_bytes) || 0; });

	var maxTemp = null;
	temps.forEach(function(t) {
		if (t && isFinite(Number(t.temp_c)))
			maxTemp = (maxTemp === null) ? Number(t.temp_c) : Math.max(maxTemp, Number(t.temp_c));
	});

	var cpuSub = [];
	if (cpu.cores) cpuSub.push(cpu.cores + ' أنوية');
	if (Number(cpu.cur_freq_mhz) > 0) cpuSub.push(cpu.cur_freq_mhz + ' MHz');

	return E('div', { 'class': 'mks-overview' }, [
		mkStat('board', 'الطراز', sys.Model, sys.Factory),
		mkStat('cpu', 'المعالج', cpu.model, cpuSub.join(' • ')),
		mkStat('ram', 'الذاكرة', fmtKb(mem.mem_total_kb), safe(mem.dram_type, '')),
		mkStat('disk', 'التخزين', fmtBytes(flashTotal), safe(stor.primary_type, '').toUpperCase()),
		mkStat('wifi', 'الواي فاي', wifi.length ? wifi.length + ' راديو' : UNKNOWN,
			wifi.map(function(w) { return w.bands; }).filter(Boolean).join(' / ') || ''),
		mkStat('temp', 'أعلى حرارة', maxTemp !== null ? maxTemp + '°C' : 'غير متوفرة',
			temps.length ? temps.length + ' حساس' : '')
	]);
}

function sectionSystem(sys) {
	return mkPanel('النظام', [ mkTable([
		[ 'الطراز', sys.Model ],
		[ 'اسم اللوحة', sys.Board_Name, { mono: true } ],
		[ 'المصنّع', sys.Factory ],
		[ 'نظام التشغيل', sys.OSystem ],
		[ 'إصدار SyncSys', sys.ALMalaki_Version ],
		[ 'إصدار OpenWrt', sys.Openwrt_Release ],
		[ 'المنصة الهدف', sys.TargetPlatform, { mono: true } ],
		[ 'المعمارية', sys.Arch, { mono: true } ],
		[ 'النواة (Kernel)', sys.Kernel, { mono: true } ],
		[ 'اسم المضيف', sys.Hostname, { mono: true } ]
	]) ], { icon: 'board' });
}

function sectionCpu(cpu, soc) {
	var cache = Array.isArray(cpu.cache) ? cpu.cache : [];
	var cacheNode = cache.length
		? mkChips(cache.map(function(c) { return 'L' + c.level + ' ' + safe(c.type) + ': ' + safe(c.size); }), true)
		: UNKNOWN;

	var freqTxt = (Number(cpu.cur_freq_mhz) > 0)
		? cpu.cur_freq_mhz + ' MHz' + (Number(cpu.max_freq_mhz) > Number(cpu.cur_freq_mhz) ? ' (حتى ' + cpu.max_freq_mhz + ' MHz)' : '')
		: UNKNOWN;

	var srcMap = { live: 'قراءة حية', arch: 'وحدة المعمارية', db: 'قاعدة البيانات', none: '' };

	var rows = [
		[ 'المعالج (SoC)', cpu.model ],
		[ 'النواة', cpu.core_model ],
		[ 'الأنوية / الخيوط', safe(cpu.cores) + ' / ' + safe(cpu.threads) ],
		[ 'التردد', freqTxt + (srcMap[cpu.freq_source] ? ' — ' + srcMap[cpu.freq_source] : '') ],
		cpu.bogomips ? [ 'BogoMIPS', cpu.bogomips, { mono: true } ] : null,
		cpu.isa ? [ 'مجموعة التعليمات', cpu.isa, { mono: true } ] : null,
		[ 'الكاش', cacheNode, { node: cache.length > 0 } ]
	];

	if (soc) {
		rows.push([ 'العائلة', soc.family ]);
		if (soc.process) rows.push([ 'دقة التصنيع', soc.process, { mono: true } ]);
		if (soc.interfaces) rows.push([ 'الواجهات', soc.interfaces, { mono: true } ]);
	}

	return mkPanel('المعالج', [ mkTable(rows) ], { icon: 'cpu' });
}

function sectionMemory(mem) {
	var opts = { icon: 'ram' };
	if (mem.dram_source === 'db')
		opts.note = 'مواصفات DRAM من قاعدة البيانات المرجعية';

	return mkPanel('الذاكرة', [ mkTable([
		[ 'الإجمالي', fmtKb(mem.mem_total_kb) ],
		[ 'المتاح', fmtKb(mem.mem_available_kb) ],
		[ 'الحر', fmtKb(mem.mem_free_kb) ],
		[ 'نوع DRAM', mem.dram_type ],
		[ 'المصنّع', mem.dram_vendor ],
		[ 'التردد', mem.dram_clock ]
	]) ], opts);
}

function sectionStorage(stor) {
	var body = [];
	var flash = Array.isArray(stor.flash) ? stor.flash : [];

	var rows = [ [ 'النوع الأساسي', safe(stor.primary_type, UNKNOWN).toUpperCase(), { mono: true } ] ];

	var parts = Array.isArray(stor.partitions) ? stor.partitions : [];

	flash.forEach(function(f) {
		rows.push([ 'الشريحة', f.chip_model ]);
		rows.push([ 'الحجم', fmtBytes(f.size_bytes) ]);
		if (f.page_bytes)
			rows.push([ 'Page / Erase / OOB',
				fmtBytes(f.page_bytes) + ' / ' + fmtBytes(f.erase_bytes) + ' / ' + f.oob_bytes + ' B',
				{ mono: true } ]);
	});

	rows.push([ 'عدد الأقسام', parts.length || (flash[0] && flash[0].section) || '-' ]);

	if (stor.ubi) {
		var bad = Number(stor.ubi.bad_peb_count) || 0;
		var badge = mkBadge(
			bad === 0 ? 'UBI سليم — لا بلوكات تالفة'
				: 'UBI: ' + bad + ' بلوك تالف من ' + safe(stor.ubi.total_eraseblocks),
			bad === 0 ? 'ok' : (bad > 5 ? 'bad' : 'warn'));
		rows.push([ 'صحة UBI', badge, { node: true } ]);
	}

	body.push(mkTable(rows));

	return mkPanel('التخزين', body, { icon: 'disk' });
}

function sectionTemps(temps) {
	if (!temps.length)
		return mkPanel('الحرارة', [
			E('div', { 'class': 'mks-note is-info' }, [
				svgIcon('info', 16),
				E('div', {}, [ 'لا توجد حساسات حرارة مكشوفة على هذه المعمارية.' ])
			])
		], { icon: 'temp' });

	var cards = temps.map(function(t) {
		var v = Number(t.temp_c);
		var cls = tempClass(v, t.max_c, t.crit_c);
		var hi = Number(t.crit_c) || Number(t.max_c) || 100;
		var pct = Math.max(3, Math.min(100, Math.round(v / hi * 100)));
		var meta = [];
		if (t.max_c) meta.push('max ' + t.max_c + '°C');
		if (t.crit_c) meta.push('crit ' + t.crit_c + '°C');

		return E('div', { 'class': 'mks-temp' }, [
			E('div', { 'class': 'mks-temp-head' }, [
				E('span', { 'class': 'mks-temp-name' }, [ safe(t.label, t.sensor) ]),
				E('span', { 'class': 'mks-temp-val ' + cls }, [ v + '°C' ])
			]),
			E('div', { 'class': 'mks-temp-bar' }, [
				E('div', { 'class': cls, 'style': 'width:' + pct + '%' })
			]),
			meta.length ? E('div', { 'class': 'mks-temp-meta' }, [ meta.join(' • ') ]) : ''
		]);
	});

	return mkPanel('الحرارة', [ E('div', { 'class': 'mks-temps' }, cards) ], { full: true, icon: 'temp' });
}

function sectionNetwork(net) {
	net = net || {};
	var sw = net.switch || {};
	var ports = Array.isArray(net.ports) ? net.ports : [];

	var srcMap = { live: 'كشف حي', arch: 'وحدة المعمارية', db: 'قاعدة البيانات', none: '' };
	var rows = [
		[ 'السويتش', safe(sw.model, UNKNOWN) + (srcMap[sw.source] ? ' — ' + srcMap[sw.source] : '') ],
		[ 'عدد المنافذ', sw.ports ]
	];
	if (net.crypto_engine)
		rows.push([ 'محرك التشفير', net.crypto_engine ]);

	var body = [ mkTable(rows) ];

	if (ports.length) {
		body.push(E('div', { 'class': 'mks-ports' }, ports.map(function(p) {
			var up = (p.state === 'up');
			return E('div', { 'class': 'mks-port ' + (up ? 'up' : 'down') }, [
				E('div', { 'class': 'mks-port-head' }, [
					E('span', { 'class': 'mks-port-name' }, [ p.name ]),
					mkBadge(up ? (p.speed_mbps > 0 ? p.speed_mbps + 'M' : 'UP') : 'DOWN', up ? 'ok' : 'bad')
				]),
				E('div', { 'class': 'mks-port-meta' }, [
					(up && p.duplex && p.duplex !== '?' ? p.duplex + ' • ' : '') + safe(p.mac, '')
				])
			]);
		})));
	}

	return mkPanel('الشبكة السلكية', body, { full: true, icon: 'net' });
}

function wifiFeatureChips(f) {
	// رقائق المزايا المتقدمة: MIMO / MU-MIMO / SU-MIMO / Beamforming / TWT / OFDMA / QAM
	if (!f) return null;
	var items = [];
	if (f.mimo && f.mimo !== UNKNOWN) items.push('MIMO ' + f.mimo);
	if (f.mu_mimo_dl) items.push('MU-MIMO تنزيل');
	if (f.mu_mimo_ul) items.push('MU-MIMO رفع');
	if (f.su_beamformer) items.push('SU-Beamformer');
	if (f.su_beamformee) items.push('SU-Beamformee');
	if (f.mu_beamformer) items.push('MU-Beamformer');
	if (f.mu_beamformee) items.push('MU-Beamformee');
	if (f.ofdma) items.push('OFDMA');
	if (f.twt) items.push('TWT');
	if (f.qam1024) items.push('1024-QAM');
	if (f.ldpc) items.push('LDPC');
	if (f.stbc) items.push('STBC');
	return items.length ? mkChips(items) : null;
}

function sectionWifi(wifi) {
	if (!wifi.length)
		return mkPanel('الواي فاي', [ mkTable([ [ 'الراديوهات', 'لم يُكتشف أي راديو' ] ]) ], { icon: 'wifi' });

	return wifi.map(function(w, i) {
		var bandTxt = safe(w.bands, UNKNOWN);
		var title = 'راديو ' + (i + 1) + (bandTxt !== UNKNOWN ? ' — ' + bandTxt + ' GHz' : '');
		var f = w.features || null;
		var chips = wifiFeatureChips(f);

		var rows = [
			w.hardware ? [ 'الشريحة', w.hardware ] : null,
			[ 'phy / الواجهة', safe(w.phy) + (w.iface ? ' / ' + w.iface : ''), { mono: true } ],
			[ 'التعريف (Driver)', safe(w.driver) + ' (' + safe(w.bus) + ')', { mono: true } ],
			[ 'الحزم', bandTxt + ' GHz', { mono: true } ],
			[ 'المعايير', '802.11 ' + safe(w.standards), { mono: true } ],
			[ 'أقصى عرض قناة', safe(w.max_channel_width_mhz) + ' MHz', { mono: true } ],
			[ 'MIMO (سلاسل TX/RX)', (f && f.mimo) ? f.mimo : safe(w.tx_chains) + 'x' + safe(w.rx_chains), { mono: true } ],
			chips ? [ 'المزايا المتقدمة', chips, { node: true } ] :
				[ 'Beamforming', w.beamforming === 'yes' ? 'مدعوم' : 'غير مدعوم' ]
		];

		var opts = { icon: 'wifi' };
		if (isFinite(Number(w.temp_c)))
			opts.note = 'الحرارة: ' + w.temp_c + '°C';

		return mkPanel(title, [ mkTable(rows) ], opts);
	});
}

function sectionMetaNote(meta) {
	meta = meta || {};
	var bits = [];

	bits.push(mkBadge('وحدة المعمارية: ' + safe(meta.arch_module, 'generic'), 'royal'));

	if (meta.db_match) {
		var n = Array.isArray(meta.db_fields) ? meta.db_fields.length : 0;
		bits.push(mkBadge('موجود في قاعدة البيانات المرجعية' + (n ? ' (' + n + ' حقول مكمَّلة)' : ''), 'gold'));
	} else {
		bits.push(mkBadge(' غير مسجل في قاعدة البيانات ', 'warn'));
	}

	var body = [ E('div', { 'class': 'mks-chip-row' }, bits) ];

	// مرجع قاعدة البيانات: الشرائح الفيزيائية وفئة السرعة (لا تُقرأ حيًّا)
	var ref = meta.db_ref || null;
	if (ref && (ref.wifi_chip || ref.wifi_class)) {
		var refBits = [];
		if (ref.wifi_chip) refBits.push(mkBadge('شرائح الواي فاي: ' + ref.wifi_chip, ''));
		if (ref.wifi_class) refBits.push(mkBadge(ref.wifi_class, ''));
		body.push(E('div', { 'class': 'mks-chip-row', 'style': 'margin-top:6px' }, refBits));
	}

	return E('div', { 'class': 'mks-note is-info' }, [
		svgIcon('db', 16),
		E('div', {}, body)
	]);
}

/* ------------------------------------------------ الهيدر ------ */

function mkHeader(onReload) {
	var themeBtn = E('button', {
		'type': 'button',
		'class': 'mks-ibtn',
		'data-mks-theme-btn': '1',
		'title': 'تبديل المظهر',
		'click': function(ev) {
			ev.preventDefault();
			var shell = ev.target.closest('.mks-shell');
			setTheme(shell, shell.classList.contains('is-dark') ? 'light' : 'dark');
		}
	}, [ svgIcon(getTheme() === 'dark' ? 'sun' : 'moon', 18) ]);

	var reloadBtn = E('button', {
		'type': 'button',
		'class': 'mks-ibtn mks-ibtn-primary',
		'title': 'إعادة الفحص',
		'aria-label': 'إعادة الفحص',
		'click': function(ev) {
			ev.preventDefault();
			if (typeof onReload === 'function') onReload();
			else window.location.reload();
		}
	}, [ svgIcon('refresh', 18) ]);

	return E('header', { 'class': 'mks-header' }, [
		E('div', { 'class': 'mks-brand' }, [
			E('div', { 'class': 'mks-logo' }, [ svgIcon('chip', 24) ]),
			E('div', { 'class': 'mks-brand-text' }, [
				E('div', { 'class': 'mks-brand-name' }, [ 'MKSPC ', E('b', {}, 'مواصفات الجهاز') ]),
				E('span', { 'class': 'mks-brand-tag' }, 'تقرير شامل لعتاد الجهاز مع فحص صحة العتاد وحالتة — من فريق SyncSys.cloud')
			])
		]),
		E('div', { 'class': 'mks-header-actions' }, [ reloadBtn, themeBtn ])
	]);
}

/* ------------------------------------------------ الواجهة ------ */

function renderHiddenView(data, rightActionsNodes, onReload) {
	data = data || {};

	var content;

	if (data.error) {
		content = [
			E('div', { 'class': 'mks-note is-danger' }, [
				svgIcon('info', 16),
				E('div', {}, [
					E('strong', {}, [ 'تعذر جمع المواصفات: ' ]),
					safe(data.error)
				])
			]),
			data.raw ? E('pre', { 'class': 'mks-pre' }, [ String(data.raw) ]) : ''
		];
	} else {
		var temps = Array.isArray(data.temps) ? data.temps : [];
		var wifi = Array.isArray(data.wifi) ? data.wifi : [];

		var panels = [
			sectionSystem(data.system || {}),
			sectionCpu(data.cpu || {}, data.soc || null),
			sectionMemory(data.memory || {}),
			sectionStorage(data.storage || {})
		];

		panels = panels.concat(sectionWifi(wifi));
		panels.push(sectionTemps(temps));
		panels.push(sectionNetwork(data.network || {}));

		content = [
			sectionOverview(data),
			sectionMetaNote(data.meta),
			E('div', { 'class': 'mks-grid' }, panels)
		];
	}

	var shell = E('div', { 'class': 'mks-shell' + (getTheme() === 'dark' ? ' is-dark' : '') }, [
		mkHeader(onReload),
		E('div', { 'class': 'mks-content' }, content),
		E('footer', { 'class': 'mks-footer' }, [
			'Copyright(c) 2026-2027, SyncSys.cloud OPEWNWRT TEAM — All Rights Reserved'
		])
	]);

	return shell;
}

return {
	renderHiddenView: renderHiddenView
};
