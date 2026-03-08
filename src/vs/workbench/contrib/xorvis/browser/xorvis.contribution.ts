/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IViewContainersRegistry, IViewDescriptor, IViewsRegistry, ViewContainerLocation, Extensions as ViewExtensions } from '../../../common/views.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { ILifecycleService, LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IXorvisService } from '../common/xorvis.js';
import { XorvisService } from './xorvisService.js';
import { XorvisViewPane } from './xorvisViewPane.js';

// --- Icon

const xorvisViewIcon = registerIcon('xorvis-view-icon', Codicon.chip, localize('xorvisViewIcon', 'View icon of the Xorvis AI chat view.'));

// --- Configuration

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'xorvis',
	title: localize('xorvis', 'Xorvis IDE'),
	properties: {
		'xorvis.apiEndpoint': {
			type: 'string',
			default: 'http://localhost:8000/chat',
			description: localize('xorvis.apiEndpoint', 'URL of the Xorvis AI agent chat API endpoint.'),
			scope: 1, // APPLICATION
		},
	},
});

// --- Service

registerSingleton(IXorvisService, XorvisService, InstantiationType.Delayed);

// --- View Container (AuxiliaryBar — right sidebar)

const XORVIS_VIEW_CONTAINER_ID = 'workbench.view.xorvis';
const XORVIS_VIEW_ID = 'workbench.view.xorvis.panel';

const xorvisViewContainer = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry)
	.registerViewContainer({
		id: XORVIS_VIEW_CONTAINER_ID,
		title: localize2('xorvisAI', 'Xorvis AI'),
		icon: xorvisViewIcon,
		ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [XORVIS_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
		storageId: XORVIS_VIEW_CONTAINER_ID,
		hideIfEmpty: true,
		order: 1,
	}, ViewContainerLocation.AuxiliaryBar, { isDefault: true });

// --- View Descriptor

const xorvisViewDescriptor: IViewDescriptor = {
	id: XORVIS_VIEW_ID,
	name: localize2('xorvisAI', 'Xorvis AI'),
	containerIcon: xorvisViewContainer.icon,
	containerTitle: xorvisViewContainer.title.value,
	singleViewPaneContainerTitle: xorvisViewContainer.title.value,
	ctorDescriptor: new SyncDescriptor(XorvisViewPane),
	canToggleVisibility: false,
	canMoveView: false,
};

Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry)
	.registerViews([xorvisViewDescriptor], xorvisViewContainer);

// --- Commands

registerAction2(class OpenXorvisChat extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.openXorvisChat',
			title: localize2('openXorvisChat', 'Open Xorvis AI'),
			category: localize2('xorvis', 'Xorvis'),
			f1: true,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyX,
				weight: KeybindingWeight.WorkbenchContrib,
			},
		});
	}

	override run(accessor: ServicesAccessor): Promise<unknown> {
		const paneCompositeService = accessor.get(IPaneCompositePartService);
		return paneCompositeService.openPaneComposite(XORVIS_VIEW_CONTAINER_ID, ViewContainerLocation.AuxiliaryBar, true) ?? Promise.resolve();
	}
});

registerAction2(class ClearXorvisChat extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.clearXorvisChat',
			title: localize2('clearXorvisChat', 'Clear Xorvis AI Chat'),
			category: localize2('xorvis', 'Xorvis'),
			f1: true,
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IXorvisService).clearHistory();
	}
});

// --- Auto-open: ensure the Xorvis AI panel is visible on every IDE start

class XorvisAutoOpenContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.xorvisAutoOpen';

	constructor(
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
	) {
		super();
		this._open();
	}

	private async _open(): Promise<void> {
		await this.lifecycleService.when(LifecyclePhase.Restored);
		await this.paneCompositeService.openPaneComposite(
			XORVIS_VIEW_CONTAINER_ID,
			ViewContainerLocation.AuxiliaryBar,
			false, // keep focus in the editor
		);
	}
}

registerWorkbenchContribution2(
	XorvisAutoOpenContribution.ID,
	XorvisAutoOpenContribution,
	WorkbenchPhase.AfterRestored,
);
