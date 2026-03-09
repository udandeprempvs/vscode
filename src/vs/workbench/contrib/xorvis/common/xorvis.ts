/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export interface IChatMessage {
	role: 'user' | 'assistant';
	content: string;
	timestamp: number;
}

export interface IAgentPatch {
	file: string;
	start: number;
	end: number;
	code: string;
}

export interface IAgentRequest {
	messages: IChatMessage[];
	context: {
		currentFile?: { path: string; content: string };
		workspaceFiles: string[];
	};
}

export interface IAgentResponse {
	content: string;
	patches?: IAgentPatch[];
}

export const IXorvisService = createDecorator<IXorvisService>('xorvisService');

export interface IXorvisService {
	readonly _serviceBrand: undefined;
	readonly messages: readonly IChatMessage[];
	readonly onDidChangeMessages: Event<void>;
	readonly isProcessing: boolean;
	readonly onDidChangeProcessing: Event<boolean>;
	sendMessage(content: string): Promise<void>;
	cancelRequest(): void;
	clearHistory(): void;
}
