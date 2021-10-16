# Frequently Asked Questions

## Why another code editor?

I like really web technologies and treating the browser as the platform, rather than reliance on the OS as the platform. I think that we can do just about anything in the browser (setting aside the question of whether or not we SHOULD...).

To that end, I started a little passion project to build a functioning, modestly featured code editor as an installable web application (PWA/Progressive Web App). 

Code is the result.

## Can I do real work with this?

- Does it do everything? 
- Can it run an embedded terminal, or trigger my linker and compiler?
- Can it replace X/Y/Z IDE or application that I've used for years?

No, No and, maybe?

I write software for a living, I've used a lot of editors and IDEs, many have great, smart, fancy feature that can make development easier. Code doesn't have a lot of those smart and fancy features, and probably never will. However, I have personally used code excusively for my day job for 3 weeks (at time of writing) and Code itself has been written in Code from very early in project. So it's certainly good enough to do some serious coding.

## How do I install the webapp locally?
For now a working copy of Code is hosted at https://code.jakbox.dev/

If you're running Chrome (or another Chromium-based browser), you'll be prompted to trigger the local install (usually on your second visit).


## Can I contribute? 
#### If so, how should I?
Clone/Fork this repo, submit issues, submit pull requests.

## I'm trying to use Regex and...
This project uses EMCScript regex, provided directly by the Javascrpt runtime. In practice it’s fast and consistent across platforms, but likely doesn’t directly confirm to any “other” standard.

I love this tool and cheat-sheet for fiddling, if I’m not sure how to regex something https://www.regexpal.com/