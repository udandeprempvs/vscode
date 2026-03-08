/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IFileService, IFileStat } from '../../../../platform/files/common/files.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

const MAX_FILES = 500;
const MAX_DEPTH = 3;

const IGNORED_NAMES = new Set(['node_modules', '__pycache__', 'out', 'dist', '.git', '.svn', 'target', 'build']);

export class IDEBridge {

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
	) { }

	getCurrentFileContext(): { path: string; content: string } | undefined {
		const control = this.editorService.activeTextEditorControl;
		if (!control || !isCodeEditor(control)) {
			return undefined;
		}
		const model = control.getModel();
		if (!model) {
			return undefined;
		}
		return {
			path: model.uri.fsPath,
			content: model.getValue(),
		};
	}

	async getWorkspaceFiles(): Promise<string[]> {
		const folders = this.workspaceContextService.getWorkspace().folders;
		const result: string[] = [];

		for (const folder of folders) {
			let rootStat: IFileStat;
			try {
				rootStat = await this.fileService.resolve(folder.uri);
			} catch {
				continue;
			}
			if (rootStat.children) {
				await this._walkChildren(rootStat.children, folder.uri, 1, result);
			}
			if (result.length >= MAX_FILES) {
				break;
			}
		}

		return result.slice(0, MAX_FILES);
	}

	private async _walkChildren(children: IFileStat[], workspaceRoot: URI, depth: number, result: string[]): Promise<void> {
		for (const child of children) {
			if (result.length >= MAX_FILES) {
				return;
			}
			if (child.name.startsWith('.') || IGNORED_NAMES.has(child.name)) {
				continue;
			}
			if (child.isFile) {
				result.push(child.resource.fsPath.replace(workspaceRoot.fsPath, '').replace(/^[/\\]/, ''));
			} else if (child.isDirectory && depth < MAX_DEPTH) {
				let subStat: IFileStat;
				try {
					subStat = await this.fileService.resolve(child.resource);
				} catch {
					continue;
				}
				if (subStat.children) {
					await this._walkChildren(subStat.children, workspaceRoot, depth + 1, result);
				}
			}
		}
	}
}
