/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IAgentRequest, IAgentResponse } from '../common/xorvis.js';

export class AgentClient {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	async chat(request: IAgentRequest, signal?: AbortSignal): Promise<IAgentResponse> {
		const endpoint = this.configurationService.getValue<string>('xorvis.apiEndpoint') || 'http://localhost:8000/chat';

		// The API is GET /chat?query=<last user message>
		const lastUserMessage = [...request.messages].reverse().find(m => m.role === 'user');
		const query = lastUserMessage?.content ?? '';
		const url = new URL(endpoint);
		url.searchParams.set('query', query);

		const timeoutController = new AbortController();
		const timeoutId = setTimeout(() => timeoutController.abort('timeout'), 30_000);

		// Combine user-provided signal with the timeout signal
		const combinedController = new AbortController();
		const onSignalAbort = () => combinedController.abort(signal?.reason);
		const onTimeoutAbort = () => combinedController.abort('timeout');
		signal?.addEventListener('abort', onSignalAbort);
		timeoutController.signal.addEventListener('abort', onTimeoutAbort);

		let response: Response;
		try {
			response = await fetch(url.toString(), {
				method: 'GET',
				signal: combinedController.signal,
			});
		} catch (err) {
			clearTimeout(timeoutId);
			signal?.removeEventListener('abort', onSignalAbort);
			timeoutController.signal.removeEventListener('abort', onTimeoutAbort);

			if (err instanceof Error && err.name === 'AbortError') {
				if (timeoutController.signal.aborted) {
					const timeoutErr = new Error('Request timed out after 30 seconds. Is your agent running?');
					console.error('Xorvis AI error:', timeoutErr);
					throw timeoutErr;
				}
				// User-initiated cancel — re-throw as-is so caller can detect it
				throw err;
			}
			const networkErr = new Error(`Xorvis AI: Unable to reach agent at ${endpoint}. Is your agent running? (${err})`);
			console.error('Xorvis AI error:', networkErr);
			throw networkErr;
		} finally {
			clearTimeout(timeoutId);
			signal?.removeEventListener('abort', onSignalAbort);
			timeoutController.signal.removeEventListener('abort', onTimeoutAbort);
		}

		if (!response.ok) {
			const text = await response.text().catch(() => '');
			const httpErr = new Error(`Xorvis AI: Agent returned HTTP ${response.status}. ${text}`);
			console.error('Xorvis AI error:', httpErr);
			throw httpErr;
		}

		// Backend returns { "response": "..." } — map to internal IAgentResponse shape
		const data = await response.json() as { response: string };
		return { content: data.response };
	}
}
