'use strict';
'require view';
'require ui';
'require fs';

const CORE_PATH = '/usr/libexec/mkntt/hidden/mkntt-core.js';

let _coreTextPromise;
let _coreSpecPromise;

function _mkErrNode(err) {
	const msg = (err && (err.message || err.error)) ? (err.message || err.error) : String(err || 'Unknown error');
	const stack = (err && err.stack) ? String(err.stack) : '';

	return E('div', { 'class': 'cbi-section' }, [
		E('div', { 'class': 'alert-message error' }, [
			E('h4', {}, [ _('MKNTT loader error') ]),
			E('p', {}, [ _('The hidden core view failed to load or execute.') ]),
			E('pre', { 'style': 'white-space:pre-wrap; word-break:break-word; margin:0.75em 0 0;' }, [ msg + (stack ? ('\n\n' + stack) : '') ])
		])
	]);
}

function _loadCoreSpec() {
	if (!_coreSpecPromise) {
		_coreTextPromise = _coreTextPromise || fs.read(CORE_PATH).catch(function(err) {
			// Match the known-good pattern: do not throw raw PermissionError to console as unhandled.
			return '';
		});

		_coreSpecPromise = _coreTextPromise.then(function(code) {
			if (!code || !code.trim())
				throw new Error('ACL? Unable to read hidden core: ' + CORE_PATH);

			let fn;
			try {
				fn = new Function('view', 'ui', 'fs', 'L', 'E', '_', 'XHR', code);
			}
			catch (e) {
				throw new Error('CompileError: ' + (e && e.message ? e.message : String(e)));
			}

			let spec;
			try {
				spec = fn(view, ui, fs, L, E, _, XHR);
			}
			catch (e) {
				throw e;
			}

			if (!spec || typeof spec !== 'object')
				throw new Error('BadExport: hidden core did not return an object spec');

			if (typeof spec.render !== 'function')
				throw new Error('BadExport: spec.render is not a function');

			// load() optional
			return spec;
		});
	}
	return _coreSpecPromise;
}

function _bindSpecIntoInstance(self, spec) {
	if (self.__mkntt_bound)
		return;

	for (let k in spec) {
		// Keep wrapper error-handling in stub; do not overwrite load/render on the instance.
		if (k === 'load' || k === 'render')
			continue;
		self[k] = spec[k];
	}
	self.__mkntt_bound = true;
}

return view.extend({
	async load() {
		const spec = await _loadCoreSpec();
		_bindSpecIntoInstance(this, spec);
		if (typeof spec.load === 'function')
			return await spec.load.apply(this, arguments);
	},

	async render() {
		try {
			const spec = await _loadCoreSpec();
			_bindSpecIntoInstance(this, spec);
			return await spec.render.apply(this, arguments);
		}
		catch (e) {
			return _mkErrNode(e);
		}
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
