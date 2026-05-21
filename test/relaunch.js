'use strict';
const assert = require('assert');
const Module = require('module');

const loadWithStubs = ({defaultApp}) => {
	let changeHandler;
	const spawned = [];
	const electronState = {
		relaunchCalls: 0,
		exitCalls: 0,
		releaseCalls: 0,
	};

	const electronStub = {
		app: {
			on() {},
			relaunch() {
				electronState.relaunchCalls++;
			},
			exit() {
				electronState.exitCalls++;
			},
			releaseSingleInstanceLock() {
				electronState.releaseCalls++;
			},
		},
		BrowserWindow: {
			getAllWindows() {
				return [];
			},
		},
	};

	const watcherStub = {
		close() {},
		on(event, handler) {
			if (event === 'change') {
				changeHandler = handler;
			}

			return watcherStub;
		},
	};

	const originalLoad = Module._load;
	const originalArgv = process.argv;
	const originalDefaultApp = process.defaultApp;

	Module._load = function (request, parent, isMain) {
		if (request === 'electron') {
			return electronStub;
		}

		if (request === 'child_process') {
			return {
				spawn(command, arguments_, options) {
					spawned.push({command, arguments_, options});
					return {unref() {}};
				},
			};
		}

		if (request === 'chokidar') {
			return {watch: () => watcherStub};
		}

		if (request === 'electron-is-dev') {
			return true;
		}

		if (request === 'date-time') {
			return () => '00:00:00';
		}

		if (request === 'chalk') {
			return {bold: value => value, dim: value => value};
		}

		if (request === 'find-up') {
			return {sync: () => '/tmp/app/package.json'};
		}

		return originalLoad(request, parent, isMain);
	};

	Object.defineProperty(process, 'defaultApp', {
		value: defaultApp,
		configurable: true,
	});
	process.argv = ['/Applications/Electron.app/Contents/MacOS/Electron', '/tmp/app/main.js', '--inspect'];

	delete require.cache[require.resolve('../index.js')];
	const reloader = require('../index.js');
	reloader({filename: '/tmp/app/main.js', children: []}, {watchRenderer: false});

	assert.ok(changeHandler, 'Expected change handler to be registered');
	changeHandler('main.js');

	Module._load = originalLoad;
	process.argv = originalArgv;
	Object.defineProperty(process, 'defaultApp', {
		value: originalDefaultApp,
		configurable: true,
	});

	return {spawned, electronState};
};

{
	const {spawned, electronState} = loadWithStubs({defaultApp: true});
	assert.strictEqual(spawned.length, 1, 'default app path should spawn a replacement process');
	assert.strictEqual(spawned[0].command, '/Applications/Electron.app/Contents/MacOS/Electron');
	assert.deepStrictEqual(spawned[0].arguments_, ['/tmp/app/main.js', '--inspect']);
	assert.strictEqual(spawned[0].options.stdio, 'inherit');
	assert.strictEqual(electronState.releaseCalls, 1);
	assert.strictEqual(electronState.relaunchCalls, 0);
	assert.strictEqual(electronState.exitCalls, 1);
}

{
	const {spawned, electronState} = loadWithStubs({defaultApp: false});
	assert.strictEqual(spawned.length, 0, 'packaged path should keep using app.relaunch');
	assert.strictEqual(electronState.releaseCalls, 0);
	assert.strictEqual(electronState.relaunchCalls, 1);
	assert.strictEqual(electronState.exitCalls, 1);
}

console.log('ok');
