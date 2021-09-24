(function() { 
	// author blakjak.au@gmil.com
	// extends the console with colour-coded output for info/debug/error
	// adds stats output
	var log = (function() {
		/*TODO:
		- add logging to file (sans colouring)
		- add "output level" to enable log reduction
		*/
		var uptime = (function() {
			var startAt = new Date().getTime();
			return function() {
				return new Date().getTime() - startAt;
			}
		})()
		var logName = '';
		var levels = ['debug', 'log', 'info'];
		var stats = {
			uptime:0,
			requests:0,
			time:0,
			bytes:0,
			avgtime:0,
			avgbytes:0,
			avgkb:0,
			userAgents:{}
		};
		var pad = function(i) {
			i = ""+i;
			if(i.length < 2) { i = "0"+i; };
			return i;
		}
		var now = function() {
			var n = new Date();
			return pad(n.getHours())+":"+pad(n.getMinutes())+":" +pad(n.getSeconds());
			//return moment().format('HH:mm:ss');
		}

		var originalLog = console.log;

		var consoleDebug = function() {
			if(levels.indexOf('debug')<0) return; 
			var args = Array.prototype.slice.call(arguments);
			args.unshift("\033[94m"+now()+"\033[97m "+logName+"\033[90m");
			args.push("\033[97m");
			originalLog.apply(this, args);
		}

		var consoleInfo = function() {
			if(levels.indexOf('info')<0) return; 
			var args = Array.prototype.slice.call(arguments);
			args.unshift("\033[94m"+now()+"\033[97m "+logName+"\033[37m");
			args.push("\033[97m");
			originalLog.apply(this, args);
		}

		var consoleLog = function() {
			if(levels.indexOf('log')<0) return; 
			var args = Array.prototype.slice.call(arguments);
			args.unshift("\033[94m"+now()+"\033[97m "+logName+"\033[34m");
			args.push("\033[97m");
			originalLog.apply(this, args);
		}

		var consoleError = function() {
			var args = Array.prototype.slice.call(arguments);
			args.unshift("\033[94m"+now()+"\033[97m "+logName+"\033[31m");
			args.push("\033[97m");
			originalLog.apply(this, args);
		}

		var consoleRequest = function(req, res, next) {
			//var args = Array.prototype.slice.call(arguments);
			if(req.url === '/requestStats') {
				var raw = uptime();
				var s = Math.floor(raw / 1000);
				var m = Math.floor(s/60);
				var h = Math.floor(m/60);
				s = s % 60;
				m = m % 60;

				stats.uptime = pad(h)+":"+pad(m)+":"+pad(s);
				res.json(stats);
				res.end();
				return;
			}
			var args = [];
			var start = new Date().getTime();
			req.startTime = start;
			args.unshift("\033[32m"+now()+"\033[90m "+req.method+"\033[90m");
			args.push(req.url);
			args.push("\033[97m");

			// bind to the end of the request so we can log with timing...
			res.on('finish', function() {
				var length = res.getHeader('content-length');
				var end = new Date().getTime();
				stats.requests++;
				stats.time+=(end - start);
				stats.bytes+=parseInt(length);
				stats.avgtime = stats.time / stats.requests;
				stats.avgbytes = stats.bytes / stats.requests;
				stats.avgtime = stats.time / stats.requests;
				stats.avgkb = parseInt(stats.avgbytes/1024);

				if(stats.userAgents[req.ip+" - "+req.headers['user-agent']] !== undefined) {
					stats.userAgents[req.ip+" - "+req.headers['user-agent']]++
				} else {
					stats.userAgents[req.ip+" - "+req.headers['user-agent']] = 1
				}

				var time = args.shift();
				args.unshift("\033[32m"+res.statusCode+"\033[90m "+(end - start)+"ms ", (parseInt(length/1024)||0)+"kb");
				//args.unshift(req.domain, req.subdomain);				
				args.unshift(time);
				originalLog.apply(this, args);
			});
			next();
		}

		console.log = consoleLog;
		console.info = consoleInfo;
		console.error = consoleError;
		console.debug = consoleDebug;

		return {
			set levels(v) {
				if(Array.isArray(v)) {
					levels = v;
				}
			},
			set app(v) {
				app = v;
			},
			set name(v) {
				logName = v
			},
			get name() {
				return logName
			},
			info: consoleInfo,
			log: consoleDebug,
			debug: consoleDebug,
			error: consoleError,
			requestLogger: consoleRequest
		}
	});
	module.exports = log;
})();