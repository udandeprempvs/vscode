/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import * as marked from '../../../../base/common/marked/marked.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { ViewPane, IViewPaneOptions } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IChatMessage, IXorvisService } from '../common/xorvis.js';

import './xorvis.css';

export class XorvisViewPane extends ViewPane {

	private _messagesContainer!: HTMLElement;
	private _inputArea!: HTMLTextAreaElement;
	private _sendButton!: HTMLButtonElement;
	private _isSending = false;

	private readonly _paneDisposables = this._register(new DisposableStore());

	constructor(
		options: IViewPaneOptions,
		@IXorvisService private readonly xorvisService: IXorvisService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const root = DOM.append(container, DOM.$('.xorvis-container'));

		this._messagesContainer = DOM.append(root, DOM.$('.xorvis-messages'));

		const inputArea = DOM.append(root, DOM.$('.xorvis-input-area'));
		this._inputArea = DOM.append(inputArea, DOM.$('textarea.xorvis-input')) as HTMLTextAreaElement;
		this._inputArea.placeholder = 'Ask Xorvis AI...';
		this._inputArea.rows = 3;

		this._sendButton = DOM.append(inputArea, DOM.$('button.xorvis-send-btn')) as HTMLButtonElement;
		this._sendButton.textContent = 'Send';

		this._paneDisposables.add(DOM.addDisposableListener(this._sendButton, DOM.EventType.CLICK, () => this._send()));
		this._paneDisposables.add(DOM.addDisposableListener(this._inputArea, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this._send();
			}
		}));

		this._paneDisposables.add(this.xorvisService.onDidChangeMessages(() => this._renderMessages()));
		this._renderMessages();
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}

	private _renderMessages(): void {
		if (!this._messagesContainer) {
			return;
		}
		DOM.clearNode(this._messagesContainer);

		const messages = this.xorvisService.messages;
		if (messages.length === 0) {
			const empty = DOM.append(this._messagesContainer, DOM.$('.xorvis-empty'));
			empty.textContent = 'Start chatting with Xorvis AI. Your active file and workspace context will be sent automatically.';
			return;
		}

		for (const msg of messages) {
			this._renderMessage(msg);
		}

		// Scroll to bottom
		this._messagesContainer.scrollTop = this._messagesContainer.scrollHeight;
	}

	private _renderMessage(msg: IChatMessage): void {
		const wrapper = DOM.append(this._messagesContainer, DOM.$('.xorvis-message.' + msg.role));
		const label = DOM.append(wrapper, DOM.$('.xorvis-message-label'));
		label.textContent = msg.role === 'user' ? 'You' : 'Xorvis';
		const content = DOM.append(wrapper, DOM.$('.xorvis-message-content'));

		if (msg.role === 'assistant') {
			const html = marked.marked(msg.content) as string;
			content.innerHTML = html;
		} else {
			content.textContent = msg.content;
		}
	}

	private async _send(): Promise<void> {
		if (this._isSending) {
			return;
		}
		const text = this._inputArea.value.trim();
		if (!text) {
			return;
		}

		this._isSending = true;
		this._inputArea.value = '';
		this._sendButton.textContent = '...';
		this._sendButton.disabled = true;
		this._inputArea.disabled = true;

		try {
			await this.xorvisService.sendMessage(text);
		} finally {
			this._isSending = false;
			this._sendButton.textContent = 'Send';
			this._sendButton.disabled = false;
			this._inputArea.disabled = false;
			this._inputArea.focus();
		}
	}
}
