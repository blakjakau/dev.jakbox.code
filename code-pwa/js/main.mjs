import prettier from "https://unpkg.com/prettier@2.4.1/esm/standalone.mjs"
import parserBabel from "https://unpkg.com/prettier@2.4.1/esm/parser-babel.mjs"
import parserHtml from "https://unpkg.com/prettier@2.4.1/esm/parser-html.mjs"
import parserCss from "https://unpkg.com/prettier@2.4.1/esm/parser-postcss.mjs"
import { get, set, del } from "https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm" // Keep these imports

import ui from './ui-main.mjs';
import { ActionBar, Block, Button, ContentFill, CounterButton, Element, Effects, Effect, FileItem, FileList, Icon, Inline, Input, Inner, MediaView, Panel, Ripple, TabBar, TabItem, View, Menu, MenuItem, FileUploadList, actionBars, addStylesheet, buildPath, clone, isElement, isFunction, isNotNull, isset, readAndOrderDirectory, readAndOrderDirectoryRecursive, sortOnName } from './elements.mjs';
import { observeFile, unobserveFile } from "./fileSystemObserver.mjs"

const canPrettify = {
	"ace/mode/javascript": { name: "babel", plugins: [parserBabel] },
	"ace/mode/json": { name: "json", plugins: [parserBabel] },
	"ace/mode/html": { name: "html", plugins: [parserHtml] },
	"ace/mode/css": { name: "css", plugins: [parserCss] },
}

async function verifyPermission(fileHandle, queryOnly = false) {
	const options = {}
	options.mode = "readwrite"
	// Check if permission was already granted. If so, return true.
	if ((await fileHandle.queryPermission(options)) === "granted") {
		return true
	}

	if (queryOnly) return false

	// Request permission. If the user grants permission, return true.
	if ((await fileHandle.requestPermission(options)) === "granted") {
		return true
	}
	// The user didn't grant permission, so return false.
	return false
}

function sleep(ms) {
	return new Promise((accept, reject) => {
		setTimeout(accept, ms)
	})
}
function safeString(string) {
	return string.replace(/\ /g, "-").replace(/[^A-Za-z0-9\-]/g, "")
}

let permissionNotReloaded = true // should we re-request permission for folders added
let isSavingFile = false; // New flag for file saving status

ui.create()
window.ui = ui
window.code = {
	version: (()=>{
		const last="0.4.2"
		 fetch("/version.json").then(async response=>{
			const version = await response.json()
			if(version.appName && version.version) {
				window.code = {...window.code, ...version}
			}
		})
		return last
	})(),
}

const leftEdit = ui.leftEdit
const rightEdit = ui.rightEdit
const leftMedia = ui.leftMedia
const rightMedia = ui.rightMedia

const installer = ui.installer
const fileActions = ui.fileActions
const fileList = ui.fileList
const filesPanel = ui.files
const leftTabs = ui.leftTabs
const rightTabs = ui.rightTabs
const prettify = document.querySelector("#prettier")

const app = {
	folders: [],
	workspaces: [],
	sessionOptions: null,
	rendererOptions: null,
	enableLiveAutocompletion: null,
	darkmode: 'system',
    aiConfig: {},
}

const workspace = {
	id: "default",
	name: "default",
	folders: [],
	files: [],
	scratchpad: '',
	// REMOVED: promptHistory: [], // This will be stored per AI session now
    aiConfig: {},
    // NEW: AI session metadata and active session ID
    aiSessionsMetadata: [], // Array of {id, name, createdAt, lastModified}
    activeAiSessionId: null, // The ID of the currently active AI session
}

// window.showSettings = ui.showSettings
window.app = app
window.workspace = workspace

const fileOpen = new Button("Add Folder to Workspace")
const fileAccess = new Button("Restore")
const menuRestoreFolders = document.querySelector("#menu_restore_folders")



window.ui.commands = {
	byKeys: {},
	byName: {},
	add(command) {
		if (command && command.name && "function" == typeof command.exec) {
			switch (command.target) {
				case "editor":
					//register with ACE editor
					leftEdit.commands.addCommand({
						name: command.name,
						bindKey: command.bindKey,
						exec: command.exec,
					})
					break
				case "app":
				default:
					// register with ui
					if (command.bindKey) {
						if (command.bindKey.mac) {
							const win = command.bindKey.win
							const mac = command.bindKey.mac

							command.bindKey = win
							if (window.navigator.userAgent.toLowerCase().includes("os x")) {
								command.bindKeyAlt = mac
							}
						}
					}

					if (command.name in this.byName) {
						console.warn(command.name, "already registered, removing existing")
						if (this.byName[command.name].bindKey) {
							if (this.byKeys[command.bindKey] == command.name) {
								delete this.byKeys[command.bindKey]
							}
							if (this.byKeys[command.bindKeyAlt] == command.name) {
								delete this.byKeys[command.bindKeyAlt]
							}
						}
						delete this.byName[command.name]
					}
					this.byName[command.name] = command

					if (command.bindKey) {
						command.bindKey = command.bindKey
							.toLowerCase()
							.replace(/command/g, "meta")
							.replace(/option/g, "alt")
							.replace(/\+/g, "-")
						this.byKeys[command.bindKey] = command.name
					}
					if (command.bindKeyAlt) {
						command.bindKeyAlt = command.bindKeyAlt
							.toLowerCase()
							.replace(/command/g, "meta")
							.replace(/option/g, "alt")
							.replace(/\+/g, "-")
						this.byKeys[command.bindKeyAlt] = command.name
					}

					break
			}
		} else {
			console.warn("Invalid command definition", command)
		}
	},
	exec(commandName, args) {
		if (commandName in this.byName) {
			this.byName[commandName].exec(args)
		}
	},
	bindToDocument() {
		if (this.boundToDocument) return
		if (this.boundToDocument) return
		document.addEventListener(
			"keydown",
			(e) => {
				const skipKeys = {
					ControlLeft: true,
					ShiftLeft: true,
					AltLeft: true,
					AltRight: true,
					ShiftRight: true,
					ControlRight: true,
					MetaLeft: true,
				}

				const ctrl = e.ctrlKey,
					shift = e.shiftKey,
					alt = e.altKey,
					meta = e.metaKey

				const cancelEvent = (e, bound) => {
					e.preventDefault()
					e.stopPropagation()
				}
				if (e.code in skipKeys) {
					return
				}

				// build a key code string from this event
				const bindKey = (
					(ctrl ? "ctrl-" : "") +
					(shift ? "shift-" : "") +
					(alt ? "alt-" : "") +
					(meta ? "meta-" : "") +
					e.code.replace(/(Key|Digit)/, "")
				).toLowerCase()

				if (bindKey in this.byKeys) {
					if (bindKey !== "escape") cancelEvent(e, bindKey)
					this.exec(this.byKeys[bindKey])
				}
			},
			{ capture: true }
		)
		this.boundToDocument = true
	}
}

window.ui.commands.bindToDocument()

const getSuggestedStartDirectory = async () => {
    const activeTab = currentTabs?.activeTab;

    // 1. From active tab's folder
    if (activeTab?.config?.folder) {
        return activeTab.config.folder;
    }

    // 2. From a sibling tab's folder
    for (const tab of currentTabs?.tabs || []) {
        if (tab.config?.folder) {
            return tab.config.folder;
        }
    }
    
    // 3. From a tab in the other panel
    const otherTabs = (currentTabs === leftTabs) ? rightTabs : leftTabs;
    for (const tab of otherTabs?.tabs || []) {
        if (tab.config?.folder) {
            return tab.config.folder;
        }
    }

    // 4. From any open folder in the workspace
    if (workspace.folders?.length > 0) {
        return workspace.folders[0];
    }
    
    return null; // Fallback to default behavior
};

const saveFile = async (tab) => {
	const handle = tab.config.handle;
	const text = tab.config.session.getValue();
	if (!handle) return;

	const writable = await handle.createWritable();
	await writable.write(text);
	await writable.close();
	
	tab.changed = false;
	
	// Update filelist item state
	fileList.active = handle;
	const fileItem = fileList.activeItem;
	if (fileItem && fileItem.item.handle === handle) {
		fileItem.changed = false;
	}
};

const saveAppConfig = async () => {
	app.sessionOptions = ui.leftEdit.session.getOptions()
	app.rendererOptions = ui.leftEdit.renderer.getOptions()
	app.enableLiveAutocompletion = ui.leftEdit.$enableLiveAutocompletion
	delete app.sessionOptions.mode // don't persist the mode, that's dumb
	delete app.folders //app.folders = workspace.folders

	// ensure that the app config has links to the current workspace name
	if (app.workspaces.indexOf(workspace.id) == -1) {
		app.workspaces.push(workspace.id)
	}
	app.workspace = workspace.id

	// updateWorkspaceSelectors()

	await set("appConfig", app)
	console.debug("saved", app)
}

// New function to handle file modifications from FileSystemObserver
const onFileModified = (fileHandle) => {
    if (isSavingFile) { // Ignore changes if a save operation is in progress
        return;
    }
    // Find the tab associated with the modified fileHandle
    let foundTab = null;
    for (const tab of leftTabs.tabs) {
        if (tab.config.handle === fileHandle) {
            foundTab = tab;
            break;
        }
    }
    if (!foundTab) {
        for (const tab of rightTabs.tabs) {
            if (tab.config.handle === fileHandle) {
                foundTab = tab;
                break;
            }
        }
    }

    if (foundTab) {
        foundTab.config.fileModified = true;
        // If the modified tab is the active tab, show the notice bar
        if (foundTab === currentTabs.activeTab) {
            ui.showFileModifiedNotice(foundTab, foundTab.config.side);
        }
    }
};

let workspaceUnloading = false
const saveWorkspace = async () => {
	if (workspaceUnloading) return
	workspace.openFolders = fileList.openFolders;
	workspace.sidebarWidth = ui.sidebar.offsetWidth;
	workspace.activeSidebarTab = ui.iconTabBar?.activeTab?.iconId;
	// REMOVED: workspace.promptHistory = ui.aiManager.promptHistory; // No longer here
    // AI sessions metadata is now stored directly in workspace (small footprint)
	set(`workspace_${workspace.id}`, workspace); // This will save workspace.aiSessionsMetadata and workspace.activeAiSessionId
}

const updateWorkspaceSelectors = (() => {
	const close = document.querySelector("#workspaceClose")
	const rename = document.querySelector("#workspaceRename")
	const remove = document.querySelector("#workspaceDelete")
	const selectors = document.querySelector("#workspaceSelectors")
	const actions = document.querySelector("#workspaceActions")
	return () => {
		selectors.innerHTML = ""
		for (const name of app.workspaces) {
			// if(name == "default") continue
			let item = document.createElement("ui-menu-item")
			item.setAttribute("command", `app:workspaceOpen:${name}`)
			item.text = name

			selectors.appendChild(item)

			if (workspace.id == name) {
				item.icon = "done"
				if (name !== "default") {
					actions.appendChild(close)
					// actions.appendChild(rename)
					actions.appendChild(remove)

					close.text = `Close workspace`
					rename.text = `Rename workspace "${name}"`
					remove.text = `Delete workspace "${name}"`
				} else {
					close.remove()
					rename.remove()
					remove.remove()
				}
			}
		}
	}
})()

const openWorkspace = (() => {
	const close = document.querySelector("#workspaceClose")
	const rename = document.querySelector("#workspaceRename")
	const remove = document.querySelector("#workspaceDelete")
	const selectors = document.querySelector("#workspaceSelectors")
	const actions = document.querySelector("#workspaceActions")

	// rename for possible future functionality
	rename.remove()

	return async (name, triggered = false) => {
		console.debug(`openWorkspace: Opening workspace ${name}.`);
		let load = await get(`workspace_${name}`)


		const hideActions = () => {
			close.remove()
			rename.remove()
			remove.remove()
		}

		if ("undefined" != typeof load) {
			workspaceUnloading = true
			// clear the leftTabs
			while (leftTabs.tabs.length > 1) {
				leftTabs.tabs[0].close.click()
			}
			if (leftTabs.tabs[0]) leftTabs.tabs[0].close.click()

			workspaceUnloading = false

			workspace.name = load.name || "default"
			workspace.folders = load.folders || []
			workspace.files = load.files || []
			workspace.openFolders = load.openFolders || [];
			workspace.scratchpad = load.scratchpad || '';
			ui.scratchEditor.setValue(workspace.scratchpad || '');
			workspace.sidebarWidth = load.sidebarWidth || null;
			workspace.activeSidebarTab = load.activeSidebarTab || null;
			workspace.id = load.id || safeString(workspace.name)
			// REMOVED: workspace.promptHistory = load.promptHistory || []; // Removed
			// REMOVED: ui.aiManager.promptHistory = workspace.promptHistory; // Removed
            workspace.aiConfig = load.aiConfig || {};
            // REMOVED: workspace.chatHistory = load.chatHistory || []; // Removed
            // if (ui.aiManager.historyManager) {
            //     ui.aiManager.historyManager.loadHistory(workspace.chatHistory, true);
            // }

            // NEW: Load AI session metadata and active session ID
            workspace.aiSessionsMetadata = load.aiSessionsMetadata || [];
            workspace.activeAiSessionId = load.activeAiSessionId || null;
            if (ui.aiManager) {
                // Pass the AI session metadata and active ID to the manager
                ui.aiManager.loadSessions(workspace.aiSessionsMetadata, workspace.activeAiSessionId);
            }

            // After loading workspace, ensure aiManager is initialized with the correct provider's config
            // This assumes ui.aiManager.aiProvider is already set by ui.aiManager.loadSettings() in its init
            const currentProvider = ui.aiManager.aiProvider;
            if (workspace.aiConfig[currentProvider]) {
                ui.aiManager.ai.setOptions(workspace.aiConfig[currentProvider], null, null, true, 'workspace');
            } else if (app.aiConfig[currentProvider]) {
                ui.aiManager.ai.setOptions(app.aiConfig[currentProvider], null, null, false, 'global');
            } else {
                // If no specific config for the current provider, reset to default for that provider
                ui.aiManager.ai.setOptions({}, null, null, false, 'global');
            }
			
			setTimeout(()=>{
				ui.scratchEditor.session.setOption("wrap", "free")
				ui.scratchEditor.session.setOption("indentedSoftWrap", false)
				ui.scratchEditor.session.setMode("ace/mode/markdown")
			})


			fileActions.append(fileAccess)
			fileOpen.text = "Add Folder"

			if (workspace.folders.length > 0) {
				fileAccess.style.display = "";
				menuRestoreFolders.style.display = "";

				let hasLockedFolders = false;
				for (const folder of workspace.folders) {
					if (folder.locked) {
						hasLockedFolders = true;
						break;
					}
				}
				if (hasLockedFolders && triggered) {
					await fileAccess.click();
				}
			} else {
				fileAccess.style.display = "none";
				menuRestoreFolders.style.display = "none";
			}

			app.workspace = workspace.id
			if (name === "default") {
				hideActions()
			}

			saveAppConfig()
			ui.showSidebar()
			fileList.openFolders = workspace.openFolders || [];
			updateWorkspaceSelectors()

			
			console.log("openWorkspace: workspace.activeSidebarTab =", workspace.activeSidebarTab);
			console.log("openWorkspace: ui.iconTabBar =", ui.iconTabBar);
			if (ui.iconTabBar) {
				console.log("openWorkspace: ui.iconTabBar._tabs =", ui.iconTabBar._tabs);
				ui.iconTabBar._tabs.forEach(tab => console.log("  Tab iconId:", tab.iconId));
			}
			if (workspace.sidebarWidth) {
				ui.sidebar.width = workspace.sidebarWidth;
			}
			if (workspace.activeSidebarTab && ui.iconTabBar) {
				ui.iconTabBar.activeTabById = workspace.activeSidebarTab;
			}
		} else {
			if (name === "default") {
				workspace.name = "default"
				workspace.id = "default"
				workspace.files = []
				workspace.folders = []
				// NEW: Initialize empty AI session metadata
                workspace.aiSessionsMetadata = [];
                workspace.activeAiSessionId = null;
                // AIManager will handle creating the first session when it gets loadSessions call
				hideActions()
				let item = document.createElement("ui-menu-item")
				item.setAttribute("command", `app:workspaceOpen:default`)
				item.text = name
				selectors.appendChild(item)
				if (name == workspace.name) {
					item.icon = "done"
				}

				saveWorkspace()
			} else {
				alert(`couldn't load workspace ${name}`)
				app.workspaces.splice(app.workspaces.indexOf(name), 1)
				saveAppConfig()
				openWorkspace("default")
			}
		}
	}
})()

const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)');

const execCommandSetDarkMode = (mode) => {
    app.darkmode = mode;
    switch (mode) {
        case 'light':
            document.body.classList.remove("darkmode");
            break;
        case 'dark':
            document.body.classList.add("darkmode");
            break;
        case 'system':
            if (prefersDarkMode.matches) {
                document.body.classList.add("darkmode");
            } else {
                document.body.classList.remove("darkmode");
            }
            break;
    }
    saveAppConfig();
    updateThemeAndMode();
};

prefersDarkMode.addEventListener('change', () => {
    if (app.darkmode === 'system') {
        execCommandSetDarkMode('system');
    }
});

const updateThemeAndMode = (doSave = false) => {
	ui.updateThemeAndMode()

	if (leftEdit.getOption("mode") in canPrettify) {
		prettify.removeAttribute("disabled")
	} else {
		prettify.setAttribute("disabled", "disabled")
	}
	if (doSave) saveAppConfig()
}

const execCommandPrettify = () => {
	let text = currentEditor.getValue()
	const mode = currentEditor.getOption("mode")
	if (!(mode in canPrettify)) return

	const parser = canPrettify[mode]
	const activeRow = currentEditor.getCursorPosition().row + 1

	try {
		text = prettier.format(text, {
			parser: parser.name,
			plugins: parser.plugins,
			printWidth: currentEditor.getOption("printMargin") || 120,
			tabWidth: currentEditor.getOption("tabSize") || 4,
			useTabs: !currentEditor.getOption("useSoftTabs") || false,
			semi: false,
		})
		currentEditor.setValue(text)
		currentEditor.clearSelection()
		currentEditor.gotoLine(activeRow)
	} catch (e) {
		console.warn("Unable to prettify", e)
		const m = e.message
		try {
			let match = m.match(/\>\s(\d*) \|/g)
			if (match.length > 0) {
				let l = parseInt(match[0].replace(/[\>\|\s]/g, "")) - 1
				currentEditor.getSession().setAnnotations([
					{
						row: l,
						column: 0,
						text: m, // Or the Json reply from the parser
						type: "error", // also "warning" and "information"
					},
				])
				currentEditor.execCommand("goToNextError")
			}
		} catch (er) {
			console.error("Unable to prettify", e, er)
		}
	}
}

const execCommandEditorOptions = () => {
	for (const editor of window.editors) {
		// Exclude special editors from global session/renderer options
		if (app.sessionOptions && !['scratch-editor', 'ai-prompt-editor'].includes(editor.id)) {
			editor.session.setOptions(app.sessionOptions);
		}
		if (app.rendererOptions && !['scratch-editor', 'ai-prompt-editor'].includes(editor.id)) {
 			editor.renderer.setOptions(app.rendererOptions);
		}
		if (app.enableLiveAutocompletion) {
			editor.$enableLiveAutocompletion = app.enableLiveAutocompletion;
		}

		if (editor.getOption("mode") === "ace/mode/javascript") {
			editor.setOption("useWorker", false);
		} else {
			editor.setOption("useWorker", true);
		}
	}
}

const execCommandAbout = () => {
	setTimeout(() => {
		const about = document.querySelector("#about")
		const version = document.querySelector("#version")
		if (!about) {
			alert(`Code v${window.code.version} <code@jakbox.net>`)
		} else {
			version.innerHTML = `Version ${window.code.version} - `
			about.setAttribute("active", "true")
		}
	})
}
const execCommandAddFolder = () => {
	fileOpen.click()
}
const execCommandToggleFolders = () => {
	ui.toggleSidebar()
}

const execCommandSplitView = () => {
	ui.toggleSplitView()
}

const execCommandToggleSidebarPanel = (panelId) => {
	const isSidebarVisible = document.body.classList.contains("showSidebar")
	const currentPanel = ui.iconTabBar.activeTab?.iconId;

	if (isSidebarVisible && currentPanel === panelId) {
		if(panelId == 'developer_board') {
			if(!document.activeElement.classList.contains("prompt-area")) {
				// just focus the tab
				ui.iconTabBar.activeTabById = panelId;
				return
			}
		}
		
		ui.toggleSidebar(); // Close the sidebar
	} else if (!isSidebarVisible) {
		ui.toggleSidebar(); // Open the sidebar
		ui.iconTabBar.activeTabById = panelId;
	} else {
		ui.iconTabBar.activeTabById = panelId; // Switch to the new panel
	}
};

const execCommandRemoveAllFolders = () => {
	setTimeout(async () => {
		const l = workspace.folders.length
		if (l == 0) {
			alert("You don't have any folders in your workspace")
		} else {
			if (confirm(`Are you sure you want to remove ${l} folder${l > 1 ? "s" : ""} from your workspace?`)) {
				while (workspace.folders.length > 0) {
					workspace.folders.pop()
				}
				ui.showSidebar()
				// saveAppConfig()
				saveWorkspace()
			}
		}
	}, 400)
}

const execCommandRefreshFolders = () => {}

const execCommandRestoreFolders = () => {
	fileList.openFolders = workspace.openFolders;
	fileAccess.click();
	fileAccess.style.display = "none";
	menuRestoreFolders.style.display = "none";
	// setTimeout(()=>{
	// 	fileList.openFolders = workspace.openFolders;
	// }, 300)
}

const execCommandCloseActiveTab = async () => {
	const tab = leftTabs.activeTab
	tab.close.click()
}
const execCommandSave = async () => {
	isSavingFile = true; // Set flag at the beginning of save operation
	const tab = currentTabs.activeTab;
	const config = tab.config;
	if (config.handle) {
		await saveFile(tab);
		config.session.baseValue = config.session.getValue();
	} else {
		const startIn = await getSuggestedStartDirectory();
		const options = {};
		if (startIn) {
			options.startIn = startIn;
		}
		const newHandle = await window.showSaveFilePicker(options).catch(console.warn);
		if (!newHandle) {
			alert("File NOT saved");
			isSavingFile = false; // Reset flag if save is cancelled
			return;
		}
		config.handle = newHandle;
		config.name = newHandle.name;
		config.path = buildPath(newHandle);
		config.folder = newHandle.container;
		tab.name = config.name;
		tab.setAttribute("title", config.path);

		await saveFile(tab);
		config.session.baseValue = config.session.getValue();
		
		// This is a new file, add it to the workspace
		syncWorkspaceFile(tab);

		// Refresh the folder in the file list to show the new file
		await fileList.refreshFolder(newHandle.container);
	}
	setTimeout(() => { // Reset flag after a short delay
		isSavingFile = false;
	}, 500); // 500ms delay
};

const execCommandSaveAs = async () => {
    isSavingFile = true; // Set flag at the beginning of save operation
	const tab = currentTabs.activeTab;
	const config = tab.config;
	const oldHandle = config.handle;
	const oldFolderHandle = oldHandle?.container;

	const startIn = await getSuggestedStartDirectory();
	const options = {};
	if (startIn) {
		options.startIn = startIn;
	}
	const newHandle = await window.showSaveFilePicker(options).catch(console.warn)
	if (!newHandle) {
		alert("File NOT saved")
        isSavingFile = false; // Reset flag if save is cancelled
		return
	}

	if (oldHandle) {
		workspace.files = workspace.files.filter(f => f.handle !== oldHandle);
	}

	config.handle = newHandle
	config.name = newHandle.name
	config.path = buildPath(newHandle);
	config.folder = newHandle.container;
	tab.name = config.name;
	tab.setAttribute("title", config.path);
	await saveFile(tab);
	syncWorkspaceFile(tab);

	await fileList.refreshFolder(newHandle.container);
	if (oldFolderHandle && oldFolderHandle !== newHandle.container) {
		await fileList.refreshFolder(oldFolderHandle);
	}

    setTimeout(() => { // Reset flag after a short delay
        isSavingFile = false;
    }, 500); // 500ms delay
}

const execCommandOpen = async () => {
	const startIn = await getSuggestedStartDirectory();
	const newHandle = await window.showOpenFilePicker({ startIn }).catch(console.warn)
	if (!newHandle) {
		return
	}
	fileList.open(newHandle[0])
}

const execCommandNewFile = async () => {
	const srcTab = ui.currentTabs.activeTab
	const mode = srcTab?.config?.mode?.mode || "";
	const folder = srcTab?.config?.folder || undefined;
	const newSession = ace.createEditSession("", mode);	
	// Apply stored session options to the new session
	if (app.sessionOptions) {
		newSession.setOptions(app.sessionOptions);
	}
	newSession.baseValue = "";

	let targetTabs = ui.currentTabs

	const tab = targetTabs.add({ name: "untitled", mode: { mode: mode }, session: newSession, folder: folder, side: (targetTabs === leftTabs) ? "left" : "right" });

	
	tab.click();
}

const execCommandNewWindow = async () => {
	window.open("/", "new-window", `width=${window.outerWidth},height=${window.outerHeight}`)
}

// Function to reload a file from disk
const reloadFile = async (tab) => {
    const handle = tab.config.handle;
    if (!handle) {
        console.warn("No file handle found for tab:", tab.config.name);
        return;
    }

    try {
        const file = await handle.getFile();
        const text = await file.text();

        // Update the session with the new content
        tab.config.session.setValue(text);
        tab.config.session.baseValue = text; // Reset baseValue to current content
        tab.config.fileModified = false; // Clear the file modified flag
        tab.changed = false; // Clear unsaved changes flag

        // If the reloaded tab is the active tab, ensure the editor updates
        if (tab === currentTabs.activeTab) {
            currentEditor.setSession(tab.config.session);
            currentEditor.focus();
        }
    } catch (error) {
        console.error("Error reloading file:", tab.config.name, error);
        alert(`Error reloading file ${tab.config.name}: ${error.message}`);
    }
};

// Expose it globally for ui-main.mjs to call
window.ui.reloadFile = reloadFile;

// 	const buildPath = (f) => {
// 	if (!(f instanceof FileSystemFileHandle || f instanceof FileSystemDirectoryHandle)) {
// 		return ""
// 	}
// 	let n = f.name
// 	if (f.container) n = buildPath(f.container) + "/" + n
// 	return n
// }

const syncWorkspaceFile = (tab) => {
	const config = tab.config;
	const handle = config.handle;
	if (!handle) return;

	let matched = false;
	for (const file of workspace.files) {
		if (file.handle === handle) {
			file.side = config.side;
			matched = true;
			break;
		}
	}

	if (!matched) {
		workspace.files.push({
			name: config.name,
			path: config.path,
			handle: handle,
			side: config.side,
			containers: (() => {
				const containers = [];
				let current = handle.container;
				while (current) {
					containers.push(current);
					current = current.container;
				}
				return containers;
			})()
		});
	}
	saveWorkspace();
};
const setupSessionChangeListener = (session, tab) => {
    session.on('change', () => {
        const isDirty = session.getValue() !== session.baseValue;
        
        // Update tab's changed status
        tab.changed = isDirty;
        
        // Update corresponding file list item's changed status
        const handle = tab.config.handle;
        if (handle) {
            const fileItem = fileList.byTitle(buildPath(handle));
            if (fileItem) {
                fileItem.changed = isDirty;
            }
        }
    });
};
let currentEditor = leftEdit;
let currentTabs = leftEdit;
let currentMediaView = ui.leftMedia;

const setCurrentEditor = (editor)=>{
	ui.currentEditor = currentEditor = editor
	ui.currentTabs = currentTabs = (editor === leftEdit ? ui.leftTabs : ui.rightTabs)
	ui.currentMediaView = currentMediaView = (editor === leftEdit ? ui.leftMedia : ui.rightMedia)
	ui.aiManager.editor = editor;
	
	const tab = editor?.tabs?.activeTab
	if(tab) {
		fileList.active = tab.config.handle;
    	tab.scrollIntoViewIfNeeded();
    	tab.parentElement.scrollTop = 0;
    	if (tab.changed && fileList.activeItem) {
	        fileList.activeItem.changed = true;
	    }

		// Update the side property in workspace.files when the active editor changes
		const fileInWorkspace = workspace.files.find(file => file.handle === tab.config.handle);
		if (fileInWorkspace) {
			fileInWorkspace.side = (editor === leftEdit) ? "left" : "right";
			saveWorkspace();
		}
	}
}

const openFileHandle = async (handle, knownPath = null, targetEditor = currentEditor) => {
    // This function will be assigned to leftTabs.dropFileHandle and rightTabs.dropFileHandle later
    // So, we don't need to assign it here.

	// don't add a new tab if the file is already open in a tab
	const path = knownPath != null ? knownPath : buildPath(handle)
	{
		let tab = leftTabs.byTitle(path)
		if (tab) return tab.click()
		tab = rightTabs.byTitle(path)
		if (tab) return tab.click()
	}

	const file = await handle.getFile()
	let text = await file.text()

	let fileMode = { mode: "" }

	// lookup editor modes
	for (let n in ace_modes) {
		const mode = ace_modes[n]

		// HTML should be html, not django
		if(mode.name == "django") continue
		
		if (file.name.match(mode.extRe)) {
			fileMode = mode
			break
		}
	}

	if (fileMode.mode == "") {
		// attempt to infer from line 1
		const filters = {
			"ace/mode/sh": /#!.*bash/,
			"ace/mode/javascript": /#!.*node/,
		}
		for (let n in filters) {
			let filter = filters[n]
			if (fileMode.mode == "") {
				const match = filter.exec(text)
				if (match && match.index === 0) {
					fileMode.mode = n
				}
			}
		}
	}

	if (fileMode.mode == "") {
		// specific filter files for now... images!
		// there are others, but these ones we def CAN display
		const images = "png|jpg|jpeg|bmp|tiff|gif|webp|ico".split("|")
		for(const i of images) {
			if(file.name.endsWith(i)) {
				console.warn("branch for image handling?!", file.name)
				//TODO build in an image preview layer to handle here
				fileMode.mode = "media"
			}
		}
		if(fileMode.mode == "") {
			if(file.name.startsWith(".")) {
				fileMode.mode = "ace/mode/sh"
			} else {
				if (fileMode.mode == "") {
					fileMode.mode = "ace/mode/text"
				}
			}
		}
	}

	if (fileMode.mode == "") {
		console.warn("Unsupported File", file)
		alert(`Unsupported or unrecongnised file type: ${file.name.split(".").pop().toUpperCase()}`)
		return
	}

	if (fileMode.name == "javascript" && 1 == 0) {
		text = prettier.format(text, {
			parser: "babel",
			plugins: [parserBabel, parserHtml],
			printWidth: 120,
			tabWidth: 4,
			useTabs: true,
			semi: false,
		})
	}

	// Check for and remove empty "untitled" tabs before opening a new file.
	const removeEmptyUntitledTab = (tabGroup) => {
		if (tabGroup.tabs.length === 1) {
			const tab = tabGroup.tabs[0];
            if (tab.config.name === "untitled" && tab.config.session.getValue() === "") {
				tabGroup.remove(tab, true); // Pass true to suppress defaultTab creation
			}
		}
	};

	removeEmptyUntitledTab(leftTabs);
	removeEmptyUntitledTab(rightTabs);

	const newSession = ace.createEditSession(text, fileMode.mode)
	newSession.baseValue = text

	targetEditor.setSession(newSession)
	execCommandEditorOptions()

	let targetTabs = targetEditor.tabs

	const tab = targetTabs.add({
		name: file.name,
		path: path,
		mode: fileMode,
		session: newSession,
		side: (targetEditor === leftEdit) ? "left" : "right",
		handle: handle,
		folder: handle.container,
		fileModified: false, // Initialize fileModified flag
	});
	setupSessionChangeListener(newSession, tab);
	tab.click()
	observeFile(handle, onFileModified); // Observe the file for changes

	// Only add to workspace and save if it's a newly opened file, not from a restore
	if (knownPath === null) {
		syncWorkspaceFile(tab);
	}
}

const fileMenu = document.getElementById("file_context")
const folderMenu = document.getElementById("folder_context")
const topfolderMenu = document.getElementById("top_folder_context")

folderMenu.click = topfolderMenu.click = (action) => {
	const active = fileList.contextElement
	const file = active.item
	switch (action) {
		case "remove":
			for (let i = 0; i < workspace.folders.length; i++) {
				if (workspace.folders[i] === file) {
					workspace.folders.splice(i, 1)
					i--
				}
			}
			saveWorkspace()
			ui.showFolders()
			break
		case "refresh":
			if (active.refresh) {
				active.refresh.click()
			}
			break
	}
}
fileList.context = (e) => {
	let menu = folderMenu

	if (e.srcElement.parentElement.parentElement instanceof FileList) {
		menu = topfolderMenu
	} else {
		if (e.srcElement?.item?.kind == "file") {
			// menu = fileMenu
			return
		} else {
			menu = folderMenu
		}
	}
	menu.showAt(e)
}

fileList.unlock = verifyPermission

fileList.expand = (item) => {
	for (const tab of leftTabs.tabs) {
		fileList.active = tab.config.handle
		if (tab._changed) {
			fileList.activeItem.changed = true
		}
	}
	fileList.active = currentTabs?.activeTab?.config?.handle
}

const updateEditorUI = async (targetEditor, targetMediaView, tab) => {
    if (tab.config.mode.mode === "media") {
        targetEditor.container.style.display = 'none';
        targetMediaView.style.display = 'block';

        const file = await tab.config.handle.getFile();
        const imageUrl = URL.createObjectURL(file);
        targetMediaView.setImage(imageUrl);
    } else {
        targetEditor.container.style.display = 'block';
        targetMediaView.style.display = 'none';
        targetEditor.setSession(tab.config.session);
        targetEditor.focus();
    }
    // setCurrentEditor(targetEditor);
    fileList.active = tab.config.handle;
    tab.scrollIntoViewIfNeeded();
    tab.parentElement.scrollTop = 0;
    updateThemeAndMode();
    if (tab.changed && fileList.activeItem) {
        fileList.activeItem.changed = true;
    }
}

leftTabs.click = async (event) => {
    const tab = event.tab;
    setCurrentEditor(leftEdit);
    await updateEditorUI(leftEdit, ui.leftMedia, tab);
    // Check if the file has been modified externally and show notice
    if (tab.config.fileModified) {
        ui.showFileModifiedNotice(tab, 'left');
    } else {
        ui.hideFileModifiedNotice('left'); // Hide if not modified
    }
};

rightTabs.click = async (event) => {
    const tab = event.tab;
    setCurrentEditor(rightEdit);
    await updateEditorUI(rightEdit, ui.rightMedia, tab);
    // Check if the file has been modified externally and show notice
    if (tab.config.fileModified) {
        ui.showFileModifiedNotice(tab, 'right');
    } else {
        ui.hideFileModifiedNotice('right'); // Hide if not modified
    }
};

const closeTab = (targetTabs, event) => {
    const tab = event.tab;
    if (tab.changed) {
        if (!confirm("This file has unsaved changes, are you sure?")) {
            return;
        }
    }

    // If the tab is a media file, revoke the object URL
    if (tab.config.mode.mode === "media") {
        if (targetTabs === leftTabs && ui.leftMedia.style.backgroundImage) {
            const imageUrl = ui.leftMedia.style.backgroundImage.replace(/url\("|"\)/g, '');
            URL.revokeObjectURL(imageUrl);
        } else if (targetTabs === rightTabs && ui.rightMedia.style.backgroundImage) {
            const imageUrl = ui.rightMedia.style.backgroundImage.replace(/url\("|"\)/g, '');
            URL.revokeObjectURL(imageUrl);
        }
    }

    // remove from workspace recent files
    for (let i = 0; i < workspace.files.length; i++) {
        if (workspace.files[i].handle == tab.config.handle) {
            workspace.files.splice(i, 1);
            i--;
        }
    }

    fileList.inactive = tab.config.handle;

    unobserveFile(tab.config.handle); // Stop observing the file

	tab.tabBar.remove(tab)
    // targetTabs.remove(tab);
    tab.config.session.destroy();
    saveWorkspace();
};

leftTabs.close = (event) => {
    closeTab(leftTabs, event);
};

rightTabs.close = (event) => {
    closeTab(rightTabs, event);
};

const defaultTab = (targetTabs) => {
	if(!targetTabs) {
		targetTabs = ui.currentTabs
	}
	const defaultSession = ace.createEditSession("", "")
	const tab = targetTabs.add({ name: "untitled", mode: { mode: "" }, session: defaultSession })
	setupSessionChangeListener(newSession, tab);

	// Determine which editor and media view to use based on the targetTabs
	let editorToUse = leftEdit;
	let mediaViewToUse = leftMedia;
	
	if (targetTabs === rightTabs) {
		editorToUse = rightEdit;
		mediaViewToUse = rightMedia;
	}

	editorToUse.setSession(defaultSession)
	execCommandEditorOptions()
	tab.click()
}

// fileActions.hook="bottom";
fileAccess.icon = "settings_backup_restore"
fileAccess.hook = "right"
fileAccess.title = "Unlock folders and restore open files"
fileAccess.on("click", async () => {
	let allGood = true
	for (let i = 0, l = workspace.folders.length; i < l; i++) {
		let handle = workspace.folders[i]
		if (await verifyPermission(handle)) {
			handle.locked = false
			// ui.showFolders(0)
		} else {
			allGood = false
		}
	}

	// Check if split view needs to be enabled
	let enableSplitView = false;
	for (const file of workspace.files) {
		if (file.side === "right") {
			enableSplitView = true;
			break;
		}
	}

	if (enableSplitView) {
		if(!document.body.classList.contains("showSplitView")) {
			ui.toggleSplitView(); // Enable split view if needed
		}
	}

	if (allGood) {
		// hide this button now
		fileAccess.remove()
		fileOpen.text = "Add Folder to Workspace"
		await fileList.refreshAll()

		if (workspace.files.length > 0) {
			const missingFiles = [];
			for (const file of workspace.files) {
				let newContainers = []
				let fileContainers = { container: null }
				let container = fileContainers
				while (file.containers.length > 0) {
					let next = file.containers.shift()
					newContainers.push(next)
					container.container = next
					if (file.containers.length > 0) container = container.container
				}
				file.containers = newContainers
				file.handle.container = fileContainers.container
				try {
					await openFileHandle(file.handle, file.path, (file.side === "right" ? rightEdit : leftEdit))
					fileList.active = file.handle
				} catch (e) {
					console.warn(`Failed to open file ${file.path}: ${e.message}`)
					missingFiles.push(file.path)
				}
			}
			// Remove missing files from workspace.files
			workspace.files = workspace.files.filter(file => !missingFiles.includes(file.path));
			saveWorkspace(); // Save workspace after removing missing files
		}
		ui.showSidebar(1)
	} else {
		ui.showSidebar()
	}
})

fileOpen.icon = "create_new_folder"
fileOpen.title = "Add Folder to Workspace"
fileActions.append(fileOpen)

fileActions.append(fileAccess)
if (workspace.folders.length > 0) {
	fileOpen.text = "Add Folder"
}

fileOpen.on("click", async () => {
	const folderHandle = await window.showDirectoryPicker({ mode: "readwrite", create: true })

	// checkForExistingFolder
	// before adding the folder, lets make sure we don't already have access.
	let addToFolders = true
	workspace.folders.forEach((handle) => {
		if (handle == folderHandle) {
			addToFolders = false
		}
	})
	// verifyPermission
	await verifyPermission(folderHandle)
	if (addToFolders) workspace.folders.push(folderHandle)
	// 	saveAppConfig()
	saveWorkspace()
	ui.showSidebar()
})

const keyBinds = [
	{
		target: "app",
		name: "showKeyboardShortcuts",
		bindKey: { win: "ctrl-alt-k", mac: "Command-Alt-k" },
		exec: function () {
			ace.config.loadModule("ace/ext/keybinding_menu", function (module) {
				module.init(leftEdit)
				currentEditor.showKeyboardShortcuts()
			})
		},
	},
	{
		target: "app",
		name: "find",
		bindKey: { win: "Ctrl-F", mac: "Command-F" },
		exec: () => {
			window.ui.omnibox("find")
		},
	},
	{
		target: "app",
		name: "find-next",
		bindKey: { win: "F3", mac: "F3" },
		exec: () => {
			currentEditor.execCommand("findnext")
		},
	},
	{
		target: "editor",
		name: "collapselines",
		bindKey: { win: "Ctrl-Shift-J", mac: "Command-Shift-J" },
		exec: () => {
			currentEditor.execCommand("joinlines")
		},
	},
	{
		target: "app",
		name: "find-regex",
		bindKey: { win: "Ctrl-Shift-F", mac: "Command-Shift-F" },
		exec: () => {
			window.ui.omnibox("regex")
		},
	},
	{
		target: "app",
		name: "find-regex-multiline",
		bindKey: { win: "Ctrl-Shift-Alt-F", mac: "Command-Shift-Alt-F" },
		exec: () => {
			window.ui.omnibox("regex-m")
		},
	},
	{
		target: "app",
		name: "goto",
		bindKey: { win: "Ctrl-G", mac: "Command-G" },
		exec: () => {
			window.ui.omnibox("goto")
		},
	},
	{
		target: "editor",
		name: "lookup",
		bindKey: { win: "Ctrl-L", mac: "Command-L" },
		exec: () => {
			window.ui.omnibox("lookup")
		},
	},
	{
		target: "app",
		name: "showAllCommands",
		bindKey: { win: "Ctrl+Shift+P", mac: "Command+Shift+P" },
		exec: () => {
			currentEditor.execCommand("openCommandPallete")
		},
	},
	{
		target: "editor",
		name: "prettify",
		bindKey: { win: "Ctrl+Shift+I", mac: "Command+Shift+I" },
		exec: () => {
			execCommandPrettify()
		},
	},
	{
		target: "app",
		name: "next-buffer",
		bindKey: { win: "Ctrl+Tab", mac: "Command+Tab" },
		exec: () => {
			leftTabs.next()
		},
	},
	{
		target: "app",
		name: "prev-buffer",
		bindKey: { win: "Ctrl+Shift+Tab", mac: "Command+Shift+Tab" },
		exec: () => {
			leftTabs.prev()
		},
	},
	{
		target: "app",
		name: "newFile",
		bindKey: { win: "Ctrl+N", mac: "Command+N" },
		exec: execCommandNewFile,
	},
	{
		target: "app",
		name: "newWindow",
		bindKey: { win: "Ctrl+Shift+N", mac: "Command+Shift+N" },
		exec: execCommandNewWindow,
	},
	{
		target: "app",
		name: "openFile",
		bindKey: { win: "Ctrl+O", mac: "Command+O" },
		exec: execCommandOpen,
	},
	{
		target: "app",
		name: "saveFile",
		bindKey: { win: "Ctrl+S", mac: "Command+S" },
		exec: execCommandSave,
	},
	{
		target: "app",
		name: "saveFileAs",
		bindKey: { win: "Ctrl+Shift+S", mac: "Command+Shift+S" },
		exec: execCommandSaveAs,
	},
	{
		target: "app",
		name: "showEditorSettings",
		exec: () => {
			currentEditor.execCommand("showSettingsMenu", () => {
				updateThemeAndMode(true)
			})
		},
	},
	{
		target: "app",
		name: "closeFile",
		bindKey: { win: "Ctrl+W", mac: "Command+W" },
		exec: execCommandCloseActiveTab,
	},
	{
		target: "app",
		name: "toggleFolders",
		bindKey: { win: "Alt+F", mac: "Option+F" },
		exec: () => {
			execCommandToggleSidebarPanel('folder');
		},
	},
	// {
	// 	target: "app",
	// 	name: "toggleFoldersSidebar",
	// 	bindKey: { win: "Alt+Shift+S", mac: "Option+Shift+S" },
	// 	exec: execCommandToggleFolders,
	// },
	{
		target: "app",
		name: "toggleSplitView",
		bindKey: { win: "Alt+S", mac: "Option+S" },
		exec: execCommandSplitView,
	},
	{
		target: "app",
		name: "show-scratchpad",
		bindKey: { win: "Alt+N", mac: "Option+N" },
		exec: () => {
			execCommandToggleSidebarPanel('edit_note');
		},
	},
	{
		target: "app",
		name: "addFolder",
		exec: execCommandAddFolder,
	},
	{
		target: "app",
		name: "refeshFolders",
		exec: execCommandRefreshFolders,
	},
	{
		target: "app",
		name: "removeAllFolders",
		exec: execCommandRemoveAllFolders,
	},
	{
		target: "app",
		name: "restoreFolders",
		bindKey: { win: "Alt+R", mac: "Option+R" },
		exec: execCommandRestoreFolders,
	},
	{
		target: "app",
		name: "showAbout",
		exec: execCommandAbout,
	},
	{
		target: "app",
		name: "setTheme",
		exec: (theme) => {
			window.editors.forEach(editor=>{
				editor.setOption("theme", theme)
			})
			updateThemeAndMode(true)
		},
	},
	{
		target: "app",
		name: "setMode",
		exec: (mode) => {
			currentEditor.setOption("mode", mode)
			updateThemeAndMode(false)
		},
	},
	{
		target: "app",
		name: "hindOmniBox",
		bindKey: { win: "escape", mac: "escape" },
		exec: () => {
			window.ui.hideOmnibox()
		},
	},
	{
		target: "app",
		name: "workspaceOpen",
		exec: async (args) => {
			await sleep(400)
			if (args === workspace.name) {
				return
			}
			openWorkspace(args, true)
		},
	},
	{
		target: "app",
		name: "workspaceRename",
		exec: async () => {
			await sleep(400)
		},
	},
	{
		target: "app",
		name: "workspaceDelete",
		exec: async () => {
			await sleep(400)
			if (workspace.name !== "default") {
				if (confirm(`Really? Perminantly delete workspace ${workspace.name}?`)) {
					// set(`workspace_${workspace.id}`console.warn("DELETE", workspace)
					console.warn("DELETE", workspace)
					del(`workspace_${workspace.id}`)
                    
                    // NEW: Also delete all associated AI sessions from IndexedDB
                    // Note: This assumes `workspace.aiSessionsMetadata` holds all session IDs.
                    for (const sessionMeta of workspace.aiSessionsMetadata) {
                        await del(`ai-session-${sessionMeta.id}`);
                    }
                    // This is where a more robust orphaned session cleanup could happen if needed for truly lost sessions.

					app.workspaces.splice(app.workspaces.indexOf(workspace.id), 1)

					// reset to default
					app.workspace = "default"
					workspace.id = "default"
					saveAppConfig()
					openWorkspace("default")
				}
			} else {
				console.warn("unsupported")
			}
		},
	},
	{
		target: "app",
		name: "workspaceNew",
		exec: async () => {
			await sleep(400)
			// ensure there are no unsaved edits
			let unsaved = false
			for (const tab of leftTabs.tabs) {
				if (tab._changed) unsaved = true
			}
			if (unsaved) {
				if (!confirm("You have unsaved changes, are you sure?")) {
					return
				}
			}

			let name = prompt("New workspace name")
			if (name) {
				const id = safeString(name)
				if (app.workspaces.indexOf(id) !== -1) {
					alert("workspace name already exists")
					return
				}
				app.workspaces.push(id)
				app.workspace = id

				workspace.name = name
				workspace.id = id
				workspace.folders = []
				workspace.files = []
				workspace.openFolders = [];
                // NEW: Initialize empty AI session metadata for new workspace
                workspace.aiSessionsMetadata = [];
                workspace.activeAiSessionId = null;

				// clear the leftTabs
				while (leftTabs.tabs.length > 1) {
					leftTabs.tabs[0].close.click()
				}
				leftTabs.tabs[0].close.click()

				// refresh the folder list
				ui.showFolders()
				// update the workspace menu
				// update the app config object
				saveAppConfig()

				updateWorkspaceSelectors()

				fileAccess.remove()
			}
		},
	},
	{
		target: "app",
		name: "setDarkMode",
		exec: (mode) => {
			execCommandSetDarkMode(mode);
		},
	},
	{
		target: "app",
		name: "show-ai",
		bindKey: { win: "Alt+A", mac: "Option+A" },
		exec: () => {
			execCommandToggleSidebarPanel('developer_board');
		},
	},
]

keyBinds.forEach((bind) => {
	window.ui.commands.add(bind)
})

window.ui.execCommand = (c, args) => {
	let target = "editor",
		command = c,
		ext = ""
	if (c.indexOf(":") > -1) {
		let bits = c.split(":")
		;(target = bits[0]), (command = bits[1])
		if (bits.length > 2) {
			ext = bits[2]
		}
	}
	if (target == "editor") {
		currentEditor.focus()
		currentEditor.execCommand(command, ext)
	} else if (target == "editor-ex") {
		currentEditor.execCommand(command, ext)
	} else {
		window.ui.commands.exec(command, ext)
		// leftEdit.execCommand(command, ext)
	}
}

window.addEventListener("beforeinstallprompt", (e) => {
	let deferredPrompt = e
	const showInstallPromotion = () => {
		if (sessionStorage.getItem("install_defer") || localStorage.getItem("install_deny")) return
		ui.installer.later.on("click", () => {
			// make sure we don't ask again before next visit
			sessionStorage.setItem("install_defer", true)
			ui.installer.offscreen()
		})

		ui.installer.confirm.on("click", () => {
			// make sure we don't ask again before next visit
			sessionStorage.setItem("install_defer", true)
			deferredPrompt.prompt()
			ui.installer.offscreen()
		})

		ui.installer.deny.on("click", () => {
			// make sure we don't ask again, period
			localStorage.setItem("install_deny", true)
			ui.installer.offscreen()
		})

		ui.installer.onscreen()
	}
	// Prevent the mini-infobar from appearing on mobile
	e.preventDefault()
	// Stash the event so it can be triggered later.
	// Update UI notify the user they can install the PWA
	if (sessionStorage.getItem("notSupported")) return
	showInstallPromotion()
	// Optionally, send analytics event that PWA install promo was shown.
})

setTimeout(async () => {
	ui.leftHolder.editorElement.classList.remove("loading")
	ui.rightHolder.editorElement.classList.remove("loading")

	window.filesReceiver.addEventListener("message", (e) => {
		if (e.data?.open && window.activeFileReceiver) {
			window.filesReceiver.postMessage("fileAccepted")
			openFileHandle(e.data.open)
		}
	})

    leftEdit.on("focus", () => setCurrentEditor(leftEdit));
    rightEdit.on("focus", () => setCurrentEditor(rightEdit));
    
    ui.iconTabBar.on("tabs-updated", (e)=>{ 
    	saveWorkspace() 
    	if(e.detail?.tab?._iconId == "developer_board") {
    		ui.aiManager.focus()
    	}
    })
    // REMOVED: ui.aiManager.panel.addEventListener('new-prompt', (event) => { /* ... */ });
    // This is now handled within ai-manager for activeSession.promptHistory

    ui.aiManager.panel.addEventListener('context-update', async (event) => {
        const { aiSessionsMetadata, activeSessionData, type } = event.detail;

        // 1. Update workspace metadata (lightweight save)
        if (aiSessionsMetadata) {
            workspace.aiSessionsMetadata = aiSessionsMetadata.sessions;
            workspace.activeAiSessionId = aiSessionsMetadata.activeSessionId;
            // Debounce workspace saves, as they can happen on session switch, rename, delete
            clearTimeout(ui.aiManager.saveWorkspaceTimeout); 
            ui.aiManager.saveWorkspaceTimeout = setTimeout(saveWorkspace, 1000); 
        }

        // 2. Save the full active session data to IndexedDB (on demand)
        // This happens on message append, delete, summarization, or session switch
        if (activeSessionData && activeSessionData.id) {
            const sessionKey = `ai-session-${activeSessionData.id}`;
            await set(sessionKey, activeSessionData);
            console.debug(`AI session "${activeSessionData.name}" (${activeSessionData.id}) saved to IndexedDB.`);
        }
    });

    window.addEventListener('setting-changed', (event) => {
        const { settingsName, settings, useWorkspaceSettings } = event.detail;
        const providerName = settingsName.replace('Config', ''); // e.g., 'ollama' or 'gemini'

        if (useWorkspaceSettings) {
            workspace.aiConfig[providerName] = { ...settings };
            if (app.aiConfig && app.aiConfig[providerName]) delete app.aiConfig[providerName]; // Clear global settings for this provider if using workspace specific
            saveWorkspace();
        } else {
            app.aiConfig[providerName] = { ...settings };
            if (workspace.aiConfig && workspace.aiConfig[providerName]) delete workspace.aiConfig[providerName]; // Clear workspace settings for this provider if using global
            saveAppConfig();
        }
    });
    ui.sidebar.resizeListener(()=>{
		clearTimeout(ui.sidebar.saveTimeout);
		ui.sidebar.saveTimeout = setTimeout(saveWorkspace, 500);
    })

	leftEdit.on("ready", async () => {
		// preload stored file and folder handles
		let stored = await get("appConfig")

		app.darkmode = stored?.darkmode || "system"
		app.sessionOptions = stored?.sessionOptions || null
		app.rendererOptions = stored?.rendererOptions || null
		app.enableLiveAutocompletion = stored?.enableLiveAutocompletion || null

		// Apply any stored editor settings immediately after loading them.
		execCommandEditorOptions();

		app.workspace = stored?.workspace || "default"
		app.workspaces = stored?.workspaces || [app.workspace]
        app.aiConfig = stored?.aiConfig || {};

		if (app.workspace) {
			openWorkspace(app.workspace)
		} else {
			updateWorkspaceSelectors()
		}

		execCommandSetDarkMode(app.darkmode); 

		saveAppConfig()
		
        // After appConfig is loaded and aiManager is initialized, apply global AI settings
        const currentProvider = ui.aiManager.aiProvider;
        if (app.aiConfig[currentProvider]) {
            ui.aiManager.ai.setOptions(app.aiConfig[currentProvider], null, null, false, 'global');
        } else {
            // If no specific config for the current provider, reset to default for that provider
            ui.aiManager.ai.setOptions({}, null, null, false, 'global');
        }
		
		// set supported files in our FileList control
		let regs = []
		for (let n in ace_modes) {
			const mode = ace_modes[n]
			regs.push(mode.extRe)
		}
		ui.fileList.supported = regs

		let all = []
		workspace.folders.forEach((handle) => {
			let perm = verifyPermission(handle, true).then((res) => {
				if (!res) handle.locked = true
			})
			all.push(perm)
		})

		Promise.all(all).then(() => {
			ui.showSidebar()
		})

		if (workspace.folders.length > 0) {
			ui.showSidebar()
		}
		ui.toggleSidebar()
		ui.currentTabs = ui.leftTabs
		
		//defaultTab()
		ui.fileList.open = openFileHandle;
		fileList.unsupported = openFileHandle;
		leftTabs.dropFileHandle = (handle, knownPath) => openFileHandle(handle, knownPath, leftEdit);
		rightTabs.dropFileHandle = (handle, knownPath) => openFileHandle(handle, knownPath, rightEdit);
		leftTabs.defaultTab = () => defaultTab(leftTabs);
		rightTabs.defaultTab = () => {
		console.debug("rightTabs.defaultTab: Creating default tab for right tab bar.");
		return defaultTab(rightTabs);
};

		const scratchpad = ui.scratchEditor;
		scratchpad.on('change', () => {
			workspace.scratchpad = scratchpad.getValue();
			// Debounced save
			clearTimeout(scratchpad.saveTimeout);
			scratchpad.saveTimeout = setTimeout(saveWorkspace, 500);
		});

		leftTabs.onEmpty = () => {
			leftEdit.setSession(ace.createEditSession(""));
			leftEdit.container.style.display = 'none';
			leftMedia.style.display = 'none';
			window.ui.hideFileModifiedNotice('left'); // Hide notice bar when empty
		};

		rightTabs.onEmpty = () => {
			rightEdit.setSession(ace.createEditSession(""));
			rightEdit.container.style.display = 'none';
			rightMedia.style.display = 'none';
		    window.ui.hideFileModifiedNotice('right'); // Hide notice bar when empty
			ui.toggleSplitView({targetState: "closed"});
		};

		if ("launchQueue" in window) {
			launchQueue.setConsumer((params) => {
				if (params.files.length > 0) {
					for (const fileHandle of params.files) {
						openFileHandle(fileHandle)
					}
				}
			})
		}

		// Listen for custom event to insert code snippets from AI panel
		window.addEventListener('insert-snippet', (event) => {
			if (currentEditor) {
				currentEditor.insert(event.detail);
				currentEditor.focus();
			}
		});
	})
})
