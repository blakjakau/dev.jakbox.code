// import elements from "../elements/elements.mjs"

const defaultSettings = {
	showGutter: true, //set to true to hide the line numbering
	highlightGutterLine: true,
	printMargin: false,
	displayIndentGuides: true,
	showInvisibles: false, //show whitespace characters (spaces, tabs, returns)
	scrollPastEnd: 0, //allow the leftEditto scroll past the end of the document
	useSoftTabs: false,
	tabSize: 4,
	newLineMode: "auto",
	enableBasicAutocompletion: true,
	fontSize: 12,
	fontFamily: "roboto mono",
}

// these become the actual editor elements
var mainContent
var leftEdit, leftElement, leftHolder, leftMedia, leftTabs
var rightEdit, rightElement, rightHolder, rightMedia, rightTabs

var menu
var omni, modal, installer
var files, fileActions, fileList
var drawer, statusbar, statusTheme, statusMode, statusWorkspace
var themeMenu, modeMenu, workspaceMenu
var darkmodeMenu, darkmodeSelect
var openDir, themeModeToggle, toggleSplitViewBtn

var currentEditor, currentTabs, currentMediaView

const toggleBodyClass = (className) => {
	if (document.body.classList.contains(className)) {
		document.body.classList.remove(className)
		return false
	} else {
		document.body.classList.add(className)
		return true
	}
}

const uiManager = {
	create: (options = {}) => {

		const animRate = 250
		document.documentElement.style.setProperty('--animRate', `${animRate}ms`);
		
		const defaults = {
			theme: "ace/theme/code",
			mode: "ace/mode/javascript",
			keyboard: "ace/keyboard/sublime",
		}

		const constrainHolders = ()=>{
			if(!document.body.classList.contains("showSplitView")) {
				leftEdit.resize()
				rightEdit.resize()
				return
			}
			const w = mainContent.offsetWidth
			let l = leftHolder.offsetWidth/w
			let r = rightHolder.offsetWidth/w
			
			console.log(w, l, r)
			l = Math.max(0.25, Math.min(0.75, l))
			r = 1 - l
			// r = Math.max(0.25, Math.min(0.75, r))
			
			leftHolder.style.width = ((l)*100)+"%"
			rightHolder.style.width = ((r)*100)+"%"
			
			setTimeout(()=>{
				leftEdit.resize()
				rightEdit.resize()
			}, animRate)
		}

		options = { ...defaults, ...options }

		mainContent = document.querySelector("#mainContent")

		fileActions = new elements.ActionBar()
		fileActions.setAttribute("id", "fileActions")
		fileActions.setAttribute("slim", "true")

		fileList = new elements.FileList()

		files = new elements.Panel()
		files.setAttribute("id", "files")
		files.append(fileActions)
		files.append(fileList)
		files.resizable = "right"
		files.minSize = 200
		let sidebarWidth = 258

		menu = document.querySelector("#menu")
		if (menu == null) {
			menu = new elements.ActionBar()
			menu.setAttribute("id", "menu")
			menu.addClass("slim")
			menu.append(new elements.Inline('<img src="images/code-192.png"/> Code'))
		}

		openDir = new elements.Button()
		openDir.icon = "menu_open"
		openDir.setAttribute("title", "hide file list")

		openDir.on("click", () => {
			if (toggleBodyClass("showFiles")) {
				openDir.icon = "menu_open"
				openDir.setAttribute("title", "hide file list")
				mainContent.style.left = sidebarWidth + "px"
			} else {
				openDir.icon = "menu"
				openDir.setAttribute("title", "show file list")
				mainContent.style.left = ""
			}
			setTimeout(()=>{
				drawer.style.left = (files.offsetLeft+sidebarWidth)+"px"
				constrainHolders()
			},animRate)
		})

		toggleSplitViewBtn = new elements.Button()
		toggleSplitViewBtn.icon = "vertical_split"
		toggleSplitViewBtn.setAttribute("title", "Toggle split view")
		toggleSplitViewBtn.setAttribute("id", "toggleSplitView")
		toggleSplitViewBtn.on("click", () => {
			const targetWidth = (window.innerWidth - leftHolder.offsetLeft)/2
			if (toggleBodyClass("showSplitView")) {
				toggleSplitViewBtn.icon = "view_column"
				toggleSplitViewBtn.setAttribute("title", "Hide split view")
				leftHolder.style.width = "50%"
				rightHolder.style.width = "50%"
				rightTabs.reclaimTabs(leftTabs, "rightTabs");
				if (rightTabs.tabs.length === 0) {
					rightTabs.onEmpty();
				}
			} else {
				toggleSplitViewBtn.icon = "vertical_split"
				toggleSplitViewBtn.setAttribute("title", "Show split view")
				leftHolder.style.width = "100%"
				rightHolder.style.width = "0%"
				rightTabs.moveAllTabsTo(leftTabs, "rightTabs", true);
			}

			setTimeout(()=>{
				constrainHolders()
			},animRate)
		})

		leftTabs = new elements.TabBar()
		leftTabs.type = "tabs"
		leftTabs.setAttribute("id", "leftTabs")
		leftTabs.setAttribute("slim", "true")
		
		leftTabs.append(openDir)
		leftTabs.append(toggleSplitViewBtn)
		
		rightTabs = new elements.TabBar()
		rightTabs.type = "tabs"
		rightTabs.setAttribute("id", "rightTabs")
		rightTabs.setAttribute("slim", "true")

		statusbar = document.querySelector("#statusbar")
		if (statusbar == null) {
			statusbar = new elements.ActionBar()
			statusbar.setAttribute("id", "statusbar")
			statusbar.setAttribute("slim", "true")
			statusbar.hook = "top"
		}

		toggleSplitViewBtn.setAttribute("hook", "right")
		
		statusTheme = document.querySelector("#theme_select")
		statusMode = document.querySelector("#mode_select")

		themeMenu = document.querySelector("#theme_menu")
		modeMenu = document.querySelector("#mode_menu")

		themeMenu.on( "show", (e) => {
			e.stopPropagation()
			setTimeout(() => {
				const active = themeMenu.querySelector("[icon='done']")
				themeMenu.scrollTop = active.offsetTop - themeMenu.offsetHeight / 2 + 12
			})
		}, true )
		
		modeMenu.on( "show", (e) => {
			e.stopPropagation()
			setTimeout(() => {
				const active = modeMenu.querySelector("[icon='done']")
				modeMenu.scrollTop = active.offsetTop - modeMenu.offsetHeight / 2 + 12
			})
		}, true )

		// Query darkmode elements directly within the function
		darkmodeSelect = document.querySelector("#darkmode_select");
		darkmodeMenu = document.querySelector("#darkmode_menu");

		leftHolder = new elements.Panel()
		leftHolder.setAttribute("id", "leftHolder")
		
		leftElement = document.createElement("div")
		leftElement.classList.add("loading")
		leftElement.setAttribute("id", "leftEdit")

		leftHolder.appendChild(leftElement)
		leftMedia = new elements.MediaView()
		leftMedia.setAttribute("id", "leftMedia")
		leftHolder.appendChild(leftMedia)
		
		

		rightHolder = new elements.Panel()
		rightHolder.setAttribute("id", "rightHolder")
		rightHolder.style.width = "0px"
		rightHolder.style.right = "0px"
		rightHolder.resizable = "left"
		rightHolder.minSize = 0
		rightHolder.maxSize = 2440

		;([leftHolder, ]).forEach(holder=>{
			const backgroundElement = document.createElement("div");
			backgroundElement.classList.add("background-element");
			const image = document.createElement("img");
			image.src = "/images/code-192.png";
			const caption = document.createElement("div");
			caption.classList.add("caption");
			caption.innerHTML = "CTRL+O to open a file <br/> CTRL+N to create a new file";
			backgroundElement.appendChild(image);
			backgroundElement.appendChild(caption);
			holder.appendChild(backgroundElement);
		})

		rightElement = document.createElement("div")
		
		rightElement.classList.add("loading")
		rightElement.setAttribute("id", "rightEdit")
		rightHolder.appendChild(rightElement)

		rightMedia = new elements.MediaView()
		rightMedia.setAttribute("id", "rightMedia")
		rightHolder.appendChild(rightMedia)
		
		files.resizeListener((width)=>{
			sidebarWidth = width
			mainContent.style.transition = "none"
			mainContent.style.left = width + "px"
			drawer.style.left = (files.offsetLeft+sidebarWidth)+"px"
		})
		
		files.resizeEndListener(()=>{
			mainContent.style.transition = ""
			constrainHolders()
		})

		rightHolder.resizeListener((width)=>{
			const w = mainContent.offsetWidth
			const l = w-width
			const r = width
			leftHolder.style.transition = "none";
			leftHolder.style.width = l+"px"
		})
		rightHolder.resizeEndListener(()=>{
			leftHolder.style.transition = ""
			constrainHolders()
		})

		drawer = new elements.Panel()
		drawer.setAttribute("id", "drawer")
		drawer.resizable = "top"
		let drawerHeight = 34
		drawer.minSize = drawerHeight
		drawer.style.height = drawerHeight + "px"
		mainContent.style.bottom = drawerHeight + "px"

		drawer.resizeListener((height)=>{
			mainContent.style.transition = "none"
			mainContent.style.bottom = height + "px"
			// drawer.style.left = files.offsetWidth
		})

		drawer.resizeEndListener(()=>{
			mainContent.style.transition = ""
			constrainHolders()
		})

		installer = new elements.Panel()
		installer.setAttribute("type", "modal")
		document.body.append(installer)
		installer.classList.add("slideUp")
		installer.style.cssText = `left:auto; top:auto; right:32px; bottom:64px; width:auto; height:105px; text-align:center;`
		installer.innerHTML = `<p><img src="images/code-192.png" height='32px' style="vertical-align:middle; margin-top:-4px;">&nbsp;&nbsp;<b>Add 'Code' as an app?</b></p>`

		installer.confirm = new elements.Button("Yes please!")
		installer.confirm.classList.add("themed")
		installer.confirm.icon = "done"

		installer.later = new elements.Button("Later")
		installer.later.classList.add("themed")
		installer.later.icon = "watch_later"

		installer.deny = new elements.Button("No thanks")
		installer.deny.classList.add("cancel")
		// installer.deny.icon = "close"

		installer.onscreen = () => {
			installer.show()
			setTimeout(() => {
				installer.setAttribute("active", "active")
			}, 1)
		}

		installer.offscreen = () => {
			installer.removeAttribute("active")
			setTimeout(() => {
				installer.hide()
			}, 333)
		}

		installer.clear = new elements.Button("")
		installer.clear.icon = "close"
		installer.clear.style.cssText = `
        position:absolute;
        right:0px;
        top:0px;
        text-indent: -1px;
        width:32px;
        height:28px;
        min-height:34px;
        border-radius: 16px;
        `
		installer.clear.on("click", () => {
			installer.offscreen()
		})

		installer.prepend(installer.clear)
		installer.append(installer.deny, installer.later, installer.confirm)

		installer.hide()

		omni = new elements.Panel()
		omni.results = new elements.Panel()
		omni.results.classList.add("results")
		omni.results.next = (step = 1) => {
			omni.resultItemIndex += step
			if (step == 1) {
				if (omni.resultItemIndex >= omni.results.children.length) {
					omni.resultItemIndex = 0
				}
			} else {
				if (omni.resultItemIndex >= omni.results.children.length) {
					omni.resultItemIndex = omni.results.children.length - 1
				}
			}
			for (let node of omni.results.children) {
				node.classList.remove("active")
			}
			omni.results.children[omni.resultItemIndex].classList.add("active")
			omni.results.children[omni.resultItemIndex].scrollIntoViewIfNeeded()
		}
		omni.results.prev = (step = 1) => {
			omni.resultItemIndex -= step
			if (step == 1) {
				if (omni.resultItemIndex < 0) {
					omni.resultItemIndex = omni.results.children.length - 1
				}
			} else {
				if (omni.resultItemIndex < 0) {
					omni.resultItemIndex = 0
				}
			}
			for (let node of omni.results.children) {
				node.classList.remove("active")
			}
			omni.results.children[omni.resultItemIndex].classList.add("active")
			omni.results.children[omni.resultItemIndex].scrollIntoViewIfNeeded()
		}

		omni.appendChild(omni.results)

		omni.titleElement = new elements.Block("omni box")
		omni.input = new elements.Input()
		omni.input.value = ""
		omni.stack = []
		omni.perform = (e, next = false, prev = false) => {
			let val = omni.input.value
			let mode = ""

			if (val.substr(0, 1) == "/") { mode = "find" }
			if (val.substr(0, 1) == ":") { mode = "goto" }
			if (val.substr(0, 1) == "~") { mode = "regex" }
			if (val.substr(0, 1) == "?") { mode = "regex-m" }
			if (val.substr(0, 1) == "@") { mode = "index" }

			if (mode === "" && val.length > 0) {
				mode = "find"
				omni.input.value = omni.modePrefix + val
				val = omni.input.value
			}
			val = val.slice(1)

			switch (mode) {
				case "regex-m":
				case "regex":
					let reg
					if (val.length < 3) {
						return currentEditor.find("")
					}
					try {
						reg = new RegExp(val, "gsim")
					} catch (e) {
						console.warn("incomplete or invalid regex")
					}

					if (reg instanceof RegExp) {
						if (mode == "regex") {
							currentEditor.find(reg)
						} else {
							const match = reg.exec(currentEditor.getValue())
							// console.log(match);
							if (match && match.length > 0) {
								currentEditor.selection.setRange({
									start: currentEditor.session.doc.indexToPosition(match.index),
									end: currentEditor.session.doc.indexToPosition(match.index + match[0].length),
								})
							}
						}
					}
					break
				case "goto":
					if (isNaN(val)) {
						omni.resultItem = null
						omni.resultItemIndex = 0
						const matches = fileList.find(val)
						if (matches.length == 0) {
							omni.results.hide()
							return
						} else {
							omni.results.show()
							omni.results.empty()
							omni.results.scrollTop = 0
							if (matches.length > 0) {
								omni.resultItem = matches[0]
							} else {
								omni.results.hide()
							}
							// console.log(matches)
							let counter = 0
							for (let item of matches) {
								// if(counter>10) continue
								const result = new elements.Block()
								if (counter === 0) result.classList.add("active")
								result.itemIndex = counter
								result.addEventListener("click", () => {
									fileList.open(item)
									omni.results.hide()
								})
								result.addEventListener("pointerover", () => {
									for (let node of omni.results.children) {
										node.classList.remove("active")
									}
									result.classList.add("active")
									omni.resultItemIndex = result.itemIndex
								})
								counter++

								const name = item.name.split(val).join(`<b>${val}</b>`)
								const path = item.path.split(val).join(`<b>${val}</b>`)

								result.innerHTML = `<big>${name}</big><br/><small>${path}</small>`
								omni.results.append(result)
							}
						}
					} else {
						omni.resultItem = null
						omni.results.hide()
						currentEditor.gotoLine(val)
					}
					break
				case "find":
					// 	if(prev) { return currentEditor.findPrevious({needle: val}); }
					// 	if(next) { return currentEditor.findNext({needle: val}); }
					currentEditor.find("")
					currentEditor.find(val)
					break
			}
		}
		omni.saveStack = () => {
			if (omni.input.value.length < 2) return
			if (omni.stack.length == 0 || omni.stack.indexOf(omni.input.value) == -1) {
				omni.stack.push(omni.input.value)
			}
			while (omni.stack.length > 50) {
				omni.stack.shift()
			}
		}

		omni.input.addEventListener("keydown", (e) => {
			if (omni.last === "goto" && omni.resultItem) {
				if (e.code == "PageUp") {
					e.preventDefault()
					omni.input.setSelectionRange(omni.input.value.length, omni.input.value.length)
					omni.results.prev(10)
					return
				}
				if (e.code == "PageDown") {
					e.preventDefault()
					omni.input.setSelectionRange(omni.input.value.length, omni.input.value.length)
					omni.results.next(10)
					return
				}
				if (e.code == "ArrowUp") {
					e.preventDefault()
					omni.input.setSelectionRange(omni.input.value.length, omni.input.value.length)
					omni.results.prev()
					return
				}
				if (e.code == "ArrowDown") {
					e.preventDefault()
					omni.input.setSelectionRange(omni.input.value.length, omni.input.value.length)
					omni.results.next()
					return
				}
			}
		})
		omni.input.addEventListener("keyup", (e) => {
			// 			console.debug(e.code, omni.stackPos, omni.stack.length)

			if (omni.last === "goto" && omni.resultItem) {
				if (e.code == "ArrowUp") {
					// e.preventDefault()
					// omni.input.setSelectionRange(omni.input.value.length, omni.input.value.length)
					// omni.results.prev()
					return
				}

				if (e.code == "ArrowDown") {
					// e.preventDefault()
					// omni.input.setSelectionRange(omni.input.value.length, omni.input.value.length)
					// omni.results.next()
					return
				}
			} else {
				if (e.code == "ArrowUp") {
					if (omni.stackPos > omni.stack.length) {
						omni.stackPos == omni.stack.length
					} else if (omni.stackPos == omni.stack.length) {
						omni.saveStack()
					}
					if (omni.stack.length > 0) {
						omni.stackPos--
						if (omni.stackPos < 0) omni.stackPos = 0
						omni.input.value = omni.stack[omni.stackPos]
						omni.input.setSelectionRange(1, omni.input.value.length)
						omni.perform(e)
					}
					return
				}
				if (e.code == "ArrowDown") {
					if (omni.stackPos < omni.stack.length - 1) {
						omni.stackPos++
						if (omni.stackPos >= omni.stack.length) {
							omni.input.value = ""
						}
						omni.input.value = omni.stack[omni.stackPos]
						omni.input.setSelectionRange(1, omni.input.value.length)
						omni.perform(e)
					} else {
						omni.stackPos = omni.stack.length
						// omni.input.value = omni.modePrefix
					}
					return
				}
			}

			if (e.code == "Escape") {
				uiManager.hideOmnibox()
				currentEditor.focus()
				return
			}

			if (e.code == "Enter") {
				if (omni.last === "goto") {
					if (omni.resultItem) {
						omni.results.children[omni.resultItemIndex].click()
						omni.results.hide()
					}
					uiManager.hideOmnibox()
					currentEditor.focus()
					return
				}
				if (e.ctrlKey) {
					uiManager.hideOmnibox()
					currentEditor.focus()
				} else if (e.shiftKey) {
					if (omni.last == "regex") currentEditor.gotoLine(currentEditor.getCursorPosition().row)
					currentEditor.execCommand("findprevious")
					// omni.perform(e, false, true)
				} else {
					if (omni.last == "regex") currentEditor.gotoLine(currentEditor.getCursorPosition().row + 2)
					currentEditor.execCommand("findnext")
					// 	omni.perform(e, true)
				}
				return
			}

			omni.stackPos = omni.stack.length
		})
		omni.input.addEventListener("input", omni.perform)
		omni.prepend(omni.titleElement)
		omni.append(omni.input)
		omni.append(
			new elements.Block(
				`
				&nbsp;&nbsp; <acronym title='Ctrl-G'>:Goto</acronym> 
				&nbsp;&nbsp; <acronym title='Ctrl-F'>/Find</acronym> 
				&nbsp;&nbsp; <acronym title='Ctrl-Shift-F'>~RegEx</acronym> 
				&nbsp;&nbsp; <acronym title='Ctrl-Shift-Alt-F'>?RegEx-Multiline</acronym> 
				<!--&nbsp;&nbsp; <acronym title='Ctrl-R (Not implemented)'><strike>@Reference</strike></acronym>-->
				&nbsp;&nbsp; `
			)
		)
		omni.setAttribute("id", "omni")
		omni.setAttribute("omni", "true")

		themeModeToggle = document.querySelector("#themeModeToggle")
		if (themeModeToggle) {
			themeModeToggle.on("click", () => {
				if (document.body.classList.contains("darkmode")) {
					document.body.classList.remove("darkmode")
					themeModeToggle.icon = "dark_mode"
				} else {
					document.body.classList.add("darkmode")
					themeModeToggle.icon = "light_mode"
				}
			})
		}

		leftHolder.appendChild(leftTabs)
		rightHolder.appendChild(rightTabs)

		document.body.appendChild(menu)
		document.body.appendChild(statusbar)
		
		
		
		mainContent.appendChild(leftHolder)
		        mainContent.appendChild(rightHolder)

        // Add the left file modified notice bar
        const leftFileModifiedNotice = document.createElement("div");
        leftFileModifiedNotice.setAttribute("id", "leftFileModifiedNotice");
        leftFileModifiedNotice.classList.add("notice-bar");
        leftFileModifiedNotice.style.display = "none"; // Hidden by default
        leftFileModifiedNotice.innerHTML = `
            <span>This file has been modified outside the editor.</span>
            <button id="leftReloadFileBtn">Reload</button>
            <button id="leftDismissNoticeBtn">X</button>
        `;
        leftHolder.appendChild(leftFileModifiedNotice); // Append to leftHolder

        // Add the right file modified notice bar
        const rightFileModifiedNotice = document.createElement("div");
        rightFileModifiedNotice.setAttribute("id", "rightFileModifiedNotice");
        rightFileModifiedNotice.classList.add("notice-bar");
        rightFileModifiedNotice.style.display = "none"; // Hidden by default
        rightFileModifiedNotice.innerHTML = `
            <span>This file has been modified outside the editor.</span>
            <button id="rightReloadFileBtn">Reload</button>
            <button id="rightDismissNoticeBtn">X</button>
        `;
        rightHolder.appendChild(rightFileModifiedNotice); // Append to rightHolder
		
		document.body.appendChild(files)
		document.body.appendChild(drawer)
		document.body.appendChild(omni)

		let cursorpos = new elements.Inline()
		cursorpos.setAttribute("id", "cursor_pos")
		statusbar.append(cursorpos)

		window.leftEdit = leftEdit = ace.edit(leftElement)
		window.rightEdit = rightEdit = ace.edit(rightElement)
		
		window.editors = [leftEdit, rightEdit]
		leftEdit.tabs = leftTabs
		rightEdit.tabs = rightTabs
		
		window.omni = omni
		ace.require("ace/keyboard/sublime")
		ace.require("ace/etc/keybindings_menu")

		for(const editor of editors) {
			const thisTabs = editor.tabs
			editor.setKeyboardHandler(options.keyboard)
			editor.setTheme(options.theme)
	
			editor.commands.removeCommand("find")
			editor.commands.removeCommand("removetolineendhard")
			editor.commands.removeCommand("removetolinestarthard")
	
			editor.setOptions(defaultSettings)
	
			editor.execCommand("loadSettingsMenu", () => {
				editor._signal("ready")
			})
	
	
			editor.on("changeSelection", () => {
				const selection = editor.getSelection()
				var cursor = selection.getCursor()
				let displayText = cursor.row + 1 + ":" + (cursor.column + 1)
				if (editor.tabs && editor.tabs.activeTab && editor.tabs.activeTab.config && editor.tabs.activeTab.config.name) {
					displayText = displayText + " - " + editor.tabs.activeTab.config.name
				}
				cursorpos.innerHTML = displayText
			})
	
			// // copy text to the thumbnail strip
			editor.on("change", () => {
				const pos = editor.getCursorPosition
				cursorpos.innerHTML = `${pos.col}:${pos.row}`
				if (!editor.session.getUndoManager().isClean()) {
					if (editor.getValue() !== editor.session.baseValue) {
						if (thisTabs.activeTab) thisTabs.activeTab.changed = true
						if (fileList.activeItem) fileList.activeItem.changed = true
					} else {
						if (thisTabs.activeTab) thisTabs.activeTab.changed = false
						if (fileList.activeItem) fileList.activeItem.changed = false
						editor.session.getUndoManager().markClean()
					}
				} else {
					if (thisTabs.activeTab) thisTabs.activeTab.changed = false
					if (fileList.activeItem) fileList.activeItem.changed = false
				}
			})
			
		}


		return
	},

	updateWorkspace:(appConfig) =>{ 
		window.workspaceMenu = workspaceMenu
		
	},

	updateThemeAndMode: () => {
		const c_mode = leftEdit.getOption("mode")
		const c_theme = leftEdit.getOption("theme")
		window.themeMenu = themeMenu
		window.modeMenu = modeMenu

		// Query darkmode elements directly within the function

		if (window.ace_themes) {
			// themeMenu.empty();
			if (themeMenu.children.length == 0) {
				for (const n in ace_themes) {
					const theme = ace_themes[n]
					const item = new elements.MenuItem(theme.caption)
					item.setAttribute("rel-data", ace_themes[n].theme)
					item.setAttribute("command", `app:setTheme:${ace_themes[n].theme}`)
					themeMenu.append(item)
				}
			}

			setTimeout(() => {
				const active = themeMenu.querySelector("[icon='done']")
				if (active) active.icon = ""
				for (const n in ace_themes) {
					if (ace_themes[n].theme == c_theme) {
						statusTheme.text = ace_themes[n].caption
						// console.log("THEME:",`[rel-data='${ace_themes[n].theme}']`)
						themeMenu.querySelector(`[rel-data='${ace_themes[n].theme}']`).icon = "done"
					}
				}
			})
		}
		if (window.ace_modes) {
			// modeMenu.empty();
			if (modeMenu.children.length == 0) {
				for (const n in ace_modes) {
					const mode = ace_modes[n]
					const item = new elements.MenuItem(mode.caption)
					item.setAttribute("rel-data", ace_modes[n].mode)
					item.setAttribute("command", `app:setMode:${ace_modes[n].mode}`)
					modeMenu.append(item)
				}
			}
			setTimeout(() => {
				const active = modeMenu.querySelector("[icon='done']")
				if (active) active.icon = ""
				for (const n in ace_modes) {
					if (ace_modes[n].mode == c_mode) {
						statusMode.text = ace_modes[n].caption
						// console.log("MODE:",`[rel-data='${ace_modes[n].mode}']`)
						modeMenu.querySelector(`[rel-data='${ace_modes[n].mode}']`).icon = "done"
					}
				}
			})
		}

		// Update dark mode menu
		setTimeout(() => {
			// Clear all existing 'done' icons from dark mode menu items
			const allDarkModeMenuItems = darkmodeMenu.querySelectorAll("ui-menu-item"); // Query all menu items
			allDarkModeMenuItems.forEach(item => item.icon = "");

			const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)');

			// Apply the darkmode class to the body based on app.darkmode setting
			if (app.darkmode === 'dark' || (app.darkmode === 'system' && prefersDarkMode.matches)) {
				document.body.classList.add("darkmode");
				darkmodeSelect.icon = "dark_mode";
			} else {
				document.body.classList.remove("darkmode");
				darkmodeSelect.icon = "light_mode";
			}

			// Set the 'done' icon for the currently selected mode in the menu
			//console.log('app.darkmode:', app.darkmode);
			//console.log('Querying for:', `[args='${app.darkmode}']`);
			const selectedMenuItem = darkmodeMenu.querySelector(`[args='${app.darkmode}']`);
			if (selectedMenuItem) {
				selectedMenuItem.icon = "done";
			}
		});
	},

	showFolders: async (expandLevels=1) => {
		fileList.autoExpand = expandLevels
		fileList.files = workspace.folders
	},

	toggleFiles: () => {
		return openDir.click()
	},
	
	toggleSplitView: (forceOpen=false)=>{
		return toggleSplitViewBtn.click(forceOpen)
	},

	omnibox: (mode) => {
		omni.classList.add("active")
		omni.results.hide()
		omni.input.focus()
		omni.stackPos = omni.stack.length
		if (omni.last == mode && "find regex regex-m".indexOf(mode) != -1) {
			omni.input.setSelectionRange(1, omni.input.value.length)
			omni.perform()
		} else {
			switch (mode) {
				case "find":
					omni.input.value = "/"
					omni.input.setSelectionRange(1, 1)
					break
				case "regex":
					omni.input.value = "~"
					omni.input.setSelectionRange(1, 1)
					break
				case "regex-m":
					omni.input.value = "?"
					omni.input.setSelectionRange(1, 1)
					break
				case "goto":
					omni.results.hide()
					omni.input.value = ":"
					omni.input.setSelectionRange(1, 1)
					break
				case "lookup":
					omni.input.value = "@"
					omni.input.setSelectionRange(1, 1)
					break
			}
		}
		omni.last = mode
		omni.modePrefix = omni.input.value.substr(0, 1)
		setTimeout(() => {
			omni.input.addEventListener("blur", uiManager.hideOmnibox, { once: true })
		})
	},

	hideOmnibox: () => {
		omni.saveStack()
		setTimeout(() => {
			omni.classList.remove("active")
		}, 200)
	},

	showSettings: (opts) => {
		console.log(opts)
		settingsPanel.show()
	},

	
	get installer() { return installer },
	
	get fileActions() { return fileActions },
	get files() { return files },
	get fileList() { return fileList },
	get leftTabs() { return leftTabs },
	get darkmodeSelect() { return darkmodeSelect },
	get darkmodeMenu() { return darkmodeMenu },

	get leftEdit() { return leftEdit },
	get leftElement() { return leftElement },
	get leftMedia() { return leftMedia },

	get rightEdit() { return rightEdit },
	get rightElement() { return rightElement },
	get rightHolder() { return rightHolder },
	get rightMedia() { return rightMedia },
	get rightTabs() { return rightTabs },
	
	set currentEditor(v) { currentEditor = v },
	set currentTabs(v) { currentTabs = v },
	set currentMediaView(v) { currentMediaView = v },

    showFileModifiedNotice: (tab, side) => {
        const noticeBarId = (side === 'left') ? "leftFileModifiedNotice" : "rightFileModifiedNotice";
        const reloadBtnId = (side === 'left') ? "leftReloadFileBtn" : "rightReloadFileBtn";
        const dismissBtnId = (side === 'left') ? "leftDismissNoticeBtn" : "rightDismissNoticeBtn";

        const noticeBar = document.getElementById(noticeBarId);
        const reloadBtn = document.getElementById(reloadBtnId);
        const dismissBtn = document.getElementById(dismissBtnId);

        // Store the tab reference on the notice bar for event handlers
        noticeBar.currentTab = tab;

        reloadBtn.onclick = () => {
            console.log("Reload button clicked for tab:", tab.config.name);
            window.app.reloadFile(tab);
            uiManager.hideFileModifiedNotice(side); // Pass side
        };

        dismissBtn.onclick = () => {
            tab.config.fileModified = false; // Clear the flag
            uiManager.hideFileModifiedNotice(side); // Pass side
        };

        noticeBar.style.display = "flex"; // Show the notice bar
    },

    hideFileModifiedNotice: (side) => {
        const noticeBarId = (side === 'left') ? "leftFileModifiedNotice" : "rightFileModifiedNotice";
        const noticeBar = document.getElementById(noticeBarId);
        noticeBar.style.display = "none"; // Hide the notice bar
        noticeBar.currentTab = null; // Clear the tab reference
    },
}

setTimeout(() => {
	leftEdit.on("ready", () => {
		uiManager.updateThemeAndMode()
	})
})

uiManager.defaultSettings = defaultSettings
export default uiManager
