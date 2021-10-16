/*
	posts - request parser
	author: jason@jakbox.net
	created: 2016-04-01

	middleware for handling querystrings and form body. for use with express or connect
	
*/

const qs = require('querystring');
const url = require('url');
const maxPostSize = 8e6;

console.log("Post Handler, maxPostSize =", maxPostSize/1024/1024, "MB");
module.exports = function(req, res, next) {
	
	// parse the actual querysting too...
	req.search = JSON.parse(JSON.stringify(url.parse(req.url, true).query));
	
	let aborted = false;
	if(req.method == 'POST') {
		console.log(req.method, "Processing Post", req.search);
		req.post = {};
		req.postMeta = {};
		// since it's a post, lets get the form body BEFORE calling next()
		var data = "";
		req.on('data', function (chunk) {
			data += chunk;
			// flood protection - on excessive post size, just kill the connection
			// post limit here is 19mb
			if(data.length > maxPostSize*2) {
				// just terminate the connection
				req.connection.destroy();
				console.error('Excessive post size, killed connection');
			} else if(data.length > maxPostSize && !aborted) {
				aborted = true;
				res.status(413);
				res.send("Upload limit exceeded");
				console.warn(`413 Payload too big ${data.length/1024/1024} MB, failing gracefully`);
				res.end();
			}
		});

		req.on('end', function () {
			console.log("Reading", req.headers['content-type'], "from post", data.length/1024/1024, "MB");
			if(req.headers['content-type'] == 'application/json') {
				// parse out the JSON content (if the body is JSON)
				try {
					let json = JSON.parse(data);
					// console.log(json);
					req.post.json = json;
					req.post.isJSON = true;
					req.post.raw = data;
					console.log("Stored post as JSON object");
				} catch(e) {
					console.error('Couldn\'t parse JSON post', req.url);
					console.error(req.method);
					console.info(data);
					res.status(500);
					res.json({status:500, error:"couldn't interpret post data"});
					res.end();
					//next();
				}
			} else {
				// otherwise, parse the body as formdata
				req.post = qs.parse(data);
				console.log("Stored post as raw string data");
			}
			next();
		});

	} else {
		req.post = null;
		next();
	}
}