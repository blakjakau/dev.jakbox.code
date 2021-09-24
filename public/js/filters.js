
if(!GPU) {
	console.error("unable to load filter library, GPU() not found")
}

const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");
const gpu = new GPU();

const filter = {
	createImageData(w,h) {
	    return ctx.createImageData(w,h);
    },
    
	contrast(pixels, adjustment,threshold=180) {
		let out = filter.createImageData(pixels.width, pixels.height);
		let d = out.data;
		let p = pixels.data;
		let r,g,b,c=threshold*2.5;
		let a = adjustment, e=1/adjustment;
		for (let i=0,l=d.length; i<l; i+=4) {
		    r = p[i]; g = p[i+1]; b = p[i+2];
		    if(r+g+b > c) {
		            r*=a; g*=a; b*=a;
		    } else {
		            r*=e; g*=e; b*=e;
		    }
			d[i] = r;
			d[i+1] = g;
			d[i+2] = b;
			d[i+3] = p[i+3];
		}
		return out;
    },

	contrast_b(pixels, adjustment,threshold=180) {
		let out = filter.createImageData(pixels.width, pixels.height);
		// accessing the pixel buffer as a Uint8 array (because this is much faster)
		let p = new Uint8ClampedArray(pixels.data.buffer);
		// let p = pixels.data;
		let d = new Uint8Array(out.data.buffer);
		// let d = out.data;
		let r,g,b,c=threshold*2.5;
		let a = adjustment, e=1/adjustment;
		for (let i=0,l=d.length; i<l; i+=4) {
			
		    r = p[i]; g = p[i+1]; b = p[i+2];
		    
		    if(r+g+b > c) {
		            r*=a; g*=a; b*=a;
		    } else {
		            r*=e; g*=e; b*=e;
		    }
		    // d[i] = (r<<24) | (g<<16) | (b<<8) | a
			d[i] = r;
			d[i+1] = g;
			d[i+2] = b;
			d[i+3] = p[i+3];
		}
		return out;
    },

    
 //   // same functionality but on the GPU
	// contrast_g: ((width=960,height=600)=>{
	// 	const kernel = gpu.createKernel(function(image, a, t) {
	// 		const d = image[this.thread.y,this.thread.x];
	// 		let [r,g,b,alpha] = d;
	// 		let e=1/a
	// 		let c = t*2.5
	// 		if(r+g+b > c) {
	// 			r*=a; g*=a; b*=a;
	// 	    } else {
	// 			r*=e; g*=e; b*=e;
	// 	    }
	// 		this.color(r,g,b,alpha) // intentionally not changing alpha
	// 	}).setGraphical(true)
		
	// 	return function(image, adjustment=1,threshold=180) {
	// 		kernel.setOutput([image.width, image.height])
			
	// 		kernel(image, adjustment, threshold)
			
	// 		const imageData = filter.createImageData(image.width, image.height);
			
	// 		imageData.data.set(kernel.getPixels())
	// 		return imageData
	// 	}
	// })()
	
	
	// same functionality but on the GPU
	contrast_g: (()=>{
		
		const kernel = gpu.createKernel(function(data, a, t) {
			const	x = this.thread.x,
					y = this.thread.y,
					w = this.constants.width,
					h = this.constants.height;
					
			// get the linear memory location for the current pixel
			const n = 4*((x+w)*(h-y))
			
			let r = data[n];
			let g = data[n+1];
			let b = data[n+2];
			// let al = data[n+3];
			
			let e=1/a
			let c = t*2.5
			if(r+g+b > c) {
				r*=a; g*=a; b*=a;
		    } else {
				r*=e; g*=e; b*=e;
		    }
			this.color(r,g,b,1) // intentionally not changing alpha
		})
		.setGraphical(true)
		.setDynamicOutput(true)
		
		kernel.setOutput([1,1]);
		kernel.setConstants({width:1,height:1})
		kernel([1,1,1,1],1,1); // pre-run the kernel
		
		return function(imageData, adjustment=1,threshold=180) {
			kernel.setOutput([imageData.width,imageData.height])
			kernel.setConstants({width:imageData.width,height:imageData.height})
			kernel(imageData.data, adjustment, threshold)
			
			const imageOut = filter.createImageData(imageData.width, imageData.height);
			imageOut.data.set(kernel.getPixels())
			return imageOut
		}
	})()
	
}

export default filter