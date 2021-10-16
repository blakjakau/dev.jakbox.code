# Code

## What is it for?

Editing files on your local machine. 

If you're passingly familiar with Sublime or VSCode the keyboard bindings should feel like home. 

### Key features: 
- it's super light-weight
- it's 99% offline capable 
-- (the 1% is any themes / modes not already loaded will not be available offline)
- It supports over 100 coding languages
- has tabbed editing
- common find/Regex Find/goto line
- comment toggling
- code folding
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

Of course you can alway clone the repo, it includes node+express app to host PWA and run/install it from local host.

## I have other questions
Check the [FAQ](FAQ.md) before asking them.

## Licence

Copyright 2021 jakbox.dev

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


