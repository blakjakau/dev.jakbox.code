
// TODO: top priority
// menus context / file
// disable live autocomplete
// look at restoring workspace during app load?
// find out why useSoftTabs isn't disbling with its setting
// trag+drop tabs on the tabbar

import ui from './ui-main.mjs'
// import elements from "../elements/elements.mjs"
import { get, set } from "/idb-keyval/index.js"

async function verifyPermission(fileHandle, queryOnly=false) {
	const options = {};
	options.mode = 'readwrite';
	// Check if permission was already granted. If so, return true.
	if ((await fileHandle.queryPermission(options)) === 'granted') {
		return true;
	}
	
	if(queryOnly) return false
	
	// Request permission. If the user grants permission, return true.
	if ((await fileHandle.requestPermission(options)) === 'granted') {
		return true;
	}
	// The user didn't grant permission, so return false.
	return false;
}

const editorElementID = "editor"
const thumbElementID = "thumbstrip"
let permissionNotReloaded = true; // should we re-request permission for folders added

ui.create()
window.ui = ui
window.code = {
	version: "0.1.2"
}

const app = {
	folders: [],
}

window.app = app


const fileOpen = new elements.Button("Add Folder to Workspace");
const fileAccess = new elements.Button("Unlock All");

{
	// preload stored file and folder handles
	let stored = await get("appConfig");
	if('undefined'!=typeof stored) {
		app.folders = stored.folders
	}
	let all = []
	app.folders.forEach(handle=>{
	    let perm = verifyPermission(handle, true).then(res=>{
	    	if(!res) handle.locked = true
	    })
	    all.push(perm);
	})
	
	Promise.all(all).then(()=>{
	    ui.showFolders()
	    
	    let allGood = true
	    app.folders.forEach(handle=>{
	        if(handle.locked) allGood = false
	    })
	    if(allGood) {
	        fileAccess.click()
	    }
	})
	// console.log(app.folders);
}

const editor = ui.editor
const thumbs = ui.thumb
const fileActions = ui.fileActions;
const fileList = ui.fileList;
const tabList = ui.tabList;

const saveFile = async (text, handle)=>{
    const tab = tabList.activeTab
	const writable = await handle.createWritable()
	await writable.write(text)
	await writable.close()
	tab.changed = false
// 	console.debug("content written to file")
}

const execCommandSave = async ()=>{
	const config = tabList.activeTab.config
	if(config.handle) {
		saveFile(editor.getValue(), config.handle);
	} else {
		const newHandle = await window.showSaveFilePicker().catch(console.warn)
		if(!newHandle) { alert("File NOT saved"); return }
		config.handle = newHandle;
		config.name = newHandle.name
		tabList.activeTab.text = config.name
		saveFile(editor.getValue(), config.handle)
	}
}

const execCommandSaveAs = async ()=>{
	const config = tabList.activeTab.config
	const newHandle = await window.showSaveFilePicker().catch(console.warn)
	if(!newHandle) { alert("File NOT saved"); return }
	config.handle = newHandle
	config.name = newHandle.name
	tabList.activeTab.text = config.name
	saveFile(editor.getValue(), config.handle)
}

const execCommandOpen = async ()=>{
	const newHandle = await window.showOpenFilePicker().catch(console.warn)
	if(!newHandle) { return }
	fileList.open(newHandle[0])
}

fileList.unlock = verifyPermission
fileList.open = async (handle)=>{
	
	// don't add a new tab if the file is already open in a tab
	for(let i=0,l=tabList.tabs.length; i<l; i++) {
		let tab = tabList.tabs[i]
		if(tab.config.handle === handle) {
			console.warn("File already open")
			tab.click();
			return
		}
	}
	
	const file = await handle.getFile()
	const text = await file.text()
	let fileMode= { mode: "" };
	
	// lookup editor modes
	for(let n in ace_modes) {
		const mode = ace_modes[n]
		if(file.name.match(mode.extRe)) {
			fileMode = mode
			break;
		}
	}
	
	if(tabList.tabs.length==1 && editor.getValue() == "") {
		tabList.remove(tabList.tabs[0]);
	}
	
	const newSession = ace.createEditSession(text, fileMode.mode)
	editor.setSession(newSession)
	thumbstrip.setValue(editor.getValue())
	thumbStrip.clearSelection();
	thumbStrip.gotoLine(0)
	
	const tab = tabList.add({name: file.name, mode: fileMode, session: newSession, handle: handle, folder:handle.container})
	tab.click();
}

tabList.click = event=>{
	const tab = event.tab
	editor.setSession(tab.config.session)
	thumbStrip.setValue(editor.getValue())
	thumbStrip.clearSelection();
	thumbStrip.gotoLine(editor.getCursorPosition().row+1)
	ui.updateThemeAndMode()
}

tabList.close = event=>{
	const tab = event.tab
	
	if(tab.changed) {
		if(!confirm("This file has unsaved changes, are you sure?")) {
			return
		}
	}
	
	
	tabList.remove(tab)
	if(tabList.tabs.length==0) {
		defaultTab()
	}
	tab.config.session.destroy()
}

const defaultTab = ()=>{
	const defaultSession = ace.createEditSession("", "")
	const tab = tabList.add({name: "untitled", mode: {mode:""}, session: defaultSession})
	editor.setSession(defaultSession)
	tab.click();
}
defaultTab()

// fileActions.hook="bottom";
fileAccess.icon = "lock_open"
fileAccess.hook = "right"
fileAccess.title = "Refresh Workspace File Permissions"
fileAccess.on("click", async ()=>{
	let allGood = true;
	for(let i=0,l=app.folders.length;i<l;i++) {
		let handle = app.folders[i]
		if(await verifyPermission(handle)) {
			handle.locked = false
			ui.showFolders()
		} else {
			allGood = false
		}
	}
	
	if(allGood) { // hide this button now
		fileAccess.remove()
		fileOpen.text = "Add Folder to Workspace"
	}
})

fileOpen.icon = "add";
fileOpen.title = "Add Folder to Workspace"
fileActions.append(fileOpen);

if(app.folders.length > 0) {
	fileActions.append(fileAccess);
	fileOpen.text = "Add Folder"
}

fileOpen.on("click", async ()=>{
	const folderHandle = await window.showDirectoryPicker({mode:'readwrite', create:true})
	
	// checkForExistingFolder
	// before adding the folder, lets make sure we don't already have access.
	let addToFolders = true;
	app.folders.forEach(handle=>{
		if(handle == folderHandle) {
			addToFolders = false;
		}
	})

	// verifyPermission
	await verifyPermission(folderHandle);
	if(addToFolders) app.folders.push(folderHandle);
	await set("appConfig", app);
	ui.showFolders()
})

editor.commands.addCommand({
    name: 'find',
    bindKey: { win:'Ctrl-F',mac:'Ctrl-F' },
    exec: ()=>{
    	window.ui.omnibox("find");
    }
});

editor.commands.addCommand({
    name: 'goto',
    bindKey: { win:'Ctrl-G',mac:'Ctrl-G' },
    exec: ()=>{
    	window.ui.omnibox("goto");
    }
});

// editor.commands.addCommand({
//     name: 'goto',
//     bindKey: { win:'Ctrl-R',mac:'Ctrl-R' },
//     exec: ()=>{
//     	console.warn("GOTO not implemented")
//     }
//     // editor.commands.byName['find'].exec
// });

editor.commands.addCommand({
    name: 'find-next',
    bindKey: { win:'F3',mac:'F3' },
    exec: ()=>{
    	editor.execCommand("find-next")
    }
});

editor.commands.addCommand({
    name: 'next-buffer',
    bindKey: { win:'Ctrl+Tab',mac:'Ctrl+Tab' },
    exec: ()=>{
    	tabList.next()
    }
});

editor.commands.addCommand({
    name: 'prev-buffer',
    bindKey: { win:'Ctrl+Shift+Tab',mac:'Ctrl+Shift+Tab' },
    exec: ()=>{
    	tabList.prev()
    }
});


editor.commands.addCommand({
    name: 'openFile',
    bindKey: { win:'Ctrl+O',mac:'Ctrl+O' },
    exec: execCommandOpen
});

editor.commands.addCommand({
    name: 'saveFile',
    bindKey: { win:'Ctrl+S',mac:'Ctrl+S' },
    exec: execCommandSave
});

editor.commands.addCommand({
    name: 'saveFileAs',
    bindKey: { win:'Ctrl+Shift+S',mac:'Ctrl+Shift+S' },
    exec: execCommandSaveAs
});

document.addEventListener("keydown", e=>{
	const ctrl = e.ctrlKey
	const shift = e.shiftKey
	
	switch(e.code) {
		case "Escape": window.ui.hideOmnibox(); break;
		case "F3": e.preventDefault(); e.stopPropagation(); break;
	}
	
	if(ctrl || shift) { // this is probably some command keystroke!
		// console.log(e)
		switch(e.code) {
			case "KeyS":
				if(!ctrl) return
				e.preventDefault(); e.stopPropagation();
				if(ctrl && shift) {
					return execCommandSaveAs()
				} else if (ctrl) {
					return execCommandSave()
				}
			break;
			case "KeyO":
			    if(!ctrl) return
				e.preventDefault(); e.stopPropagation();
				return execCommandOpen()
			break;
			
			// case "KeyR":
			// 	if(!ctrl) return
			// 	e.preventDefault(); e.stopPropagation();
			// 	window.ui.omnibox("regex");
			// break;
			case "KeyG":
				if(!ctrl) return
				e.preventDefault(); e.stopPropagation();
				window.ui.omnibox("goto");
			break;
			case "KeyF":
				if(!ctrl) return
				e.preventDefault(); e.stopPropagation();
				
				if(shift) {
					window.ui.omnibox("regex");
				} else {
					window.ui.omnibox("find");
				}
			break;
			break;
		}
	}
})

setTimeout(()=>{
	ui.editorElement.classList.remove("loading");
	ui.thumbElement.classList.remove("loading");
	
	if(app.folders.length>0) {
		ui.toggleFiles();
	}
	// ui.toggleThumb();

});