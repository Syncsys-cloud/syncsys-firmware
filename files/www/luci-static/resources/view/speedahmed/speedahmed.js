'use strict';
'require view';
'require ui';
'require fs';
'require rpc';
'require dom';
'require poll';

document.querySelector('head').appendChild(E('link', {
	rel: 'stylesheet',
	type: 'text/css',
	href: L.resource('view/speedahmed/speed.css')
}));

return view.extend({

	serverRunning: false,
	clientRunning: false,
	clientStarting: false,
	clientSessionActive: false,

	clientLogPath: '/tmp/speed_luci_client.log',
	serverLogPath: '/tmp/speed_luci_server.log',

	runnerScriptPath: '/usr/libexec/speed_luci_runner',

	unloadHandlerRegistered: false,

	clientLastLineIdx: 0,
	clientRowsCount: 0,
	clientPollFn: null,
	currentClientProto: 'tcp',

	serverLastLineIdx: 0,
	serverRowsCount: 0,
	serverPollFn: null,
	currentServerProto: 'tcp',

	currentBitrateMbps: 0,
	displayedBitrateMbps: 0,
	targetBitrateMbps: 0,
	maxObservedBitrate: 0,
	minObservedBitrate: null,
	sumBitrate: 0,
	sampleCount: 0,
	elapsedSeconds: 0,
	peerAddress: '',
	lastGaugeSource: null,
	gaugeAnimRunning: false,

	chartCanvas: null,
	summaryPeerEl: null,
	summaryMaxEl: null,
	summaryMinEl: null,
	summaryAvgEl: null,
	summaryElapsedEl: null,

	handleRunTest: function(ev) {
		ev.preventDefault();

		var mode = this.modeSelect.value;

		if (mode === 'server')
			return this.toggleServer();
		else
			return this.runClient();
	},

	runClient: function() {
		var self = this;

		if (this.clientRunning || this.clientStarting)
			return;

		this.currentClientProto = 'tcp';

		var params = [];

		var cHost = this.clientHostInput.value.trim();
		var cPort = this.clientPortInput.value.trim();
		var cTime = this.clientTimeInput.value.trim();

		if (!cHost)
			return;

		params.push('-c', cHost);

		if (cPort)
			params.push('-p', cPort);

		if (cTime)
			params.push('-t', cTime);

		// direction: upload (client -> server) OR download (server -> client)
		// if download selected, add -R to reverse the test (server sends to client)
		if (this.clientDirectionSelect && this.clientDirectionSelect.value === 'download') {
			params.push('-R');
		}

		params.push('--logfile', this.clientLogPath);
		params.push('--forceflush');

		this.peerAddress = cHost || '';
		this.clientRowsCount   = 0;
		this.clientLastLineIdx = 0;
		this.clientSessionActive = false;

		this.clientRunning  = true;
		this.clientStarting = false;

		this.resetStats('client');

		if (!this.clientPollFn)
			this.clientPollFn = L.bind(this.pollClientLog, this);

		poll.remove(this.clientPollFn);
		poll.add(this.clientPollFn, 1);

		this.updateServerButton();

		fs.exec_direct(this.runnerScriptPath, ['client'].concat(params)).then(function(res) {
			
		}).catch(function(err) {
			
			self.finishClientPoll();
		});
	},

	pollClientLog: function() {
		var self = this;

		if (!this.clientRunning)
			return;

		return fs.read(this.clientLogPath).then(function(text) {
			if (!text)
				return;

			var lines = String(text).split('\n');
			var last  = lines.length;

			if (last && lines[last - 1] === '')
				last--;

			if (last < self.clientLastLineIdx) {
				self.clientLastLineIdx = 0;
				self.clientRowsCount = 0;
				self.clientSessionActive = false;
				self.resetStats('client');
			}

			for (var i = self.clientLastLineIdx; i < last; i++) {
				var line = lines[i].trim();
				if (!line)
					continue;

				if (line.indexOf('iperf Done.') !== -1) {
					if (self.clientSessionActive)
						self.finishClientPoll();
					break;
				}

				var mPeer1 = /Connecting to host ([^, ]+), port/.exec(line);
				var mPeer2 = /connected to ([^ ]+) port/.exec(line);
				if (mPeer1 || mPeer2) {
					self.peerAddress = (mPeer1 && mPeer1[1]) || (mPeer2 && mPeer2[1]) || self.peerAddress;
					self.clientSessionActive = true;
					self.updateSummaryPanel();
				}

				if (line.indexOf('iperf3: error -') === 0) {
					console.error(line);
					self.finishClientPoll();
					break;
				}

				var brVal = self.parseBitrate(line);
				if (brVal != null) {
					self.currentBitrateMbps = brVal;
					self.targetBitrateMbps  = brVal;

					if (self.minObservedBitrate === null || brVal < self.minObservedBitrate)
						self.minObservedBitrate = brVal;
					if (brVal > self.maxObservedBitrate)
						self.maxObservedBitrate = brVal;

					self.sumBitrate  += brVal;
					self.sampleCount += 1;

					var secs = self.parseIntervalSeconds(line);
					if (secs != null)
						self.elapsedSeconds = secs;

					self.lastGaugeSource = 'client';
					self.updateSummaryPanel();
				}
			}

			self.clientLastLineIdx = last;
		}).catch(function() {
		});
	},

	finishClientPoll: function() {
		this.clientRunning  = false;
		this.clientStarting = false;
		this.clientSessionActive = false;

		if (this.clientPollFn)
			poll.remove(this.clientPollFn);

		this.updateServerButton();

		fs.exec_direct(this.runnerScriptPath, ['clear-client-log']).then(function(res) {
			
		}).catch(function(err) {
			console.error('clear-client-log error: ' + err);
		});
	},

	stopServerRunner: function() {
		var self = this;

		if (!this.serverRunning)
			return Promise.resolve();

		return fs.exec(this.runnerScriptPath, ['stop-server']).then(function(res) {
			if (res && res.code && res.code !== 0) {
				var errText = res.stderr || 'stop-server returned error';
				console.error(errText);
				return;
			}
			self.serverRunning = false;
			if (self.serverPollFn)
				poll.remove(self.serverPollFn);
			self.updateServerButton();
		}).catch(function(err) {
			console.error('stop-server error: ' + err);
		});
	},

	toggleServer: function() {
		var self = this;
		this.currentServerProto = 'tcp';

		if (this.serverRunning) {
			return this.stopServerRunner();
		}

		var params = [];

		params.push('-s');

		var sPort = this.serverPortInput.value.trim();
		if (sPort)
			params.push('-p', sPort);

		params.push('--logfile', this.serverLogPath);
		params.push('--forceflush');
		params.push('-D');

		this.serverRowsCount   = 0;
		this.serverLastLineIdx = 0;

		this.peerAddress = '';
		this.resetStats('server');

		if (!this.serverPollFn)
			this.serverPollFn = L.bind(this.pollServerLog, this);

		poll.remove(this.serverPollFn);
		poll.add(this.serverPollFn, 1);

		return fs.exec(this.runnerScriptPath, ['server'].concat(params)).then(function(res) {
			if (res && res.code === 0) {
				self.serverRunning = true;
				self.updateServerButton();
				
			}
			else {
				var errText = (res && res.stderr) ? res.stderr : _('تعذّر تشغيل سكربت السيرفر.');
				console.error(errText);
			}
		}).catch(function(err) {
			console.error('server runner error: ' + err);
		});
	},

	pollServerLog: function() {
		var self = this;

		if (!this.serverRunning)
			return;

		return fs.read(this.serverLogPath).then(function(text) {
			if (!text)
				return;

			var lines = String(text).split('\n');
			var last  = lines.length;

			if (last && lines[last - 1] === '')
				last--;

			if (last < self.serverLastLineIdx) {
				self.serverLastLineIdx = 0;
				self.serverRowsCount = 0;
				self.resetStats('server');
				self.peerAddress = '';
			}

			for (var i = self.serverLastLineIdx; i < last; i++) {
				var line = lines[i].trim();
				if (!line)
					continue;

				if (line.indexOf('Accepted connection from ') === 0) {
					var mPeer = /Accepted connection from ([^, ]+)/.exec(line);
					if (mPeer) {
						self.peerAddress = mPeer[1];
					}
					self.resetStats('server');
					continue;
				}

				var brVal = self.parseBitrate(line);
				if (brVal != null) {
					self.currentBitrateMbps = brVal;
					self.targetBitrateMbps  = brVal;

					if (self.minObservedBitrate === null || brVal < self.minObservedBitrate)
						self.minObservedBitrate = brVal;
					if (brVal > self.maxObservedBitrate)
						self.maxObservedBitrate = brVal;

					self.sumBitrate  += brVal;
					self.sampleCount += 1;

					var secs = self.parseIntervalSeconds(line);
					if (secs != null)
						self.elapsedSeconds = secs;

					self.lastGaugeSource = 'server';
					self.updateSummaryPanel();
				}
			}

			self.serverLastLineIdx = last;
		}).catch(function() {
		});
	},

	parseBitrate: function(bitrateStr) {
		var m = /([\d\.]+)\s+([KMG])?bits\/sec/.exec(bitrateStr);
		if (!m)
			return null;

		var val = parseFloat(m[1]);
		var unit = m[2] || '';

		if (unit === 'K')
			val = val / 1000.0;
		else if (unit === 'G')
			val = val * 1000.0;

		if (isNaN(val))
			return null;

		return val;
	},

	parseIntervalSeconds: function(line) {
		var m = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*sec/.exec(line);
		if (!m)
			return null;

		var end = parseFloat(m[2]);
		if (isNaN(end))
			return null;

		return end;
	},

	resetStats: function(source) {
		this.currentBitrateMbps   = 0;
		this.displayedBitrateMbps = 0;
		this.targetBitrateMbps    = 0;
		this.maxObservedBitrate   = 0;
		this.minObservedBitrate   = null;
		this.sumBitrate           = 0;
		this.sampleCount          = 0;
		this.elapsedSeconds       = 0;
		this.lastGaugeSource      = source || null;
		this.updateGauge();
		this.updateSummaryPanel();
	},

	updateSummaryPanel: function() {
		if (!this.summaryPeerEl)
			return;

		this.summaryPeerEl.textContent = this.peerAddress || '-';

		var max = this.maxObservedBitrate || 0;
		var min = (this.minObservedBitrate != null) ? this.minObservedBitrate : 0;
		var avg = (this.sampleCount > 0) ? (this.sumBitrate / this.sampleCount) : 0;

		this.summaryMaxEl.textContent = max.toFixed(1) + ' Mbit/s';
		this.summaryMinEl.textContent = min.toFixed(1) + ' Mbit/s';
		this.summaryAvgEl.textContent = avg.toFixed(1) + ' Mbit/s';

		var el = this.elapsedSeconds || 0;
		this.summaryElapsedEl.textContent = el.toFixed(1) + ' s';
	},

	updateGauge: function() {
		if (!this.chartCanvas)
			return;

		var ctx = this.chartCanvas.getContext('2d');
		var w = this.chartCanvas.width;
		var h = this.chartCanvas.height;

		ctx.clearRect(0, 0, w, h);

		var margin = 20;
		var cx = w / 2;
		var cy = h - margin;
		var r  = Math.min(w / 2 - margin, h - 2 * margin);

		var maxVal = this.maxObservedBitrate || this.targetBitrateMbps || 10;
		var gaugeMax = maxVal * 2;
		gaugeMax = Math.ceil(gaugeMax / 10) * 10;
		if (gaugeMax < 10)
			gaugeMax = 10;

		var startAngle = Math.PI;
		var endAngle   = 2 * Math.PI;

		ctx.beginPath();
		ctx.arc(cx, cy, r, startAngle, endAngle, false);
		ctx.lineWidth = 12;
		ctx.strokeStyle = '#dddddd';
		ctx.stroke();

		var ratio = (this.displayedBitrateMbps || 0) / gaugeMax;
		if (ratio < 0) ratio = 0;
		if (ratio > 1) ratio = 1;

		var needleAngle = startAngle + (endAngle - startAngle) * ratio;

		ctx.beginPath();
		ctx.arc(cx, cy, r, startAngle, needleAngle, false);
		ctx.lineWidth = 12;
		ctx.strokeStyle = '#3c8dbc';
		ctx.stroke();

		ctx.lineWidth = 2;
		ctx.strokeStyle = '#999999';
		ctx.fillStyle = '#444444';
		ctx.font = '11px sans-serif';

		var tickCount = 5;
		for (var i = 0; i <= tickCount; i++) {
			var tRatio = i / tickCount;
			var ang = startAngle + (endAngle - startAngle) * tRatio;

			var r1 = r - 10;
			var r2 = r;

			var x1 = cx + r1 * Math.cos(ang);
			var y1 = cy + r1 * Math.sin(ang);
			var x2 = cx + r2 * Math.cos(ang);
			var y2 = cy + r2 * Math.sin(ang);

			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.stroke();

			var v = gaugeMax * tRatio;
			var label = String(Math.round(v));

			var rl = r - 28;
			var lx = cx + rl * Math.cos(ang);
			var ly = cy + rl * Math.sin(ang);

			ctx.fillText(label, lx - ctx.measureText(label).width / 2, ly + 3);
		}

		var needleLen = r - 24;
		var nx = cx + needleLen * Math.cos(needleAngle);
		var ny = cy + needleLen * Math.sin(needleAngle);

		ctx.beginPath();
		ctx.moveTo(cx, cy);
		ctx.lineTo(nx, ny);
		ctx.lineWidth = 4;
		ctx.strokeStyle = '#e74c3c';
		ctx.stroke();

		ctx.beginPath();
		ctx.arc(cx, cy, 6, 0, 2 * Math.PI, false);
		ctx.fillStyle = '#555555';
		ctx.fill();

		ctx.font = '16px sans-serif';
		ctx.fillStyle = '#000000';
		var txt = this.displayedBitrateMbps.toFixed(1) + ' Mbit/s';
		var txtX = cx - ctx.measureText(txt).width / 2;
		var txtY = cy - r * 0.55;
		ctx.fillText(txt, txtX, txtY);

		ctx.font = '11px sans-serif';
		ctx.fillStyle = '#555555';
		var lbl;
		if (this.lastGaugeSource === 'server')
			lbl = _('سرعة الاختبار (السيرفر)');
		else if (this.lastGaugeSource === 'client')
			lbl = _('سرعة الاختبار (العميل)');
		else
			lbl = _('سرعة الاختبار');
		ctx.fillText(lbl, cx - ctx.measureText(lbl).width / 2, h - 5);
	},

	startGaugeAnimation: function() {
		if (this.gaugeAnimRunning)
			return;

		this.gaugeAnimRunning = true;

		var self = this;
		var lastTime = null;

		function step(ts) {
			if (!self.gaugeAnimRunning || !self.chartCanvas)
				return;

			if (lastTime == null)
				lastTime = ts;

			var dt = (ts - lastTime) / 1000;
			lastTime = ts;

			var alpha = Math.min(1, dt * 4);

			var cur = self.displayedBitrateMbps || 0;
			var target = self.targetBitrateMbps || 0;

			self.displayedBitrateMbps = cur + (target - cur) * alpha;

			self.updateGauge();

			window.requestAnimationFrame(step);
		}

		window.requestAnimationFrame(step);
	},

	handleModeChange: function() {
		var mode = this.modeSelect.value;

		if (mode === 'server') {
			this.serverOptionsDiv.style.display = '';
			this.clientOptionsDiv.style.display = 'none';
		}
		else {
			this.serverOptionsDiv.style.display = 'none';
			this.clientOptionsDiv.style.display = '';
		}

		if (mode === 'client' && this.serverRunning)
			this.stopServerRunner();

		this.updateServerButton();
	},

	updateServerButton: function() {
		if (!this.runButton)
			return;

		var mode = this.modeSelect.value;

		if (mode === 'server') {
			this.runButton.textContent = this.serverRunning
				? _('إيقاف السيرفر')
				: _('تشغيل السيرفر');
			this.runButton.disabled = false;
		}
		else {
			var busy = this.clientRunning || this.clientStarting;
			this.runButton.textContent = busy
				? _('الاختبار قيد التنفيذ...')
				: _('تشغيل الاختبار الآن');
			this.runButton.disabled = busy;
		}
	},

	render: function() {

		this.modeSelect = E('select', {
			'class': 'cbi-input-select',
			'change': L.bind(this.handleModeChange, this)
		}, [
			E('option', { 'value': 'server' }, _('وضع السيرفر')),
			E('option', { 'value': 'client' }, _('وضع العميل'))
		]);

		this.serverPortInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'placeholder': '5201'
		});

		this.serverBindInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'placeholder': _('مثال: 0.0.0.0 أو 192.168.1.1 (اختياري)')
		});

		this.serverOneShotInput = E('input', {
			'type': 'checkbox',
			'class': 'cbi-input-checkbox'
		});

		this.serverOptionsDiv = E('div', { 'class': 'cbi-section-node st-options-node' }, [
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('المنفذ')),
				E('div', { 'class': 'cbi-value-field' }, [
					this.serverPortInput,
					E('span', { 'class': 'cbi-value-description' },
						_('(افتراضي 5201).'))
				])
			])
		]);

		this.clientHostInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'placeholder': _('192.168.1.1')
		});

		this.clientPortInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'placeholder': '5201'
		});

		this.clientTimeInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'placeholder': '10'
		});

		// New: direction select for client (upload/download)
		this.clientDirectionSelect = E('select', {
			'class': 'cbi-input-select'
		}, [
			E('option', { 'value': 'download' }, _('download')),
			E('option', { 'value': 'upload' }, _('upload'))
			
		]);

		this.clientOptionsDiv = E('div', { 'class': 'cbi-section-node st-options-node', 'style': 'display:none' }, [
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('عنوان السيرفر')),
				E('div', { 'class': 'cbi-value-field' }, [
					this.clientHostInput
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('المنفذ')),
				E('div', { 'class': 'cbi-value-field' }, [
					this.clientPortInput,
					E('span', { 'class': 'cbi-value-description' }, _('')
					)
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('نوع الاختبار')),
				E('div', { 'class': 'cbi-value-field' }, [
					this.clientDirectionSelect
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('مدة الاختبار (ثوانٍ)')),
				E('div', { 'class': 'cbi-value-field' }, [
					this.clientTimeInput
				])
			])
		]);

		this.runButton = E('button', {
			'class': 'btn cbi-button cbi-button-apply',
			'click': L.bind(this.handleRunTest, this)
		}, _('تشغيل الاختبار الآن'));

		this.chartCanvas = E('canvas', {
			width: 480,
			height: 260
		});

		var gaugeWrapper = E('div', { 'class': 'cbi-section-node st-gauge-wrapper' }, [
			this.chartCanvas
		]);

		this.summaryPeerEl     = E('span', {}, '-');
		this.summaryMaxEl      = E('span', {}, '0.0 Mbit/s');
		this.summaryMinEl      = E('span', {}, '0.0 Mbit/s');
		this.summaryAvgEl      = E('span', {}, '0.0 Mbit/s');
		this.summaryElapsedEl  = E('span', {}, '0.0 s');

		var summaryBox = E('div', {
			'class': 'cbi-section-node speed-summary-card'
		}, [
			E('h3', {}, _('خلاصة الاختبار')),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('العنوان البعيد')),
				E('div', { 'class': 'cbi-value-field' }, [ this.summaryPeerEl ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('أعلى سرعة')),
				E('div', { 'class': 'cbi-value-field' }, [ this.summaryMaxEl ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('أقل سرعة')),
				E('div', { 'class': 'cbi-value-field' }, [ this.summaryMinEl ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('المتوسط')),
				E('div', { 'class': 'cbi-value-field' }, [ this.summaryAvgEl ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('الوقت المنقضي')),
				E('div', { 'class': 'cbi-value-field' }, [ this.summaryElapsedEl ])
			])
		]);

		var topRow = E('div', {
			'class': 'st-top-row'
		}, [
			gaugeWrapper,
			summaryBox
		]);

		var container = E('div', { 'class': 'cbi-section' }, [
			E('h2', {}, _('اختبار السرعة ')),

			topRow,

			E('div', { 'class': 'cbi-section-actions' }, [
				this.runButton
			]),

			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('الوضع')),
				E('div', { 'class': 'cbi-value-field' }, [
					this.modeSelect
				])
			]),

			this.serverOptionsDiv,
			this.clientOptionsDiv
		]);

		this.handleModeChange();
		this.updateServerButton();
		this.updateSummaryPanel();
		this.updateGauge();
		this.startGaugeAnimation();

		if (!this.unloadHandlerRegistered) {
			this.unloadHandlerRegistered = true;
			var self = this;
			window.addEventListener('beforeunload', function() {
				if (self.serverRunning)
					self.stopServerRunner();
			});
		}

		return container;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
