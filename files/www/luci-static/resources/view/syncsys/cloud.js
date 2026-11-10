'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require fs';

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('syncsys'),
			fs.read_direct('/tmp/syncsys_cloud.json', 'json').catch(function() { return null; })
		]);
	},

	render: function(data) {
		var status = data[1] || {};
		var isConnected = status.connected === true;
		var licStatus = status.status || 'Checking...';

		var m, s, o;

		m = new form.Map('syncsys', _('SyncSys.cloud — إدارة السيرفر والترخيص (ACS Server)'),
			_('ربط الراوتر بسيرفر الدوت نت SyncSysAcsServer للتحكم بالسيرفر المركزي، التحقق من التراخيص، وإرسال الأوامر عن بُعد.'));

		s = m.section(form.NamedSection, 'main', 'syncsys', _('حالة الاتصال والترخيص'));

		// Status Badge
		o = s.option(form.DummyValue, '_status', _('حالة السيرفر والترخيص'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			var badgeColor = isConnected ? '#10b981' : '#f59e0b';
			var statusText = isConnected ? ('نشط ومفعل (' + licStatus + ')') : 'جاري الاتصال بالسيرفر...';
			return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;">' +
				'<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + badgeColor + ';box-shadow:0 0 8px ' + badgeColor + ';"></span>' +
				'<strong style="color:' + badgeColor + ';font-size:1.05rem;">' + statusText + '</strong>' +
				'</div>';
		};

		// Device Details
		o = s.option(form.DummyValue, '_mac', _('عنوان الماك (MAC Address)'));
		o.cfgvalue = function() { return status.mac || _('جاري القراءة...'); };

		o = s.option(form.DummyValue, '_model', _('موديل الراوتر'));
		o.cfgvalue = function() { return status.model || _('SyncSys Router'); };

		o = s.option(form.DummyValue, '_last_checkin', _('آخر فحص مع السيرفر'));
		o.cfgvalue = function() { return status.last_checkin || _('غير متاح'); };

		// Settings Section
		s = m.section(form.NamedSection, 'main', 'syncsys', _('إعدادات الاتصال بالسيرفر'));

		o = s.option(form.Flag, 'enabled', _('تفعيل خدمة الاتصال بالسيرفر'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'server_url', _('عنوان سيرفر SyncSys (.NET Web API)'));
		o.placeholder = 'http://192.168.1.23:7501';
		o.description = _('الرابط الكامل لسيرفر الدوت نت SyncSysAcsServer شامل المنفذ 7501.');
		o.rmempty = false;

		o = s.option(form.Value, 'acs_url', _('رابط بروتوكول ACS / CWMP'));
		o.placeholder = 'http://192.168.1.23:7547/cwmp';
		o.description = _('رابط بروتوكول TR-069 للإدارة المتقدمة.');

		o = s.option(form.Value, 'client_id', _('معرّف العميل / المتجر (Client ID)'));
		o.placeholder = '1';
		o.description = _('رقم العميل المسجل في قاعدة بيانات SQL Server لربط هذا الراوتر بالمتجر التابع له.');

		o = s.option(form.Value, 'interval', _('فترة التحديث (بالثواني)'));
		o.placeholder = '60';
		o.datatype = 'uinteger';
		o.default = '60';

		return m.render();
	}
});
