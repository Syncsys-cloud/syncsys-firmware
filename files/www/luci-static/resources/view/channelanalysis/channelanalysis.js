'use strict';
'require view';
'require poll';
'require request';
'require network';
'require ui';
'require rpc';
'require tools.prng as random';

document.querySelector('head').appendChild(E('link', {
	rel: 'stylesheet',
	type: 'text/css',
	href: L.resource('view/channelanalysis/channel.css')
}));

return view.extend({
	callFrequencyList : rpc.declare({
		object: 'iwinfo',
		method: 'freqlist',
		params: [ 'device' ],
		expect: { results: [] }
	}),

	callInfo : rpc.declare({
		object: 'iwinfo',
		method: 'info',
		params: [ 'device' ],
		expect: { }
	}),

	render_signal_badge: function(signalPercent, signalValue) {
		var icon, title, value;

		if (signalPercent < 0)
			icon = L.resource('icons/signal-none.png');
		else if (signalPercent == 0)
			icon = L.resource('icons/signal-0.png');
		else if (signalPercent < 25)
			icon = L.resource('icons/signal-0-25.png');
		else if (signalPercent < 50)
			icon = L.resource('icons/signal-25-50.png');
		else if (signalPercent < 75)
			icon = L.resource('icons/signal-50-75.png');
		else
			icon = L.resource('icons/signal-75-100.png');

		value = '%d\xa0%s'.format(signalValue, _('dBm'));
		title = '%s: %d %s'.format(_('الإشارة'), signalValue, _('dBm'));

		return E('div', {
			'class': 'ifacebadge',
			'title': title,
			'data-signal': signalValue
		}, [
			E('img', { 'src': icon }),
			value
		]);
	},

	add_wifi_to_graph: function(chan_analysis, res, scanCache, channels, channel_width) {
	},

	create_channel_graph: function(chan_analysis, freq_tbl, band) {
	},

	isValidNoise: function(n) {
		return (typeof n === 'number' && n <= -60 && n >= -120);
	},

	formatLastScanText: function(lastScanDate) {
		if (!(lastScanDate instanceof Date))
			return null;

		var diffMs = Date.now() - lastScanDate.getTime();
		if (diffMs < 0)
			diffMs = 0;

		var diffMin = Math.round(diffMs / 60000);

		if (diffMin <= 0)
			return _('قبل أقل من دقيقة');

		return _('قبل %d دقيقة').format(diffMin);
	},

	updateChannelSummary: function(radio, channelStats) {
		var summaryEl = radio.summary;

		if (!summaryEl)
			return;

		while (summaryEl.firstChild)
			summaryEl.removeChild(summaryEl.firstChild);

		summaryEl.appendChild(E('h3', { 'class': 'channel-summary-title' }, _('ملخص القنوات')));

		var channels;
		if (radio.channels && radio.channels.length) {
			channels = radio.channels.slice().sort(function(a, b) {
				return a - b;
			}).map(String);
		}
		else {
			channels = Object.keys(channelStats).sort(function(a, b) {
				return parseInt(a) - parseInt(b);
			});
		}

		if (!channels.length) {
			var emptyBox = E('div', { 'class': 'channel-summary-box' });
			var emptyList = E('ul', { 'class': 'channel-summary-main-list' });

			if (typeof radio.currentChannel === 'number') {
				emptyList.appendChild(
					E('li', {}, _('القناة الحالية: %d').format(radio.currentChannel))
				);
			}

			if (emptyList.childNodes.length > 0)
				emptyBox.appendChild(emptyList);

			if (emptyBox.childNodes.length > 0)
				summaryEl.appendChild(emptyBox);

			summaryEl.appendChild(E('p', {}, _('لا توجد قنوات مكتشفة على هذا النطاق بعد.')));
			return;
		}

		var band = parseInt(radio.band);
		var effectiveScores = {};
		var bestChannel = null;
		var bestScore = null;

		var weights = {
			1: 0.75,
			2: 0.5,
			3: 0.25,
			4: 0.1
		};

		for (var i = 0; i < channels.length; i++) {
			var ch = channels[i];
			var chNum = parseInt(ch);
			var stat = channelStats[ch] || { count: 0, effectiveCount: 0, maxSignal: null, maxSnr: null };

			var eff = (typeof stat.effectiveCount === 'number' && stat.effectiveCount > 0)
				? stat.effectiveCount
				: (stat.count || 0);

			if (band === 2) {
				for (var d = 1; d <= 4; d++) {
					var w = weights[d];

					var up = String(chNum + d);
					var down = String(chNum - d);

					var upStat = channelStats[up];
					if (upStat) {
						var upLoad = (typeof upStat.effectiveCount === 'number' && upStat.effectiveCount > 0)
							? upStat.effectiveCount
							: (upStat.count || 0);
						eff += upLoad * w;
					}

					var downStat = channelStats[down];
					if (downStat) {
						var downLoad = (typeof downStat.effectiveCount === 'number' && downStat.effectiveCount > 0)
							? downStat.effectiveCount
							: (downStat.count || 0);
						eff += downLoad * w;
					}
				}
			}

			if (stat.maxSignal != null) {
				eff += (100 + stat.maxSignal) / 25;
			}

			if (stat.maxSnr != null) {
				var snrPenalty = 0;
				if (stat.maxSnr >= 30)
					snrPenalty = 3;
				else if (stat.maxSnr >= 20)
					snrPenalty = 2;
				else if (stat.maxSnr >= 10)
					snrPenalty = 1;
				eff += snrPenalty;
			}

			effectiveScores[ch] = eff;

			if (bestScore === null || eff < bestScore || (eff === bestScore && chNum < parseInt(bestChannel))) {
				bestScore = eff;
				bestChannel = ch;
			}
		}

		var sortedByScore = channels.slice().sort(function(a, b) {
			var sa = effectiveScores[a];
			var sb = effectiveScores[b];

			if (sa < sb) return -1;
			if (sa > sb) return 1;
			return parseInt(a) - parseInt(b);
		});

		var headerBox = E('div', { 'class': 'channel-summary-box' });
		var mainList = E('ul', { 'class': 'channel-summary-main-list' });

		if (bestChannel !== null) {
			mainList.appendChild(
				E('li', {}, _('أفضل قناة مقترحة: %d').format(parseInt(bestChannel)))
			);
		}

		if (typeof radio.currentChannel === 'number') {
			mainList.appendChild(
				E('li', {}, _('القناة الحالية: %d').format(radio.currentChannel))
			);
		}

		if (mainList.childNodes.length > 0) {
			headerBox.appendChild(mainList);
			summaryEl.appendChild(headerBox);
		}

		if (sortedByScore.length > 0) {
			var topCount = Math.min(sortedByScore.length, 3);
			var topListSimple = E('ul', { 'class': 'channel-top3-simple' });

			for (var t = 0; t < topCount; t++) {
				var chTop = sortedByScore[t];
				topListSimple.appendChild(
					E('li', {}, _('%d) القناة %d').format(
						t + 1, parseInt(chTop)))
				);
			}

			summaryEl.appendChild(
				E('div', { 'class': 'channel-top3' }, [
					E('p', { 'class': 'channel-top3-title' }, _('أفضل 3 قنوات حسب الترتيب:')),
					topListSimple
				])
			);
		}

		var table = E('table', { 'class': 'table channel-summary-table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th col-1 middle center' }, _('القناة')),
				E('th', { 'class': 'th col-1 middle center' }, _('عدد الشبكات في القناة')),
				E('th', { 'class': 'th col-1 middle left' }, _('قوة إشارة أقرب شبكة'))
			])
		]);

		for (var j = 0; j < channels.length; j++) {
			var ch2 = channels[j];
			var chNum2 = parseInt(ch2);
			var statRow = channelStats[ch2] || { count: 0, effectiveCount: 0, maxSignal: null, maxSnr: null };

			table.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td middle center' }, '%d'.format(chNum2)),
				E('td', { 'class': 'td middle center' }, '%d'.format(statRow.count || 0)),
				E('td', { 'class': 'td middle left' },
					(statRow.maxSignal != null)
						? '%d %s'.format(statRow.maxSignal, _('dBm'))
						: '-')
			]));
		}

		summaryEl.appendChild(table);
	},

	handleRadioChange: function(ev) {
		var select = ev.target || ev.currentTarget;
		if (!select)
			return;

		var key = select.value;
		if (!key || !this.radios[key])
			return;

		this.active_tab = key;

		for (var rkey in this.radios) {
			var r = this.radios[rkey];
			if (r.container)
				r.container.style.display = (rkey === key) ? '' : 'none';
		}

		var radio = this.radios[key];
		if (radio && radio.summary) {
			while (radio.summary.firstChild)
				radio.summary.removeChild(radio.summary.firstChild);

			radio.summary.appendChild(
				E('em', { 'class': 'spinning' }, _('جاري فحص الشبكات اللاسلكية...'))
			);
		}

		if (!this.radios[key].loadedOnce)
			poll.start();
	},

	handleScanRefresh: function() {
		if (this._unloaded)
			return;

		if (!this.active_tab)
			return;

		var radio = this.radios[this.active_tab];

		if (radio && radio.summary) {
			while (radio.summary.firstChild)
				radio.summary.removeChild(radio.summary.firstChild);

			radio.summary.appendChild(
				E('em', { 'class': 'spinning' }, _('جاري فحص الشبكات اللاسلكية...'))
			);
		}

		return Promise.all([
			radio.dev.getScanList(),
			this.callInfo(radio.dev.getName())
		]).then(L.bind(function(data) {
			if (this._unloaded)
				return;

			var results = data[0] || [];
			var localInfo = data[1] || {};
			var band = parseInt(radio.band);

			if (typeof localInfo.channel === 'number')
				radio.currentChannel = localInfo.channel;
			if (this.isValidNoise(localInfo.noise))
				radio.defaultNoise = localInfo.noise;

			radio.lastScanTime = new Date();

			var channelStats = {};

			for (var i = 0; i < results.length; i++) {
				var res = results[i];

				if (band !== res.band)
					continue;

				if (res.channel == null)
					continue;

				var ch = res.channel;

				if (!channelStats[ch])
					channelStats[ch] = { count: 0, effectiveCount: 0, maxSignal: null, maxSnr: null };

				var stat = channelStats[ch];

				stat.count++;

				var widthMHz = 20;

				if (res.ht_operation) {
					if (res.ht_operation.secondary_channel_offset === 'below' ||
					    res.ht_operation.secondary_channel_offset === 'above') {
						widthMHz = 40;
					}
				}

				if (res.vht_operation && res.vht_operation.channel_width) {
					if (res.vht_operation.channel_width >= 160)
						widthMHz = Math.max(widthMHz, 160);
					else if (res.vht_operation.channel_width >= 80)
						widthMHz = Math.max(widthMHz, 80);
				}

				if (res.he_operation && res.he_operation.channel_width) {
					widthMHz = Math.max(widthMHz, res.he_operation.channel_width);
				}

				if (res.eht_operation && res.eht_operation.channel_width) {
					widthMHz = Math.max(widthMHz, res.eht_operation.channel_width);
				}

				if (typeof widthMHz !== 'number' || widthMHz <= 0)
					widthMHz = 20;

				var widthFactor = 1;
				if (widthMHz >= 320)
					widthFactor = 16;
				else if (widthMHz >= 160)
					widthFactor = 8;
				else if (widthMHz >= 80)
					widthFactor = 4;
				else if (widthMHz >= 40)
					widthFactor = 2;
				else
					widthFactor = 1;

				stat.effectiveCount += widthFactor;

				if (typeof res.signal === 'number') {
					if (stat.maxSignal === null || res.signal > stat.maxSignal)
						stat.maxSignal = res.signal;
				}

				var noise = null;
				if (this.isValidNoise(res.noise))
					noise = res.noise;
				else if (this.isValidNoise(radio.defaultNoise))
					noise = radio.defaultNoise;

				if (typeof res.signal === 'number' && noise !== null) {
					var snr = res.signal - noise;
					if (channelStats[ch].maxSnr === null || snr > channelStats[ch].maxSnr)
						channelStats[ch].maxSnr = snr;
				}
			}

			this.updateChannelSummary(radio, channelStats);

			if (!radio.loadedOnce) {
				radio.loadedOnce = true;
				poll.stop();
			}
		}, this));
	},

	unload: function() {
		this._unloaded = true;

		if (this.pollFn) {
			poll.remove(this.pollFn);
			this.pollFn = null;
		}

		poll.stop();

		this.radios = {};
		this.active_tab = null;
	},

	radios : {},

	loadSVG : function(src) {
		return request.get(src).then(function(response) {
			if (!response.ok)
				throw new Error(response.statusText);

			return E('div', {
				'id': 'channel_graph',
				'style': 'width:100%;height:400px;border:1px solid #000;background:#fff'
			}, E(response.text()));
		});
	},

	load: function() {
		return Promise.all([
			this.loadSVG(L.resource('svg/channel_analysis.svg')),
			network.getWifiDevices().then(L.bind(function(data) {
				var tasks = [], ret = [];

				for (var i = 0; i < data.length; i++) {
					ret[data[i].getName()] = { dev : data[i] };

					tasks.push(this.callFrequencyList(data[i].getName())
					.then(L.bind(function(radio, data) {
						ret[radio.getName()].freq = data;
					}, this, data[i])));
				}

				return Promise.all(tasks).then(function() { return ret; });
			}, this))
		]);
	},

	render: function(data) {
		var wifiDevs = data[1];

		var h2 = E('div', {'class' : 'cbi-title-section'}, [
			E('h2', {'class': 'cbi-title-field'}, [ _('تحليل القنوات') ])
		]);

		var select = E('select', {
			'id': 'channel-analysis-radio-select',
			'change': ui.createHandlerFn(this, 'handleRadioChange')
		});

		var refreshBtn = E('button', {
			'class': 'cbi-button cbi-button-edit',
			'click': ui.createHandlerFn(this, 'handleScanRefresh')
		}, [ _('اعادة المسح') ]);

		var selectWrapper = E('div', { 'class': 'channel-radio-select-wrapper' }, [
			E('label', { 'for': 'channel-analysis-radio-select', 'style': 'margin-left:0.5em' },
				_('اختر الواجهة / النطاق:')),
			select,
			refreshBtn
		]);

		var radiosContainer = E('div', { 'class': 'channel-radios-container' });

		for (var ifname in wifiDevs) {
			var bands = {
				2 : { title: '2.4GHz', channels: [] },
				5 : { title: '5GHz', channels: [] },
				6 : { title: '6GHz', channels: [] }
			};

			wifiDevs[ifname].freq.forEach(function(freq) {
				if (bands[freq.band])
					bands[freq.band].channels.push(freq.channel);
			});

			for (var band in bands) {
				if (bands[band].channels.length == 0)
					continue;

				var key = ifname + band;

				select.appendChild(
					E('option', { 'value': key }, '%s (%s)'.format(ifname, bands[band].title))
				);

				var summary = E('div', { 'class': 'channel-summary' }, [
					E('em', { 'class': 'spinning' }, _('جاري فحص القنوات...'))
				]);

				var wrapper = E('div', {
					'class': 'channel-radio-wrapper',
					'data-radio-key': key
				}, [
					E('br'), summary, E('br')
				]);

				wrapper.style.display = 'none';

				this.radios[key] = {
					dev: wifiDevs[ifname].dev,
					band: parseInt(band),
					summary: summary,
					channels: bands[band].channels.slice(),
					scanCache: {},
					loadedOnce: false,
					lastScanTime: null,
					currentChannel: null,
					defaultNoise: null,
					container: wrapper
				};

				radiosContainer.appendChild(wrapper);
			}
		}

		this.active_tab = null;
		var firstKey = null;
		for (var k in this.radios) {
			firstKey = k;
			break;
		}

		if (firstKey !== null) {
			this.active_tab = firstKey;
			select.value = firstKey;

			if (this.radios[firstKey].container)
				this.radios[firstKey].container.style.display = '';
		}

		this._unloaded = false;
		this.pollFn = L.bind(this.handleScanRefresh, this);
		poll.add(this.pollFn);

		return E('div', {}, [h2, selectWrapper, radiosContainer]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});

