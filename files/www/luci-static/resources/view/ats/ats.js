'use strict'; 
'require view';
'require poll';
'require ui';
'require uci';
'require rpc';
'require form';
'require tools.widgets as widgets';


document.querySelector('head').appendChild(E('link', {
	rel: 'stylesheet',
	type: 'text/css',
	href: L.resource('view/speedahmed/speed.css')
}));


var callInitList, callInitAction, callTimezone,
    callGetLocaltime, callSetLocaltime, CBILocalTime;

callGetLocaltime = rpc.declare({
	object: 'system',
	method: 'info',
	expect: { localtime: 0 }
});

callSetLocaltime = rpc.declare({
	object: 'luci',
	method: 'setLocaltime',
	params: [ 'localtime' ],
	expect: { result: 0 }
});

callTimezone = rpc.declare({
	object: 'luci',
	method: 'getTimezones',
	expect: { '': {} }
});

function formatTime(epoch) {
	var date = new Date(epoch * 1000);

	return '%04d-%02d-%02d %02d:%02d:%02d'.format(
		date.getUTCFullYear(),
		date.getUTCMonth() + 1,
		date.getUTCDate(),
		date.getUTCHours(),
		date.getUTCMinutes(),
		date.getUTCSeconds()
	);
}

CBILocalTime = form.DummyValue.extend({
	renderWidget: function(section_id, option_id, cfgvalue) {
		return E([], [
			E('input', {
				'id': 'localtime',
				'type': 'text',
				'readonly': true,
				'value': formatTime(cfgvalue)
			}),
			E('br'),
			E('span', { 'class': 'control-group' }, [
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': ui.createHandlerFn(this, function() {
						return callSetLocaltime(Math.floor(Date.now() / 1000));
					}),
					'disabled': (this.readonly != null) ? this.readonly : this.map.readonly
				}, _('ضبط الوقت')),
				' '
			])
		]);
	},
});

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('ats'),
			callTimezone(),
			callGetLocaltime(),
			uci.load('luci'),
			uci.load('system')
		]);
	},

	render: function(rpc_replies) {
		var timezones = rpc_replies[1],
		    localtime = rpc_replies[2];

		var m, s, o;

		m = new form.Map('ats');
		m.chain('luci');

		s = m.section(form.TypedSection, 'main');
		s.anonymous = true;

		var s2 = m.section(form.TypedSection, 'main' ,_(''));
		s2.anonymous = true;

		callSetLocaltime(Math.floor(Date.now() / 1000));
		
		o = s.option(form.ListValue, "enable", _("وضع حفظ الوقت"));
		o.rmempty = false;
		o.value("boot", _("حفظ الوقت عند الإيقاف والتشغيل فقط"));
		o.value("interval", _("حفظ الوقت كل وقت معين"));
		o.value("off", _("إيقاف الخدمة"));
		o.default = "boot";

		o = s.option(form.ListValue, "minute", _("الضبط التلقائي كل (بالدقائق)"));
		o.datatype = "range(0,59)";
		o.rmempty = false;
		for (var i = 0; i < 60; i++) {
			var key = String(i);
			o.value(key, "%02d".format(i));
		}
		o.default = "2";
		o.cfgvalue = function(section_id) {
			var v = uci.get('ats', section_id, 'minute');
			if (v == null || v === '' || v === '0')
				return "10";
			return v;
		};
		o.depends("enable", "interval");
		
		o = s2.option(CBILocalTime, '_systime', _('التوقيت الحالي'));
		o.cfgvalue = function() { return localtime };

		var ttt = uci.get('system','@system[0]','zonename') || 'UTC';
		o = s2.option(form.ListValue, "zonenamee", _('المنطقة الزمنية'));
		o.value(ttt);

		var zones = Object.keys(timezones || {}).sort();
		for (var i = 0; i < zones.length; i++)
			o.value(zones[i]);

		o.write = function(section_id, formvalue) {
			console.log(section_id);
			var tz = timezones[formvalue] ? timezones[formvalue].tzstring : null;
			uci.set('system', '@system[0]', 'zonename', formvalue);
			uci.set('system', '@system[0]', 'timezone', tz);
			console.log(formvalue);
		};

		return m.render().then(function(mapEl) {
			poll.add(function() {
				return callGetLocaltime().then(function(t) {
					mapEl.querySelector('#localtime').value = formatTime(t);
				});
			});

			return mapEl;
		});
	}
});
