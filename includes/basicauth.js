/*
BasicAuth handler
author: jason@scantek.com.au
created: 2020-01-02

Handles the request/response stuff for HTTP Basic Authorisation as an express middlewear

*/

const md5 = require('md5');
const util = require("util");
const fs = require('fs');
fs._readFile = util.promisify(fs.readFile);
fs._readDir = util.promisify(fs.readdir);
fs._writeFile = util.promisify(fs.writeFile);


let authList = null;
let skipList = []
let credentialsPath = null;

// express middlewear for directly handling the basic auth
function basicAuth(req,res,next) {
	if(authList == null) {
		console.info("basicAuth disabled, blocking access");
		return res.status(500).send("Server Error: authorization required but not configure on the server");
	}
	
	req.uri = req.url.split("?")[0];
	// console.log(req.uri, skipList.url);
	// Grab the "Authorization" header.
	var auth = req.get("authorization");
	
	// On the first request, the "Authorization" header won't exist, so we'll set a Response
	// header that prompts the browser to ask for a username and password.
	if(skipList != null) {
		if(Array.isArray(skipList.match)) {
			let skip = false;
			skipList.match.forEach(match=>{ if(req.url.indexOf(match)!=-1) { skip = true }	})
			if(skip) return basicAuth.noAuth(req, res, next);
		}
		if(Array.isArray(skipList.url)) {
			if(skipList.url.indexOf(req.uri)!=-1) return basicAuth.noAuth(req, res, next);
		}
	}
	
	if (!auth) {
		res.set("WWW-Authenticate", "Basic realm=\"Authorization Required\"");
		// If the user cancels the dialog, or enters the password wrong too many times,
		// show the Access Restricted error message.
		return res.status(401).send("Authorization Required");
	} else {
		// If the user enters a username and password, the browser re-requests the route
		// and includes a Base64 string of those credentials.
		var credentials = new Buffer(auth.split(" ").pop(), "base64").toString("ascii").split(":");
		
		if(basicAuth.checkUser(credentials[0], credentials[1])) {
			req.auth = {}
			req.auth.user = credentials[0];
			return next();
		} else {
			res.set("WWW-Authenticate", "Basic realm=\"Authorization Required\"");
			return res.status(401).send("Authorization Required");
			// return res.status(403).send("Access Denied (incorrect credentials)");
		}
	}
}

basicAuth.noAuth = (req, res, next)=>{
	req.auth = { user: "guest" }
	next();
}

basicAuth.enableCORS = (req, res, next)=>{
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Authentication");
	return (req.method=="OPTIONS")?res.end():next()
}

// extend the object for other ops
// file handling, etc
basicAuth.setPath = (path)=>{
	return new Promise((accept, reject)=>{
		fs._readFile(path+"/basicAuth.json").then(file=>{
			credentialsPath = path
			let content = file.toString()
			if(content=="") {
				authList = {}
				accept()
			} else {
				try {
					authList = JSON.parse(content)
					console.log(path+"/basicAuth.json", "loaded")
					fs._readFile(path+"/basicAuth-skip.json").then(file=>{
						let content = file.toString();
						if(content == "") {
							skipList = []
							console.log(path+"/basicAuth-skip.json", "empty or not exists")
							accept()
						} else {
							try {
								skipList = JSON.parse(content)
								console.log(path+"/basicAuth-skip.json", "loaded")
							} catch(e) {
								console.info("basicAuth exemptions not parseable")
							}
							accept()
						}
						accept()
					}).catch(e=>{
						console.log("basicAuth exemptions not available")
						accept()
					})
				} catch(e) {
					console.info("basicAuth not parseable")
					reject()
				}
			}
		}).catch(e=>{
			console.warn("couldn't open", path+"/basicAuth.json", "creating new blank authList")
			credentialsPath = path
			authList = {}
			accept()
			// authList = null;
			// reject();
		});
	})
}

basicAuth.checkUser = (user,password)=>{
	let md5Pass = md5(password);
	if(authList[user]) {
		if(authList[user].password == md5Pass) {
			return true;
		} else {
			return false;
		}
	} else {
		return false;
	}
}

basicAuth.addUser = (user, password)=>{
	let md5Pass = md5(password);
	console.log("Adding user", user);
	if(authList[user]) {
		authList[user].password = md5Pass;
		fs._writeFile(credentialsPath+"/basicAuth.json", JSON.stringify(authList, null, "\t"))
		return `Updated password for ${user}`;
	} else {
		authList[user] = {
			username:user,
			password:md5Pass
		}
		fs._writeFile(credentialsPath+"/basicAuth.json", JSON.stringify(authList, null, "\t"))
		return `Added password for ${user}`;
	}
}

basicAuth.removeUser = (user)=>{
	delete(authList[user]);
	fs._writeFile(credentialsPath+"/basicAuth.json", JSON.stringify(authList, null, "\t"))
	return `Removed password for ${user}`;
}

// handle the CLI interface for adding / removing users
basicAuth.cli = ()=>{
	// drop the start args
	process.argv.shift();
	process.argv.shift();

	// then we should have a username and password
	let action = process.argv.shift();
	let user = process.argv.shift();
	let pass = process.argv.shift();

	basicAuth.setPath(process.env.PWD).then(()=>{
		switch(action) {
			case "add":
				if(user!="" && pass!="") {
					console.log(basicAuth.addUser(user,pass));
				}
			break;
			case "remove":
				if(user!="" && pass!="") {
					console.log(basicAuth.removeUser(user));
				}
			break;
			case "check":
				if(user!="" && pass!="") {
					console.log(basicAuth.checkUser(user,pass));
				}
			break;
			case "list":
				for(i in authList) { console.log(i); }
			break;
		}
	}).catch(e=>{
		console.error("unable to open basicAuth.json", e);
	})
}


module.exports = basicAuth