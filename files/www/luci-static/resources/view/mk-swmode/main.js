'use strict';
'require rpc';
'require ui';
'require view';

var callStatus = rpc.declare({ object: 'mk-swmode', method: 'status', expect: { '': {} } });
var callDetect = rpc.declare({ object: 'mk-swmode', method: 'detect', expect: { '': {} } });
var callPreview = rpc.declare({ object: 'mk-swmode', method: 'preview', params: [ 'mode' ], expect: { '': {} } });
var callApply = rpc.declare({ object: 'mk-swmode', method: 'apply', params: [ 'mode' ], expect: { '': {} } });
var callBackup = rpc.declare({ object: 'mk-swmode', method: 'backup', expect: { '': {} } });
var callRestore = rpc.declare({ object: 'mk-swmode', method: 'restore', expect: { '': {} } });
var callDiagnostics = rpc.declare({ object: 'mk-swmode', method: 'diagnostics', params: [ 'command' ], expect: { '': {} } });

var MODE_SWITCH = 'switch-port';
var MODE_ADAPTER = 'ethernet-adapter';

function ensureStyles() {
	if (document.getElementById('mk-swmode-style'))
		return;

	var link = document.createElement('link');
	link.id = 'mk-swmode-style';
	link.rel = 'stylesheet';
	link.type = 'text/css';
	link.href = L.resource('mk-swmode/mk-swmode.css');
	document.head.appendChild(link);
}

function icon(name) {
	var paths = {
		crown: [ 'M3 8l4 4 5-7 5 7 4-4-2 11H5L3 8z', 'M5 19h14' ],
		help: [ 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M9.1 9a3 3 0 1 1 5.8 1c0 2-3 3-3 3', 'M12 17h.01' ],
		sun: [ 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2', 'M12 20v2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M2 12h2', 'M20 12h2', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4' ],
		moon: [ 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z' ],
		switch: [ 'M3 7h18v10H3z', 'M7 11h.01', 'M11 11h.01', 'M15 11h.01', 'M19 11h.01', 'M7 15h10' ],
		port: [ 'M6 8h12v8H6z', 'M9 8V5h6v3', 'M9 16v3h6v-3' ],
		adapter: [ 'M5 12h6', 'M13 7l6 5-6 5V7z', 'M3 7v10' ],
		refresh: [ 'M21 12a9 9 0 0 1-15.4 6.4L3 16', 'M3 21v-5h5', 'M3 12A9 9 0 0 1 18.4 5.6L21 8', 'M21 3v5h-5' ],
		check: [ 'M20 6L9 17l-5-5' ],
		save: [ 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z', 'M17 21v-8H7v8', 'M7 3v5h8' ],
		backup: [ 'M12 3v10', 'M8 9l4 4 4-4', 'M5 17h14', 'M5 21h14' ],
		restore: [ 'M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5' ],
		tool: [ 'M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5L15 12l-3-3 2.7-2.7z' ],
		warn: [ 'M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01' ],
		close: [ 'M18 6L6 18', 'M6 6l12 12' ],
		terminal: [ 'M4 17l6-5-6-5', 'M12 19h8' ],
		shield: [ 'M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z' ]
	};
	var ns = 'http://www.w3.org/2000/svg';
	var svg = document.createElementNS(ns, 'svg');
	var data = paths[name] || paths.switch;

	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('fill', 'none');
	svg.setAttribute('stroke', 'currentColor');
	svg.setAttribute('stroke-width', '2');
	svg.setAttribute('stroke-linecap', 'round');
	svg.setAttribute('stroke-linejoin', 'round');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');

	for (var i = 0; i < data.length; i++) {
		var path = document.createElementNS(ns, 'path');
		path.setAttribute('d', data[i]);
		svg.appendChild(path);
	}

	return svg;
}

function svgEl(name, attrs, text) {
	var ns = 'http://www.w3.org/2000/svg';
	var el = document.createElementNS(ns, name);
	var key;

	for (key in (attrs || {}))
		el.setAttribute(key, attrs[key]);

	if (text != null)
		el.appendChild(document.createTextNode(text));

	return el;
}

function asList(value) {
	if (!value)
		return [];
	if (Array.isArray(value))
		return value.filter(function(item) { return item; });
	return String(value).split(/\s+/).filter(function(item) { return item; });
}

function unique(list) {
	var seen = {};
	var out = [];

	for (var i = 0; i < list.length; i++) {
		if (!list[i] || seen[list[i]])
			continue;
		seen[list[i]] = true;
		out.push(list[i]);
	}

	return out;
}

function modeLabel(mode) {
	if (mode === MODE_SWITCH)
		return _('وضع منافذ السويتش');
	if (mode === MODE_ADAPTER)
		return _('وضع محولات Ethernet');
	return _('غير معروف / مختلط');
}

function modeClass(mode) {
	if (mode === MODE_SWITCH)
		return 'is-switch';
	if (mode === MODE_ADAPTER)
		return 'is-adapter';
	return 'is-mixed';
}

function portType(name, physical, macvlans) {
	if (macvlans.indexOf(name) >= 0 || /^mv-/.test(name))
		return 'macvlan';
	if (physical.indexOf(name) >= 0)
		return 'physical';
	return 'other';
}

function compactPorts(data) {
	var physical = asList(data.physical_ports || data.original_ports);
	var macvlans = asList(data.macvlan_ports);
	var skipped = asList(data.skipped_ports);
	var current = unique(asList(data.ports).concat(physical).concat(macvlans).concat(skipped));

	return {
		physical: unique(physical),
		macvlans: unique(macvlans),
		skipped: unique(skipped),
		current: current
	};
}

function resultOk(data) {
	return data && data.ok !== false && !data.error;
}

function errorText(err) {
	if (!err)
		return _('خطأ غير معروف');
	if (typeof err === 'string')
		return err;
	return err.message || err.error || _('فشلت العملية. راجع سجل النظام أو خدمة rpcd.');
}

function portCaption(type) {
	if (type === 'macvlan')
		return _('macvlan مباشر');
	if (type === 'physical')
		return _('منفذ DSA أصلي');
	return _('عضو في الجسر');
}

function listText(list, empty) {
	list = asList(list);
	return list.length ? list.join(', ') : (empty || _('لا يوجد'));
}

function actionButton(iconName, label, action, extraClass) {
	return E('button', {
		'type': 'button',
		'class': 'mk-sw-btn' + (extraClass ? ' ' + extraClass : ''),
		'data-action': action
	}, [
		icon(iconName),
		E('span', {}, label)
	]);
}

function helpItem(text) {
	return E('li', {}, text);
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(callStatus(), {}),
			L.resolveDefault(callDetect(), {})
		]);
	},

	showToast: function(kind, text) {
		if (!this.toastNode)
			return;

		this.toastNode.className = 'mk-sw-toast is-' + (kind || 'info') + ' is-visible';
		this.toastNode.textContent = text;

		window.clearTimeout(this.toastTimer);
		this.toastTimer = window.setTimeout(L.bind(function() {
			if (this.toastNode)
				this.toastNode.className = 'mk-sw-toast';
		}, this), 4200);
	},

	showModal: function(title, content, actions, accent) {
		if (!this.overlayNode)
			return;

		this.overlayNode.setAttribute('data-state', 'open');
		this.modalTitleNode.textContent = title;
		this.modalIconNode.className = 'mk-sw-modal-ico ' + (accent || '');
		this.modalContentNode.replaceChildren(content);
		this.modalActionsNode.replaceChildren.apply(this.modalActionsNode, actions || [
			E('button', { 'type': 'button', 'class': 'mk-sw-btn', 'data-action': 'close-modal' }, [ icon('close'), E('span', {}, _('إغلاق')) ])
		]);
	},

	closeModal: function() {
		if (this.overlayNode)
			this.overlayNode.setAttribute('data-state', 'closed');
	},

	currentMode: function() {
		return (this.statusData && this.statusData.mode) || (this.detectData && this.detectData.suggested_mode) || 'mixed';
	},

	selectedMode: function() {
		return this.targetMode || this.currentMode() || MODE_ADAPTER;
	},

	stateForRender: function() {
		var status = this.statusData || {};
		var detect = this.detectData || {};
		var ports = compactPorts({
			ports: detect.ports || status.ports,
			physical_ports: detect.physical_ports || status.physical_ports || status.original_ports,
			macvlan_ports: detect.macvlan_ports || status.macvlan_ports,
			skipped_ports: detect.skipped_ports || status.skipped_ports,
			original_ports: detect.original_ports || status.original_ports
		});

		return {
			mode: this.currentMode(),
			bridge: status.bridge || detect.bridge || 'br-lan',
			ports: ports,
			macvlan: !!status.kmod_macvlan_available,
			backup: status.backup_file || ''
		};
	},

	renderSwitchSvg: function(state) {
		var ports = state.ports.current;
		var rows = ports.length > 8 ? 2 : 1;
		var cols = Math.max(1, Math.ceil(ports.length / rows));
		var portW = rows > 1 ? 64 : 76;
		var portH = rows > 1 ? 25 : 32;
		var usableW = 600;
		var gap = cols > 1 ? Math.max(7, (usableW - (cols * portW)) / (cols - 1)) : 0;
		var startX = 42;
		var startY = rows > 1 ? 43 : 56;
		var svg = svgEl('svg', {
			'class': 'mk-sw-switch-svg ' + modeClass(state.mode),
			'viewBox': '0 0 860 112',
			'preserveAspectRatio': 'xMidYMid meet',
			'role': 'img',
			'aria-label': state.bridge + ' ' + modeLabel(state.mode)
		});
		var defs = svgEl('defs');
		var grad = svgEl('linearGradient', { 'id': 'mk-sw-chassis-grad', 'x1': '0', 'y1': '0', 'x2': '1', 'y2': '1' });

		grad.appendChild(svgEl('stop', { 'offset': '0%', 'stop-color': '#33425c' }));
		grad.appendChild(svgEl('stop', { 'offset': '100%', 'stop-color': '#172033' }));
		defs.appendChild(grad);
		svg.appendChild(defs);

		svg.appendChild(svgEl('rect', { 'class': 'mk-sw-svg-shadow', 'x': '28', 'y': '16', 'width': '804', 'height': '84', 'rx': '18' }));
		svg.appendChild(svgEl('rect', { 'class': 'mk-sw-svg-chassis', 'x': '24', 'y': '10', 'width': '812', 'height': '84', 'rx': '17' }));
		svg.appendChild(svgEl('rect', { 'class': 'mk-sw-svg-face-line', 'x': '42', 'y': '36', 'width': '776', 'height': '1', 'rx': '1' }));
		svg.appendChild(svgEl('text', { 'class': 'mk-sw-svg-title', 'x': '102', 'y': '30', 'text-anchor': 'end' }, state.bridge));
		svg.appendChild(svgEl('text', { 'class': 'mk-sw-svg-subtitle', 'x': '102', 'y': '49', 'text-anchor': 'end' }, modeLabel(state.mode)));
		svg.appendChild(svgEl('circle', { 'class': 'mk-sw-svg-system-led', 'cx': '62', 'cy': '27', 'r': '5.5' }));
		svg.appendChild(svgEl('circle', { 'class': 'mk-sw-svg-system-led is-second', 'cx': '82', 'cy': '27', 'r': '5.5' }));

		if (!ports.length) {
			svg.appendChild(svgEl('text', { 'class': 'mk-sw-svg-empty', 'x': '430', 'y': '68', 'text-anchor': 'middle' }, _('لم يتم اكتشاف منافذ داخل الجسر')));
			return svg;
		}

		for (var i = 0; i < ports.length; i++) {
			var row = Math.floor(i / cols);
			var col = i % cols;
			var x = startX + col * (portW + gap);
			var y = startY + row * 30;
			var name = ports[i];
			var type = portType(name, state.ports.physical, state.ports.macvlans);
			var g = svgEl('g', { 'class': 'mk-sw-svg-port is-' + type });
			var notchPath = 'M' + (x + (portW / 2) - 12) + ' ' + (y + portH - 12) + 'h24l3 5H' + (x + (portW / 2) - 15) + 'z';

			g.appendChild(svgEl('title', {}, name + ' - ' + portCaption(type)));
			g.appendChild(svgEl('rect', { 'class': 'mk-sw-svg-port-body', 'x': x, 'y': y, 'width': portW, 'height': portH, 'rx': '9' }));
			g.appendChild(svgEl('rect', { 'class': 'mk-sw-svg-port-hole', 'x': x + 10, 'y': y + 6, 'width': portW - 20, 'height': rows > 1 ? 10 : 13, 'rx': '3' }));
			g.appendChild(svgEl('path', { 'class': 'mk-sw-svg-port-pins', 'd': 'M' + (x + 20) + ' ' + (y + 10) + 'h5M' + (x + 32) + ' ' + (y + 10) + 'h5M' + (x + 44) + ' ' + (y + 10) + 'h5M' + (x + 56) + ' ' + (y + 10) + 'h5' }));
			g.appendChild(svgEl('path', { 'class': 'mk-sw-svg-port-notch', 'd': notchPath }));
			g.appendChild(svgEl('circle', { 'class': 'mk-sw-svg-led', 'cx': x + 12, 'cy': y + portH - 7, 'r': '3.8' }));
			g.appendChild(svgEl('circle', { 'class': 'mk-sw-svg-led is-alt', 'cx': x + portW - 12, 'cy': y + portH - 7, 'r': '3.1' }));
			g.appendChild(svgEl('text', { 'class': 'mk-sw-svg-port-label', 'x': x + (portW / 2), 'y': y + portH - 13, 'text-anchor': 'middle' }, name));
			svg.appendChild(g);
		}

		return svg;
	},

	renderTopology: function() {
		var state = this.stateForRender();
		var active = modeClass(state.mode);

		return E('section', { 'class': 'mk-sw-topology-card ' + active }, [
			E('div', { 'class': 'mk-sw-topology-head' }, [
				E('div', { 'class': 'mk-sw-device-mark' }, icon('switch')),
				E('div', { 'class': 'mk-sw-device-copy' }, [
					E('span', { 'class': 'mk-sw-kicker' }, _('الجسر الحالي')),
					E('h2', {}, state.bridge),
					E('p', {}, modeLabel(state.mode))
				]),
				E('span', { 'class': 'mk-sw-mode-pill ' + active }, modeLabel(state.mode))
			]),
			E('div', { 'class': 'mk-sw-switch-body' }, [
				E('div', { 'class': 'mk-sw-switch-face' }, [
					E('div', { 'class': 'mk-sw-switch-title' }, [
						icon('shield'),
						E('span', {}, _('جسر منافذ LAN بنظام DSA'))
					]),
					this.renderSwitchSvg(state)
				])
			]),
			E('div', { 'class': 'mk-sw-legend' }, [
				E('span', { 'class': 'is-physical' }, [ E('i'), _('منفذ أصلي') ]),
				E('span', { 'class': 'is-macvlan' }, [ E('i'), _('واجهة macvlan') ]),
				E('span', { 'class': 'is-other' }, [ E('i'), _('عضو آخر') ])
			])
		]);
	},

	renderModeCards: function() {
		var selected = this.selectedMode();
		var current = this.currentMode();

		return E('section', { 'class': 'mk-sw-mode-section' }, [
			E('div', { 'class': 'mk-sw-section-head' }, [
				E('span', { 'class': 'mk-sw-panel-ico' }, icon('adapter')),
				E('div', {}, [
					E('h3', {}, _('تغيير وضع السويتش')),
					E('p', {}, _('اختر طريقة ربط المنافذ داخل الجسر، ثم راجع المعاينة قبل التطبيق.'))
				])
			]),
			E('div', { 'class': 'mk-sw-mode-grid' }, [
				this.renderModeCard(MODE_SWITCH, _('وضع منافذ السويتش'), _('يستخدم الجسر منافذ DSA الأصلية مباشرة.'), [ 'lan1', 'lan2', 'lan3' ], selected, current, 'switch'),
				this.renderModeCard(MODE_ADAPTER, _('وضع محولات Ethernet'), _('يستخدم الجسر واجهات macvlan passthru فوق كل منفذ LAN.'), [ 'lan1 -> mv-lan1', 'lan2 -> mv-lan2' ], selected, current, 'adapter')
			])
		]);
	},

	renderModeCard: function(mode, title, desc, chips, selected, current, iconName) {
		return E('button', {
			'type': 'button',
			'class': 'mk-sw-mode-card ' + modeClass(mode) + (selected === mode ? ' is-selected' : '') + (current === mode ? ' is-current' : ''),
			'data-mode': mode
		}, [
			E('div', { 'class': 'mk-sw-mode-card-head' }, [
				E('span', { 'class': 'mk-sw-mode-ico' }, icon(iconName)),
				E('span', { 'class': 'mk-sw-mode-title' }, [
					E('strong', {}, title),
					current === mode ? E('em', {}, _('نشط الآن')) : ''
				]),
				E('span', { 'class': 'mk-sw-mode-check' }, icon('check'))
			]),
			E('p', {}, desc),
			E('div', { 'class': 'mk-sw-chip-row' }, chips.map(function(chip) {
				return E('span', {}, chip);
			}))
		]);
	},

	renderSummaryCards: function() {
		var state = this.stateForRender();

		return E('div', { 'class': 'mk-sw-stat-grid' }, [
			this.statCard(_('المنافذ الأصلية'), state.ports.physical.length, listText(state.ports.physical), 'port', 'is-physical'),
			this.statCard(_('واجهات macvlan'), state.ports.macvlans.length, listText(state.ports.macvlans), 'adapter', 'is-macvlan'),
			this.statCard(_('دعم macvlan'), state.macvlan ? _('متوفر') : _('غير مكتشف'), state.macvlan ? _('kmod-macvlan موجود') : _('ثبّت أو حمّل kmod-macvlan'), 'shield', state.macvlan ? 'is-ok' : 'is-warn')
		]);
	},

	statCard: function(label, value, detail, iconName, cls) {
		return E('section', { 'class': 'mk-sw-stat-card ' + cls }, [
			E('span', { 'class': 'mk-sw-stat-ico' }, icon(iconName)),
			E('div', {}, [
				E('small', {}, label),
				E('strong', {}, String(value)),
				E('p', {}, detail)
			])
		]);
	},

	refreshView: function() {
		if (this.topologyNode)
			this.topologyNode.replaceChildren(this.renderTopology());
		if (this.modeNode)
			this.modeNode.replaceChildren(this.renderModeCards());
		if (this.statsNode)
			this.statsNode.replaceChildren(this.renderSummaryCards());
		if (this.footerModeNode)
			this.footerModeNode.textContent = _('الوضع المحدد: %s').format(modeLabel(this.selectedMode()));
	},

	refreshData: function() {
		this.showToast('info', _('جاري تحديث حالة السويتش...'));

		return Promise.all([
			L.resolveDefault(callStatus(), {}),
			L.resolveDefault(callDetect(), {})
		]).then(L.bind(function(data) {
			this.statusData = data[0] || {};
			this.detectData = data[1] || {};
			this.targetMode = this.currentMode() === MODE_SWITCH ? MODE_SWITCH : MODE_ADAPTER;
			this.refreshView();
			this.showToast('success', _('تم تحديث الحالة.'));
		}, this)).catch(L.bind(function(err) {
			this.showToast('danger', errorText(err));
		}, this));
	},

	previewMode: function(mode) {
		this.showToast('info', _('جاري تجهيز المعاينة...'));

		return callPreview(mode).then(L.bind(function(preview) {
			if (!resultOk(preview)) {
				this.showToast('danger', errorText(preview));
				return;
			}

			this.showPreviewModal(mode, preview, false);
		}, this)).catch(L.bind(function(err) {
			this.showToast('danger', errorText(err));
		}, this));
	},

	showPreviewModal: function(mode, preview, allowApply) {
		var creates = asList(preview.create_macvlans);
		var deletes = asList(preview.delete_macvlans);
		var skipped = asList(preview.skipped_ports);

		this.showModal(
			allowApply ? _('مراجعة وتطبيق') : _('معاينة الوضع'),
			E('div', { 'class': 'mk-sw-preview' }, [
				E('div', { 'class': 'mk-sw-preview-target ' + modeClass(mode) }, [
					icon(mode === MODE_ADAPTER ? 'adapter' : 'switch'),
					E('div', {}, [
						E('small', {}, _('الوضع المطلوب')),
						E('strong', {}, modeLabel(mode))
					])
				]),
				E('div', { 'class': 'mk-sw-preview-grid' }, [
					this.previewItem(_('المنافذ الحالية'), listText(preview.current_ports)),
					this.previewItem(_('المنافذ بعد التطبيق'), listText(preview.target_ports)),
					this.previewItem(_('واجهات macvlan التي ستنشأ'), creates.length ? creates.join(', ') : _('لن يتم إنشاء واجهات جديدة')),
					this.previewItem(_('واجهات macvlan التي ستزال'), deletes.length ? deletes.join(', ') : _('لن يتم حذف واجهات')),
					skipped.length ? this.previewItem(_('منافذ تم تجاوزها'), skipped.join(', ')) : ''
				]),
				E('div', { 'class': 'mk-sw-warning-line' }, [
					icon('warn'),
					E('span', {}, _('سيتم أخذ نسخة احتياطية من /etc/config/network ثم تعديل منافذ الجسر وإعادة تحميل الشبكة.'))
				])
			]),
			[
				E('button', { 'type': 'button', 'class': 'mk-sw-btn', 'data-action': 'close-modal' }, [ icon('close'), E('span', {}, _('إغلاق')) ]),
				allowApply ? E('button', { 'type': 'button', 'class': 'mk-sw-btn mk-sw-btn-primary', 'data-action': 'confirm-apply', 'data-mode': mode }, [ icon('check'), E('span', {}, _('طبّق الآن')) ]) : ''
			],
			modeClass(mode)
		);
	},

	previewItem: function(label, value) {
		return E('div', { 'class': 'mk-sw-preview-item' }, [
			E('small', {}, label),
			E('strong', {}, value)
		]);
	},

	openApply: function(mode) {
		this.showToast('info', _('جاري فحص التغييرات المخطط لها...'));

		return callPreview(mode).then(L.bind(function(preview) {
			if (!resultOk(preview)) {
				this.showToast('danger', errorText(preview));
				return;
			}

			this.showPreviewModal(mode, preview, true);
		}, this)).catch(L.bind(function(err) {
			this.showToast('danger', errorText(err));
		}, this));
	},

	applyConfirmed: function(mode) {
		this.closeModal();
		this.showToast('info', _('جاري تطبيق وضع السويتش...'));

		return callApply(mode).then(L.bind(function(res) {
			if (!resultOk(res)) {
				this.showToast('danger', errorText(res));
				return;
			}

			this.showToast('success', _('تم تطبيق وضع السويتش بنجاح.'));
			return this.refreshData();
		}, this)).catch(L.bind(function(err) {
			this.showToast('danger', errorText(err));
		}, this));
	},

	backup: function() {
		this.showToast('info', _('جاري إنشاء نسخة احتياطية...'));

		return callBackup().then(L.bind(function(res) {
			if (!resultOk(res)) {
				this.showToast('danger', errorText(res));
				return;
			}

			this.showToast('success', _('تم إنشاء نسخة احتياطية لإعدادات الشبكة.'));
		}, this)).catch(L.bind(function(err) {
			this.showToast('danger', errorText(err));
		}, this));
	},

	openRestore: function() {
		this.showModal(
			_('استعادة آخر نسخة احتياطية'),
			E('div', { 'class': 'mk-sw-preview' }, [
				E('div', { 'class': 'mk-sw-warning-line is-danger' }, [
					icon('warn'),
					E('span', {}, _('الاستعادة ستستبدل /etc/config/network بآخر نسخة احتياطية من mk-swmode ثم تعيد تحميل الشبكة.'))
				]),
				E('p', {}, _('استخدم هذا الخيار فقط عند الحاجة للتراجع عن آخر تغيير في وضع السويتش.'))
			]),
			[
				E('button', { 'type': 'button', 'class': 'mk-sw-btn', 'data-action': 'close-modal' }, [ icon('close'), E('span', {}, _('إلغاء')) ]),
				E('button', { 'type': 'button', 'class': 'mk-sw-btn mk-sw-btn-danger', 'data-action': 'confirm-restore' }, [ icon('restore'), E('span', {}, _('استعادة النسخة')) ])
			],
			'is-danger'
		);
	},

	restoreConfirmed: function() {
		this.closeModal();
		this.showToast('info', _('جاري استعادة النسخة الاحتياطية...'));

		return callRestore().then(L.bind(function(res) {
			if (!resultOk(res)) {
				this.showToast('danger', errorText(res));
				return;
			}

			this.showToast('success', _('تمت استعادة النسخة الاحتياطية.'));
			return this.refreshData();
		}, this)).catch(L.bind(function(err) {
			this.showToast('danger', errorText(err));
		}, this));
	},

	runDiagnostics: function(command) {
		this.showToast('info', _('جاري تشغيل التشخيص...'));

		return callDiagnostics(command).then(L.bind(function(res) {
			if (!resultOk(res)) {
				this.showToast('danger', errorText(res));
				return;
			}

			this.showModal(
				res.command || _('التشخيص'),
				E('pre', { 'class': 'mk-sw-diag-output' }, res.output || _('لا توجد مخرجات')),
				[ E('button', { 'type': 'button', 'class': 'mk-sw-btn', 'data-action': 'close-modal' }, [ icon('close'), E('span', {}, _('إغلاق')) ]) ],
				'is-tool'
			);
			this.showToast('success', _('نتائج التشخيص جاهزة.'));
		}, this)).catch(L.bind(function(err) {
			this.showToast('danger', errorText(err));
		}, this));
	},

	renderHelpContent: function() {
		return E('div', { 'class': 'mk-sw-help' }, [
			E('section', { 'class': 'mk-sw-help-hero' }, [
				E('span', { 'class': 'mk-sw-help-hero-ico' }, icon('help')),
				E('div', {}, [
					E('h3', {}, _('دليل MK Switch Mode')),
					E('p', {}, _('هذه الصفحة تغيّر فقط طريقة ربط منافذ LAN داخل br-lan بين المنافذ الأصلية وواجهات macvlan passthru. لا يتم تعديل wireless أو firewall أو dhcp أو VLAN filtering.'))
				])
			]),
			E('section', { 'class': 'mk-sw-help-section' }, [
				E('h4', {}, _('الأوضاع')),
				E('div', { 'class': 'mk-sw-help-grid' }, [
					this.helpCard('switch', _('وضع منافذ السويتش'), _('الوضع الطبيعي'), _('يتم ربط br-lan مباشرة بمنافذ DSA الأصلية مثل lan1 و lan2. استخدمه عندما لا تحتاج إلى workaround خاص بمشكلة FDB.')),
					this.helpCard('adapter', _('وضع محولات Ethernet'), _('macvlan passthru'), _('ينشئ واجهة mv- فوق كل منفذ LAN ويضع واجهات mv-* داخل br-lan بدل المنافذ الأصلية.'))
				])
			]),
			E('section', { 'class': 'mk-sw-help-section' }, [
				E('h4', {}, _('قبل التطبيق')),
				E('div', { 'class': 'mk-sw-help-checks' }, [
					E('div', {}, [ icon('check'), E('span', {}, _('استخدم المعاينة لمعرفة المنافذ التي ستتغير قبل الضغط على تطبيق.')) ]),
					E('div', {}, [ icon('backup'), E('span', {}, _('يتم إنشاء نسخة احتياطية من /etc/config/network قبل أي تعديل.')) ]),
					E('div', {}, [ icon('warn'), E('span', {}, _('تطبيق الوضع يعيد تحميل الشبكة وقد يقطع الاتصال مؤقتًا.')) ]),
					E('div', {}, [ icon('restore'), E('span', {}, _('زر الاستعادة يعيد آخر نسخة احتياطية أنشأها mk-swmode.')) ])
				])
			]),
			E('section', { 'class': 'mk-sw-help-section' }, [
				E('h4', {}, _('التشخيص')),
				E('ul', {}, [
					helpItem(_('bridge fdb show يعرض جدول MAC داخل الجسر.')),
					helpItem(_('bridge vlan show يعرض VLAN filtering دون تغييره.')),
					helpItem(_('ip -d link show يعرض تفاصيل br-lan والمنافذ المرتبطة.'))
				])
			])
		]);
	},

	helpCard: function(iconName, title, subtitle, description) {
		return E('section', { 'class': 'mk-sw-help-card ' + modeClass(iconName === 'adapter' ? MODE_ADAPTER : MODE_SWITCH) }, [
			E('div', { 'class': 'mk-sw-help-card-head' }, [
				E('span', { 'class': 'mk-sw-help-ico' }, icon(iconName)),
				E('div', {}, [
					E('strong', {}, title),
					E('small', {}, subtitle)
				])
			]),
			E('p', {}, description)
		]);
	},

	showHelp: function() {
		this.showModal(
			_('المساعدة'),
			this.renderHelpContent(),
			[ E('button', { 'type': 'button', 'class': 'mk-sw-btn mk-sw-btn-primary', 'data-action': 'close-modal' }, [ icon('close'), E('span', {}, _('إغلاق')) ]) ],
			'is-help'
		);
	},

	toggleTheme: function(target) {
		this.theme = this.theme === 'dark' ? 'light' : 'dark';
		try {
			window.localStorage.setItem('mk-swmode-theme', this.theme);
		} catch (e) {}

		if (this.rootNode)
			this.rootNode.classList.toggle('is-dark', this.theme === 'dark');

		if (target)
			target.replaceChildren(
				icon(this.theme === 'dark' ? 'sun' : 'moon'),
				E('span', {}, this.theme === 'dark' ? _('فاتح') : _('داكن'))
			);

		this.showToast('info', this.theme === 'dark' ? _('تم تفعيل المظهر الغامق.') : _('تم تفعيل المظهر الفاتح.'));
	},

	renderShell: function() {
		this.topologyNode = E('div', { 'class': 'mk-sw-live-panel' }, [ this.renderTopology() ]);
		this.modeNode = E('div', {}, [ this.renderModeCards() ]);
		this.statsNode = E('div', {}, [ this.renderSummaryCards() ]);
		this.toastNode = E('div', { 'class': 'mk-sw-toast', 'role': 'status' });
		this.modalIconNode = E('span', { 'class': 'mk-sw-modal-ico' }, icon('crown'));
		this.modalTitleNode = E('strong', { 'class': 'mk-sw-modal-title' }, '');
		this.modalContentNode = E('div', { 'class': 'mk-sw-modal-content' });
		this.modalActionsNode = E('div', { 'class': 'mk-sw-modal-actions' });
		this.footerModeNode = E('span', {}, _('الوضع المحدد: %s').format(modeLabel(this.selectedMode())));
		this.overlayNode = E('div', { 'class': 'mk-sw-overlay', 'data-state': 'closed' }, [
			E('div', { 'class': 'mk-sw-modal' }, [
				E('div', { 'class': 'mk-sw-modal-head' }, [
					this.modalIconNode,
					this.modalTitleNode,
					E('button', { 'type': 'button', 'class': 'mk-sw-modal-close', 'data-action': 'close-modal' }, icon('close'))
				]),
				this.modalContentNode,
				this.modalActionsNode
			])
		]);

		return E('div', { 'class': 'mk-sw-app' + (this.theme === 'dark' ? ' is-dark' : '') }, [
			E('header', { 'class': 'mk-sw-header' }, [
				E('div', { 'class': 'mk-sw-brand' }, [
					E('div', { 'class': 'mk-sw-logo' }, icon('crown')),
					E('div', {}, [
						E('div', { 'class': 'mk-sw-title' }, [
							E('span', {}, 'MK'),
							E('b', {}, ' وضع السويتش')
						]),
						E('span', { 'class': 'mk-sw-subtitle' }, _('التحكم بطريقة ربط منافذ DSA داخل الجسر'))
					])
				]),
				E('div', { 'class': 'mk-sw-header-actions' }, [
					actionButton('refresh', _('تحديث'), 'refresh', 'mk-sw-btn-icon'),
					actionButton('help', _('مساعدة'), 'help', 'mk-sw-btn-icon'),
					actionButton(this.theme === 'dark' ? 'sun' : 'moon', this.theme === 'dark' ? _('فاتح') : _('داكن'), 'theme', 'mk-sw-btn-icon')
				])
			]),
			E('main', { 'class': 'mk-sw-body' }, [
				this.topologyNode,
				this.statsNode,
				this.modeNode,
				E('section', { 'class': 'mk-sw-ops-panel' }, [
					E('div', { 'class': 'mk-sw-section-head' }, [
						E('span', { 'class': 'mk-sw-panel-ico' }, icon('save')),
						E('div', {}, [
							E('h3', {}, _('الحفظ والعمليات')),
							E('p', {}, _('راجع المعاينة أولًا، ثم طبّق الوضع المحدد. أدوات النسخ والاستعادة موجودة هنا.'))
						])
					]),
					E('div', { 'class': 'mk-sw-op-grid' }, [
						actionButton('terminal', _('معاينة الوضع المحدد'), 'preview-selected'),
						actionButton('check', _('تطبيق الوضع المحدد'), 'apply-selected', 'mk-sw-btn-primary'),
						actionButton('backup', _('نسخ إعدادات الشبكة'), 'backup'),
						actionButton('restore', _('استعادة آخر نسخة'), 'restore', 'mk-sw-btn-danger')
					])
				]),
				E('section', { 'class': 'mk-sw-ops-panel mk-sw-advanced' }, [
					E('details', {}, [
						E('summary', {}, [
							icon('tool'),
							E('span', {}, _('التشخيص المتقدم'))
						]),
						E('div', { 'class': 'mk-sw-op-grid' }, [
							actionButton('terminal', _('bridge fdb show'), 'diag-fdb'),
							actionButton('terminal', _('bridge vlan show'), 'diag-vlan'),
							actionButton('terminal', _('bridge link'), 'diag-link'),
							actionButton('terminal', _('ip -d link show'), 'diag-ip')
						])
					])
				])
			]),
			E('footer', { 'class': 'mk-sw-footer' }, [
				E('div', { 'class': 'mk-sw-footer-info' }, [
					E('span', { 'class': 'dot' }),
					this.footerModeNode
				]),
				E('div', { 'class': 'mk-sw-footer-actions' }, [
					actionButton('terminal', _('معاينة'), 'preview-selected', 'mk-sw-btn-ghost'),
					actionButton('check', _('تطبيق'), 'apply-selected', 'mk-sw-btn-primary')
				])
			]),
			this.toastNode,
			this.overlayNode
		]);
	},

	handleAction: function(action, target) {
		var mode = target ? target.getAttribute('data-mode') : null;

		if (action === 'refresh')
			return this.refreshData();
		if (action === 'help')
			return this.showHelp();
		if (action === 'theme')
			return this.toggleTheme(target);
		if (action === 'preview-selected')
			return this.previewMode(this.selectedMode());
		if (action === 'apply-selected')
			return this.openApply(this.selectedMode());
		if (action === 'confirm-apply')
			return this.applyConfirmed(mode || this.selectedMode());
		if (action === 'backup')
			return this.backup();
		if (action === 'restore')
			return this.openRestore();
		if (action === 'confirm-restore')
			return this.restoreConfirmed();
		if (action === 'diag-fdb')
			return this.runDiagnostics('bridge_fdb');
		if (action === 'diag-vlan')
			return this.runDiagnostics('bridge_vlan');
		if (action === 'diag-link')
			return this.runDiagnostics('bridge_link');
		if (action === 'diag-ip')
			return this.runDiagnostics('ip_links');
		if (action === 'close-modal')
			return this.closeModal();
	},

	render: function(data) {
		ensureStyles();

		this.statusData = data[0] || {};
		this.detectData = data[1] || {};
		this.targetMode = this.currentMode() === MODE_SWITCH ? MODE_SWITCH : MODE_ADAPTER;
		try {
			this.theme = window.localStorage.getItem('mk-swmode-theme') || 'dark';
		} catch (e) {
			this.theme = 'dark';
		}

		var root = this.renderShell();
		this.rootNode = root;

		root.addEventListener('click', L.bind(function(ev) {
			var modeCard = ev.target.closest('.mk-sw-mode-card[data-mode]');
			var action = ev.target.closest('[data-action]');

			if (modeCard) {
				this.targetMode = modeCard.getAttribute('data-mode');
				this.refreshView();
				this.showToast('info', _('تم اختيار: %s').format(modeLabel(this.targetMode)));
				return;
			}

			if (action) {
				ev.preventDefault();
				this.handleAction(action.getAttribute('data-action'), action);
			}
		}, this));

		return root;
	}
});
