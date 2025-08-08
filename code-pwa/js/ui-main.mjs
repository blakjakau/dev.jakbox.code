import { FileList, Panel, Inline, Block, Button, TabBar, MediaView, Input, MenuItem, ActionBar, EditorHolder, IconTabBar, IconTab, SidebarPanel } from './elements.mjs';
import TerminalManager from './terminal-manager.mjs'; // Import the new TerminalManager
import aiManager from './ai-manager.mjs';
import ollama from './ai-ollama.mjs';

const defaultSettings = {
	showGutter: true, //set to true to hide the line numbering
	highlightGutterLine: true,
	printMargin: false,
	displayIndentGuides: true,
	showInvisibles: false, //show whitespace characters (spaces, tabs, returns)
	scrollPastEnd: 1, //allow the leftEditto scroll past the end of the document
	useSoftTabs: false,
	tabSize: 4,
	newLineMode: "auto",
	enableBasicAutocompletion: true,
	fontSize: 12,
	fontFamily: "roboto mono",
}

// these become the actual editor elements
var mainContent
var leftEdit, leftHolder, leftTabs
var rightEdit, rightHolder, rightTabs


var menu
var omni, modal, installer
var sidebar, fileActions, fileList
var drawer, statusbar, statusTheme, statusMode, statusWorkspace
var themeMenu, modeMenu, workspaceMenu
var darkmodeMenu, darkmodeSelect
var openDir, themeModeToggle, toggleSplitViewBtn, scratchEditor, iconTabBar;
var fileListBackground
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
var animRate = 250, constrainHolders, constrainHoldersTimeout, debounceConstrainHolders
var saveSidepanelWidth

let isResizingSidebar = false; // Flag to hide panel content during manual resize to prevent jank
const uiManager = {
	
	create: (options = {}) => {
		
		document.documentElement.style.setProperty('--animRate', `${animRate}ms`);
		
		const defaults = {
			theme: "ace/theme/code",
			mode: "ace/mode/javascript",
			keyboard: "ace/keyboard/sublime",
		}
		
		window.addEventListener("resize", ()=>{
			debounceConstrainHolders()
		})
		
		debounceConstrainHolders = ()=>{
			clearTimeout(constrainHoldersTimeout); 
			constrainHoldersTimeout = setTimeout(constrainHolders, 100); 
		}
		constrainHolders = ()=>{
			void sidebar.offsetWidth
			const minWidth = 350
			const maxWidth = window.innerWidth - 300; // 50% of window width
			if(sidebar.offsetWidth > maxWidth) {
				sidebar.style.width = maxWidth + "px"
				mainContent.style.left = maxWidth + "px";
			} else if(sidebar.offsetWidth < minWidth) {
				sidebar.style.width = minWidth + "px"
				mainContent.style.left = minWidth + "px";
			}
			
			drawer.style.left = (sidebar.offsetLeft + sidebarWidth) + "px";
			
			// Call fit on the terminal manager's instance
			if (window.terminalManager) {
				window.terminalManager.fit();
				// Ensure fit after sidebar transition
				sidebar.removeEventListener("transitionend", uiManager._sidebarFitTerminalAfterTransition); // Prevent duplicate listeners
				uiManager._sidebarFitTerminalAfterTransition = () => window.terminalManager.fit();
				sidebar.addEventListener("transitionend", uiManager._sidebarFitTerminalAfterTransition, { once: true });
			}
			saveSidepanelWidth()
			if(!document.body.classList.contains("showSplitView")) {
				leftEdit.resize()
				rightEdit.resize()
				scratchEditor.resize();
				return
			}
			
			
			const w = mainContent.offsetWidth
			let l = leftHolder.offsetWidth/w
			let r = rightHolder.offsetWidth/w
			l = Math.max(0.25, Math.min(0.75, l))
			r = 1 - l
			leftHolder.style.width = ((l)*100)+"%"
			rightHolder.style.width = ((r)*100)+"%"
			
			
			
			setTimeout(()=>{
				leftEdit.resize()
				rightEdit.resize()
				scratchEditor.resize();
			}, animRate)

		}

		options = { ...defaults, ...options }

		mainContent = document.querySelector("#mainContent")

		fileActions = new ActionBar()
		fileActions.setAttribute("id", "fileActions")
		fileActions.setAttribute("slim", "true")

		const fileSettingsBtn = new Button();
		fileSettingsBtn.icon = "settings";
		fileSettingsBtn.setAttribute("title", "File list settings");
		fileSettingsBtn.setAttribute("hook", "right");
		fileSettingsBtn.on('click', () => {
			ui.fileList.toggleSettingsPanel();
		});
		fileActions.append(fileSettingsBtn);

		fileList = new FileList()

		iconTabBar = new IconTabBar();

		const filesTab = new IconTab('folder');
		const aiTab = new IconTab('developer_board');
		const scratchTab = new IconTab('edit_note');
		const terminalTab = new IconTab('terminal');
		iconTabBar.addTab(filesTab);
		iconTabBar.addTab(aiTab);
		iconTabBar.addTab(terminalTab);
		iconTabBar.addTab(scratchTab);
		
		const filesPanel = new SidebarPanel();
		filesPanel.append(fileActions);
		filesPanel.append(fileList);

		fileListBackground = document.createElement("div");
		fileListBackground.classList.add("file-list-background-element");
		fileListBackground.innerHTML = `<ui-icon icon="folder_open" style="font-size: 48px; opacity: 0.5;"></ui-icon><div class="caption">No folders in workspace<br/>Add a folder to begin.</div>`;
		filesPanel.append(fileListBackground);

		// The AI Panel creation is delegated to aiManager.init(aiManagerPanel)
        // Ensure aiManagerPanel exists for aiManager to append its UI
		// aiManager.panel is set here for the first time
		const aiManagerPanel = new SidebarPanel();
		aiManager.init(aiManagerPanel) 
        // as we need global app/workspace config loaded before aiManager fully initializes.
        // So this append happens here, but init() is external.

		const scratchPanel = new SidebarPanel();
		const scratchEditorElement = new Block();
		scratchEditorElement.setAttribute("id", "scratchpad-editor");
		scratchEditorElement.style.height = "100%";
		scratchPanel.append(scratchEditorElement);

		const terminalPanel = new SidebarPanel(); // Create a SidebarPanel to host the terminal
		terminalPanel.setAttribute("id", "terminal-panel");
		
		window.terminalManager = TerminalManager; // Create the manager instance
		window.terminalManager.init(terminalPanel); // Initialize the manager with its panel
		window.terminalManager._checkConduitStatus()

		const sidebarPanelsContainer = new Block();
		sidebarPanelsContainer.setAttribute("id", "sidebar-panels-container");
		sidebarPanelsContainer.append(filesPanel);
		sidebarPanelsContainer.append(aiManagerPanel);
		sidebarPanelsContainer.append(scratchPanel);
		sidebarPanelsContainer.append(terminalPanel);

		sidebar = new Panel()
		sidebar.setAttribute("id", "sidebar")
		sidebar.append(iconTabBar);
		sidebar.append(sidebarPanelsContainer);
		sidebar.minSize = 240
		sidebar.maxSize = 2440
		
		
		let currentTab
		saveSidepanelWidth = ()=>{
			const activeTabId = iconTabBar.activeTab?.iconId;
			if (activeTabId && window.workspace) {
				window.workspace.sidebarPanelWidths = window.workspace.sidebarPanelWidths || {};
				window.workspace.sidebarPanelWidths[activeTabId] = sidebar.offsetWidth;
				if (window.saveWorkspace) {
					window.saveWorkspace();
				}
			}
		}

		
		iconTabBar.on('tabs-updated', ({ detail }) => {
			const tab = detail.tab;
			const panels = sidebar.querySelectorAll('ui-sidebar-panel');
			
			let nextActivePanel;
			if (tab === filesTab) {
				nextActivePanel = filesPanel;
			} else if (tab === aiTab) {
				nextActivePanel = aiManagerPanel;
			} else if (tab === scratchTab) {
				nextActivePanel = scratchPanel
			} else if (tab === terminalTab) {
				nextActivePanel = terminalPanel
			}
			
			const currentlyVisiblePanel = sidebar.querySelector('ui-sidebar-panel[active]');
			const isSwitchingPanel = currentlyVisiblePanel !== nextActivePanel;
			if (isSwitchingPanel) {
				panels.forEach(panel => panel.active = false); // Hide all panels only if truly switching
			}
			const tabId = tab.iconId;
			const newWidth = window.workspace?.sidebarPanelWidths?.[tabId];
			if (newWidth && sidebar.offsetWidth !== newWidth) {
				// Animate the resize and reveal the panel content after the animation completes
				sidebar.style.transition = "width var(--animRate) ease-in-out";
				mainContent.style.transition = "left var(--animRate) ease-in-out";
				sidebar.style.width = `${newWidth}px`;
				mainContent.style.left = `${newWidth}px`;
				setTimeout(() => {
					sidebar.style.transition = "";
					mainContent.style.transition = "";
					if (nextActivePanel) nextActivePanel.active = true; // Reveal the correct panel after animation
					debounceConstrainHolders(); // Re-constrain holders after sidebar resize
					saveSidepanelWidth()
					
				}, animRate);
			} else {
				// No animation needed, or it's the same width, just ensure the correct panel is active
				if (nextActivePanel) nextActivePanel.active = true;
				// If no animation, ensure current width is stored and saved
				saveSidepanelWidth()
			}
		});

		iconTabBar.activeTab = filesTab;
		sidebar.resizable = "right"
		sidebar.minSize = 40
		let sidebarWidth = 350

		menu = document.querySelector("#menu")
		if (menu == null) {
						menu = new ActionBar()
			menu.setAttribute("id", "menu")
			menu.addClass("slim")
			menu.append(new Inline('<img src="images/code-192.png"/> Code'))
		}

		openDir = new Button()
		openDir.icon = "menu_open"
		openDir.setAttribute("title", "hide file list")

		openDir.on("click", () => {
			if (toggleBodyClass("showSidebar")) {
				openDir.icon = "menu_open"
				openDir.setAttribute("title", "hide sidebar")
				mainContent.style.left = ui.sidebar.offsetWidth + "px"
			} else {
				openDir.icon = "menu"
				openDir.setAttribute("title", "show sidebar")
				mainContent.style.left = ""
			}
			setTimeout(()=>{
				debounceConstrainHolders()
			},animRate)
		})

		toggleSplitViewBtn = new Button()
		toggleSplitViewBtn.icon = "vertical_split"
		toggleSplitViewBtn.setAttribute("title", "Toggle split view")
		toggleSplitViewBtn.setAttribute("id", "toggleSplitView")
		toggleSplitViewBtn.on("click", () => {
			uiManager.toggleSplitView()
		})

		leftTabs = new TabBar()
		leftTabs.type = "tabs"
		leftTabs.setAttribute("id", "leftTabs")
		leftTabs.setAttribute("slim", "true")
		leftTabs.splitViewDragEnabled = true;
		
		leftTabs.append(openDir)
		leftTabs.append(toggleSplitViewBtn)
		
		rightTabs = new TabBar()
		rightTabs.type = "tabs"
		rightTabs.setAttribute("id", "rightTabs")
		rightTabs.setAttribute("slim", "true")
		
		
		statusbar = document.querySelector("#statusbar")
		if (statusbar == null) {
			statusbar = new ActionBar()
			statusbar.setAttribute("id", "statusbar")
			statusbar.setAttribute("slim", "true")
			statusbar.hook = "top"
		}

		toggleSplitViewBtn.setAttribute("hook", "right")
		
		statusTheme = document.querySelector("#theme_select")
		statusMode = document.querySelector("#mode_select")

		themeMenu = document.querySelector("#theme_menu")
		modeMenu = document.querySelector("#mode_menu")

		// Query darkmode elements directly within the function
		darkmodeSelect = document.querySelector("#darkmode_select");
		darkmodeMenu = document.querySelector("#darkmode_menu");

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

		leftHolder = new EditorHolder()
		leftHolder.setAttribute("id", "leftHolder")
		leftHolder.classList.add("current")
		leftHolder.mediaView.id = "leftMedia"
		
		rightHolder = new EditorHolder()
		rightHolder.mediaView.id = "rightMedia"
		
		window.rightHolder = rightHolder
		
		rightHolder.setAttribute("id", "rightHolder")
		// rightHolder.querySelector(".notice-bar").setAttribute("id", "rightFileModifiedNotice")
		rightHolder.style.width = "0px"
		rightHolder.style.right = "0px"
		rightHolder.resizable = "left"
		rightHolder.minSize = 0
		rightHolder.maxSize = 2440
		
	
		leftTabs.exclusiveDropType = "editor-tab"
		rightTabs.exclusiveDropType = "editor-tab"
		leftHolder.exclusiveDropType = "editor-tab"
		rightHolder.exclusiveDropType = "editor-tab"

		
		sidebar.resizeListener((width) => {
			const maxWidth = window.innerWidth * 0.8; // 50% of window width
			// sidebar.style.transition = "none";
			sidebarWidth = Math.min(width, maxWidth); // Constrain width
			mainContent.style.transition = "none";
			mainContent.style.left = sidebarWidth + "px";
			drawer.style.left = (sidebar.offsetLeft + sidebarWidth) + "px";
		});
		
		sidebar.resizeEndListener(()=>{
			// if (!isResizingSidebar && sidebarPanelsContainer) {
			// 	isResizingSidebar = true;
			// 	sidebarPanelsContainer.style.visibility = 'hidden';
			// }
			if (isResizingSidebar && sidebarPanelsContainer) {
				isResizingSidebar = false;
				sidebarPanelsContainer.style.visibility = 'hidden';
			}
			sidebar.style.transition = ""
			mainContent.style.transition = ""

			debounceConstrainHolders()
			
			sidebar.on("transitionend", ()=>{
				console.debug("save sidepanel resize event")
				saveSidepanelWidth()
				// sidebarPanelsContainer.style.visibility = 'hidden';
			}, {once:true})
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
			debounceConstrainHolders()
		})

		drawer = new Panel()
		drawer.setAttribute("id", "drawer")
		drawer.resizable = "top"
		let drawerHeight = 34
		drawer.minSize = drawerHeight
		drawer.maxSize = 1440
		drawer.style.height = drawerHeight + "px"
		mainContent.style.bottom = drawerHeight + "px"

		drawer.resizeListener((height)=>{
			mainContent.style.transition = "none"
			mainContent.style.bottom = height + "px"
			// drawer.style.left = sidebar.offsetWidth
		})

		drawer.resizeEndListener(()=>{
			mainContent.style.transition = ""
			debounceConstrainHolders()
		})
		

		installer = new Panel()
		installer.setAttribute("type", "modal")
		document.body.append(installer)
		installer.classList.add("slideUp")
		installer.style.cssText = `left:auto; top:auto; right:32px; bottom:64px; width:auto; height:105px; text-align:center;`
		installer.innerHTML = `<p><img src="images/code-192.png" height='32px' style="vertical-align:middle; margin-top:-4px;">&nbsp;&nbsp;<b>Add 'Code' as an app?</b></p>`

		installer.confirm = new Button("Yes please!")
		installer.confirm.classList.add("themed")
		installer.confirm.icon = "done"

		installer.later = new Button("Later")
		installer.later.classList.add("themed")
		installer.later.icon = "watch_later"

		installer.deny = new Button("No thanks")
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

		installer.clear = new Button("")
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

		omni = new Panel()
		omni.results = new Panel()
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

		omni.titleElement = new Block("omni box")
		omni.input = new Input()
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
							
							let counter = 0
							for (let item of matches) {
								// if(counter>10) continue
								const result = new Block()
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
				// ArrowDown or Tab -> next item
				if (e.code === "ArrowDown" || (e.code === "Tab" && !e.shiftKey && !e.ctrlKey)) {
					e.preventDefault();
					omni.input.setSelectionRange(omni.input.value.length, omni.input.value.length);
					omni.results.next();
					return;
				}
				// ArrowUp or Shift+Tab or Ctrl+Tab -> previous item
				if (e.code === "ArrowUp" || (e.code === "Tab" && (e.shiftKey || e.ctrlKey))) {
					e.preventDefault();
					omni.input.setSelectionRange(omni.input.value.length, omni.input.value.length);
					omni.results.prev();
					return;
				}
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
			new Block(
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

		leftHolder.tabs = leftTabs
		rightHolder.tabs = rightTabs

		leftTabs.on("click", () => { uiManager.currentEditor = leftEdit })
		rightTabs.on("click", () => { uiManager.currentEditor = rightEdit })
		leftHolder.on("click", () => { uiManager.currentEditor = leftEdit })
		rightHolder.on("click", () => { uiManager.currentEditor = rightEdit })

		leftHolder.on("empty", () => { 
			leftEdit.setSession(ace.createEditSession("", ""))
		})
		rightHolder.on("empty", () => { 
			rightEdit.setSession(ace.createEditSession("", ""))
		})

		document.body.addEventListener('tabdroppedonbar', () => {
			leftHolder.classList.remove("drag-over");
			rightHolder.classList.remove("drag-over");
		});

		document.body.appendChild(menu)
		document.body.appendChild(statusbar)
		
		
		
		mainContent.appendChild(leftHolder)
		mainContent.appendChild(rightHolder)
		
		document.body.appendChild(sidebar)
		// document.body.appendChild(drawer)
		document.body.appendChild(omni)

		let cursorpos = new Inline()
		cursorpos.setAttribute("id", "cursor_pos")
		statusbar.append(cursorpos)

		window.leftEdit = leftEdit = ace.edit(leftHolder.editorElement)
		window.rightEdit = rightEdit = ace.edit(rightHolder.editorElement)
		
		leftEdit.id = "left-editor"
		rightEdit.id = "right-editor"
		
		leftHolder.editor = leftEdit
		rightHolder.editor = rightEdit
		
		window.editors = [leftEdit, rightEdit]
		leftEdit.tabs = leftTabs
		rightEdit.tabs = rightTabs
		
		uiManager.currentEditor = leftEdit;
		window.omni = omni
		ace.require("ace/keyboard/sublime")
		ace.require("ace/etc/keybindings_menu")

		scratchEditor = ace.edit(scratchEditorElement);
		scratchEditor.id = "scratch-editor"
		
		window.editors.push(scratchEditor);

		const updateCursorPositionStatus = (editor) => {
			if (editor === scratchEditor) return;
			const selection = editor.getSelection();
			const cursor = selection.getCursor();
			let displayText = `${cursor.row + 1}:${cursor.column + 1}`;

			const tab = editor.tabs?.activeTab;
			if (tab) {
				const fileName = tab.title || tab.config.name;
				if (fileName) {
					displayText += ` - ${fileName.replace(/\//g, " > ")}`;
				}
			}
			cursorpos.innerHTML = displayText;
		};

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
	
	
			editor.on("focus", () => {
				// if (editor === scratchEditor) return;
				uiManager.currentEditor = editor
			})

			editor.on("changeSelection", () => {
				updateCursorPositionStatus(editor);
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
					const item = new MenuItem(theme.caption)
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
					const item = new MenuItem(mode.caption)
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
			const selectedMenuItem = darkmodeMenu.querySelector(`[args='${app.darkmode}']`);
			if (selectedMenuItem) {
				selectedMenuItem.icon = "done";
			}
		});
	},

	showSidebar: async (expandLevels=1) => {
		fileList.autoExpand = expandLevels
		fileList.files = workspace.folders
	},

	toggleSidebar: () => {
		return openDir.click()
	},
	
	toggleSplitView: (ext = {})=>{
		if(ext?.targetState == "closed") {
			if(!document.body.classList.contains("showSplitView")) {
				uiManager.currentEditor = leftEdit
				return
			}
		}
		const targetWidth = (window.innerWidth - leftHolder.offsetLeft)/2
		if (toggleBodyClass("showSplitView")) {
			toggleSplitViewBtn.icon = "view_column"
			toggleSplitViewBtn.setAttribute("title", "Hide split view")
			leftHolder.style.width = "50%"
			rightHolder.style.width = "50%"
			rightTabs.reclaimTabs(leftTabs, "rightTabs");
		} else {
			toggleSplitViewBtn.icon = "vertical_split"
			toggleSplitViewBtn.setAttribute("title", "Show split view")
			leftHolder.style.width = "100%"
			rightHolder.style.width = "0%"
			rightTabs.moveAllTabsTo(leftTabs, "rightTabs", true);
		}

		setTimeout(()=>{
			debounceConstrainHolders()
		},animRate)
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
			omni.input.on("blur", uiManager.hideOmnibox, { once: true })
		})
	},

	hideOmnibox: () => {
		omni.saveStack()
		setTimeout(() => {
			omni.classList.remove("active")
		}, 200)
	},

	showSettings: (opts) => {
		console.debug(opts)
		settingsPanel.show()
	},

	
	get installer() { return installer },
	
	get mainContent() { return mainContent },
	get fileActions() { return fileActions },
	get sidebar() { return sidebar },
	get fileList() { return fileList },
	get leftTabs() { return leftTabs },
	get darkmodeSelect() { return darkmodeSelect },
	get darkmodeMenu() { return darkmodeMenu },

	get leftEdit() { return leftEdit },
	get leftHolder() { return leftHolder },
	get leftMedia() { return leftHolder.mediaView },

	get rightEdit() { return rightEdit },
	get rightHolder() { return rightHolder },
	get rightMedia() { return rightHolder.mediaView },
	get rightTabs() { return rightTabs },
	get scratchEditor() { return scratchEditor },
	get iconTabBar() { return iconTabBar },
	
	get terminalManager() { return terminalManager }, // Export the terminal's SidebarPanel
	get aiManager() { return aiManager },
	
	fileListBackground: fileListBackground, // Expose the new element
	_sidebarFitTerminalAfterTransition: null, // To hold the bound function for removal
	constrainHolders: debounceConstrainHolders,

	set currentEditor(v) {
		currentEditor = v;
		if (v === leftEdit) {
			leftHolder.classList.add("current");
			rightHolder.classList.remove("current");
			currentTabs = leftTabs;
			// currentTabs?.activeTab?.click()
			// leftHolder._updateContentVisibility(false);
			// rightHolder._updateContentVisibility(true);
		} else {
			leftHolder.classList.remove("current");
			rightHolder.classList.add("current");
			currentTabs = rightTabs;
			// currentTabs?.activeTab?.click()
			// rightHolder._updateContentVisibility(false);
			// leftHolder._updateContentVisibility(true);
		}
	},
	set currentTabs(v) { currentTabs = v },
	get currentEditor() { return currentEditor },
	get currentTabs() { return currentTabs },
	get currentMediaView() { return currentMediaView },
	set currentMediaView(v) { currentMediaView = v },

	set reloadFile(v) {
		if("function" == typeof v) {
			uiManager._reloadFile = v
		}
	},

    showFileModifiedNotice: (tab, side) => {
    	
        const noticeBarId = (side === 'left') ? "leftHolderFileModifiedNotice" : "rightHolderFileModifiedNotice";
        const noticeBar = document.getElementById(noticeBarId);
        const reloadBtn = noticeBar.querySelector("button[rel=reload]");
        const dismissBtn = noticeBar.querySelector("button[rel=dismiss]");

        // Store the tab reference on the notice bar for event handlers
        noticeBar.currentTab = tab;

        reloadBtn.onclick = () => {
            console.debug("Reload button clicked for tab:", tab.config.name);
            uiManager._reloadFile(tab)
            uiManager.hideFileModifiedNotice(side); // Pass side
        };
        dismissBtn.onclick = () => {
            tab.config.fileModified = false; // Clear the flag
            uiManager.hideFileModifiedNotice(side); // Pass side
        };

        noticeBar.style.display = "flex"; // Show the notice bar
    },

    hideFileModifiedNotice: (side) => {
        const noticeBarId = (side === 'left') ? "leftHolderFileModifiedNotice" : "rightHolderFileModifiedNotice";
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