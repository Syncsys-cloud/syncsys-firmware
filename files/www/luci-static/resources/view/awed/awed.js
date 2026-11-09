'use strict';
'require view';
'require dom';
'require poll';
'require fs';
'require ui';
'require rpc';
'require uci';
'require form';
'require network';
'require firewall';
'require tools.widgets as widgets';

/*
document.querySelector('head').appendChild(E('link', {
	rel: 'stylesheet',
	type: 'text/css',
	href: L.resource('view/speedahmed/speed.css')
}));

*/
return view.extend({
	load: function() {
		return Promise.all([
			uci.changes(),
			uci.load('wireless'),
			uci.load('awed')		]);
	},

	render: function(data) {
    var m, s, o;

    m = new form.Map('awed', _('تغير القنوات التلقائي'), _('تقوم هذه الخدمة بمكافحة التشويش عبر اختيار القناة الأقل ازدحامًا من بين القنوات المحددة.'));

    s = m.section(form.TypedSection, 'awed', _('الاعدادات'));
		s.anonymous = true;

	var s1 = m.section(form.TypedSection, 'awed', _('تردد 2g'));
		s1.anonymous = true;
o = s1.option(form.Flag, 'enabled_2g', _('تفعيل'));
    o.default = '0';
	var s2 = m.section(form.TypedSection, 'awed', _('تردد 5g'));
		s2.anonymous = true;
o = s2.option(form.Flag, 'enabled_5g', _('تفعيل'));
    o.default = '0';

	

			var callFreqList = rpc.declare({
				object: 'iwinfo',
				method: 'freqlist',
				params: ['device'],
				expect: { results: [] }
			});
	
			var callTxPowerList = rpc.declare({
				object: 'iwinfo',
				method: 'txpowerlist',
				params: ['device'],
				expect: { results: [] }
			});
	

    o = s.option(form.Flag, 'enabled', _('تفعيل'), _('يجب تفعيل هذا لتعمل الخدمة '));
    o.default = '0';
o = s.option(form.ListValue, "houre", _('اختر وقت التكرار'));
		o.depends('enabled', '1');
		for (let index = 1; index <= 100; index++) { o.value(index,index+'h'); }
		o.default = '6h';
		o.rmempty = true;
var radios = uci.sections('wireless', 'wifi-device').map(function(dev) {
				return dev['.name'];
			});
	
			if (!radios.length) {
				ui.addNotification(null, E('p', {}, _('لايوجد وايرلس')));
				return m.render();
			}
		
					var x = 0;
			radios.forEach(function(radio) {
				Promise.all([callFreqList(radio), callTxPowerList(radio)]).then(function(res) {
					var freqlist = res[0] || [];

	
					var ccc = uci.get('wireless',radio,'channel') || 'auto';
					
					var band2g = [];
					var band5g = [];
	
					freqlist.forEach(function(freq) {
						if (freq.band == 2)
							band2g.push([freq.channel, '%d (%d MHz)'.format(freq.channel, freq.mhz)]);
						else if (freq.band == 5)
							band5g.push([freq.channel, '%d (%d MHz)'.format(freq.channel, freq.mhz)]);
					});
	
					if (band2g.length) {
						o = s1.option(form.DynamicList, 'channels_2g', _('channel [2g]'));
						o.value('auto',_('Auto'));
						band2g.forEach(function(c) { o.value(c[0], c[1]); });
						//o.poll = true;
						//o.cfgvalue = function(section_id){ return uci.get('wireless',radio,'channel') || 'auto'; };
					}
	
					if (band5g.length) {
						o = s2.option( form.DynamicList, 'channels_5g', _('channel [5g]'));
						o.value('auto',_('Auto'));
						band5g.forEach(function(c) { o.value(c[0], c[1]); });
						//o.poll = true;
						//o.cfgvalue = function(section_id){ return uci.get('wireless',radio,'channel') || 'auto'; };
					}
	
								}).catch(function(err) {
					ui.addNotification(null, E('p', {}, _(': ') + radio));
					console.error(err);
				});
			});

	m.handleSaveApply = function(ev, mode) {
	return this.constructor.prototype.handleSaveApply.call(this,ev,mode).then(()=> {
	L.resolveDefault(fs.exec('/etc/init.d/awed',['restart']), null);
//	ui.addNotification(null,_('ok'));
	ui.addNotification(null, E('p', {}, _('ok')));
});
};

   
    return m.render();
  }
	
});
