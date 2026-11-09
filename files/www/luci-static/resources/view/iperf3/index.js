'use strict';
'require view';
'require form';
'require fs';
'require ui';
'require uci';
return view.extend({
    load: function() {
        return fs.exec_direct('/usr/bin/iperf3', ['--version']);
    },
    render: function(version) {
        var m, s, o;
        m = new form.Map('iperf3', _('MK SpeedTest'), _(' .صفحة الإعدادات الخاصة بأداة SyncSys MK SpeedTest لإختبار السرعة'));
        s = m.section(form.TypedSection, 'iperf3', _('Settings'));
        s.anonymous = true;
        o = s.option(form.Value, 'server', _('السيرفر'), _('عنوان السرفر MK SpeedTest المراد الإتصال به. لإختبار السرعة معة'));
        o.datatype = 'host';
        o = s.option(form.Value, 'port', _('المنفذ'), _('رقم المنفذ المخصص للإتصال'));
        o.datatype = 'port';
        o.placeholder = '5201';
        o = s.option(form.Flag, 'reverse', _('عكس'), _('الشغيل في الوضع العكسي'));
        o.default = o.disabled;
        o = s.option(form.Button, '_start', _('البدء في وضع العميل'));
        o.inputtitle = _('التشغيل في وضع العميل');
        o.onclick = this.handleStartTest;
        o = s.option(form.Button, '_start_server', _('البدء في وضع السيرفر'));
        o.inputtitle = _('تشغيل في وضع السيرفر');
        o.onclick = this.handleStartServer;
        o = s.option(form.Button, '_stop_server', _('إيقاف الإختبار'));
        o.inputtitle = _('إيقاف السيرفر');
        o.onclick = this.handleStopServer;
        return m.render();
    },
    handleStartTest: function() {
        var server = uci.get_first('iperf3', 'iperf3', 'server');
        var port = uci.get_first('iperf3', 'iperf3', 'port') || '5201';
        var reverse = uci.get_first('iperf3', 'iperf3', 'reverse') ? '-R' : '';
        var modalContent = ui.showModal(_('MK SpeedTest نتائج الإختبار'), [E('div', {
            'class': 'cbi-section'
        }), E('p', _('running... Will take a bit...')), E('button', {
            'class': 'btn',
            'click': function() {
                ui.hideModal();
            }
        }, _('Dismiss'))]);
        fs.exec('/usr/bin/iperf3', ['-c', server, '-p', port, reverse]).then(function(res) {
            if (res.stdout && res.stdout.length > 0) {
                modalContent.removeChild(modalContent.lastChild);
                modalContent.removeChild(modalContent.lastChild);
                modalContent.appendChild(E('pre', [res.stdout]));
                modalContent.appendChild(E('button', {
                    'class': 'btn',
                    'click': function() {
                        ui.hideModal();
                    }
                }, _('Dismiss')));
            } else {
                modalContent.removeChild(modalContent.lastChild);
                modalContent.removeChild(modalContent.lastChild);
                modalContent.appendChild(E('p', 'Failed to start MK SpeedTest test: No output received'));
                modalContent.appendChild(E('button', {
                    'class': 'btn',
                    'click': function() {
                        ui.hideModal();
                    }
                }, _('Dismiss')));
            }
        }).catch(function(err) {
            ui.addNotification(null, _('Failed to start MK SpeedTest test: ') + err.message, 'error');
        });
    },
    handleStartServer: function() {
        var port = uci.get_first('iperf3', 'iperf3', 'port') || '5201';
        fs.exec('/usr/bin/iperf3', ['-s', '-D', '-p', port]).then(function(res) {
            ui.addNotification(null, _('وضع السرفر في MK SpeedTest يعمل بنجاح'), 'info');
        }).catch(function(err) {
            ui.addNotification(null, _('Failed to start MK SpeedTest server: ') + err.message, 'error');
        });
    },
    handleStopServer: function() {
        var command = `killall iperf3`;
        fs.exec_direct('killall', ['iperf3']).then(function(res) {
            ui.addNotification(null, _('تم ايقاف MK SpeedTest بنجاح'), 'info');
        }).catch(function(err) {
            ui.addNotification(null, _('Failed to stop MK SpeedTest server: ') + err.message, 'error');
        });
    }
});