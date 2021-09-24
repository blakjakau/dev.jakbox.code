

// provides a video element component with a matched canvas overlay
// and handling for camera selection

import _ from "https://demo.scantek.io/sdk/dev/utils.mjs"

const Camera = function(config={}) {
	
	const options = {
		facing:"any",
		resolution:"SD",
		allowIR: false,
		audio: false,
	}
	
	// merge config into default options
	for(let k in config) { options[k] = config[k] }
	
	// video is our base object, that all our functions will be attached to
	const base = document.createElement("div")
	const video = document.createElement("video")
	const canvas = document.createElement("canvas")
	const ctx = canvas.getContext("2d")
	
	base.video = video
	base.canvas = canvas
	base.context = ctx
	
	let resizeTrigger = null;
	let running = false

	base.style.cssText = ` position:relative; padding:0px; margin:0px; background:transparent; `
	base.style.height = "100%"
	base.style.width = "100%"
	video.style.cssText = `position:absolute; width:100%; height:100%; background:#0b0; `
	canvas.style.cssText = `position:absolute; width:100%; height:100%; border:1px solid #0af; background:rgba(255,255,255,0.25); `

	// so that the video will start steaming immediatley
	video.muted = true
	video.setAttribute('playsinline', true)
	video.setAttribute('autoplay', true)
	base.ready = false

	base.appendChild(video);
	base.appendChild(canvas);

	const resize = ()=>{
		// keep canvas size in lockstep with video element size (not video resolution)
		// will need to consider if the canvas resolution should be
		// scaled to the display or the video for now will scale to the display
		const w = base.offsetWidth, h = base.offsetHeight
		const vh = video.videoHeight, vw = video.videoWidth
		const aspect = w/h, vaspect = vw/vh
		let cw,ch,ct,cl;
		
		if(aspect<vaspect) {
			cw = w
			ch = w/vaspect
		} else {
			ch = h
			cw = h*vaspect
		}
		ct = (h - ch) / 2
		cl = (w - cw) / 2

		console.log("resize canvas", w, h, aspect, vaspect);

		// canvas.style.top = ((base.offsetHeight - h)/2)+"px"
		canvas.style.width = `${cw}px`
		canvas.style.height = `${ch}px`
		canvas.style.top = `${ct}px`
		canvas.style.left = `${cl}px`
		canvas.width = cw
		canvas.height = ch
	}
	
	// throttled resize triggering
	window.addEventListener("resize", ()=>{
		// if(video.autoResize && running) {
			clearTimeout(resizeTrigger);
			resizeTrigger = setTimeout(resize, 50);
		// }
	})
	
	video.addEventListener('loadeddata', ()=>{
		resize()
		base.ready = true
		video.classList.add('ready');
	})

	base.start = ()=>{
		// default video constraints
		let constraints = {
			audio: false,
			video: {
				width: {  min: 1280, ideal: 1920, max: 2592, },
				height: { min: 720, ideal: 1080, max: 1536 },
				frameRate: { ideal: 60 },
				aspectRatio: { ideal: 1.6 }
			}
		};

		if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
			// mobile phone video constraints
			// for now this is exactly the same, except iOS needs 60fps to work nicely
			constraints = {
				audio: false,
				video: {
					width: {  min: 1280, ideal: 1920, max: 2592, },
					height: { min: 720, ideal: 1080, max: 1536 },
					frameRate: { ideal: 60 }, // removed min framerate because late model iPhone crack it.
					aspectRatio: { ideal: 2},
					facingMode: {exact: 'environment'}
				},
			}
			
			if('undefined' != typeof navigator.deviceMemory && navigator.deviceMemory <= 2) {
				// this willbe an older/slower device, e.g. Nexus 6, Nexus 9
				// likey to struggle with the inference and processing
				// possibly struggle with even showing the camera feed
				constraints.video.frameRate.ideal = 30;
				
				constraints.video.width.ideal = 1280;
				constraints.video.height.ideal = 720;
				
				constraints.video.width.max = 1280;
				constraints.video.height.max = 720;
			}

			if(/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
				// forcing full refresh on iPhone prevents some bluring issues
				// caused by poorly adjusted exposure settings
				constraints.video.frameRate.ideal = 60;
			}
		}

		let video_devices = [];
		const connect = ()=>{
			// actually start the capture device
			navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
				video.srcObject = stream;
				video.addEventListener("play", ()=>{
					running = true;
					if(_.device.form=="computer" && !_.isset(constraints.video.deviceId)) {
						video.style.transform = "scale(-1,1)";
						canvas.style.transform = "scale(-1,1)";
					}
				}, {once:true});

			}).catch(function (error) {
				console.error("Something went wrong!", error);
				console.debug(video_devices);
			});
		}

		const enumDevicesAndConnect=()=>{
			video_devices = [];
			navigator.mediaDevices.enumerateDevices().then(devices=>{
				// iOS hack to select the right camera, as iPads don't seem to report facingMode properly
				// request the best camera to suit our needs (backfacing by default)
				devices.forEach(device=>{
					if(device.kind != "videoinput") { return; }
					if(device.label.toLowerCase().indexOf("IR")!=-1) { return; }
					if(device.label.toLowerCase().indexOf("Infra")!=-1) { return; }
					
					video_devices.push(device);
					// console.debug(device.label, device);

					if(device.kind == "videoinput" &&
						(device.label.toLowerCase().indexOf('back')>-1 ||
							device.label.toLowerCase().indexOf('rear')>-1 ||
							device.label.toLowerCase().indexOf('environment')>-1)) {
						constraints.video.deviceId = device.deviceId;
					}
				})
				connect();
			});
		}
		
		if(_.isiOS) {
			// assess the video options then call connect()
			// we have to call getUserMedia() first, because iOS won't
			// report the devices until the user has already given permission
			navigator.mediaDevices.getUserMedia(constraints).then(stream=>{
				// kill whatever tracks we have here
				stream.getTracks().forEach(track=>{ track.stop(); });
				// now that we (presumably) have permission...
				enumDevicesAndConnect();
			})
		} else {
			enumDevicesAndConnect();
		}
	}

	return base
}

export default Camera