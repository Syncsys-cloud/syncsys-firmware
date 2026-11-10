function xhrPostJson(url, data) {
	data = data || {};
	if (L && L.env && L.env.token && !data.token)
		data.token = L.env.token;

	return new Promise((resolve, reject) => {
		XHR.post(url, data, function(x) {
			const t = (x && x.responseText) ? x.responseText : '';
			if (t.trim().charAt(0) !== '{') return reject({ error: 'Non-JSON response', raw: t });
			try { resolve(JSON.parse(t)); } catch (e) { reject({ error: 'Bad JSON', raw: t }); }
		});
	});
}

function xhrGetJson(url, query) {
	return new Promise((resolve, reject) => {
		XHR.get(url, query || null, function(x) {
			const t = (x && x.responseText) ? x.responseText : '';
			if (t.trim().charAt(0) !== '{') return reject({ error: 'Non-JSON response', raw: t });
			try { resolve(JSON.parse(t)); } catch (e) { reject({ error: 'Bad JSON', raw: t }); }
		});
	});
}

function fmtNum(v, digits) {
	if (v === null || v === undefined || v === '' || isNaN(v)) return '-';
	const n = Number(v);
	if (!isFinite(n)) return '-';
	return (digits != null) ? n.toFixed(digits) : String(n);
}

function el(tag, attrs, children) {
	return E(tag, attrs || {}, children || []);
}

/* -------------------------- Minimal chart engine -------------------------- */

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function setupHiDPICanvas(canvas) {
	const dpr = window.devicePixelRatio || 1;
	const rect = canvas.getBoundingClientRect();
	const w = Math.max(1, Math.floor(rect.width));
	const h = Math.max(1, Math.floor(rect.height));
	const bw = Math.floor(w * dpr);
	const bh = Math.floor(h * dpr);

	if (canvas.width !== bw || canvas.height !== bh) {
		canvas.width = bw;
		canvas.height = bh;
	}
	const ctx = canvas.getContext('2d');
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	return { ctx, w, h };
}

function drawGrid(ctx, w, h, padding, gridY) {
	ctx.save();
	ctx.lineWidth = 1;
	for (let i = 0; i <= gridY; i++) {
		const y = padding.t + (h - padding.t - padding.b) * (i / gridY);
		ctx.beginPath();
		ctx.moveTo(padding.l, y);
		ctx.lineTo(w - padding.r, y);
		ctx.stroke();
	}
	ctx.restore();
}

function drawLineSeries(ctx, w, h, padding, data, yMin, yMax) {
	if (!data || !data.length) return;

	const x0 = padding.l, x1 = w - padding.r;
	const y0 = padding.t, y1 = h - padding.b;
	const n = data.length;

	ctx.beginPath();
	for (let i = 0; i < n; i++) {
		const x = x0 + (x1 - x0) * (i / Math.max(1, n - 1));
		const v = data[i];
		const t = (v - yMin) / Math.max(1e-9, (yMax - yMin));
		const y = y1 - (y1 - y0) * clamp(t, 0, 1);
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.stroke();
}

function drawAreaUnder(ctx, w, h, padding, data, yMin, yMax) {
	if (!data || !data.length) return;

	const x0 = padding.l, x1 = w - padding.r;
	const y0 = padding.t, y1 = h - padding.b;
	const n = data.length;

	ctx.beginPath();
	for (let i = 0; i < n; i++) {
		const x = x0 + (x1 - x0) * (i / Math.max(1, n - 1));
		const v = data[i];
		const t = (v - yMin) / Math.max(1e-9, (yMax - yMin));
		const y = y1 - (y1 - y0) * clamp(t, 0, 1);
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.lineTo(x1, y1);
	ctx.lineTo(x0, y1);
	ctx.closePath();
	ctx.fill();
}

function drawBarSeries(ctx, w, h, padding, values, yMin, yMax) {
	if (!values || !values.length) return;

	const x0 = padding.l, x1 = w - padding.r;
	const y0 = padding.t, y1 = h - padding.b;
	const n = values.length;
	const bw = (x1 - x0) / Math.max(1, n);
	const barW = Math.max(1, Math.floor(bw * 0.72));

	for (let i = 0; i < n; i++) {
		const v = values[i];
		const t = (v - yMin) / Math.max(1e-9, (yMax - yMin));
		const barH = (y1 - y0) * clamp(t, 0, 1);
		const x = x0 + i * bw + (bw - barW) / 2;
		const y = y1 - barH;
		ctx.fillRect(x, y, barW, barH);
	}
}

/* -------------------------- Theme palettes -------------------------- */

function safeParseInt(v, defv) {
	const n = parseInt(v, 10);
	return isFinite(n) ? n : defv;
}

return ({
	_ping: { sid: null, since: 0, running: false, poll_ms: 300, timer: null },
	_trace: { sid: null, since: 0, running: false, poll_ms: 400, timer: null },

	_dom: {},
	_theme: {
		mode: 'dark',       // 'dark'|'light'
		accent: 0           // index into palettes
	},

	_palettes: [

		
		{ name: 'Cyan',   accent: [24,189,246], accent2: [124,124,255], danger: [255,77,109] },
		{ name: 'Gry',   accent: [229,231,235], accent2: [156,163,175], danger: [255,77,109] },
		{ name: 'Indigo', accent: [124,124,255], accent2: [24,189,246], danger: [255,77,109] },
		{ name: 'Emerald',accent: [16,185,129], accent2: [56,189,248],  danger: [244,63,94] },
		{ name: 'Amber',  accent: [245,158,11], accent2: [59,130,246],  danger: [239,68,68] },
		{ name: 'Violet', accent: [139,92,246], accent2: [34,211,238],  danger: [244,63,94] },
		{ name: 'Red',  accent: [251,113,133], accent2: [253,164,175],  danger: [239,68,68] }
	],

	_pingStats: { min: null, avg: null, max: null, sent: 0, recv: 0, loss_pct: null },

	_chart: {
		ping_rtt_ms: [],
		ping_max_points: 120,
		trace_hops: {},
		trace_last_hops: [],
		trace_max_hops: 40,
		raf: null,
		dirty_ping: false,
		dirty_trace: false
	},

	_url(name) {
		return L.url('admin', 'syncsys', 'mkntt', name);
	},

	_loadTheme() {
		try {
			const m = window.localStorage.getItem('mkntt.theme.mode');
			const a = window.localStorage.getItem('mkntt.theme.accent');
			if (m === 'light' || m === 'dark') this._theme.mode = m;
			if (a != null) this._theme.accent = clamp(safeParseInt(a, 0), 0, this._palettes.length - 1);
		} catch (e) {}
	},

	_saveTheme() {
		try {
			window.localStorage.setItem('mkntt.theme.mode', this._theme.mode);
			window.localStorage.setItem('mkntt.theme.accent', String(this._theme.accent));
		} catch (e) {}
	},

	_rgb(arr) { return arr[0] + ',' + arr[1] + ',' + arr[2]; },

	_applyThemeVars(rootEl) {
		if (!rootEl) return;

		const p = this._palettes[this._theme.accent] || this._palettes[0];
		const accentRGB = this._rgb(p.accent);
		const accent2RGB = this._rgb(p.accent2);
		const dangerRGB = this._rgb(p.danger);

		rootEl.setAttribute('data-mknt-mode', this._theme.mode);
		rootEl.style.setProperty('--mknt-accent-rgb', accentRGB);
		rootEl.style.setProperty('--mknt-accent2-rgb', accent2RGB);
		rootEl.style.setProperty('--mknt-danger-rgb', dangerRGB);

		// trigger charts repaint to match accent/mode
		this._chart.dirty_ping = true;
		this._chart.dirty_trace = true;
		this._requestChartsRender();

		// update header labels if any
		if (this._dom.theme_badge) {
			const modeLabel = (this._theme.mode === 'light') ? 'Light' : 'Dark';
			this._dom.theme_badge.textContent = modeLabel + ' • ' + p.name;
		}
	},

	_toggleMode(rootEl) {
		this._theme.mode = (this._theme.mode === 'dark') ? 'light' : 'dark';
		this._saveTheme();
		this._applyThemeVars(rootEl);
	},

	_cycleAccent(rootEl) {
		this._theme.accent = (this._theme.accent + 1) % this._palettes.length;
		this._saveTheme();
		this._applyThemeVars(rootEl);
	},

	_setMsg(kind, msg) {
		const n = this._dom[kind + '_msg'];
		if (n) n.textContent = msg || '';
	},

	_setStatus(kind, txt, busy) {
		const t = this._dom[kind + '_status_text'];
		const s = this._dom[kind + '_spinner'];
		if (t) t.textContent = txt || '';
		if (s) s.style.display = busy ? '' : 'none';
	},

	_requestChartsRender() {
		if (this._chart.raf) return;
		this._chart.raf = window.requestAnimationFrame(() => {
			this._chart.raf = null;
			this._renderCharts();
		});
	},

	_onResizeBound: null,

	_attachResize() {
		if (this._onResizeBound) return;
		this._onResizeBound = () => {
			this._chart.dirty_ping = true;
			this._chart.dirty_trace = true;
			this._requestChartsRender();
		};
		window.addEventListener('resize', this._onResizeBound);
	},

	_detachResize() {
		if (!this._onResizeBound) return;
		window.removeEventListener('resize', this._onResizeBound);
		this._onResizeBound = null;
	},

	_resetPingUI() {
		this._pingStats = { min: null, avg: null, max: null, sent: 0, recv: 0, loss_pct: null };
		this._renderPingStats();
		const body = this._dom.ping_tbody;
		if (body) body.textContent = '';
		this._setMsg('ping', '');

		this._chart.ping_rtt_ms = [];
		this._chart.dirty_ping = true;
		this._requestChartsRender();
	},

	_resetTraceUI() {
		const body = this._dom.trace_tbody;
		if (body) body.textContent = '';
		this._setMsg('trace', '');

		this._chart.trace_hops = {};
		this._chart.trace_last_hops = [];
		this._chart.dirty_trace = true;
		this._requestChartsRender();
	},

	_renderPingStats() {
		const s = this._pingStats;
		if (this._dom.ping_stat_min) this._dom.ping_stat_min.textContent = fmtNum(s.min, 2);
		if (this._dom.ping_stat_avg) this._dom.ping_stat_avg.textContent = fmtNum(s.avg, 2);
		if (this._dom.ping_stat_max) this._dom.ping_stat_max.textContent = fmtNum(s.max, 2);
		if (this._dom.ping_stat_loss) this._dom.ping_stat_loss.textContent = (s.loss_pct == null ? '-' : fmtNum(s.loss_pct, 1) + '%');
		if (this._dom.ping_stat_sent) this._dom.ping_stat_sent.textContent = String(s.sent || 0);
		if (this._dom.ping_stat_recv) this._dom.ping_stat_recv.textContent = String(s.recv || 0);

		const lm = this._dom.ping_loss_meter;
		if (lm && s.loss_pct != null) {
			const v = clamp(Number(s.loss_pct) || 0, 0, 100);
			lm.style.width = v + '%';
		} else if (lm) {
			lm.style.width = '0%';
		}
	},

	_applyPingStats(ev) {
		if (!ev || !ev.stats) return;
		const st = ev.stats;
		this._pingStats.min = st.min;
		this._pingStats.avg = st.avg;
		this._pingStats.max = st.max;
		this._pingStats.sent = st.sent || 0;
		this._pingStats.recv = st.recv || 0;
		this._pingStats.loss_pct = st.loss_pct;
		this._renderPingStats();
	},

	_addPingRow(ev) {
		const body = this._dom.ping_tbody;
		if (!body) return;

		const tr = el('tr', {}, [
			el('td', {}, [ String(ev.ts || '') ]),
			el('td', {}, [ String(ev.type || '') ]),
			el('td', {}, [ (ev.seq != null ? String(ev.seq) : '-') ]),
			el('td', {}, [ (ev.addr != null ? String(ev.addr) : '-') ]),
			el('td', {}, [ (ev.ttl != null ? String(ev.ttl) : '-') ]),
			el('td', {}, [ (ev.time_ms != null ? fmtNum(ev.time_ms, 2) : '-') ]),
			el('td', { 'class': 'mknt-mono' }, [ (ev.msg != null ? String(ev.msg) : '') ])
		]);
		body.appendChild(tr);

		while (body.childNodes.length > 300)
			body.removeChild(body.firstChild);

		if (ev && ev.time_ms != null && isFinite(Number(ev.time_ms))) {
			const arr = this._chart.ping_rtt_ms;
			arr.push(Number(ev.time_ms));
			if (arr.length > this._chart.ping_max_points)
				arr.splice(0, arr.length - this._chart.ping_max_points);

			this._chart.dirty_ping = true;
			this._requestChartsRender();
		}
	},

	_addTraceRow(ev) {
		const body = this._dom.trace_tbody;
		if (!body) return;

		if (ev.type === 'hop') {
			const rtt = ev.rtt_ms || [];
			const tr = el('tr', {}, [
				el('td', {}, [ String(ev.ts || '') ]),
				el('td', {}, [ String(ev.hop != null ? ev.hop : '') ]),
				el('td', {}, [ (ev.addr != null ? String(ev.addr) : '*') ]),
				el('td', {}, [ (rtt[0] != null ? fmtNum(rtt[0], 2) : '*') ]),
				el('td', {}, [ (rtt[1] != null ? fmtNum(rtt[1], 2) : '*') ]),
				el('td', {}, [ (rtt[2] != null ? fmtNum(rtt[2], 2) : '*') ]),
				el('td', { 'class': 'mknt-mono' }, [ '' ])
			]);
			body.appendChild(tr);

			const hop = Number(ev.hop);
			if (isFinite(hop) && hop > 0 && hop <= this._chart.trace_max_hops) {
				let sum = 0, cnt = 0;
				for (let i = 0; i < rtt.length; i++) {
					const v = Number(rtt[i]);
					if (isFinite(v)) { sum += v; cnt++; }
				}
				if (cnt > 0) {
					const avg = sum / cnt;
					this._chart.trace_hops[hop] = { avg: avg };

					const list = this._chart.trace_last_hops;
					if (list.indexOf(hop) === -1) {
						list.push(hop);
						list.sort((a, b) => a - b);
					}
					this._chart.dirty_trace = true;
					this._requestChartsRender();
				}
			}
		}
		else {
			const tr = el('tr', {}, [
				el('td', {}, [ String(ev.ts || '') ]),
				el('td', {}, [ '-' ]),
				el('td', {}, [ '-' ]),
				el('td', {}, [ '-' ]),
				el('td', {}, [ '-' ]),
				el('td', {}, [ '-' ]),
				el('td', { 'class': 'mknt-mono' }, [ (ev.msg != null ? String(ev.msg) : '') ])
			]);
			body.appendChild(tr);
		}

		while (body.childNodes.length > 300)
			body.removeChild(body.firstChild);
	},

	_renderCharts() {
		const p = this._palettes[this._theme.accent] || this._palettes[0];

		// chart colors derived from palette + mode
		const accent = p.accent;
		const accent2 = p.accent2;

		const gridStroke = (this._theme.mode === 'light')
			? 'rgba(17,24,39,0.10)'
			: 'rgba(255,255,255,0.10)';

		const panelFill = (this._theme.mode === 'light')
			? 'rgba(0,0,0,0.03)'
			: 'rgba(255,255,255,0.06)';

		const labelFill = (this._theme.mode === 'light')
			? 'rgba(17,24,39,0.60)'
			: 'rgba(255,255,255,0.60)';

		/* Ping chart */
		if (this._chart.dirty_ping && this._dom.ping_chart) {
			this._chart.dirty_ping = false;
			const canvas = this._dom.ping_chart;
			const { ctx, w, h } = setupHiDPICanvas(canvas);

			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = panelFill;
			ctx.fillRect(0, 0, w, h);

			const padding = { l: 10, r: 10, t: 10, b: 18 };

			ctx.strokeStyle = gridStroke;
			drawGrid(ctx, w, h, padding, 3);

			const data = this._chart.ping_rtt_ms;
			let yMin = 0, yMax = 100;
			if (data.length) {
				let mn = data[0], mx = data[0];
				for (let i = 1; i < data.length; i++) {
					const v = data[i];
					if (v < mn) mn = v;
					if (v > mx) mx = v;
				}
				yMin = Math.max(0, Math.floor(mn * 0.8));
				yMax = Math.max(yMin + 10, Math.ceil(mx * 1.2));
			}

			ctx.fillStyle = 'rgba(' + accent[0] + ',' + accent[1] + ',' + accent[2] + ',0.14)';
			drawAreaUnder(ctx, w, h, padding, data, yMin, yMax);

			ctx.strokeStyle = 'rgba(' + accent[0] + ',' + accent[1] + ',' + accent[2] + ',0.95)';
			ctx.lineWidth = 2;
			drawLineSeries(ctx, w, h, padding, data, yMin, yMax);

			ctx.fillStyle = labelFill;
			ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
			ctx.textAlign = 'left';
			ctx.fillText('RTT (ms)', 10, h - 6);
			ctx.textAlign = 'right';
			ctx.fillText(String(yMax), w - 10, 12);
			ctx.textAlign = 'left';
		}

		/* Trace chart */
		if (this._chart.dirty_trace && this._dom.trace_chart) {
			this._chart.dirty_trace = false;
			const canvas = this._dom.trace_chart;
			const { ctx, w, h } = setupHiDPICanvas(canvas);

			ctx.clearRect(0, 0, w, h);
			ctx.fillStyle = panelFill;
			ctx.fillRect(0, 0, w, h);

			const padding = { l: 10, r: 10, t: 10, b: 18 };

			ctx.strokeStyle = gridStroke;
			drawGrid(ctx, w, h, padding, 3);

			const hops = this._chart.trace_last_hops.slice(0, this._chart.trace_max_hops);
			const values = [];
			for (let i = 0; i < hops.length; i++) {
				const hop = hops[i];
				const o = this._chart.trace_hops[hop];
				values.push(o ? o.avg : 0);
			}

			let yMin = 0, yMax = 150;
			if (values.length) {
				let mx = values[0];
				for (let i = 1; i < values.length; i++)
					if (values[i] > mx) mx = values[i];
				yMax = Math.max(50, Math.ceil(mx * 1.25));
			}

			ctx.fillStyle = 'rgba(' + accent2[0] + ',' + accent2[1] + ',' + accent2[2] + ',0.28)';
			drawBarSeries(ctx, w, h, padding, values, yMin, yMax);

			ctx.fillStyle = labelFill;
			ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
			ctx.textAlign = 'left';
			ctx.fillText('Hop RTT avg (ms)', 10, h - 6);
			ctx.textAlign = 'right';
			ctx.fillText(String(yMax), w - 10, 12);
			ctx.textAlign = 'left';
		}
	},

	_stopTimers() {
		if (this._ping.timer) { window.clearInterval(this._ping.timer); this._ping.timer = null; }
		if (this._trace.timer) { window.clearInterval(this._trace.timer); this._trace.timer = null; }
	},

	async _pingStart(familyKey) {
		try {
			this._resetPingUI();
			this._setStatus('ping', 'جاري البدء…', true);

			const data = {
				host: this._dom.ping_host.value.trim(),
				family: (familyKey === 'v6') ? '6' : (familyKey === 'v4') ? '4' : 'auto',
			};

			const map = [
				['count','ping_count'],
				['size','ping_size'],
				['interval','ping_interval'],
				['ttl','ping_ttl'],
				['source','ping_source'],
				['wait','ping_wait'],
				['deadline','ping_deadline'],
				['pattern','ping_pattern'],
			];
			map.forEach(([k,id]) => {
				const v = this._dom[id].value.trim();
				if (v) data[k] = v;
			});
			data.adaptive = this._dom.ping_adaptive.checked ? '1' : '0';

			const res = await xhrPostJson(this._url('pingstart'), data);
			if (!res || res.ok !== true) {
				this._setStatus('ping', 'إستعداد', false);
				this._setMsg('ping', 'فشل البدء: ' + (res && (res.error || res.raw) ? (res.error || res.raw) : 'unknown'));
				return;
			}

			this._ping.sid = res.sid;
			this._ping.since = 0;
			this._ping.running = true;
			this._ping.poll_ms = res.poll_ms || 300;
			this._setStatus('ping', 'جاري البدء (sid ' + res.sid + ')', true);
			this._setMsg('ping', res.cmd ? ('CMD: ' + res.cmd) : '');

			if (this._ping.timer) window.clearInterval(this._ping.timer);
			this._ping.timer = window.setInterval(() => { this._pingPoll(); }, this._ping.poll_ms);
			this._pingPoll();
		} catch (e) {
			this._setStatus('ping', 'إستعداد', false);
			this._setMsg('ping', 'خطاء البدء: ' + (e && (e.error || e.raw) ? (e.error + (e.raw ? ('\n' + e.raw) : '')) : String(e)));
		}
	},

	async _pingPoll() {
		if (!this._ping.running || !this._ping.sid) return;
		try {
			const res = await xhrGetJson(this._url('pingpoll'), {
				sid: this._ping.sid,
				since: String(this._ping.since),
				limit: '200'
			});
			if (!res || res.ok !== true) {
				this._setMsg('ping', 'فشل التحديث: ' + (res && (res.error || res.raw) ? (res.error || res.raw) : 'unknown'));
				return;
			}
			const evs = res.events || [];
			evs.forEach(ev => {
				this._applyPingStats(ev);
				this._addPingRow(ev);
			});
			this._ping.since = res.next_since || this._ping.since;

			if (res.state && res.state !== 'running') {
				this._ping.running = false;
				this._setStatus('ping', 'إنتهى', false);
				if (this._ping.timer) { window.clearInterval(this._ping.timer); this._ping.timer = null; }
			}
		} catch (e) {
			this._setMsg('ping', 'خطاء في التحديث: ' + (e && (e.error || e.raw) ? (e.error + (e.raw ? ('\n' + e.raw) : '')) : String(e)));
		}
	},

	async _pingStop() {
		if (!this._ping.sid) return;
		try { await xhrPostJson(this._url('pingstop'), { sid: this._ping.sid }); } catch (e) {}
		this._ping.running = false;
		this._setStatus('ping', 'تم الإيقاف', false);
		if (this._ping.timer) { window.clearInterval(this._ping.timer); this._ping.timer = null; }
	},

	async _traceStart(familyKey) {
		try {
			this._resetTraceUI();
			this._setStatus('trace', 'جاري البدء…', true);

			const data = {
				host: this._dom.trace_host.value.trim(),
				family: (familyKey === 'v6') ? '6' : (familyKey === 'v4') ? '4' : 'auto',
			};

			['dont_fragment','show_ttl','numeric','bypass','verbose'].forEach(k => {
				const id = 'trace_' + k;
				data[k] = (this._dom[id] && this._dom[id].checked) ? '1' : '0';
			});

			const map = [
				['first_ttl','trace_first_ttl'],
				['max_ttl','trace_max_ttl'],
				['probes','trace_probes'],
				['port','trace_port'],
				['tos','trace_tos'],
				['wait','trace_wait'],
				['source','trace_source'],
				['iface','trace_iface'],
				['pause','trace_pause'],
				['bytes','trace_bytes'],
			];
			map.forEach(([k,id]) => {
				const v = this._dom[id].value.trim();
				if (v) data[k] = v;
			});

			const res = await xhrPostJson(this._url('tracestart'), data);
			if (!res || res.ok !== true) {
				this._setStatus('trace', 'إستعداد', false);
				this._setMsg('trace', 'فشل البدء: ' + (res && (res.error || res.raw) ? (res.error || res.raw) : 'unknown'));
				return;
			}

			this._trace.sid = res.sid;
			this._trace.since = 0;
			this._trace.running = true;
			this._trace.poll_ms = res.poll_ms || 400;
			this._setStatus('trace', 'جاري التشغيل (sid ' + res.sid + ')', true);
			this._setMsg('trace', res.cmd ? ('CMD: ' + res.cmd) : '');

			if (this._trace.timer) window.clearInterval(this._trace.timer);
			this._trace.timer = window.setInterval(() => { this._tracePoll(); }, this._trace.poll_ms);
			this._tracePoll();
		} catch (e) {
			this._setStatus('trace', 'إستعداد', false);
			this._setMsg('trace', 'خطأ في البدء: ' + (e && (e.error || e.raw) ? (e.error + (e.raw ? ('\n' + e.raw) : '')) : String(e)));
		}
	},

	async _tracePoll() {
		if (!this._trace.running || !this._trace.sid) return;
		try {
			const res = await xhrGetJson(this._url('tracepoll'), {
				sid: this._trace.sid,
				since: String(this._trace.since),
				limit: '200'
			});
			if (!res || res.ok !== true) {
				this._setMsg('trace', 'فشل التحديث: ' + (res && (res.error || res.raw) ? (res.error || res.raw) : 'unknown'));
				return;
			}
			(res.events || []).forEach(ev => this._addTraceRow(ev));
			this._trace.since = res.next_since || this._trace.since;

			if (res.state && res.state !== 'running') {
				this._trace.running = false;
				this._setStatus('trace', 'إنتهى', false);
				if (this._trace.timer) { window.clearInterval(this._trace.timer); this._trace.timer = null; }
			}
		} catch (e) {
			this._setMsg('trace', 'خطاء في التحديث: ' + (e && (e.error || e.raw) ? (e.error + (e.raw ? ('\n' + e.raw) : '')) : String(e)));
		}
	},

	async _traceStop() {
		if (!this._trace.sid) return;
		try { await xhrPostJson(this._url('tracestop'), { sid: this._trace.sid }); } catch (e) {}
		this._trace.running = false;
		this._setStatus('trace', 'تم الإيقاف', false);
		if (this._trace.timer) { window.clearInterval(this._trace.timer); this._trace.timer = null; }
	},

	onUnload() {
		this._stopTimers();
		this._detachResize();
		if (this._chart.raf) {
			window.cancelAnimationFrame(this._chart.raf);
			this._chart.raf = null;
		}
	},

	render() {
		// Load theme before building DOM
		this._loadTheme();
		
		const css = E('link', {
			'rel': 'stylesheet',
			'type': 'text/css',
			'href': L.resource('view/mkntt/mkntt.css')
		  });
		/* -------------------- Inputs & UI blocks (same as before) -------------------- */

		// PING
		const pingHost = el('input', { 'class': 'cbi-input-text', 'placeholder': 'example.com / 192.168.1.21' });
		const pingCount = el('input', { 'class': 'cbi-input-text', 'placeholder': 'CNT (e.g. 10)' });
		const pingSize = el('input', { 'class': 'cbi-input-text', 'placeholder': 'SIZE bytes (e.g. 56)' });
		const pingInterval = el('input', { 'class': 'cbi-input-text', 'placeholder': 'SECS (e.g. 1)' });
		const pingTTL = el('input', { 'class': 'cbi-input-text', 'placeholder': 'TTL' });
		const pingSource = el('input', { 'class': 'cbi-input-text', 'placeholder': 'IFACE or IP (optional)' });
		const pingWait = el('input', { 'class': 'cbi-input-text', 'placeholder': 'W (sec)' });
		const pingDeadline = el('input', { 'class': 'cbi-input-text', 'placeholder': 'w (sec)' });
		const pingPattern = el('input', { 'class': 'cbi-input-text', 'placeholder': 'HEXBYTE (e.g. ff)' });
		const pingAdaptive = el('input', { 'type': 'checkbox' });

		const pingStartBtn = new ui.ComboButton('v4', {
			v4: _('بدء إختبار Ping IPv4'),
			v6: _('بدء إختبار Ping IPv6'),
			auto: _('بدء إختبار Ping Auto')
		}, {
			classes: { main: 'cbi-button cbi-button-action' },
			click: (btn, key) => this._pingStart(key)
		});
		const pingStopBtn = el('button', { 'class': 'cbi-button cbi-button-negative', 'click': () => this._pingStop() }, [ _('إيقاف') ]);

		const pingMsg = el('div', { 'class': 'mknt-mono' }, []);
		const pingStatusText = el('div', { 'class': 'mknt-mono' }, [ 'Idle' ]);
		const pingSpinner = el('div', { 'class': 'mknt-spinner', 'style': 'display:none;' }, []);

		const pingStatMin = el('span', {}, ['-']);
		const pingStatAvg = el('span', {}, ['-']);
		const pingStatMax = el('span', {}, ['-']);
		const pingStatLoss = el('span', {}, ['-']);
		const pingStatSent = el('span', {}, ['0']);
		const pingStatRecv = el('span', {}, ['0']);

		const pingTbody = el('tbody');
		const pingChart = el('canvas', { 'class': 'mknt-chart' }, []);
		const pingLossMeter = el('div', { 'class': 'mknt-meter' }, [ el('div', {}, []) ]);

		// TRACE
		const traceHost = el('input', { 'class': 'cbi-input-text', 'placeholder': 'example.com / 192.168.1.21' });
		const traceFirstTTL = el('input', { 'class': 'cbi-input-text', 'placeholder': 'First hop (f)' });
		const traceMaxTTL = el('input', { 'class': 'cbi-input-text', 'placeholder': 'Max hop (m)' });
		const traceProbes = el('input', { 'class': 'cbi-input-text', 'placeholder': 'Probes (q)' });
		const tracePort = el('input', { 'class': 'cbi-input-text', 'placeholder': 'Port (p)' });
		const traceTos = el('input', { 'class': 'cbi-input-text', 'placeholder': 'ToS (t)' });
		const traceWait = el('input', { 'class': 'cbi-input-text', 'placeholder': 'Wait sec (w)' });
		const traceSource = el('input', { 'class': 'cbi-input-text', 'placeholder': 'Source IP (s)' });
		const traceIface = el('input', { 'class': 'cbi-input-text', 'placeholder': 'Iface (i)' });
		const tracePause = el('input', { 'class': 'cbi-input-text', 'placeholder': 'Pause ms (z)' });
		const traceBytes = el('input', { 'class': 'cbi-input-text', 'placeholder': 'Bytes' });

		const traceDontFragment = el('input', { 'type': 'checkbox' });
		const traceShowTTL = el('input', { 'type': 'checkbox' });
		const traceNumeric = el('input', { 'type': 'checkbox' });
		const traceBypass = el('input', { 'type': 'checkbox' });
		const traceVerbose = el('input', { 'type': 'checkbox' });

		const traceStartBtn = new ui.ComboButton('v4', {
			v4: _('بدء إختبار Trace IPv4'),
			v6: _('بدء إختبار Trace IPv6'),
			auto: _('بدء إختبار Trace Auto')
		}, {
			classes: { main: 'cbi-button cbi-button-action' },
			click: (btn, key) => this._traceStart(key)
		});
		const traceStopBtn = el('button', { 'class': 'cbi-button cbi-button-negative', 'click': () => this._traceStop() }, [ _('إيقاف') ]);

		const traceMsg = el('div', { 'class': 'mknt-mono' }, []);
		const traceStatusText = el('div', { 'class': 'mknt-mono' }, [ 'Idle' ]);
		const traceSpinner = el('div', { 'class': 'mknt-spinner', 'style': 'display:none;' }, []);

		const traceTbody = el('tbody');
		const traceChart = el('canvas', { 'class': 'mknt-chart' }, []);

		// Default values
		pingHost.value = '192.168.1.21';
		pingCount.value = '20';
		pingSize.value = '56';
		pingInterval.value = '1';
		pingWait.value = '10';
		traceHost.value = 'm.net';
		traceFirstTTL.value = '1';
		traceMaxTTL.value = '30';
		traceProbes.value = '3';
		tracePort.value = '33434';
		traceTos.value = '0';
		traceWait.value = '3';
		traceNumeric.checked = true;

		// store refs
		this._dom = {
			ping_host: pingHost,
			ping_count: pingCount,
			ping_size: pingSize,
			ping_interval: pingInterval,
			ping_ttl: pingTTL,
			ping_source: pingSource,
			ping_wait: pingWait,
			ping_deadline: pingDeadline,
			ping_pattern: pingPattern,
			ping_adaptive: pingAdaptive,
			ping_tbody: pingTbody,
			ping_msg: pingMsg,
			ping_status_text: pingStatusText,
			ping_spinner: pingSpinner,
			ping_stat_min: pingStatMin,
			ping_stat_avg: pingStatAvg,
			ping_stat_max: pingStatMax,
			ping_stat_loss: pingStatLoss,
			ping_stat_sent: pingStatSent,
			ping_stat_recv: pingStatRecv,
			ping_chart: pingChart,
			ping_loss_meter: pingLossMeter.firstChild,

			trace_host: traceHost,
			trace_first_ttl: traceFirstTTL,
			trace_max_ttl: traceMaxTTL,
			trace_probes: traceProbes,
			trace_port: tracePort,
			trace_tos: traceTos,
			trace_wait: traceWait,
			trace_source: traceSource,
			trace_iface: traceIface,
			trace_pause: tracePause,
			trace_bytes: traceBytes,

			trace_dont_fragment: traceDontFragment,
			trace_show_ttl: traceShowTTL,
			trace_numeric: traceNumeric,
			trace_bypass: traceBypass,
			trace_verbose: traceVerbose,

			trace_tbody: traceTbody,
			trace_msg: traceMsg,
			trace_status_text: traceStatusText,
			trace_spinner: traceSpinner,
			trace_chart: traceChart
		};

		/* Build card columns (same split layout) */
		const pingLeft = el('div', { 'class': 'mknt-col' }, [
			el('details', { 'class': 'mknt-details', 'open': 'open' }, [
				el('summary', {}, [ _('إعدادات الهدف') ]),
				el('div', { 'class': 'mknt-grid mknt-field' }, [
					el('div', {}, [ _('المضيف/Host') ]), pingHost,
					el('div', {}, [ _('العدد (-c)') ]), pingCount
				])
			]),
			el('details', { 'class': 'mknt-details' }, [
				el('summary', {}, [ _('إعدادات التوقيت') ]),
				el('div', { 'class': 'mknt-grid mknt-field' }, [
					el('div', {}, [ _('الفترة (-i)') ]), pingInterval,
					el('div', {}, [ _('إنتظر أولاً (-W)') ]), pingWait,
					el('div', {}, [ _('الموعد النهائي (-w)') ]), pingDeadline,
					el('div', {}, [ _('التكيف (-A)') ]), pingAdaptive
				])
			]),
			el('details', { 'class': 'mknt-details' }, [
				el('summary', {}, [ _('إعدادات الحزمة') ]),
				el('div', { 'class': 'mknt-grid mknt-field' }, [
					el('div', {}, [ _('الحجم/Size (-s)') ]), pingSize,
					el('div', {}, [ _('TTL (-t)') ]), pingTTL,
					el('div', {}, [ _('النمط (-p)') ]), pingPattern
				])
			]),
			el('details', { 'class': 'mknt-details' }, [
				el('summary', {}, [ _('إعدادات المصدر') ]),
				el('div', { 'class': 'mknt-grid mknt-field' }, [
					el('div', {}, [ _('الواجهة/IP (-I)') ]), pingSource
				])
			]),
			el('div', { 'class': 'mknt-actions' }, [ pingStartBtn.render(), pingStopBtn ]),
			el('div', { 'class': 'mknt-status' }, [ pingSpinner, pingStatusText ]),
		]);

		const pingRight = el('div', { 'class': 'mknt-col mknt-results' }, [
			el('div', { 'class': 'mknt-chartwrap' }, [
				el('div', { 'class': 'mknt-charthead' }, [
					el('div', { 'class': 'mknt-charttitle' }, [ _('Ping RTT مخطط') ]),
					el('div', { 'class': 'mknt-chartmeta' }, [ _('مياشر') ])
				]),
				pingChart
			]),
			pingMsg,
			el('div', { 'class': 'mknt-tablewrap' }, [
				el('table', { 'class': 'mknt-table' }, [
					el('thead', {}, [
						el('tr', {}, [
							el('th', {}, ['ts']),
							el('th', {}, ['نوع']),
							el('th', {}, ['تسلسل']),
							el('th', {}, ['addr']),
							el('th', {}, ['ttl']),
							el('th', {}, ['الزمن ms']),
							el('th', {}, ['الرسالة'])
						])
					]),
					pingTbody
				])
			])
		]);

		const pingCard = el('div', { 'class': 'mknt-card' }, [
			el('h3', {}, [
				el('span', {}, [ _('Ping Tool') ]),
				el('span', { 'class': 'mknt-subtitle' }, [ _('الإستجابة') ])
			]),
			el('div', { 'class': 'mknt-kpis' }, [
				el('div', { 'class': 'mknt-tile' }, [ el('b', {}, [ 'الحد الأدنى']), el('span', {}, [ pingStatMin, ' ms' ]) ]),
				el('div', { 'class': 'mknt-tile' }, [ el('b', {}, [ 'المتوسط']), el('span', {}, [ pingStatAvg, ' ms'  ]) ]),
				el('div', { 'class': 'mknt-tile' }, [ el('b', {}, [ 'الحد الأقصى']), el('span', {}, [ pingStatMax, ' ms' ]) ]),
				el('div', { 'class': 'mknt-tile' }, [ el('b', {}, [ 'تم الإرسال']), el('span', {}, [ pingStatSent ]) ]),
				el('div', { 'class': 'mknt-tile' }, [ el('b', {}, [ 'recv']), el('span', {}, [ pingStatRecv ]) ]),
				el('div', { 'class': 'mknt-tile' }, [ el('b', {}, [ 'الخسارة']), el('span', {}, [ pingStatLoss, ' ', pingLossMeter ]) ])
			  ]),
			el('div', { 'class': 'mknt-split' }, [ pingLeft, pingRight ])
		]);

		const traceLeft = el('div', { 'class': 'mknt-col' }, [
			el('details', { 'class': 'mknt-details', 'open': 'open' }, [
				el('summary', {}, [ _('إعدادات الهدف') ]),
				el('div', { 'class': 'mknt-grid mknt-field' }, [
					el('div', {}, [ _('المضيف/Host') ]), traceHost
				])
			]),
			el('details', { 'class': 'mknt-details' }, [
				el('summary', {}, [ _('القفزات/Hops') ]),
				el('div', { 'class': 'mknt-grid mknt-field' }, [
					el('div', {}, [ _('أول TTL (-f)') ]), traceFirstTTL,
					el('div', {}, [ _('أعلى TTL (-m)') ]), traceMaxTTL
				])
			]),
			el('details', { 'class': 'mknt-details' }, [
				el('summary', {}, [ _('المجسات/Probes') ]),
				el('div', { 'class': 'mknt-grid mknt-field' }, [
					el('div', {}, [ _('المجسات (-q)') ]), traceProbes,
					el('div', {}, [ _('منفذ القاعدة (-p)') ]), tracePort,
					el('div', {}, [ _('إنتظر (-w)') ]), traceWait,
					el('div', {}, [ _('إيقاف (-z) ms') ]), tracePause
				])
			]),
			el('details', { 'class': 'mknt-details' }, [
				el('summary', {}, [ _('المصدر و التوجيه') ]),
				el('div', { 'class': 'mknt-grid mknt-field' }, [
					el('div', {}, [ _('المصدر (-s)') ]), traceSource,
					el('div', {}, [ _('الواجهة (-i)') ]), traceIface,
					el('div', {}, [ _('شروط الخدمة (-t)') ]), traceTos,
					el('div', {}, [ _('البايتات') ]), traceBytes
				]),
				el('div', { 'style': 'margin-top:10px; display:flex; gap:14px; flex-wrap:wrap;' }, [
					el('label', {}, [ traceDontFragment, ' ', _('لا تتجزأ (-F)') ]),
					el('label', {}, [ traceShowTTL, ' ', _('عودة العرض TTL (-l)') ]),
					el('label', {}, [ traceNumeric, ' ', _('رقمي (-n)') ]),
					el('label', {}, [ traceBypass, ' ', _('التحويل عبر التوجية (-r)') ]),
					el('label', {}, [ traceVerbose, ' ', _('Verbose (-v)') ])
				])
			]),
			el('div', { 'class': 'mknt-actions' }, [ traceStartBtn.render(), traceStopBtn ]),
			el('div', { 'class': 'mknt-status' }, [ traceSpinner, traceStatusText ]),
		]);

		const traceRight = el('div', { 'class': 'mknt-col mknt-results' }, [
			el('div', { 'class': 'mknt-chartwrap' }, [
				el('div', { 'class': 'mknt-charthead' }, [
					el('div', { 'class': 'mknt-charttitle' }, [ _('Traceroute Hop RTT مخطط') ]),
					el('div', { 'class': 'mknt-chartmeta' }, [ _('avg/hop') ])
				]),
				traceChart
			]),
			traceMsg,
			el('div', { 'class': 'mknt-tablewrap' }, [
				el('table', { 'class': 'mknt-table' }, [
					el('thead', {}, [
						el('tr', {}, [
							el('th', {}, ['ts']),
							el('th', {}, ['قفز']),
							el('th', {}, ['addr']),
							el('th', {}, ['rtt1']),
							el('th', {}, ['rtt2']),
							el('th', {}, ['rtt3']),
							el('th', {}, ['الرسالة'])
						])
					]),
					traceTbody
				])
			])
		]);

		const traceCard = el('div', { 'class': 'mknt-card' }, [
			el('h3', {}, [
				el('span', {}, [ _('Traceroute تتبع المسار') ]),
				el('span', { 'class': 'mknt-subtitle' }, [ _('الإستجابة') ])
			]),
			el('div', { 'class': 'mknt-split' }, [ traceLeft, traceRight ])
		]);

		/* Theme topbar */
		const themeBadge = el('span', { 'class': 'mknt-badge' }, []);
		this._dom.theme_badge = themeBadge;

		const root = el('div', { 'class': 'mknt-wrap' }, [
			css,

			el('div', { 'class': 'mknt-topbar' }, [
				el('div', { 'class': 'mknt-brand' }, [
					el('b', {}, [ _('AL-Malaki Network Tools') ]),
					el('span', {}, [
						el('span', { 'class': 'mknt-dot' }, []),
						themeBadge
					])
				]),
				el('div', { 'class': 'mknt-topactions' }, [
					el('button', {
						'class': 'cbi-button-lights',
						'click': () => this._toggleMode(root)
					}, [ _('◑') ]),

					el('button', {
						'class': 'cbi-button-lights',
						'click': () => this._cycleAccent(root)
					}, [ _('🎨') ])
				])
			]),

			el('div', { 'class': 'mknt-layout' }, [
				pingCard,
				traceCard
			])
		]);

		// Apply theme vars + label
		this._applyThemeVars(root);

		// Resize handling + initial chart draw
		this._attachResize();
		window.requestAnimationFrame(() => {
			this._chart.dirty_ping = true;
			this._chart.dirty_trace = true;
			this._requestChartsRender();
		});

		return root;
	},
	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
