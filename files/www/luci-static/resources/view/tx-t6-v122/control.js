'use strict';
'require view';
'require fs';
'require ui';

return view.extend({
	load: function() {
		return L.resolveDefault(fs.exec('/usr/libexec/tx-t6', [ 'status' ]), {
			code: 1,
			stdout: '',
			stderr: 'status_failed'
		});
	},

	parseResult: function(result) {
		var data;

		try {
			data = JSON.parse((result && result.stdout) || '');
		}
		catch (e) {
			throw new Error((result && result.stderr) || _('تعذر قراءة استجابة الأداة'));
		}

		if (!data.ok)
			throw new Error(data.error || _('فشلت العملية'));

		return data;
	},

	stagePercentages: function(data) {
		var raw = String(data.range_stage_percentages || '25 50 75 100').trim();
		var parts = raw ? raw.split(/\s+/) : [];
		var result = [];

		for (var i = 0; i < parts.length; i++) {
			var value = Number(parts[i]);
			if (isFinite(value) && value > 0 && value <= 100)
				result.push(value);
		}

		return result.length ? result : [ 25, 50, 75, 100 ];
	},

	stageLevel: function(maxLevel, percent) {
		if (maxLevel <= 0)
			return 0;

		return Math.max(1, Math.min(maxLevel, Math.round(maxLevel * percent / 100)));
	},

	stageLabel: function(level, maxLevel, stages) {
		if (!isFinite(level) || level < 0)
			return _('إعداد سابق غير معروف');

		if (level === 0)
			return _('الوضع الافتراضي');

		for (var i = 0; i < stages.length; i++) {
			if (this.stageLevel(maxLevel, stages[i]) === level)
				return _('زيادة المدى بنسبة ') + stages[i] + '%';
		}

		return _('إعداد سابق محفوظ');
	},

	makeOptions: function(maxLevel, currentLevel, stages) {
		var options = [];
		var currentMapped = currentLevel === 0;

		if (!isFinite(currentLevel) || currentLevel < 0) {
			options.push(E('option', { 'value': '-1' }, _('إعداد سابق غير معروف')));
		}

		options.push(E('option', { 'value': '0' }, _('الوضع الافتراضي')));

		for (var i = 0; i < stages.length; i++) {
			if (this.stageLevel(maxLevel, stages[i]) === currentLevel)
				currentMapped = true;
		}

		if (currentLevel > 0 && !currentMapped)
			options.push(E('option', { 'value': String(currentLevel) }, _('إعداد سابق محفوظ')));

		for (var j = 0; j < stages.length; j++) {
			var level = this.stageLevel(maxLevel, stages[j]);
			options.push(E('option', { 'value': String(level) }, _('زيادة المدى بنسبة ') + stages[j] + '%'));
		}

		return options;
	},

	stateIsKnown: function(data) {
		return !!data && data.known_2g !== false && data.known_5g !== false && Number(data.level_2g) >= 0 && Number(data.level_5g) >= 0;
	},

	updateReadyBadge: function(data) {
		var badge = document.getElementById('txp-ready-state');
		if (!badge)
			return;

		if (this.stateIsKnown(data)) {
			badge.className = 'txp-ready';
			badge.textContent = _('جاهز');
		}
		else {
			badge.className = 'txp-attention';
			badge.textContent = _('جاهز لإعادة الضبط');
		}
	},

	errorText: function(error) {
		var code = String(error && error.message || error);
		var messages = {
			'shadow_partition_not_found': _('تعذر الوصول إلى بيانات الواي فاي المهيأة.'),
			'shadow_device_not_found': _('تعذر الوصول إلى مساحة إعداد الواي فاي.'),
			'invalid_shadow_partition_size': _('مساحة إعداد الواي فاي غير متوافقة مع هذا الجهاز.'),
			'shadow_partition_not_writable': _('مساحة إعداد الواي فاي غير قابلة للكتابة.'),
			'invalid_2g_signature': _('بيانات نطاق 2.4GHz غير متوافقة.'),
			'invalid_5g_signature': _('بيانات نطاق 5GHz غير متوافقة.'),
			'module_not_loaded': _('تعذر العثور على تعريف الواي فاي المطلوب.'),
			'unknown_current_2g_values': _('الإعداد الحالي لنطاق 2.4GHz غير معروف.'),
			'unknown_current_5g_values': _('الإعداد الحالي لنطاق 5GHz غير معروف.'),
			'operation_in_progress': _('توجد عملية أخرى قيد التنفيذ.'),
			'shadow_read_failed': _('تعذر قراءة إعدادات الواي فاي.'),
			'shadow_write_failed': _('تعذر حفظ التغييرات.'),
			'unexpected_shadow_difference': _('تم إيقاف العملية لحماية بيانات الجهاز.'),
			'live_2g_verify_failed': _('تعذر التحقق من إعداد نطاق 2.4GHz.'),
			'live_5g_verify_failed': _('تعذر التحقق من إعداد نطاق 5GHz.'),
			'module_reload_failed': _('تم حفظ الإعدادات، لكن تعذر تفعيلها الآن.'),
			'select_valid_level': _('اختر مستوى صالحًا لكل نطاق قبل الحفظ.')
		};

		if (code.indexOf('invalid_config_') === 0)
			return _('إعدادات الحزمة الداخلية غير صحيحة.');

		return messages[code] || code;
	},

	showError: function(error) {
		ui.showModal(_('تعذر تنفيذ العملية'), [
			E('p', { 'class': 'alert-message error' }, this.errorText(error)),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('إغلاق'))
			])
		]);
	},

	syncState: function(data) {
		var runtime = this.runtimeData || {};
		var stages = this.stagePercentages(runtime);
		var select2g = document.getElementById('txp-level-2g');
		var select5g = document.getElementById('txp-level-5g');
		var current2g = document.getElementById('txp-current-2g');
		var current5g = document.getElementById('txp-current-5g');
		var selected2g = document.getElementById('txp-selected-2g');
		var selected5g = document.getElementById('txp-selected-5g');
		var saveButton = document.getElementById('txp-save');

		runtime.level_2g = data.level_2g;
		runtime.level_5g = data.level_5g;
		runtime.known_2g = data.known_2g !== false && Number(data.level_2g) >= 0;
		runtime.known_5g = data.known_5g !== false && Number(data.level_5g) >= 0;
		runtime.profile_2g = data.profile_2g || runtime.profile_2g || 'fact1';
		runtime.profile_5g = data.profile_5g || runtime.profile_5g || 'fact1';
		this.runtimeData = runtime;

		if (select2g)
			select2g.value = String(data.level_2g);
		if (select5g)
			select5g.value = String(data.level_5g);
		if (current2g)
			current2g.textContent = this.stageLabel(data.level_2g, runtime.max_level_2g, stages);
		if (current5g)
			current5g.textContent = this.stageLabel(data.level_5g, runtime.max_level_5g, stages);
		if (selected2g)
			selected2g.textContent = this.stageLabel(data.level_2g, runtime.max_level_2g, stages);
		if (selected5g)
			selected5g.textContent = this.stageLabel(data.level_5g, runtime.max_level_5g, stages);
		if (saveButton)
			saveButton.disabled = true;
		this.updateReadyBadge(runtime);
	},

	showApplied: function(data) {
		var runtime = this.runtimeData;
		var stages = this.stagePercentages(runtime);
		var activationText = _('تم حفظ الإعدادات بنجاح.');
		this.syncState(data);
		ui.showModal(_('تم تطبيق الإعدادات'), [
			E('div', { 'class': 'txp-success' }, [
				E('div', { 'class': 'txp-success-icon' }, '✓'),
				E('h3', {}, _('تم تطبيق زيادة مدى الواي فاي')),
				E('div', { 'class': 'txp-result-grid' }, [
					E('div', { 'class': 'txp-result-item' }, [
						E('span', {}, '2.4GHz'),
						E('strong', {}, this.stageLabel(data.level_2g, runtime.max_level_2g, stages))
					]),
					E('div', { 'class': 'txp-result-item' }, [
						E('span', {}, '5GHz'),
						E('strong', {}, this.stageLabel(data.level_5g, runtime.max_level_5g, stages))
					])
				]),
				E('p', {}, activationText),
				E('div', { 'class': 'right txp-modal-actions' }, [
					E('button', {
						'class': 'btn cbi-button-positive',
						'click': ui.hideModal
					}, _('تم'))
				])
			])
		]);
	},

	delay: function(ms) {
		return new Promise(function(resolve) {
			window.setTimeout(resolve, ms);
		});
	},

	verifyCommittedState: function(action, args, originalError) {
		var self = this;
		var target2g = action === 'restore' ? Number(self.runtimeData.restore_level_2g || 0) : Number(args && args[0]);
		var target5g = action === 'restore' ? Number(self.runtimeData.restore_level_5g || 0) : Number(args && args[1]);
		var attempts = 10;

		function check() {
			return self.delay(2000).then(function() {
				return L.resolveDefault(fs.exec('/usr/libexec/tx-t6', [ 'status' ]), null);
			}).then(function(result) {
				if (result) {
					try {
						var data = self.parseResult(result);
						if (Number(data.level_2g) === target2g && Number(data.level_5g) === target5g) {
							data.changed = true;
							data.activation_pending = false;
							self.showApplied(data);
							return true;
						}
					}
					catch (e) { }
				}

				attempts--;
				if (attempts > 0)
					return check();
				throw originalError;
			});
		}

		return check();
	},

	runAction: function(action, args) {
		var self = this;

		ui.showModal(_('جارٍ تطبيق الإعدادات'), [
			E('p', { 'class': 'spinning' }, _('يرجى الانتظار حتى تكتمل العملية.'))
		]);

		return fs.exec('/usr/libexec/tx-t6', [ action ].concat(args || []))
			.then(function(result) {
				var data = self.parseResult(result);

				if (!data.changed) {
					self.syncState(data);
					ui.showModal(_('لا توجد تغييرات'), [
						E('p', {}, _('المراحل المختارة مطبقة بالفعل.')),
						E('div', { 'class': 'right' }, [
							E('button', { 'class': 'btn', 'click': ui.hideModal }, _('إغلاق'))
						])
					]);
					return;
				}

				self.showApplied(data);
			})
			.catch(function(error) {
				return self.verifyCommittedState(action, args || [], error)
					.catch(function(finalError) {
						self.showError(finalError);
					});
			});
	},

	confirmApply: function() {
		var self = this;
		var data = self.runtimeData;
		var stages = self.stagePercentages(data);
		var level2g = Number(document.getElementById('txp-level-2g').value);
		var level5g = Number(document.getElementById('txp-level-5g').value);

		if (!isFinite(level2g) || !isFinite(level5g) || level2g < 0 || level5g < 0) {
			self.showError(new Error('select_valid_level'));
			return;
		}

		ui.showModal(_('تأكيد التغييرات'), [
			E('div', { 'class': 'txp-confirm-grid' }, [
				E('div', { 'class': 'txp-confirm-item' }, [
					E('span', {}, '2.4GHz'),
					E('strong', {}, self.stageLabel(level2g, data.max_level_2g, stages))
				]),
				E('div', { 'class': 'txp-confirm-item' }, [
					E('span', {}, '5GHz'),
					E('strong', {}, self.stageLabel(level5g, data.max_level_5g, stages))
				])
			]),
			E('p', {}, _('هل تريد تطبيق المراحل المختارة؟')),
			E('div', { 'class': 'right txp-modal-actions' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('إلغاء')),
				E('button', {
					'class': 'btn cbi-button-positive',
					'click': function() {
						ui.hideModal();
						self.runAction('apply', [ String(level2g), String(level5g) ]);
					}
				}, _('تطبيق'))
			])
		]);
	},

	confirmRestore: function() {
		var self = this;

		ui.showModal(_('استعادة الوضع الافتراضي'), [
			E('p', {}, _('ستتم إعادة نطاقي 2.4GHz و5GHz إلى الوضع الافتراضي.')),
			E('div', { 'class': 'right txp-modal-actions' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('إلغاء')),
				E('button', {
					'class': 'btn cbi-button-negative',
					'click': function() {
						ui.hideModal();
						self.runAction('restore');
					}
				}, _('استعادة'))
			])
		]);
	},

	render: function(result) {
		var self = this;
		var data;

		try {
			data = self.parseResult(result);
			self.runtimeData = data;
		}
		catch (error) {
			return E('div', { 'class': 'cbi-map' }, [
				E('h2', {}, _('زيادة مدى الواي فاي')),
				E('div', { 'class': 'alert-message error' }, self.errorText(error))
			]);
		}

		var stages = self.stagePercentages(data);
		var select2g = E('select', {
			'id': 'txp-level-2g',
			'class': 'cbi-input-select txp-select'
		}, self.makeOptions(data.max_level_2g, data.level_2g, stages));
		var select5g = E('select', {
			'id': 'txp-level-5g',
			'class': 'cbi-input-select txp-select'
		}, self.makeOptions(data.max_level_5g, data.level_5g, stages));
		var selected2g = E('strong', { 'id': 'txp-selected-2g' });
		var selected5g = E('strong', { 'id': 'txp-selected-5g' });
		var saveButton = E('button', {
			'id': 'txp-save',
			'class': 'btn cbi-button-positive txp-save',
			'click': function() {
				self.confirmApply();
			}
		}, _('حفظ التغييرات'));

		select2g.value = String(data.level_2g);
		select5g.value = String(data.level_5g);

		function updateSelection() {
			var level2g = Number(select2g.value);
			var level5g = Number(select5g.value);
			var invalid = !isFinite(level2g) || !isFinite(level5g) || level2g < 0 || level5g < 0;
			var unchanged = level2g === Number(self.runtimeData.level_2g) && level5g === Number(self.runtimeData.level_5g);

			selected2g.textContent = self.stageLabel(level2g, data.max_level_2g, stages);
			selected5g.textContent = self.stageLabel(level5g, data.max_level_5g, stages);
			saveButton.disabled = invalid || unchanged;
		}

		select2g.addEventListener('change', updateSelection);
		select5g.addEventListener('change', updateSelection);
		updateSelection();

		return E('div', { 'class': 'cbi-map txp-page' }, [
			E('style', {},
				'.txp-page{max-width:980px;margin:0 auto;color:var(--text-color-high,inherit)}.txp-hero{position:relative;overflow:hidden;padding:24px 26px;border-radius:16px;background:linear-gradient(135deg,#2458d8 0%,#5579eb 62%,#718df2 100%);color:#fff;margin-bottom:18px;box-shadow:0 10px 28px rgba(36,88,216,.2)}.txp-hero:after{content:"";position:absolute;width:180px;height:180px;border-radius:50%;background:rgba(255,255,255,.09);inset:-90px -45px auto auto}.txp-hero h2{position:relative;color:#fff;margin:0 0 8px;font-size:25px}.txp-hero p{position:relative;margin:0;opacity:.92;font-size:15px}.txp-shell{background:var(--background-color-high,#fff);border:1px solid rgba(127,127,127,.18);border-radius:16px;padding:22px;box-shadow:0 6px 22px rgba(0,0,0,.055)}.txp-topline{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid rgba(127,127,127,.16)}.txp-device{display:flex;align-items:center;gap:9px}.txp-device-label{color:var(--text-color-medium,#6b7280)}.txp-ready{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:rgba(46,204,113,.12);color:#20a45a;font-size:12px;font-weight:700}.txp-ready:before{content:"";width:7px;height:7px;border-radius:50%;background:#2ecc71}.txp-attention{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;background:rgba(255,184,0,.13);color:#b27600;font-size:12px;font-weight:700}.txp-attention:before{content:"";width:7px;height:7px;border-radius:50%;background:#e4a000}.txp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.txp-card{position:relative;border:1px solid rgba(127,127,127,.2);border-radius:14px;padding:20px;background:linear-gradient(180deg,rgba(49,91,234,.035),transparent 55%);transition:border-color .2s,box-shadow .2s}.txp-card:focus-within{border-color:rgba(49,91,234,.55);box-shadow:0 0 0 3px rgba(49,91,234,.08)}.txp-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:18px}.txp-band{margin:0;font-size:20px}.txp-band-tag{padding:4px 9px;border-radius:999px;background:rgba(49,91,234,.1);color:#315bea;font-size:11px;font-weight:700}.txp-values-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}.txp-value{display:flex;flex-direction:column;gap:4px;padding:11px 12px;border-radius:10px;background:rgba(127,127,127,.07)}.txp-value span{font-size:12px;color:var(--text-color-medium,#6b7280)}.txp-value strong{font-size:16px;color:#315bea;line-height:1.45}.txp-field-label{display:block;margin-bottom:7px;font-size:13px;font-weight:600}.txp-select{width:100%;min-height:44px;border-radius:9px}.txp-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:20px;padding-top:18px;border-top:1px solid rgba(127,127,127,.16)}.txp-actions .btn{min-height:40px;border-radius:8px}.txp-save{min-width:150px}.txp-save:disabled{opacity:.5;cursor:not-allowed}.txp-note{display:flex;gap:10px;margin-top:16px;padding:12px 14px;border-radius:10px;background:rgba(255,184,0,.1);color:var(--text-color-medium,#5f6368);font-size:13px;line-height:1.65}.txp-note-icon{color:#d59300;font-weight:800}.txp-note-text{display:flex;flex-direction:column;gap:5px}.txp-disclaimer{font-size:12px;opacity:.9}.txp-success{text-align:center;padding:8px 14px}.txp-success-icon{width:54px;height:54px;line-height:54px;border-radius:50%;background:#2ecc71;color:#fff;font-size:29px;margin:0 auto 12px}.txp-result-grid,.txp-confirm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}.txp-result-item,.txp-confirm-item{display:flex;justify-content:space-between;gap:12px;padding:12px;border-radius:9px;background:rgba(127,127,127,.08)}.txp-modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}@media(max-width:700px){.txp-page{margin:0}.txp-hero{padding:20px}.txp-shell{padding:14px}.txp-grid{grid-template-columns:1fr}.txp-topline{align-items:flex-start}.txp-values-row{gap:8px}.txp-actions{display:grid}.txp-actions .btn{width:100%}}'),
			E('div', { 'class': 'txp-hero' }, [
				E('h2', {}, _('زيادة مدى الواي فاي')),
				E('p', {}, _('اختر مستوى زيادة المدى المناسب لكل نطاق ثم احفظ التغييرات.'))
			]),
			E('div', { 'class': 'txp-shell' }, [
				E('div', { 'class': 'txp-topline' }, [
					E('div', { 'class': 'txp-device' }, [
						E('span', { 'class': 'txp-device-label' }, _('الجهاز')),
						E('strong', {}, data.model)
					]),
					E('span', { 'id': 'txp-ready-state', 'class': self.stateIsKnown(data) ? 'txp-ready' : 'txp-attention' }, self.stateIsKnown(data) ? _('جاهز') : _('جاهز لإعادة الضبط'))
				]),
				E('div', { 'class': 'txp-grid' }, [
					E('section', { 'class': 'txp-card' }, [
						E('div', { 'class': 'txp-card-head' }, [
							E('h3', { 'class': 'txp-band' }, '2.4GHz'),
							E('span', { 'class': 'txp-band-tag' }, _('تغطية أوسع'))
						]),
						E('div', { 'class': 'txp-values-row' }, [
							E('div', { 'class': 'txp-value' }, [
								E('span', {}, _('الحالية')),
								E('strong', { 'id': 'txp-current-2g' }, self.stageLabel(data.level_2g, data.max_level_2g, stages))
							]),
							E('div', { 'class': 'txp-value' }, [
								E('span', {}, _('المختارة')),
								selected2g
							])
						]),
						E('label', { 'class': 'txp-field-label', 'for': 'txp-level-2g' }, _('زيادة المدى')),
						select2g
					]),
					E('section', { 'class': 'txp-card' }, [
						E('div', { 'class': 'txp-card-head' }, [
							E('h3', { 'class': 'txp-band' }, '5GHz'),
							E('span', { 'class': 'txp-band-tag' }, _('تغطية محسنة'))
						]),
						E('div', { 'class': 'txp-values-row' }, [
							E('div', { 'class': 'txp-value' }, [
								E('span', {}, _('الحالية')),
								E('strong', { 'id': 'txp-current-5g' }, self.stageLabel(data.level_5g, data.max_level_5g, stages))
							]),
							E('div', { 'class': 'txp-value' }, [
								E('span', {}, _('المختارة')),
								selected5g
							])
						]),
						E('label', { 'class': 'txp-field-label', 'for': 'txp-level-5g' }, _('زيادة المدى')),
						select5g
					])
				]),
				E('div', { 'class': 'txp-actions' }, [
					saveButton,
					E('button', {
						'class': 'btn cbi-button-neutral',
						'click': function() {
							self.confirmRestore();
						}
					}, _('استعادة الافتراضي'))
				]),
				E('div', { 'class': 'txp-note' }, [
					E('span', { 'class': 'txp-note-icon' }, '!'),
					E('div', { 'class': 'txp-note-text' }, [
						E('span', {}, _('استخدام مستويات مرتفعة قد يزيد الحرارة والتشويش. اختر القوة المناسبة لحاجة الشبكة.')),
						E('span', { 'class': 'txp-disclaimer' }, _('إخلاء المسؤولية: نسب زيادة المدى المعروضة تمثل مراحل ضبط تقديرية ولا تضمن زيادة فعلية بنفس النسبة، إذ تتأثر التغطية بالبيئة والعوائق والتداخل والأجهزة المتصلة.'))
					])
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
