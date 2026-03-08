/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IBulkEditService, ResourceTextEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IChatMessage, IXorvisService } from '../common/xorvis.js';
import { AgentClient } from './agentClient.js';
import { IDEBridge } from './ideBridge.js';

export class XorvisService extends Disposable implements IXorvisService {

	declare readonly _serviceBrand: undefined;

	private readonly _messages: IChatMessage[] = [];
	private readonly _onDidChangeMessages = this._register(new Emitter<void>());
	readonly onDidChangeMessages: Event<void> = this._onDidChangeMessages.event;

	private readonly _bridge: IDEBridge;
	private readonly _agentClient: AgentClient;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this._bridge = instantiationService.createInstance(IDEBridge);
		this._agentClient = instantiationService.createInstance(AgentClient);
	}

	get messages(): readonly IChatMessage[] {
		return this._messages;
	}

	async sendMessage(content: string): Promise<void> {
		const userMessage: IChatMessage = { role: 'user', content, timestamp: Date.now() };
		this._messages.push(userMessage);
		this._onDidChangeMessages.fire();

		const currentFile = this._bridge.getCurrentFileContext();
		const workspaceFiles = await this._bridge.getWorkspaceFiles();

		let responseContent: string;
		try {
			const response = await this._agentClient.chat({
				messages: this._messages.slice(),
				context: { currentFile, workspaceFiles },
			});
			responseContent = response.content;

			if (response.patches && response.patches.length > 0) {
				await this._applyPatches(response.patches);
			}
		} catch (err) {
			responseContent = `**Error:** ${err instanceof Error ? err.message : String(err)}`;
		}

		const assistantMessage: IChatMessage = { role: 'assistant', content: responseContent, timestamp: Date.now() };
		this._messages.push(assistantMessage);
		this._onDidChangeMessages.fire();
	}

	clearHistory(): void {
		this._messages.length = 0;
		this._onDidChangeMessages.fire();
	}

	private async _applyPatches(patches: import('../common/xorvis.js').IAgentPatch[]): Promise<void> {
		const folders = this.workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return;
		}
		const workspaceRoot = folders[0].uri;

		const edits: ResourceTextEdit[] = patches.map(patch => {
			const fileUri = joinPath(workspaceRoot, patch.file);
			return new ResourceTextEdit(fileUri, {
				range: {
					startLineNumber: patch.start,
					startColumn: 1,
					endLineNumber: patch.end,
					endColumn: Number.MAX_SAFE_INTEGER,
				},
				text: patch.code,
			});
		});

		try {
			await this.bulkEditService.apply(edits);
			this.notificationService.info(
				patches.length === 1
					? 'Xorvis AI applied 1 edit.'
					: `Xorvis AI applied ${patches.length} edits.`
			);
		} catch (err) {
			this.notificationService.error(`Xorvis AI: Failed to apply edits. ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}
