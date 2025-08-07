# Code

## What is it for?

Editing files on your local machine. 

If you're passingly familiar with Sublime Text or VSCode the keyboard bindings should feel quite familiar. 

### Key features: 
- it's super light-weight
- it's 99% offline capable 
	- (the 1% is any themes / modes not already loaded will not be available offline)
- has tabbed editing
- common find/Regex Find/goto line
- built around the '[ace editor](https://ace.c9.io)'
	- supports over 100 coding languages
	- comment toggling
	- code folding
	- multi-cursor support
	- many colour themes
- integrated '[prettier](https://prettier.io/)' 
	- One touch code reformatting for your HTML/CSS/JavaScript files
- integrated Ollama and Gemini API hooks for AI coding assistance with tooling for DIFF outputs and 1-touch apply
- integrated '[xtermjs](https://xtermjs.org)' and '[Conduit](https://github.com/blakjakau/dev.jakbox.conduit)' for passthrough to terminal (PTY) on macOS, Linux and Windows 11
- dark mode

>**Please Note**  
> Only works in desktop, chromium-based browsers (Chrome, Chromium, Edge, Opera) - turns out Brave disables the File System API, Firefox and Safari have not (and may never) implement, and AFAIK no mobile browsers support it.

> UPDATE: JAN 2022 apparently shortly after writing this Brave added a flag to enable file-system-access-api which can be turned on here  brave://flags/#file-system-access-api

> UPDATE: Desktop Safari has partial support for the File System Access API some time after version 15, the current implementation is not usable for this project.



The app works _exclusively_ with local file editing, your files don't leave your computer, __*EVER*__. Remote filesystems _should_ work -- so long as your system's file explorer can access it, Code can access it... hypothically -- I've used and tested it on Windows 10, Chrome OS and Ubuntu Linux.

## What is it _not_ for?
- Storing your documents online (see above).
- Serving extremely specific or niche needs that add excessive complexity, bloat or performance cost

## Where can I try it?
For now a working copy of Code is hosted at https://code.jakbox.dev/

Of course you can alway clone the repo, it includes a node+express app to host the PWA and run/install it from localhost, you could be up and running minutes from now...

### Getting started

Assuming you have a working terminal CLI with a working node.js install...

- Clone the repo
```shell
git clone https://github.com/blakjakau/dev.jakbox.code.git
```

- Install the npm packages and `nodemon`
```sh
cd dev.jakbox.code/http
npm i
sudo npm i -g nodemon
```

- Run the http app (localhost service to host the app)
```sh
npm start
```

- open a supported browser, see [FAQ](FAQ.md#user-content-can-i-run-it-in-x-browser)
- navigate to `localhost:8083`

## I have other questions
Check the [FAQ](FAQ.md) before asking them.

## Licence
Licenced under "[The 3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause)". 

Actual [licence statement here](licence.md).
