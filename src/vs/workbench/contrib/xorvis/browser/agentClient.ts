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

	async chat(request: IAgentRequest): Promise<IAgentResponse> {
		const endpoint = this.configurationService.getValue<string>('xorvis.apiEndpoint') || 'http://localhost:8000/chat';

		let response: Response;
		try {
			response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(request),
			});
		} catch (err) {
			throw new Error(`Xorvis AI: Unable to reach agent at ${endpoint}. Is your agent running? (${err})`);
		}

		if (!response.ok) {
			const text = await response.text().catch(() => '');
			throw new Error(`Xorvis AI: Agent returned HTTP ${response.status}. ${text}`);
		}

		const data = await response.json() as IAgentResponse;
		return data;
	}
}
