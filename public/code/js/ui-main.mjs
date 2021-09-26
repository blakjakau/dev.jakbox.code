// import elements from "../elements/elements.mjs"

const defaultOptions = {
	"showGutter": true, //set to true to hide the line numbering
	"highlightGutterLine": true,
	"printMargin": false,
	"displayIndentGuides":true,
	"showInvisibles": false, //show whitespace characters (spaces, tabs, returns)
	"scrollPastEnd": 0, //allow the editor to scroll past the end of the document
	"trimTrailingWhitespace": true, //run "Trim Trailing Whitespace" on save
	"trimEmptyLines": false, //should the trim whitespace command also truncate empty lines?
	"tabSize": 4,
	"useSoftTabs": false,
	"newLineMode": "auto",
	"wrapLimit": false,
	"enableBasicAutocompletion":true,
// 	"enableLiveAutocompletion":true,
	
	"fontSize": 12,
	"fontFamily": "Roboto Mono",
	
	// "hScrollBarAlwaysVisible": true,
	// "vScrollBarAlwaysVisible": true,
}

var editor, thumbstrip;
var editorElement, thumbElement
var menu, tabBar, openDir;
var files, fileActions, fileList;
var statusbar;
var statusTheme, statusMode;
var omni;

const toggleBodyClass=(className)=>{
	if(document.body.classList.contains(className)) {
		document.body.classList.remove(className);
		return false;
	} else {
		document.body.classList.add(className);
		return true;
	}
}

const uiManager = {
	create: (options={})=>{
		
		const editorID = "ui_editor"
		const thumbID = "ui_thumbstrip"
		
		const defaults = {
			theme: "ace/theme/code",
			mode: "ace/mode/javascript",
			keyboard: "ace/keyboard/sublime",
		}
		
		options = { ...defaults, ...options }

		fileActions = new elements.ActionBar()
		fileActions.setAttribute("id","fileActions")
		fileActions.setAttribute("slim", "true");
		
		fileList = new elements.FileList()
		
		files = new elements.Panel()
		files.setAttribute("id", "files")
		files.append(fileActions)
		files.append(fileList)

		menu = document.querySelector("#menu");
		if(menu == null) {
			menu = new elements.ActionBar()
			menu.setAttribute("id", "menu")
			menu.addClass("slim");
			menu.append(new elements.Inline('<img src="images/code-192.png"/> Code'))
		}
		
		openDir = new elements.Button()
		openDir.icon = "drive_file_move_rtl"
		
		openDir.on("click", ()=>{
			if(toggleBodyClass("showFiles")) {
				openDir.icon = "drive_file_move_rtl"
			} else {
				openDir.icon = "drive_file_move"
			}
		})
		
		tabBar = new elements.TabBar();
		tabBar.type = "tabs"
		tabBar.setAttribute("id", "tabs");
		tabBar.setAttribute("slim", "true");
		tabBar.append(openDir)
		
		
		statusbar = document.querySelector("#statusbar")
		if(statusbar == null) {
			statusbar = new elements.ActionBar()
			statusbar.setAttribute("id", "statusbar")
			statusbar.setAttribute("slim", "true");
			statusbar.hook = "top"
		}
		
		statusTheme = document.querySelector('#theme_select')
		statusMode = document.querySelector('#mode_select')
		
		editorElement = document.createElement("pre")
		editorElement.setAttribute("id", editorID)
		editorElement.classList.add("loading")
		
		thumbElement = document.createElement("pre")
		thumbElement.setAttribute("id", thumbID)
		thumbElement.classList.add("loading")
		
		omni = new Panel()
		omni.titleElement = new elements.Block("Omni box")
		omni.input = new elements.Input();
		omni.input.value = ""
		omni.stack = [];
		omni.perform = (e, next=false, prev=false)=>{
			let val = omni.input.value
			let mode = "";
			if(val.substr(0,1)==":") { mode = "goto" }
			if(val.substr(0,1)=="/") { mode = "regex" }
			if(val.substr(0,1)=="@") { mode = "index" }
			
			if(mode === "") {
				mode = "find"
			} else {
				if(mode != "regex") val = val.slice(1);
			}
			
			switch(mode) {
				case "regex":
					let reg
					if(val.substr(val.length-1,1)!=="/") val+="/"
					try { eval(`reg = new RegExp(${val});`) } catch(e) { console.warn("incomplete or invalid regex")}
					if(reg instanceof RegExp) {
						if(next) editor.gotoLine(editor.getCursorPosition().row+2)
				// 		if(prev) editor.findPrevious({needle: reg, regExp:true})
						editor.find(reg, { backwards: prev }) 
					}
				break;
				case "goto": editor.gotoLine(val); break;
				case "find":
					if(prev) { return editor.findPrevious({needle: val}); }
					if(next) { return editor.findNext({needle: val}); }
					editor.find("")
					editor.find(val);
				break;
			}

		}
		omni.input.addEventListener("keyup", e=>{
			console.debug(e.code, omni.stackPos, omni.stack.length)
			
			
			if(e.code == "ArrowUp") {
				if(omni.stackPos > 0) {
					omni.stackPos--
					omni.input.value = omni.stack[omni.stackPos]
					omni.perform(e)
				} else {
					omni.input.value = ""
				}
			}
			if(e.code == "ArrowDown") {
				if(omni.stackPos < omni.stack.length) {
					omni.stackPos++
					omni.input.value = omni.stack[omni.stackPos]
					omni.perform(e)
				} else {
					omni.input.value = ""
				}
			}

			if(e.code == "Escape") {
				uiManager.hideOmnibox()
				editor.focus();
			}
			
			if(e.code == "Enter") {
				if(e.ctrlKey) {
					uiManager.hideOmnibox()
					editor.focus();
					omni.stack.push(omni.input.value)
					// truncate the omni stakc to the last X items
					while(omni.stack.length>20) { omni.stack.shift() }
				} else if(e.shiftKey) {
				    omni.perform(e, false, true)
				} else {
					omni.perform(e, true)
				}
			}
			
		})
		omni.input.addEventListener("input", omni.perform )
		omni.prepend(omni.titleElement)
		omni.append(omni.input)
		omni.append(new elements.Block(`<acronym title='CTRL+F'>Find</acronym> &nbsp;&nbsp; <acronym title='CTRL+SHIFT+F'>/RegEx</acronym> &nbsp;&nbsp; 
		    <acronym title='CTRL+G'>:Goto</acronym> &nbsp;&nbsp; <acronym title='CTRL+P (Not implemented)'><strike>@Lookup</strike></acronym>`))
		omni.setAttribute("id", "omni")
		omni.setAttribute("omni", "true")
		

		
		document.body.appendChild(menu)
		document.body.appendChild(tabBar)
		document.body.appendChild(statusbar)
		document.body.appendChild(thumbElement)
		document.body.appendChild(editorElement)
		document.body.appendChild(files)
		document.body.appendChild(omni)
		
		window.editor = editor = ace.edit(editorID);
		window.thumbStrip =	thumbstrip = ace.edit(thumbID)
		ace.require("ace/keyboard/sublime")
    	ace.require("ace/etc/keybindings_menu")
    	// ace.require("ace/ext/")
    	// ace.require("ace/ext/searchbox")
    	
    	editor.setKeyboardHandler( options.keyboard )
    	editor.setTheme(options.theme)
    	
    	// editor.session.setMode(options.mode)
    	editor.commands.removeCommand('find');
    	editor.commands.removeCommand('removetolineendhard');
    	editor.commands.removeCommand('removetolinestarthard');
    	
    	editor.setOptions(defaultOptions)
    	
    	
    	window.thumbstrip = thumbstrip = ace.edit("ui_thumbstrip")
    	thumbstrip.setKeyboardHandler("ace/keyboard/sublime")
		thumbstrip.setTheme("ace/theme/code")
		thumbstrip.session.setMode("ace/mode/javascript")
	
		let thumbOptions = JSON.parse(JSON.stringify(defaultOptions))
		thumbOptions.fontSize = 2;
		thumbOptions.showGutter = false;
		thumbOptions.readOnly = true;
		thumbstrip.setOptions(thumbOptions)
		
		// thumbStrip.setSession(editor.getSession())
		
		editor.execCommand("loadSettingsMenu", ()=>{ editor._signal("ready") })
		

		let cursorpos = new elements.Inline();
		cursorpos.setAttribute("id", "cursor_pos")
		statusbar.append(cursorpos);
		
		editor.on("changeSelection", ()=>{
			// const pos = editor.getCursorPosition
			// cursorpos.innerHTML = `${pos.col}:${pos.row}`;
			// // thumbStrip.gotoLine(editor.getCursorPosition().row+1)
			const selection  = editor.getSelection()
			var cursor = selection.getCursor();
			const displayText = (cursor.row + 1) + ":" + (cursor.column + 1);
			cursorpos.innerHTML = displayText;
			
		});
		
		// // copy text to the thumbnail strip
		editor.on("change", ()=>{
			const pos = editor.getCursorPosition
			cursorpos.innerHTML = `${pos.col}:${pos.row}`;
			
			// check if the buffer has edits
// 			tabBar.activeTab.changed = !!(editor.getSession().$undoManager.$undoStack.length>0)
			tabBar.activeTab.changed = (editor.getValue() != tabBar.activeTab?.config?.session?.baseValue)
		})

		return
	},
	
	updateThemeAndMode: ()=>{
		const mode = editor.getOption("mode")
		const theme = editor.getOption("theme")
		if(window.ace_themes) {
			for(let n in ace_themes) {
				if(ace_themes[n].theme == theme) {
					statusTheme.text = ace_themes[n].caption
				}
			}
		}
		if(window.ace_modes) {
			for(let n in ace_modes) {
				if(ace_modes[n].mode == mode) {
					statusMode.text = ace_modes[n].caption
				}
			}
		}
	},
	
	showFolders: async ()=>{
		fileList.files = app.folders
	},
	
	toggleFiles: ()=>{
		return toggleBodyClass("showFiles")
	},
	
	toggleThumb: ()=>{
		return toggleBodyClass("showThumb")
	},
	
	omnibox: (mode)=>{
		omni.classList.add("active")
		omni.input.focus()
		omni.stackPos = omni.stack.length
		if(omni.last == mode) {
			switch(mode) {
				case "find": omni.input.setSelectionRange(0,omni.input.value.length); break;
				case "regex": omni.input.setSelectionRange(1,omni.input.value.length-1); break;
				case "goto": omni.input.setSelectionRange(1,omni.input.value.length); break;
				case "lookup": omni.input.setSelectionRange(1,omni.input.value.length); break;
			}
		} else {
			switch(mode) {
				case "find":omni.input.value = ""; omni.input.setSelectionRange(0,0); break;
				case "regex":omni.input.value = "//"; omni.input.setSelectionRange(1,1); break;
				case "goto":omni.input.value = ":"; omni.input.setSelectionRange(1,1); break;
				case "lookup":omni.input.value = "@"; omni.input.setSelectionRange(1,1); break;
			}
		}
		omni.last = mode
		setTimeout( ()=>{ omni.input.addEventListener("blur", uiManager.hideOmnibox, {once:true}) } )
	},
	
	hideOmnibox: ()=>{
		omni.classList.remove("active");
	},

	get editor() { return editor },
	get thumb() { return thumbstrip },
	get editorElement() { return editorElement },
	get thumbElement() { return thumbElement },
	get fileActions() { return fileActions },
	get files() { return files },
	get fileList() { return fileList },
	get tabBar() { return tabBar },
}

setTimeout(()=>{
	editor.on("ready", ()=>{
		uiManager.updateThemeAndMode()
	})
})

uiManager.defaultOptions = defaultOptions
export default uiManager