
// using ECMA script imports, instead of CommonJS require
import fs from 'fs'
import http from 'http'
import https from 'http'
import express from 'express'
import os from 'os'
import qs from 'querystring'
import posts from './includes/posts.js'
import basicAuth from './includes/basicauth.js'

const app = express()
const port = process.env.PORT || 8081
const server = http.createServer()

// get basic auth to read it's config on startup
basicAuth.setPath(process.env.PWD);

app.use("/basicAuthReload", (req,res, next)=>{
	console.info("Reloading basic auth");
	basicAuth.setPath(process.env.PWD);
	next();
});

app.use(basicAuth.enableCORS) // enable CORS handling on all endpoints
app.use(posts) // enable simple POST body handling on all endpoints

// --- Any fancy endpoint handling stuff goes right here!


// ---

app.use("/", express.static('./public')) // everything unhandled is just static hosting
// create the HTTP and HTTPS servers
app.server = http.createServer(app);

app.server.listen(port)
console.log("Listening on", port);