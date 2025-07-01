// import elements from "../elements/elements.mjs"

const defaultSettings = {
	showGutter: true, //set to true to hide the line numbering
	highlightGutterLine: true,
	printMargin: false,
	displayIndentGuides: true,
	showInvisibles: false, //show whitespace characters (spaces, tabs, returns)
	scrollPastEnd: 0, //allow the editor to scroll past the end of the document
	useSoftTabs: false,
	tabSize: 4,
	newLineMode: "auto",
	enableBasicAutocompletion: true,
	fontSize: 12,
	fontFamily: "roboto mono",
}

var editor, thumbstrip
var editorElement, editorHolder, thumbElement
var menu, tabBar, openDir
var files, fileActions, fileList, drawer
var statusbar
var statusTheme, statusMode, statusWorkspace
var themeMenu, modeMenu, workspaceMenu
var omni
var modal
var installer
var themeModeToggle

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
		const editorID = "editor"
		const holderID = "ui_editor"
		const thumbID = "ui_thumbstrip"

		const defaults = {
			theme: "ace/theme/code",
			mode: "ace/mode/javascript",
			keyboard: "ace/keyboard/sublime",
		}

		options = { ...defaults, ...options }

		fileActions = new elements.ActionBar()
		fileActions.setAttribute("id", "fileActions")
		fileActions.setAttribute("slim", "true")

		fileList = new elements.FileList()

		files = new elements.Panel()
		files.setAttribute("id", "files")
		files.append(fileActions)
		files.append(fileList)
		files.resizable = "right"
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
				tabBar.style.left = sidebarWidth+"px"
				editorHolder.style.left = sidebarWidth + "px"
			} else {
				openDir.icon = "menu"
				openDir.setAttribute("title", "show file list")
				tabBar.style.left = ""
				editorHolder.style.left = ""
			}
			setTimeout(() => {
				editor.resize()
			}, 500)
		})

		tabBar = new elements.TabBar()
		tabBar.type = "tabs"
		tabBar.setAttribute("id", "tabs")
		tabBar.setAttribute("slim", "true")
		tabBar.append(openDir)

		statusbar = document.querySelector("#statusbar")
		if (statusbar == null) {
			statusbar = new elements.ActionBar()
			statusbar.setAttribute("id", "statusbar")
			statusbar.setAttribute("slim", "true")
			statusbar.hook = "top"
		}

		statusTheme = document.querySelector("#theme_select")
		statusMode = document.querySelector("#mode_select")

		themeMenu = document.querySelector("#theme_menu")
		modeMenu = document.querySelector("#mode_menu")

		themeMenu.on(
			"show",
			(e) => {
				e.stopPropagation()
				setTimeout(() => {
					const active = themeMenu.querySelector("[icon='done']")
					themeMenu.scrollTop = active.offsetTop - themeMenu.offsetHeight / 2 + 12
					// console.log(active.offsetTop, themeMenu.scrollTop)
				})
			},
			true
		)
		modeMenu.on(
			"show",
			(e) => {
				e.stopPropagation()
				setTimeout(() => {
					const active = modeMenu.querySelector("[icon='done']")
					modeMenu.scrollTop = active.offsetTop - modeMenu.offsetHeight / 2 + 12
					// console.log(active.offsetTop, modeMenu.scrollTop)
				})
			},
			true
		)

		editorHolder = document.createElement("div")
		editorHolder.setAttribute("id", holderID)
		editorElement = document.createElement("div")
		editorElement.classList.add("loading")
		editorElement.setAttribute("id", editorID)

		editorHolder.appendChild(editorElement)
		
		files.resizeListener((width)=>{
			sidebarWidth = width
			
			tabBar.style.transition = "none"
			editorHolder.style.transition = "none"
			
			tabBar.style.left = width+"px"
			editorHolder.style.left = width + "px"
		})
		files.resizeEndListener(()=>{
			tabBar.style.transition = ""
			editorHolder.style.transition = ""
		})

		drawer = new elements.Panel()
		drawer.setAttribute("id", "drawer")
		drawer.resizable = "top"
		let drawerHeight = 32
		drawer.style.height = drawerHeight + "px"
		editorHolder.style.bottom = drawerHeight + "px"

		drawer.resizeListener((height)=>{
			editorHolder.style.transition = "none"
			editorHolder.style.bottom = height + "px"
		})

		drawer.resizeEndListener(()=>{
			editorHolder.style.transition = ""
			editor.resize()
		})

		thumbElement = document.createElement("pre")
		thumbElement.setAttribute("id", thumbID)
		thumbElement.classList.add("loading")

		installer = new elements.Panel()
		installer.setAttribute("type", "modal")
		document.body.append(installer)
		installer.classList.add("slideUp")
		installer.style.cssText = `
            left:auto; top:auto; right:32px; bottom:64px; width:auto;
            height:105px; text-align:center;
        `
		// installer.style.width="300px";
		installer.innerHTML = `
            <p><img src="images/code-192.png" height='32px' style="vertical-align:middle; margin-top:-4px;">&nbsp;&nbsp;<b>Add 'Code' as an app?</b></p>
        `

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
						return editor.find("")
					}
					try {
						reg = new RegExp(val, "gsim")
					} catch (e) {
						console.warn("incomplete or invalid regex")
					}

					if (reg instanceof RegExp) {
						if (mode == "regex") {
							editor.find(reg)
						} else {
							const match = reg.exec(editor.getValue())
							// console.log(match);
							if (match && match.length > 0) {
								editor.selection.setRange({
									start: editor.session.doc.indexToPosition(match.index),
									end: editor.session.doc.indexToPosition(match.index + match[0].length),
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
						editor.gotoLine(val)
					}
					break
				case "find":
					// 	if(prev) { return editor.findPrevious({needle: val}); }
					// 	if(next) { return editor.findNext({needle: val}); }
					editor.find("")
					editor.find(val)
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
				editor.focus()
				return
			}

			if (e.code == "Enter") {
				if (omni.last === "goto") {
					if (omni.resultItem) {
						omni.results.children[omni.resultItemIndex].click()
						omni.results.hide()
					}
					uiManager.hideOmnibox()
					editor.focus()
					return
				}
				if (e.ctrlKey) {
					uiManager.hideOmnibox()
					editor.focus()
				} else if (e.shiftKey) {
					if (omni.last == "regex") editor.gotoLine(editor.getCursorPosition().row)
					editor.execCommand("findprevious")
					// omni.perform(e, false, true)
				} else {
					if (omni.last == "regex") editor.gotoLine(editor.getCursorPosition().row + 2)
					editor.execCommand("findnext")
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

		document.body.appendChild(menu)
		document.body.appendChild(tabBar)
		document.body.appendChild(statusbar)
		document.body.appendChild(thumbElement)
		document.body.appendChild(editorHolder)
		document.body.appendChild(files)
		document.body.appendChild(drawer)
		document.body.appendChild(omni)

		window.editor = editor = ace.edit(editorID)
		window.thumbStrip = thumbstrip = ace.edit(thumbID)
		window.omni = omni
		ace.require("ace/keyboard/sublime")
		ace.require("ace/etc/keybindings_menu")
		// ace.require("ace/ext/")
		// ace.require("ace/ext/searchbox")

		editor.setKeyboardHandler(options.keyboard)
		editor.setTheme(options.theme)

		// editor.session.setMode(options.mode)
		editor.commands.removeCommand("find")
		editor.commands.removeCommand("removetolineendhard")
		editor.commands.removeCommand("removetolinestarthard")

		editor.setOptions(defaultSettings)

		window.thumbstrip = thumbstrip = ace.edit("ui_thumbstrip")
		thumbstrip.setKeyboardHandler("ace/keyboard/sublime")
		thumbstrip.setTheme("ace/theme/code")
		thumbstrip.session.setMode("ace/mode/javascript")

		let thumbOptions = JSON.parse(JSON.stringify(defaultSettings))
		thumbOptions.fontSize = 2
		thumbOptions.showGutter = false
		thumbOptions.readOnly = true
		thumbstrip.setOptions(thumbOptions)

		// thumbStrip.setSession(editor.getSession())

		editor.execCommand("loadSettingsMenu", () => {
			editor._signal("ready")
		})

		let cursorpos = new elements.Inline()
		cursorpos.setAttribute("id", "cursor_pos")
		statusbar.append(cursorpos)

		editor.on("changeSelection", () => {
			// const pos = editor.getCursorPosition
			// cursorpos.innerHTML = `${pos.col}:${pos.row}`;
			// // thumbStrip.gotoLine(editor.getCursorPosition().row+1)
			const selection = editor.getSelection()
			var cursor = selection.getCursor()
			const displayText = cursor.row + 1 + ":" + (cursor.column + 1)
			cursorpos.innerHTML = displayText
		})

		// // copy text to the thumbnail strip
		editor.on("change", () => {
			const pos = editor.getCursorPosition
			cursorpos.innerHTML = `${pos.col}:${pos.row}`
			if (!editor.session.getUndoManager().isClean()) {
				if (editor.getValue() !== editor.session.baseValue) {
					if (tabBar.activeTab) tabBar.activeTab.changed = true
					if (fileList.activeItem) fileList.activeItem.changed = true
				} else {
					if (tabBar.activeTab) tabBar.activeTab.changed = false
					if (fileList.activeItem) fileList.activeItem.changed = false
					editor.session.getUndoManager().markClean()
				}
			} else {
				if (tabBar.activeTab) tabBar.activeTab.changed = false
				if (fileList.activeItem) fileList.activeItem.changed = false
			}
			// check if the buffer has edits
			// 			tabBar.activeTab.changed = !!(editor.getSession().$undoManager.$undoStack.length>0)
			// tabBar.activeTab.changed = editor.getValue() != tabBar.activeTab?.config?.session?.baseValue
			// fileList.activeItem.changed = tabBar.activeTab.changed
		})

		return
	},

	updateWorkspace:(appConfig) =>{ 
		window.workspaceMenu = workspaceMenu
		
	},

	updateThemeAndMode: () => {
		const c_mode = editor.getOption("mode")
		const c_theme = editor.getOption("theme")
		window.themeMenu = themeMenu
		window.modeMenu = modeMenu
		

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
	},

	showFolders: async (expandLevels=1) => {
		fileList.autoExpand = expandLevels
		fileList.files = workspace.folders
	},

	toggleFiles: () => {
		return openDir.click()
	},

	toggleThumb: () => {
		return toggleBodyClass("showThumb")
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

	get editor() {
		return editor
	},
	get thumb() {
		return thumbstrip
	},
	get installer() {
		return installer
	},
	get editorElement() {
		return editorElement
	},
	get thumbElement() {
		return thumbElement
	},
	get fileActions() {
		return fileActions
	},
	get files() {
		return files
	},
	get fileList() {
		return fileList
	},
	get tabBar() {
		return tabBar
	},
	get themeModeToggle() {
		return themeModeToggle
	},
}

setTimeout(() => {
	editor.on("ready", () => {
		uiManager.updateThemeAndMode()
	})
})

uiManager.defaultSettings = defaultSettings
export default uiManager
