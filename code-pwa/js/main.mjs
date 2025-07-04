// TODO: enhancements
// --- drag+drop tabs on the tabbar
// --- disable live autocomplete
// --- set text baseValue at load and save, use it for change tracking
// --- Add "notSupported" page for firefox/brave other browsers that don't support the FileAPI
// --- add "CTRL+N" to create a new file/untitled document
// --- find out why useSoftTabs isn't disbling with its setting (bug in ACE-setting ext)
// --- Add menus (file/edit/etc) and context menu for FileList component
// --- persist editor settings in localstorage / indexdb
// --- implement "prettier" for code beautification
// --- bind theme and mode menus
// --- create "about" panel
// --- dark mode
// --- link active tab(s) to file view
// --- bind edit state between tabs and filelist?
// --- infer file type from #!/ opening line
// --- implement OS integration for file handling "Open with" (Chrome origin trial)
// --- implement indexing of filenames in workspace folders
// --- add licence information (including prettier/ace credits to about)
// --- restore workspace open files during app load
// --- implement file-type icons in file view
//
// implement multiple workspaces (restore last open?)
// move ace settings panel into a tabbed modal with other application settings
// implement @lookup in omnibox
// implement side-by-side split view
// add keyboard navigation to menus
// add save/load triggers for prettier with independant settings
// look at ponyfilling file access https://github.com/jimmywarting/native-file-system-adapter/
// maybe add "delete file" in filelist context menu?
// maybe consider porting prettier modules for Kotline/Java/Sh/other?

import prettier from "https://unpkg.com/prettier@2.4.1/esm/standalone.mjs"
import parserBabel from "https://unpkg.com/prettier@2.4.1/esm/parser-babel.mjs"
import parserHtml from "https://unpkg.com/prettier@2.4.1/esm/parser-html.mjs"
import parserCss from "https://unpkg.com/prettier@2.4.1/esm/parser-postcss.mjs"
import { get, set, del } from "https://cdn.jsdelivr.net/npm/idb-keyval@6/+esm"

import ui from "./ui-main.mjs"

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

const editorElementID = "editor"
const thumbElementID = "thumbstrip"
let permissionNotReloaded = true // should we re-request permission for folders added

ui.create()
window.ui = ui
window.code = {
	version: "0.3.2",
}

const app = {
	folders: [],
	workspaces: [],
	sessionOptions: null,
	rendererOptions: null,
	enableLiveAutocompletion: null,
	darkmode: 'system',
}

const workspace = {
	id: "default",
	name: "default",
	folders: [],
	files: [],
}

// window.showSettings = ui.showSettings
window.app = app
window.workspace = workspace

const fileOpen = new elements.Button("Add Folder to Workspace")
const fileAccess = new elements.Button("Restore")

const editor = ui.editor
const thumbs = ui.thumb
const installer = ui.installer
const fileActions = ui.fileActions
const fileList = ui.fileList
const tabBar = ui.tabBar
const prettify = document.querySelector("#prettier")

window.ui.commands = {
	byKeys: {},
	byName: {},
	add(command) {
		if (command && command.name && "function" == typeof command.exec) {
			switch (command.target) {
				case "editor":
					//register with ACE editor
					editor.commands.addCommand({
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
		console.log("execCommand", commandName, args)
		if (commandName in this.byName) {
			this.byName[commandName].exec(args)
		}
	},
	bindToDocument() {
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
	},
}
window.ui.commands.bindToDocument()

const saveFile = async (text, handle) => {
	const tab = tabBar.activeTab
	const file = fileList.activeItem

	const writable = await handle.createWritable()
	await writable.write(text)
	await writable.close()
	tab.changed = false
	if (file) {
		file.changed = false
	}
}

const saveAppConfig = async () => {
	app.sessionOptions = ui.editor.session.getOptions()
	app.rendererOptions = ui.editor.renderer.getOptions()
	app.enableLiveAutocompletion = ui.editor.$enableLiveAutocompletion
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

let workspaceUnloading = false
const saveWorkspace = async () => {
	if (workspaceUnloading) return
	let name = workspace.name
	set(`workspace_${workspace.id}`, workspace)
	console.debug("saved", workspace)
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
		let load = await get(`workspace_${name}`)

		const hideActions = () => {
			close.remove()
			rename.remove()
			remove.remove()
		}

		if ("undefined" != typeof load) {
			workspaceUnloading = true
			// clear the tabBar
			while (tabBar.tabs.length > 1) {
				tabBar.tabs[0].close.click()
			}
			if (tabBar.tabs[0]) tabBar.tabs[0].close.click()

			workspaceUnloading = false

			workspace.name = load.name || "default"
			workspace.folders = load.folders || []
			workspace.files = load.files || []
			workspace.id = load.id || safeString(workspace.name)

			if (workspace.folders.length > 0) {
				fileActions.append(fileAccess)
				fileOpen.text = "Add Folder"
				if (triggered) await fileAccess.click()
			}

			app.workspace = workspace.id
			if (name === "default") {
				hideActions()
			}

			saveAppConfig()
			ui.showFolders()
			updateWorkspaceSelectors()
		} else {
			if (name === "default") {
				workspace.name = "default"
				workspace.id = "default"
				workspace.files = []
				workspace.folders = []
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

	if (editor.getOption("mode") in canPrettify) {
		prettify.removeAttribute("disabled")
	} else {
		prettify.setAttribute("disabled", "disabled")
	}
	if (doSave) saveAppConfig()
}

const execCommandPrettify = () => {
	let text = editor.getValue()
	const mode = editor.getOption("mode")
	if (!(mode in canPrettify)) return

	const parser = canPrettify[mode]
	const activeRow = editor.getCursorPosition().row + 1

	try {
		text = prettier.format(text, {
			parser: parser.name,
			plugins: parser.plugins,
			printWidth: editor.getOption("printMargin") || 120,
			tabWidth: editor.getOption("tabSize") || 4,
			useTabs: !editor.getOption("useSoftTabs") || false,
			semi: false,
		})
		editor.setValue(text)
		editor.clearSelection()
		editor.gotoLine(activeRow)
	} catch (e) {
		console.warn("Unable to prettify", e)
		const m = e.message
		try {
			let match = m.match(/\>\s(\d*) \|/g)
			if (match.length > 0) {
				let l = parseInt(match[0].replace(/[\>\|\s]/g, "")) - 1
				editor.getSession().setAnnotations([
					{
						row: l,
						column: 0,
						text: m, // Or the Json reply from the parser
						type: "error", // also "warning" and "information"
					},
				])
				editor.execCommand("goToNextError")
			}
		} catch (er) {
			console.error("Unable to prettify", e, er)
		}
	}
}

const execCommandEditorOptions = () => {
	if (app.sessionOptions) editor.session.setOptions(app.sessionOptions)
	if (app.rendererOptions) editor.renderer.setOptions(app.rendererOptions)
	if (app.enableLiveAutocompletion) editor.$enableLiveAutocompletion = app.enableLiveAutocompletion

	if (editor.getOption("mode") === "ace/mode/javascript") {
		editor.setOption("useWorker", false)
	} else {
		editor.setOption("useWorker", true)
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
	ui.toggleFiles()
}

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
				ui.showFolders()
				// saveAppConfig()
				saveWorkspace()
			}
		}
	}, 400)
}

const execCommandRefreshFolders = () => {}

const execCommandCloseActiveTab = async () => {
	const tab = tabBar.activeTab
	tab.close.click()
}
const execCommandSave = async () => {
	const config = tabBar.activeTab.config
	if (config.handle) {
		const text = editor.getValue()
		await saveFile(text, config.handle)
		config.session.baseValue = text
	} else {
		const newHandle = await window.showSaveFilePicker().catch(console.warn)
		if (!newHandle) {
			alert("File NOT saved")
			return
		}
		config.handle = newHandle
		config.name = newHandle.name
		tabBar.activeTab.text = config.name
		const text = editor.getValue()
		await saveFile(text, config.handle)
		config.session.baseValue = text
	}
}

const execCommandSaveAs = async () => {
	const config = tabBar.activeTab.config
	const newHandle = await window.showSaveFilePicker().catch(console.warn)
	if (!newHandle) {
		alert("File NOT saved")
		return
	}
	config.handle = newHandle
	config.name = newHandle.name
	tabBar.activeTab.text = config.name
	saveFile(editor.getValue(), config.handle)
}

const execCommandOpen = async () => {
	const newHandle = await window.showOpenFilePicker().catch(console.warn)
	if (!newHandle) {
		return
	}
	fileList.open(newHandle[0])
}

const execCommandNewFile = async () => {
	const srcTab = tabBar.activeTab
	const mode = srcTab.config?.mode?.mode || ""
	const folder = srcTab.config?.folder || undefined
	const newSession = ace.createEditSession("", mode)
	newSession.baseValue = ""

	const tab = tabBar.add({ name: "untitled", mode: { mode: mode }, session: newSession, folder: folder })

	editor.setSession(newSession)
	execCommandEditorOptions()
	tab.click()
}

const execCommandNewWindow = async () => {
	window.open("/", "new-window", `width=${window.outerWidth},height=${window.outerHeight}`)
}

const buildPath = (f) => {
	if (!(f instanceof FileSystemFileHandle || f instanceof FileSystemDirectoryHandle)) {
		return ""
	}
	let n = f.name
	if (f.container) n = buildPath(f.container) + "/" + n
	return n
}

const openFileHandle = (tabBar.dropFileHandle = async (handle, knownPath = null) => {
	// don't add a new tab if the file is already open in a tab
	const path = knownPath != null ? knownPath : buildPath(handle)
	{
		let tab = tabBar.byTitle(path)
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
		if(file.name.startsWith(".")) {
			fileMode.mode = "ace/mode/sh"
		} else {
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
			if (fileMode.mode == "") {
				fileMode.mode = "ace/mode/text"
			}
		}
	}

	if (fileMode.mode == "") {
		console.warn("Unsupported File", file)
		alert(`Unsupported or unrecongnised file type: ${file.name.split(".").pop().toUpperCase()}`)
		return
	}

	if (fileMode.name == "javascript" && 1 == 0) {
		// console.log("Pretifying JavaScript")
		text = prettier.format(text, {
			parser: "babel",
			plugins: [parserBabel, parserHtml],
			printWidth: 120,
			tabWidth: 4,
			useTabs: true,
			semi: false,
		})
	}

	if (tabBar.tabs.length == 1 && editor.getValue() == "") {
		tabBar.remove(tabBar.tabs[0])
	}

	const newSession = ace.createEditSession(text, fileMode.mode)
	newSession.baseValue = text

	editor.setSession(newSession)
	execCommandEditorOptions()
	thumbstrip.setValue(editor.getValue())
	thumbStrip.clearSelection()
	thumbStrip.gotoLine(0)

	const tab = tabBar.add({
		name: file.name,
		mode: fileMode,
		session: newSession,
		handle: handle,
		folder: handle.container,
	})
	tab.click()

	let matched = false
	for (let i = 0; i < workspace.files.length; i++) {
		if (workspace.files[i].handle == tab.config.handle) {
			matched = true
		}
	}

	if (knownPath != null) return

	if (!matched) {
		workspace.files.push({
			name: file.name,
			path: path,
			handle: handle,
			containers: (() => {
				const containers = []
				const recurse = (container) => {
					containers.push(container)
					if (container.container) {
						recurse(container.container)
					}
				}
				recurse(handle.container)
				return containers
			})(),
		})
	}
	saveWorkspace()
})

const fileMenu = document.getElementById("file_context")
const folderMenu = document.getElementById("folder_context")
const topfolderMenu = document.getElementById("top_folder_context")

folderMenu.click = topfolderMenu.click = (action) => {
	console.log(action)
	const active = fileList.contextElement
	const file = active.item
	switch (action) {
		case "remove":
			for (let i = 0; i < workspace.folders.length; i++) {
				console.log(workspace.folders[i] === file)
				if (workspace.folders[i] === file) {
					workspace.folders.splice(i, 1)
					i--
				}
			}
			// 			saveAppConfig()
			saveWorkspace()
			ui.showFolders()
			break
		case "refresh":
			if (active.refresh) {
				active.refresh.click()
			}
			break
	}
	// console.log(fileList.contextElement.item)
}
fileList.context = (e) => {
	let menu = folderMenu

	if (e.srcElement.parentElement.parentElement instanceof elements.FileList) {
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
fileList.open = openFileHandle
fileList.unsupported = openFileHandle
fileList.expand = (item) => {
	for (const tab of tabBar.tabs) {
		fileList.active = tab.config.handle
		if (tab._changed) {
			fileList.activeItem.changed = true
		}
	}
	fileList.active = tabBar.activeTab.config.handle
}

tabBar.click = async (event) => {
	const tab = event.tab

	if (tab.config.mode.mode === "media") {
		ui.editorElement.style.display = 'none';
		ui.mediaView.style.display = 'block';

		const file = await tab.config.handle.getFile();
		const imageUrl = URL.createObjectURL(file);
		ui.mediaView.setImage(imageUrl);

		fileList.active = tab.config.handle;
		tab.scrollIntoViewIfNeeded();
		tabBar.scrollTop = 0;
		updateThemeAndMode();
	} else {
		ui.editorElement.style.display = 'block';
		ui.mediaView.style.display = 'none';
		// ui.mediaView.style.backgroundImage = ''; // Clear background image - handled by setImage
		// ui.mediaView.style.backgroundColor = ''; // Reset background color - handled by setImage

		editor.setSession(tab.config.session);
		fileList.active = tab.config.handle;

		tab.scrollIntoViewIfNeeded();
		tabBar.scrollTop = 0;

		if (tab.changed && fileList.activeItem) {
			fileList.activeItem.changed = true;
		}
		thumbStrip.setValue(editor.getValue());
		thumbStrip.clearSelection();
		thumbStrip.gotoLine(editor.getCursorPosition().row + 1);
		updateThemeAndMode();
		editor.focus();
	}
}

tabBar.close = (event) => {
	const tab = event.tab
	if (tab.changed) {
		if (!confirm("This file has unsaved changes, are you sure?")) {
			return
		}
	}

	// If the tab is a media file, revoke the object URL
	if (tab.config.mode.mode === "media" && ui.mediaView.style.backgroundImage) {
		const imageUrl = ui.mediaView.style.backgroundImage.replace(/url\("|"\)/g, '');
		URL.revokeObjectURL(imageUrl);
	}

	// remove from workspace recent files
	for (let i = 0; i < workspace.files.length; i++) {
		if (workspace.files[i].handle == tab.config.handle) {
			workspace.files.splice(i, 1)
			i--
		}
	}
	//if(workspace.files.indexOf(tab.config.handle)>-1) { workspace.files.splice(workspace.files.indexOf(tab.config.handle), 1) }

	fileList.inactive = tab.config.handle

	tabBar.remove(tab)
	if (tabBar.tabs.length == 0) {
		defaultTab()
	}
	tab.config.session.destroy()
	//saveAppConfig()
	saveWorkspace()
}

const defaultTab = () => {
	const defaultSession = ace.createEditSession("", "")
	const tab = tabBar.add({ name: "untitled", mode: { mode: "" }, session: defaultSession })
	editor.setSession(defaultSession)
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

	if (allGood) {
		// hide this button now
		fileAccess.remove()
		fileOpen.text = "Add Folder to Workspace"
		await fileList.refreshAll()

		if (workspace.files.length > 0) {
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
				openFileHandle(file.handle, file.path)
				fileList.active = file.handle
			}
		}
		ui.showFolders(1)
	} else {
		ui.showFolders()
	}
})

fileOpen.icon = "create_new_folder"
fileOpen.title = "Add Folder to Workspace"
fileActions.append(fileOpen)

if (workspace.folders.length > 0) {
	fileActions.append(fileAccess)
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
	ui.showFolders()
})

const keyBinds = [
	{
		target: "app",
		name: "showKeyboardShortcuts",
		bindKey: { win: "ctrl-alt-k", mac: "Command-Alt-k" },
		exec: function () {
			ace.config.loadModule("ace/ext/keybinding_menu", function (module) {
				module.init(editor)
				editor.showKeyboardShortcuts()
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
			editor.execCommand("findnext")
		},
	},
	{
		target: "editor",
		name: "collapselines",
		bindKey: { win: "Ctrl-Shift-J", mac: "Command-Shift-J" },
		exec: () => {
			editor.execCommand("joinlines")
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
			editor.execCommand("openCommandPallete")
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
			tabBar.next()
		},
	},
	{
		target: "app",
		name: "prev-buffer",
		bindKey: { win: "Ctrl+Shift+Tab", mac: "Command+Shift+Tab" },
		exec: () => {
			tabBar.prev()
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
			editor.execCommand("showSettingsMenu", () => {
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
		exec: execCommandToggleFolders,
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
		name: "showAbout",
		exec: execCommandAbout,
	},
	{
		target: "app",
		name: "setTheme",
		exec: (theme) => {
			editor.setOption("theme", theme)
			updateThemeAndMode(true)
		},
	},
	{
		target: "app",
		name: "setMode",
		exec: (mode) => {
			editor.setOption("mode", mode)
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
			for (const tab of tabBar.tabs) {
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

				// clear the tabBar
				while (tabBar.tabs.length > 1) {
					tabBar.tabs[0].close.click()
				}
				tabBar.tabs[0].close.click()

				console.log("new workspace", name)
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
		editor.focus()
		editor.execCommand(command, ext)
	} else if (target == "editor-ex") {
		editor.execCommand(command, ext)
	} else {
		window.ui.commands.exec(command, ext)
		// editor.execCommand(command, ext)
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
	ui.editorElement.classList.remove("loading")
	ui.thumbElement.classList.remove("loading")

	window.filesReceiver.addEventListener("message", (e) => {
		if (e.data?.open && window.activeFileReceiver) {
			window.filesReceiver.postMessage("fileAccepted")
			openFileHandle(e.data.open)
		}
	})

	editor.on("ready", async () => {
		// preload stored file and folder handles
		let stored = await get("appConfig")

		if ("undefined" != typeof stored) {
			app.darkmode = stored.darkmode || true
			app.sessionOptions = stored.sessionOptions || null
			app.rendererOptions = stored.rendererOptions || null
			app.enableLiveAutocompletion = stored.enableLiveAutocompletion || null

			app.workspace = stored.workspace || "default"
			app.workspaces = stored.workspaces || [app.workspace]

			if (app.workspace) {
				openWorkspace(app.workspace)
			} else {
				updateWorkspaceSelectors()
			}

			if (app.darkmode) {
				execCommandSetDarkMode(app.darkmode);
			}
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
			ui.showFolders()

			let allGood = true
			workspace.folders.forEach((handle) => {
				if (handle.locked) allGood = false
			})
			if (allGood) {
				fileAccess.click()
			}
		})

		if (workspace.folders.length > 0) {
			ui.showFolders()
		}
		ui.toggleFiles()
		defaultTab()

		if ("launchQueue" in window) {
			launchQueue.setConsumer((params) => {
				if (params.files.length > 0) {
					for (const fileHandle of params.files) {
						openFileHandle(fileHandle)
					}
				}
			})
		}
	})
})

