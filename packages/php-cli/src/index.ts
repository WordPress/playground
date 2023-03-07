/**
 * A CLI script that runs PHP CLI via the WebAssembly build.
 */
import { writeFileSync, existsSync } from 'fs';
import { rootCertificates } from 'tls';

import {
	initOutboundWebsocketProxyServer,
	addSocketOptionsSupportToWebSocketClass,
} from './outbound-ws-to-tcp-proxy';
import { addTCPServerToWebSocketServerClass } from './inbound-tcp-to-ws-proxy';
import { findFreePorts } from './utils';
// @ts-ignore
import defaultPhpIniPath from './php.ini';

let args = process.argv.slice(2);
if (!args.length) {
	args = ['--help'];
}

// Write the ca-bundle.crt file to disk so that PHP can find it.
const caBundlePath = __dirname + '/ca-bundle.crt';
if (!existsSync(caBundlePath)) {
	writeFileSync(caBundlePath, rootCertificates.join('\n'));
}

async function main() {
	const { startPHP, getPHPLoaderModule } = await import('@wordpress/php-wasm/build/node/php.js');
	const phpVersion = process.env.PHP || '8.2';

	const [inboundProxyWsServerPort, outboundProxyWsServerPort] =
		await findFreePorts(2);

	await initOutboundWebsocketProxyServer(outboundProxyWsServerPort);

	// This dynamic import only works after the build step
	// when the PHP files are present in the same directory
	// as this script.
	const phpLoaderModule = await getPHPLoaderModule(phpVersion);
	const php = await startPHP(phpLoaderModule, 'NODE', {
		ENV: {
			...process.env,
			TERM: 'xterm',
		},
		websocket: {
			url: (_, host, port) => {
				const query = new URLSearchParams({ host, port }).toString();
				return `ws://127.0.0.1:${outboundProxyWsServerPort}/?${query}`;
			},
			subprotocol: 'binary',
			decorator: addSocketOptionsSupportToWebSocketClass,
			serverDecorator: addTCPServerToWebSocketServerClass.bind(
				null,
				inboundProxyWsServerPort
			),
		},
	});
	const hasMinusCOption = args.some((arg) => arg.startsWith('-c'));
	if (!hasMinusCOption) {
		args.unshift('-c', defaultPhpIniPath);
	}
	php.writeFile(caBundlePath, rootCertificates.join('\n'));
	args.unshift('-d', `openssl.cafile=${caBundlePath}`);
	php.cli(['php', ...args]).catch((result) => {
		if (result.name === 'ExitStatus') {
			process.exit(result.status === undefined ? 1 : result.status);
		}
		throw result;
	});
}

main();
