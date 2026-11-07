
'use strict';
'require view';
'require dom';
'require ui';
'require rpc';
'require network';

var callSystemBoard = rpc.declare({
    object: 'system',
    method: 'board'
});

var callSystemInfo = rpc.declare({
    object: 'system',
    method: 'info'
});

return view.extend({
    load: function() {
        return Promise.all([
            callSystemBoard(),
            callSystemInfo(),
            network.getWifiDevices()
        ]);
    },

    render: function(data) {
        var boardinfo = data[0];
        var sysinfo = data[1];
        var wifidevs = data[2];

        var memTotal = sysinfo.memory.total;
        var memFree = sysinfo.memory.available || sysinfo.memory.free;
        var memUsed = memTotal - memFree;
        var memPercent = Math.round((memUsed / memTotal) * 100);

        var uptime = sysinfo.uptime;
        var hours = Math.floor(uptime / 3600);
        var minutes = Math.floor((uptime % 3600) / 60);

        var view = E('div', { 'class': 'syncsys-dashboard', 'style': 'direction: rtl; text-align: right;' }, [
            E('div', { 'style': 'text-align: center; padding: 20px 0; border-bottom: 1px solid rgba(0,210,255,0.15); margin-bottom: 20px;' }, [
                E('h1', { 'style': 'color: #00d2ff; font-size: 1.8rem; margin: 0;' }, 'مرحباً بك في SyncSys.cloud OS'),
                E('p', { 'style': 'color: #94a3b8; margin: 5px 0 0;' }, 'نظام التشغيل السحابي المؤسسي لإدارة الشبكات')
            ]),

            E('div', { 'style': 'display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 20px;' }, [
                // Card 1: Device Info
                E('div', { 'class': 'cbi-section', 'style': 'padding: 15px; border-radius: 10px; border-right: 3px solid #00d2ff;' }, [
                    E('h3', { 'style': 'color: #00d2ff; margin-top: 0; border: none; background: none;' }, '📡 معلومات الجهاز'),
                    E('p', {}, ['الموديل: ', E('b', {}, boardinfo.model || 'غير معروف')]),
                    E('p', {}, ['النواة: ', E('b', {}, 'Linux ' + boardinfo.kernel)]),
                    E('p', {}, ['المعمارية: ', E('b', {}, boardinfo.system)])
                ]),

                // Card 2: Performance
                E('div', { 'class': 'cbi-section', 'style': 'padding: 15px; border-radius: 10px; border-right: 3px solid #38ef7d;' }, [
                    E('h3', { 'style': 'color: #38ef7d; margin-top: 0; border: none; background: none;' }, '⚡ أداء النظام'),
                    E('p', {}, ['وقت التشغيل: ', E('b', {}, hours + ' ساعة و ' + minutes + ' دقيقة')]),
                    E('p', {}, ['الذاكرة المستخدمة: ', E('b', {}, memPercent + '%')]),
                    E('div', { 'class': 'cbi-progressbar', 'title': memPercent + '%' },
                        E('div', { 'style': 'width: ' + memPercent + '%; background: linear-gradient(90deg, #38ef7d, #11998e);' }))
                ]),

                // Card 3: Quick Actions
                E('div', { 'class': 'cbi-section', 'style': 'padding: 15px; border-radius: 10px; border-right: 3px solid #f093fb;' }, [
                    E('h3', { 'style': 'color: #f093fb; margin-top: 0; border: none; background: none;' }, '🚀 إعدادات سريعة'),
                    E('p', {}, [
                        E('a', { 'href': '/cgi-bin/luci/admin/network/wireless', 'style': 'color: #4facfe;' }, '📶 إعدادات الواي فاي')
                    ]),
                    E('p', {}, [
                        E('a', { 'href': '/cgi-bin/luci/admin/services/travelmate', 'style': 'color: #4facfe;' }, '🔄 مقوي الإشارة (ريبيتر)')
                    ]),
                    E('p', {}, [
                        E('a', { 'href': '/cgi-bin/luci/admin/network/mwan', 'style': 'color: #4facfe;' }, '🌐 دمج الخطوط (Multi-WAN)')
                    ]),
                    E('p', {}, [
                        E('a', { 'href': '/cgi-bin/luci/admin/system/flash', 'style': 'color: #4facfe;' }, '💾 تحديث النظام')
                    ])
                ])
            ])
        ]);

        return view;
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
