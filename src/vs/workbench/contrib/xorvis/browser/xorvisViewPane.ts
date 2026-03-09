/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { renderMarkdown } from '../../../../base/browser/markdownRenderer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
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
	private _loadingEl!: HTMLElement;
	private _inputArea!: HTMLTextAreaElement;
	private _actionButton!: HTMLButtonElement;

	private readonly _paneDisposables = this._register(new DisposableStore());
	private readonly _messageRenderStore = this._register(new DisposableStore());

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

		// Header
		const header = DOM.append(root, DOM.$('.xorvis-header'));
		const title = DOM.append(header, DOM.$('.xorvis-title'));
		title.textContent = 'Xorvis AI';
		const newChatBtn = DOM.append(header, DOM.$('button.xorvis-new-chat-btn')) as HTMLButtonElement;
		newChatBtn.title = 'New Chat';
		newChatBtn.textContent = '+ New Chat';

		// Messages
		this._messagesContainer = DOM.append(root, DOM.$('.xorvis-messages'));

		// Loading indicator
		this._loadingEl = DOM.append(root, DOM.$('.xorvis-loading'));
		for (let i = 0; i < 3; i++) {
			const dot = DOM.append(this._loadingEl, DOM.$('.xorvis-loading-dot'));
			dot.textContent = '●';
		}
		this._loadingEl.style.display = 'none';

		// Input area
		const inputArea = DOM.append(root, DOM.$('.xorvis-input-area'));
		this._inputArea = DOM.append(inputArea, DOM.$('textarea.xorvis-input')) as HTMLTextAreaElement;
		this._inputArea.placeholder = 'Ask Xorvis AI...';
		this._inputArea.rows = 1;

		this._actionButton = DOM.append(inputArea, DOM.$('button.xorvis-send-btn')) as HTMLButtonElement;
		this._actionButton.textContent = 'Send';

		// Auto-resize textarea
		this._paneDisposables.add(DOM.addDisposableListener(this._inputArea, DOM.EventType.INPUT, () => {
			this._inputArea.style.height = 'auto';
			this._inputArea.style.height = Math.min(this._inputArea.scrollHeight, 120) + 'px';
		}));

		// New chat
		this._paneDisposables.add(DOM.addDisposableListener(newChatBtn, DOM.EventType.CLICK, () => {
			this.xorvisService.clearHistory();
			this._inputArea.focus();
		}));

		// Send / Stop button
		this._paneDisposables.add(DOM.addDisposableListener(this._actionButton, DOM.EventType.CLICK, () => {
			if (this.xorvisService.isProcessing) {
				this.xorvisService.cancelRequest();
			} else {
				this._send();
			}
		}));

		// Enter to send, Shift+Enter for newline
		this._paneDisposables.add(DOM.addDisposableListener(this._inputArea, DOM.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				if (!this.xorvisService.isProcessing) {
					this._send();
				}
			}
		}));

		// React to message + processing changes
		this._paneDisposables.add(this.xorvisService.onDidChangeMessages(() => this._renderMessages()));
		this._paneDisposables.add(this.xorvisService.onDidChangeProcessing(processing => this._updateProcessingState(processing)));

		this._renderMessages();
		this._updateProcessingState(this.xorvisService.isProcessing);
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
	}

	private _renderMessages(): void {
		if (!this._messagesContainer) {
			return;
		}
		this._messageRenderStore.clear();
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

		this._messagesContainer.scrollTop = this._messagesContainer.scrollHeight;
	}

	private _renderMessage(msg: IChatMessage): void {
		const wrapper = DOM.append(this._messagesContainer, DOM.$('.xorvis-message.' + msg.role));
		const label = DOM.append(wrapper, DOM.$('.xorvis-message-label'));
		label.textContent = msg.role === 'user' ? 'You' : 'Xorvis';
		const content = DOM.append(wrapper, DOM.$('.xorvis-message-content'));

		if (msg.role === 'assistant') {
			const rendered = this._messageRenderStore.add(renderMarkdown(new MarkdownString(msg.content)));
			// Style error messages
			if (msg.content.startsWith('**Error:**')) {
				rendered.element.classList.add('xorvis-message-error');
			}
			content.appendChild(rendered.element);
		} else {
			content.textContent = msg.content;
		}
	}

	private _updateProcessingState(processing: boolean): void {
		if (!this._actionButton || !this._inputArea || !this._loadingEl) {
			return;
		}
		if (processing) {
			// allow-any-unicode-next-line
			this._actionButton.textContent = '■ Stop';
			this._actionButton.classList.add('xorvis-stop-btn');
			this._inputArea.disabled = true;
			this._loadingEl.style.display = 'flex';
		} else {
			this._actionButton.textContent = 'Send';
			this._actionButton.classList.remove('xorvis-stop-btn');
			this._inputArea.disabled = false;
			this._loadingEl.style.display = 'none';
			this._inputArea.focus();
		}
	}

	private async _send(): Promise<void> {
		const text = this._inputArea.value.trim();
		if (!text || this.xorvisService.isProcessing) {
			return;
		}

		this._inputArea.value = '';
		this._inputArea.style.height = 'auto';
		await this.xorvisService.sendMessage(text);
	}
}
