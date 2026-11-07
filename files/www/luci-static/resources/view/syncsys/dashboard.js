'use strict';
'require view';
'require dom';
'require ui';
'require rpc';
'require network';
'require fs';

var callSystemBoard = rpc.declare({
    object: 'system',
    method: 'board'
});

var callSystemInfo = rpc.declare({
    object: 'system',
    method: 'info'
});

var callNetworkDeviceStatus = rpc.declare({
    object: 'network.device',
    method: 'status',
    params: ['name']
});

var callServiceList = rpc.declare({
    object: 'service',
    method: 'list',
    params: ['name'],
    expect: { '': {} }
});

return view.extend({
    load: function() {
        return Promise.all([
            callSystemBoard(),
            callSystemInfo(),
            network.getWifiDevices(),
            network.getWifiNetworks(),
            network.getNetworks(),
            L.resolveDefault(callServiceList('travelmate'), {}),
            L.resolveDefault(fs.stat('/usr/sbin/usteer'), null)
        ]);
    },

    formatBytes: function(bytes) {
        if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
        if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
        if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return bytes + ' B';
    },

    formatUptime: function(seconds) {
        var days = Math.floor(seconds / 86400);
        var hours = Math.floor((seconds % 86400) / 3600);
        var minutes = Math.floor((seconds % 3600) / 60);
        var parts = [];
        if (days > 0) parts.push(days + ' يوم');
        if (hours > 0) parts.push(hours + ' ساعة');
        parts.push(minutes + ' دقيقة');
        return parts.join(' و ');
    },

    createCard: function(icon, title, color, content) {
        return E('div', {
            'class': 'cbi-section syncsys-card',
            'style': 'padding: 18px; border-radius: 12px; border-right: 4px solid ' + color + '; margin-bottom: 12px; transition: all 0.3s ease;'
        }, [
            E('h3', {
                'style': 'color: ' + color + '; margin: 0 0 12px 0; font-size: 1.1rem; border: none !important; background: none !important; padding: 0 !important;'
            }, icon + ' ' + title),
            E('div', {}, content)
        ]);
    },

    createInfoRow: function(label, value, valueColor) {
        return E('div', {
            'style': 'display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05);'
        }, [
            E('span', { 'style': 'color: #94a3b8;' }, label),
            E('span', { 'style': 'font-weight: 600; color: ' + (valueColor || '#e2e8f0') + '; direction: ltr; unicode-bidi: isolate; display: inline-block;' }, value)
        ]);
    },

    createProgressBar: function(percent, color1, color2) {
        var clampedPercent = Math.min(100, Math.max(0, percent));
        return E('div', {
            'class': 'cbi-progressbar',
            'title': clampedPercent + '%',
            'style': 'margin-top: 6px; height: 8px; border-radius: 4px; overflow: hidden;'
        }, E('div', {
            'style': 'width: ' + clampedPercent + '%; background: linear-gradient(90deg, ' + color1 + ', ' + color2 + '); height: 100%; border-radius: 4px; transition: width 0.6s ease;'
        }));
    },

    createQuickButton: function(icon, label, href, color) {
        return E('a', {
            'href': href,
            'style': 'display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 8px; background: rgba(255,255,255,0.05); color: ' + color + '; text-decoration: none; font-weight: 600; transition: all 0.2s ease; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.08);'
        }, [
            E('span', { 'style': 'font-size: 1.2rem;' }, icon),
            E('span', {}, label)
        ]);
    },

    render: function(data) {
        var boardinfo = data[0];
        var sysinfo = data[1];
        var wifidevs = data[2];
        var wifinets = data[3];
        var allnets = data[4];
        var travelmate = data[5];
        var hasMesh = data[6] !== null;

        // Memory stats
        var memTotal = sysinfo.memory.total;
        var memFree = sysinfo.memory.available || sysinfo.memory.free;
        var memUsed = memTotal - memFree;
        var memPercent = Math.round((memUsed / memTotal) * 100);

        // Storage stats
        var rootTotal = sysinfo.root ? sysinfo.root.total : 0;
        var rootUsed = sysinfo.root ? sysinfo.root.used : 0;
        var rootPercent = rootTotal > 0 ? Math.round((rootUsed / rootTotal) * 100) : 0;

        // CPU load
        var loadAvg = sysinfo.load ? (sysinfo.load[0] / 65536).toFixed(2) : '0.00';

        // WiFi networks info
        var wifiCards = [];
        for (var i = 0; i < wifinets.length; i++) {
            var net = wifinets[i];
            var ssid = net.getSSID() || '—';
            var mode = net.getMode() || '—';
            var freq = net.getFrequency() || '';
            var signal = net.getSignal() || 0;
            var bssid = net.getBSSID() || '';
            var isUp = net.isUp();

            var modeLabel = mode;
            if (mode === 'Master' || mode === 'ap') modeLabel = 'نقطة وصول (AP)';
            else if (mode === 'Client' || mode === 'sta') modeLabel = 'عميل (Client)';
            else if (mode === 'mesh point' || mode === 'Mesh Point') modeLabel = 'نقطة شبكية (Mesh)';

            var freqLabel = '';
            if (freq) freqLabel = freq > 5000 ? ' 5GHz' : ' 2.4GHz';

            wifiCards.push(this.createInfoRow(
                ssid + freqLabel,
                isUp ? '🟢 ' + modeLabel : '🔴 معطل',
                isUp ? '#38ef7d' : '#ef4444'
            ));
        }

        // Travelmate status
        var tmStatus = '—';
        var tmColor = '#94a3b8';
        if (travelmate && travelmate.travelmate && travelmate.travelmate.instances) {
            tmStatus = '✅ نشط';
            tmColor = '#38ef7d';
        }

        var self = this;

        // Build the dashboard
        var view = E('div', {
            'class': 'syncsys-dashboard',
            'style': 'direction: rtl; text-align: right; max-width: 1200px; margin: 0 auto;'
        }, [
            // === HEADER ===
            E('div', {
                'style': 'text-align: center; padding: 20px 0 15px; margin-bottom: 20px; border-bottom: 1px solid rgba(0,210,255,0.12);'
            }, [
                E('h1', {
                    'style': 'background: linear-gradient(135deg, #00f2fe, #4facfe); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 1.6rem; margin: 0 0 4px; font-weight: 900;'
                }, '☁️ SyncSys.cloud OS'),
                E('p', { 'style': 'color: #64748b; margin: 0; font-size: 0.9rem;' },
                    'لوحة التحكم الذكية • ' + boardinfo.hostname)
            ]),

            // === STATS ROW ===
            E('div', {
                'style': 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px;'
            }, [
                // Uptime mini card
                E('div', {
                    'style': 'background: rgba(0,210,255,0.08); border-radius: 10px; padding: 14px; text-align: center;'
                }, [
                    E('div', { 'style': 'font-size: 1.5rem;' }, '⏱'),
                    E('div', { 'style': 'color: #00d2ff; font-weight: 700; font-size: 1.1rem; direction: ltr; unicode-bidi: isolate;' },
                        self.formatUptime(sysinfo.uptime)),
                    E('div', { 'style': 'color: #64748b; font-size: 0.75rem;' }, 'وقت التشغيل')
                ]),
                // CPU mini card
                E('div', {
                    'style': 'background: rgba(56,239,125,0.08); border-radius: 10px; padding: 14px; text-align: center;'
                }, [
                    E('div', { 'style': 'font-size: 1.5rem;' }, '⚡'),
                    E('div', { 'style': 'color: #38ef7d; font-weight: 700; font-size: 1.1rem; direction: ltr; unicode-bidi: isolate;' }, loadAvg),
                    E('div', { 'style': 'color: #64748b; font-size: 0.75rem;' }, 'حمل المعالج')
                ]),
                // Memory mini card
                E('div', {
                    'style': 'background: rgba(79,172,254,0.08); border-radius: 10px; padding: 14px; text-align: center;'
                }, [
                    E('div', { 'style': 'font-size: 1.5rem;' }, '🧠'),
                    E('div', { 'style': 'color: #4facfe; font-weight: 700; font-size: 1.1rem; direction: ltr; unicode-bidi: isolate;' }, memPercent + '%'),
                    E('div', { 'style': 'color: #64748b; font-size: 0.75rem;' }, 'الذاكرة')
                ]),
                // Storage mini card
                E('div', {
                    'style': 'background: rgba(240,147,251,0.08); border-radius: 10px; padding: 14px; text-align: center;'
                }, [
                    E('div', { 'style': 'font-size: 1.5rem;' }, '💾'),
                    E('div', { 'style': 'color: #f093fb; font-weight: 700; font-size: 1.1rem; direction: ltr; unicode-bidi: isolate;' }, rootPercent + '%'),
                    E('div', { 'style': 'color: #64748b; font-size: 0.75rem;' }, 'التخزين')
                ])
            ]),

            // === MAIN GRID ===
            E('div', {
                'style': 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px;'
            }, [
                // === DEVICE INFO CARD ===
                self.createCard('📡', 'معلومات الجهاز', '#00d2ff', [
                    self.createInfoRow('الموديل', boardinfo.model || 'غير معروف'),
                    self.createInfoRow('النواة', 'Linux ' + boardinfo.kernel),
                    self.createInfoRow('المعمارية', boardinfo.system),
                    self.createInfoRow('الذاكرة', self.formatBytes(memUsed) + ' / ' + self.formatBytes(memTotal)),
                    self.createProgressBar(memPercent, '#00d2ff', '#4facfe'),
                    self.createInfoRow('التخزين', self.formatBytes(rootUsed) + ' / ' + self.formatBytes(rootTotal)),
                    self.createProgressBar(rootPercent, '#f093fb', '#a855f7')
                ]),

                // === WIFI STATUS CARD ===
                self.createCard('📶', 'حالة الشبكات اللاسلكية', '#38ef7d',
                    wifiCards.length > 0 ? wifiCards : [
                        E('p', { 'style': 'color: #94a3b8;' }, 'لا توجد شبكات لاسلكية نشطة')
                    ]
                ),

                // === MESH & REPEATER STATUS ===
                self.createCard('🔗', 'الشبكة المتداخلة والمقوي', '#f59e0b', [
                    self.createInfoRow('مقوي الإشارة (Travelmate)', tmStatus, tmColor),
                    self.createInfoRow('Mesh (802.11s)', hasMesh ? '✅ متوفر' : '❌ غير متوفر',
                        hasMesh ? '#38ef7d' : '#ef4444'),
                    self.createInfoRow('wpad-openssl', '✅ مثبت', '#38ef7d'),
                    E('div', { 'style': 'margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap;' }, [
                        E('a', {
                            'href': '/cgi-bin/luci/admin/services/travelmate',
                            'class': 'cbi-button cbi-button-action',
                            'style': 'font-size: 0.85rem; padding: 6px 14px; border-radius: 6px;'
                        }, '🔄 إعداد المقوي'),
                        E('a', {
                            'href': '/cgi-bin/luci/admin/network/wireless',
                            'class': 'cbi-button',
                            'style': 'font-size: 0.85rem; padding: 6px 14px; border-radius: 6px;'
                        }, '📡 إعداد Mesh')
                    ])
                ]),

                // === QUICK ACTIONS CARD ===
                self.createCard('🚀', 'إعدادات سريعة', '#a855f7', [
                    self.createQuickButton('📶', 'إعدادات الواي فاي', '/cgi-bin/luci/admin/network/wireless', '#4facfe'),
                    self.createQuickButton('🔄', 'مقوي الإشارة (ريبيتر)', '/cgi-bin/luci/admin/services/travelmate', '#f59e0b'),
                    self.createQuickButton('🌐', 'دمج الخطوط (Multi-WAN)', '/cgi-bin/luci/admin/network/mwan3', '#38ef7d'),
                    self.createQuickButton('📊', 'مراقبة استهلاك البيانات', '/cgi-bin/luci/admin/services/nlbwmon', '#f093fb'),
                    self.createQuickButton('🛡️', 'جدار الحماية', '/cgi-bin/luci/admin/network/firewall', '#ef4444'),
                    self.createQuickButton('⚙️', 'إعدادات النظام', '/cgi-bin/luci/admin/system/system', '#94a3b8'),
                    self.createQuickButton('💾', 'تحديث النظام', '/cgi-bin/luci/admin/system/flash', '#00d2ff')
                ])
            ])
        ]);

        return view;
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
