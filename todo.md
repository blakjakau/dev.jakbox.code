# todo
- fix light theme

## fixes
- filelist activity indicators (line wrapping)
- filelist rendering janky when removing folders
- resolve/rework sidebar size contraints
- maintain tab orders - files and AI chats between reloads

## ideas
- filelist index updates?
- filelist index search (helpful for @ tagging in prompts?)
- improve chat summary implementation
- - consider short-term "undo" for summarisation? or a confirm step with a preview?
- allow import/export (save to file / load from file) of context threads for portability
- 
- add basic image editing (annotations) to mediaView?
- add context menu for tabs (right-click > rename, delete)
- expand context menu for files (right-click > rename, delete, move?)
- add markdown previews (tab or sidebar, live updated?)
- embed MDN or similar doc source in sidebar
- add click handlers on the status bar current path atoms to show files panel (if not already showing) and expand the paths to it (if not already showing)

## terminal integration
- add a terminal emulator
- https://xtermjs.org/ (only available via npm) can provide frontend
- build a standalone (localhost) SSH proxy in node
- proxy to be a binary download (see build process in dev.jakbox.static)
- other possiblities with a proxy app 
- - more complex read/find ops
- - file ops independant of FileSystemAPI?

## tool integration
- find/replace commands
- EXEC:READ_FILE: { filename:"" }
- EXEC:REPLACE: { filename:"", find:"", replace:"", global:true }
- EXEC:WRITE_FILE: { filename:"", content: "" }

## loading
- disable workspace autoload
- add welcome overlay + workspace selector
- hide sidebar
- disable defaultTab() call (untiled doc)

##older (from main.js)
- move ace settings panel into a tabbed modal with other application settings
- implement @lookup in omnibox
- add keyboard navigation to menus
- add save/load triggers for prettier with independant settings
- look at polyfilling file access https://github.com/jimmywarting/native-file-system-adapter/
- add "delete file" in filelist context menu?
- consider porting prettier modules for Kotline/Java/Sh/other?



# done
- tab title updates using "Save As"
- add code merges based on diff format
- add code highlighting to markdown (for AI response and preview tab)
- replace prompt textarea with ACE editor instance?
- add tabs to AI panel for multi-session / multi-task AI usage

- drag+drop tabs on the leftTabs
- disable live autocomplete
- set text baseValue at load and save, use it for change tracking
- Add "notSupported" page for firefox/brave other browsers that don't support the FileAPI
- add "CTRL+N" to create a new file/untitled document
- find out why useSoftTabs isn't disbling with its setting (bug in ACE-setting ext)
- Add menus (file/edit/etc) and context menu for FileList component
- persist editor settings in localstorage / indexdb
- implement "prettier" for code beautification
- bind theme and mode menus
- create "about" panel
- dark mode
- link active tab(s) to file view
- bind edit state between tabs and filelist?
- infer file type from #!/ opening line
- implement OS integration for file handling "Open with" (Chrome origin trial)
- implement indexing of filenames in workspace folders
- add licence information (including prettier/ace credits to about)
- restore workspace open files during app load
- implement file-type icons in file view
- implement multiple workspaces (restore last open?)	
- implement side-by-side split view
- implement mediaView to display images
- integrate Ollama AI chat
- integrate Gemini AI chat
- add general directions/instruction for Ollama and Gemini how-to
- fix menu accesskeys