'use strict';
'require baseclass';
'require dom';
'require network';
'require rpc';

return baseclass.extend({
    title: _('الاجهزة المتصلة'),
    params: [],

    load: function () {
        return Promise.all([
            network.getWifiDevices(),
            network.getWifiNetworks(),
            network.getHostHints()
        ]).then(function (radios_networks_hints) {
            var tasks = [];

            for (var i = 0; i < radios_networks_hints[1].length; i++)
                tasks.push(
                    L.resolveDefault(radios_networks_hints[1][i].getAssocList(), [])
                        .then(L.bind(function (net, list) {
                            net.assoclist = list.sort(function (a, b) {
                                return a.mac > b.mac;
                            });
                        }, this, radios_networks_hints[1][i]))
                );

            return Promise.all(tasks).then(function () {
                return radios_networks_hints;
            });
        });
    },

    renderHtml: function () {
        var container_wapper = E('div', {
            'class': 'router-status-wifi dashboard-bg box-s1'
        });

        var container_box = E('div', {
            'class': 'wifi-info devices-list'
        });

        var container_radio = E('div', {
            'class': 'settings-info'
        });

        var container_radio_item;

        for (var i = 0; i < this.params.wifi.radios.length; i++) {
            container_radio_item = E('div', { 'class': 'radio-info' });

            for (var idx in this.params.wifi.radios[i]) {
                var classname = idx,
                    radio = this.params.wifi.radios[i];

                if (!radio[idx].visible) {
                    continue;
                }

                container_radio_item.appendChild(E('p', {}, [
                    E('span', { 'class': '' }, [radio[idx].title + ' :']),
                    E('span', { 'class': classname }, [radio[idx].value])
                ]));
            }
        }

        container_box.appendChild(container_radio);

        var container_devices = E('table', {
            'class': 'table assoclist devices-info',
            'style': 'direction: rtl; text-align: right;' // تعديل اتجاه الكتابة
        }, [
            E('tr', { 'class': 'tr dashboard-bg' }, [
                E('th', { 'class': 'th nowrap' }, _('الجهاز  MAC')),  // تم التعديل هنا
                E('th', { 'class': 'th' }, _('الواجهة ')),
                E('th', { 'class': 'th', 'width': '45%' }, _('قوة الإشارة')),
                E('th', { 'class': 'th' },
                    _(' البيانات') + ' %s / %s'.format(_('الرفع'), _('التحميل')))
            ])
        ]);

        for (var i = 0; i < this.params.wifi.devices.length; i++) {
            var container_devices_item = E('tr', {
                'class': 'tr cbi-rowstyle-1'
            });

            for (var idx in this.params.wifi.devices[i]) {
                var device = this.params.wifi.devices[i];

                if (!device[idx].visible) {
                    continue;
                }

                var container_content;

                if ('progress' == idx) {
                    container_content = E('div', {
                        'class': 'td'
                    }, [
                        E('p', { 'class': '' }, _(device[idx].value.rssi + 'dBm'))
                    ]);
                } else if ('transferred' == idx) {
                    container_content = E('td', {
                        'class': 'td device-info'
                    }, [
                        E('p', {}, [
                            E('span', { 'class': '' }, [device[idx].value.rx]),
                            E('br'),
                            E('span', { 'class': '' }, [device[idx].value.tx])
                        ])
                    ]);
                } else {
                    container_content = E('td', {
                        'class': 'td device-info'
                    }, [
                        E('p', {}, [
                            E('span', { 'class': '' }, [device[idx].value])
                        ])
                    ]);
                }

                container_devices_item.appendChild(container_content);
            }

            container_devices.appendChild(container_devices_item);
        }

        container_box.appendChild(container_devices);
        container_wapper.appendChild(container_box);

        return container_wapper;
    },

    renderUpdateData: function (radios, networks, hosthints) {
        for (var i = 0; i < radios.sort(function (a, b) {
            a.getName() > b.getName();
        }).length; i++) {

            var network_items = networks.filter(function (net) {
                return net.getWifiDeviceName() == radios[i].getName();
            });

            for (var j = 0; j < network_items.length; j++) {
                var net = network_items[j],
                    is_assoc = (net.getBSSID() != '00:00:00:00:00:00' &&
                        net.getChannel() && !net.isDisabled()),
                    chan = net.getChannel(),
                    freq = net.getFrequency(),
                    rate = net.getBitRate();

                this.params.wifi.radios.push({
                    ssid: {
                        title: _('اسم الشبكة'),
                        visible: true,
                        value: net.getActiveSSID() || '?'
                    },
                    chan: {
                        title: _('القناة'),
                        visible: true,
                        value: chan ? '%d (%.3f %s)'.format(chan, freq, _('جيجاهرتز')) : '-'
                    },
                    rate: {
                        title: _('معدل النقل'),
                        visible: true,
                        value: rate ? '%d %s'.format(rate, _('ميجابت/ث')) : '-'
                    },
                    associations: {
                        title: _('الأجهزة المتصلة'),
                        visible: true,
                        value: is_assoc ? (net.assoclist.length || '0') : 0
                    }
                });
            }
        }

        for (var i = 0; i < networks.length; i++) {
            for (var k = 0; k < networks[i].assoclist.length; k++) {
                var bss = networks[i].assoclist[k],
                    mac = bss.mac;  // التعديل هنا لاستخدام MAC بدلاً من الاسم

                var progress_style;
                var defaultNF = -90;
                var defaultCeil = -30;

                var q = 100 * (
                    (bss.signal - (bss.noise ? bss.noise : defaultNF)) /
                    (defaultCeil - (bss.noise ? bss.noise : defaultNF))
                );

                if (q == 0 || q < 25)
                    progress_style = 'bg-danger';
                else if (q < 50)
                    progress_style = 'bg-warning';
                else if (q < 75)
                    progress_style = 'bg-success';
                else
                    progress_style = 'bg-success';

                this.params.wifi.devices.push({
                    hostname: {
                        title: _('الجهاز  MAC'),  // تعديل العنوان هنا ليعرض "عنوان MAC"
                        visible: true,
                        value: mac || '?'  // هنا نعرض MAC بدلاً من الاسم
                    },
                    ssid: {
                        title: _('اسم الشبكة'),
                        visible: true,
                        value: networks[i].getActiveSSID()
                    },
                    progress: {
                        title: _('قوة الإشارة'),
                        visible: true,
                        value: {
                            qualite: q,
                            rssi: bss.signal,
                            style: progress_style
                        }
                    },
                    transferred: {
                        title: _('تم نقل البيانات'),
                        visible: true,
                        value: {
                            rx: '%s'.format('%.2mB'.format(bss.rx.bytes)),
                            tx: '%s'.format('%.2mB'.format(bss.tx.bytes))
                        }
                    }
                });
            }
        }
    },

    render: function (data) {
        this.params.wifi = {
            radios: [],
            devices: []
        };

        this.renderUpdateData(data[0], data[1], data[2]);

        if (this.params.wifi.radios.length)
            return this.renderHtml();

        return E([]);
    }
});
