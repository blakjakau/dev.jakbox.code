# Frequently Asked Questions

## Why another code editor?

I like really web technologies and treating the browser as the platform, rather than reliance on the OS as the platform. I think that we can do just about anything in the browser (setting aside the question of whether or not we SHOULD ;) ).

To that end, I started a little passion project to build a functioning, modestly featured code editor as an installable web application (PWA/Progressive Web App). 

Code is the result.

## Can I do real work with this?

- Does it do everything? 
- Can it run an embedded terminal, or trigger my linker and compiler?
- Can it replace X/Y/Z IDE or application that I've used for years?

No, No and, maybe?

I write software for a living, I've used a lot of editors and IDEs, many have great, smart, fancy feature that can make development easier. Code doesn't have a lot of those smart and fancy features, and probably never will. However, I have personally used code excusively for my day job for 12 months and Code itself has been written in Code from very early in project. So it's certainly good enough to do some serious coding.

## How do I install the webapp locally?
For now a working copy of Code is hosted at https://code.jakbox.dev/

If you're running Chrome (or another Chromium-based browser), you'll be prompted to trigger the local install (usually on your second visit).

Of course you can alway clone the repo, it includes a [node+express](readme.md#Getting%20Started) app to host the PWA and run/install it from localhost, you could be up and running minutes from now... See [getting started](readme.md#user-content-getting-started)

## Can I run it in X browser

Code only works in desktop, chromium-based browsers (Chrome, Chromium, Edge, Opera), which all have the *File System Access API* implemented and enabled. 

Blocking access to an app based on a missing feature is somewhat antithetical to the premise of Web Applications, and even moreso "Progressive Web Applications". The unfortunate reality is that this app literally will not work this new API. 

Sure a ponyfill could be implmented that would have the user literally download a new copy of a file every time they hit `save` but the experience would be unworthy of using by anyone.

To see the current state of the *File System Access API* on other browsers check [Can I Use](https://caniuse.com/native-filesystem-api)


## Can I contribute? 
#### If so, how should I?
Clone/Fork this repo, submit issues, submit pull requests.

## I'm trying to use RegEx find and...
Code uses EMCScript regex, provided directly by the JavaScrpt runtime. In practice it’s pretty fast and consistent across platforms, but doesn’t necessarily map directly to any other "standard" of RegEx.

I love this tool and its cheat-sheet for fiddling with Regex in JavaScript, https://www.regexpal.com/
