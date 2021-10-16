
// using ECMA script imports, instead of CommonJS require
import fs from 'fs'
import http from 'http'
import https from 'http'
import express from 'express'
import posts from './includes/posts.js'
import logger from "./includes/logger.js"

const app = express()
const port = process.env.PORT || 8081
const server = http.createServer()
const enableCORS = false;
const publicHTTP = `${process.env.PWD.replace("/http", "/code-pwa")}`

console.log(publicHTTP);

app.use((req, res, next)=>{
	if(!enableCORS) return next();
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Authentication");
	return (req.method=="OPTIONS")?res.end():next()
})

// --- Any fancy endpoint handling stuff goes right here!


// ---

app.use(logger().requestLogger)
app.use("/", express.static(publicHTTP)) // everything unhandled is just static hosting
// create the HTTP and HTTPS servers

app.use("/", (req, res, next)=>{
	console.error(404, req.url, "not found")
})

app.server = http.createServer(app);

app.server.listen(port)
console.log("Listening on", port);