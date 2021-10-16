# Code

## What is it for?

Editing files on your local machine. 

If you're passingly familiar with Sublime Text or VSCode the keyboard bindings should feel quite familiar. 

### Key features: 
- it's super light-weight
- it's 99% offline capable 
	- (the 1% is any themes / modes not already loaded will not be available offline)
- supports over 100 coding languages
- has tabbed editing
- common find/Regex Find/goto line
- comment toggling
- code folding
- integrated '*[prettier](https://prettier.io/)' support for HTML/CSS/Javascript
- built around the '*[ace editor](https://ace.c9.io)'
- full multi-cursor support
- many colour themes
- dark mode

>**Please Note**  
> Only works in desktop, chromium-based browsers (Chrome, Chromium, Edge, Opera) - turns out Brave disables the File System API, Firefox and Safari have not (and may never) implement, and AFAIK no mobile browsers support it.



The app works _exclusively_ with local file editing, your files don't leave your computer, __*EVER*__. Remote filesystems _should_ work -- so long as your system's file explorer can access it, Code can access it... hypothically -- I've used and tested it on Windows 10, Chrome OS and Ubuntu Linux.

## What is it _not_ for?
- Storing your documents online (see above).
- Serving extremely specific needs of others with no utility to me.
    - You can make suggestions, and they may be implemented, but the repository owner reserves the right to veto.

## Where can I try it?
For now a working copy of Code is hosted at https://code.jakbox.dev/

Of course you can alway clone the repo, it includes a node+express app to host the PWA and run/install it from localhost, you could be up and running minutes from now...

## I have other questions
Check the [FAQ](FAQ.md) before asking them.

## Licence
Licenced under "[The 3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause)". 

Actual [licence statement here](licence.md).