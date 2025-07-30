export class LoaderBar extends HTMLElement {
	constructor() {
		super()
		
		this.attachShadow({ mode: "open" })

		// Dynamically create and append the style tag
		const style = document.createElement("style")
		style.textContent = `
            /* Define a CSS variable for the theme color */
            :root {
                --theme-color: var(--theme); /* Reference the --theme from the host's root */
            }
            #loader-svg {
                width: 100%; /* Fill the width of the host */
                height: 100%; /* Fill the height of the host, as it's the only child */
            }
            /* Button styles removed as the button is removed */
        `
		this.shadowRoot.appendChild(style)

		// Dynamically create and append the SVG element
		this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
		this.svg.id = "loader-svg"
		this.shadowRoot.appendChild(this.svg)

		// Button creation removed
		// this.pauseResumeButton = document.createElement('button');
		// this.pauseResumeButton.id = 'pause-resume-button';
		// this.pauseResumeButton.textContent = 'Pause';
		// this.shadowRoot.appendChild(this.pauseResumeButton);

		this.paths = []
		this.svgNS = "http://www.w3.org/2000/svg"
		// Get theme color from the :root of the shadow DOM itself (or host if defined there)
		this.themeColor = getComputedStyle(this.shadowRoot.host).getPropertyValue("--theme").trim() // Use --theme from host
		this.lineProperties = []

		this.startTime = null
		this.animationFrameId = null
		this.isPaused = false
		this.lastPauseTime = 0

		this.config = {
			numLines: 3,
			amplitudeBaseRange: { min: 6, max: 12 },
			amplitudeVariationRange: { min: 4, max: 10 },
			amplitudeSpeedRange: { min: 0.0004, max: 0.0009 },
			frequencyBaseRange: { min: 0.015, max: 0.025 },
			frequencyVariationRange: { min: 0.006, max: 0.01 },
			frequencySpeedRange: { min: 0.0003, max: 0.0007 },
			speedRange: { min: 0.0018, max: 0.0028 },
			phaseShift: 0.75,
			strokeWidthRange: { min: 1.5, max: 2.5 },
			opacityRange: { min: 0.3, max: 1.0 },
			pathStep: 5, // The resolution of the animated line. Higher is less detailed but more performant.
		}

		// Bind methods to 'this'
		this.toggleAnimation = this.toggleAnimation.bind(this)
		this.animate = this.animate.bind(this)
		this.getRandomArbitrary = this.getRandomArbitrary.bind(this)
	}

	connectedCallback() {
		this.initializeLines()
		// Button event listener removed
		// this.pauseResumeButton.addEventListener('click', this.toggleAnimation);
		this.startAnimation()
	}

	disconnectedCallback() {
		this.stopAnimation()
		// Button event listener removal removed
		// this.pauseResumeButton.removeEventListener('click', this.toggleAnimation);
	}

	getRandomArbitrary(min, max) {
		return Math.random() * (max - min) + min
	}

	initializeLines() {
		for (let i = 0; i < this.config.numLines; i++) {
			const path = document.createElementNS(this.svgNS, "path")
			path.setAttribute("stroke", "#0af")

			const randomStrokeWidth = this.getRandomArbitrary(
				this.config.strokeWidthRange.min,
				this.config.strokeWidthRange.max
			)
			path.setAttribute("stroke-width", randomStrokeWidth)
			path.setAttribute("fill", "none")
			path.setAttribute("stroke-linecap", "round")

			const opacity = this.getRandomArbitrary(this.config.opacityRange.min, this.config.opacityRange.max)
			path.setAttribute("stroke-opacity", opacity)

			this.lineProperties.push({
				amplitudeBase: this.getRandomArbitrary(
					this.config.amplitudeBaseRange.min,
					this.config.amplitudeBaseRange.max
				),
				amplitudeVariation: this.getRandomArbitrary(
					this.config.amplitudeVariationRange.min,
					this.config.amplitudeVariationRange.max
				),
				amplitudeSpeed: this.getRandomArbitrary(
					this.config.amplitudeSpeedRange.min,
					this.config.amplitudeSpeedRange.max
				),

				frequencyBase: this.getRandomArbitrary(
					this.config.frequencyBaseRange.min,
					this.config.frequencyBaseRange.max
				),
				frequencyVariation: this.getRandomArbitrary(
					this.config.frequencyVariationRange.min,
					this.config.frequencyVariationRange.max
				),
				frequencySpeed: this.getRandomArbitrary(
					this.config.frequencySpeedRange.min,
					this.config.frequencySpeedRange.max
				),

				speed: this.getRandomArbitrary(this.config.speedRange.min, this.config.speedRange.max),
				initialPhase: this.getRandomArbitrary(0, Math.PI * 2),
			})
			this.svg.appendChild(path)
			this.paths.push(path)
		}
	}

	toggleAnimation() {
		this.isPaused = !this.isPaused
		if (this.isPaused) {
			this.stopAnimation()
			this.lastPauseTime = performance.now() - this.startTime
			// Button text update removed
			// this.pauseResumeButton.textContent = 'Resume';
		} else {
			this.startAnimation()
			// Button text update removed
			// this.pauseResumeButton.textContent = 'Pause';
		}
		// You can add a custom event here if you want to notify the outside world of the state change
		// this.dispatchEvent(new CustomEvent('animation-toggled', { detail: { isPaused: this.isPaused } }));
	}

	startAnimation() {
		this.startTime = performance.now()
		this.animationFrameId = requestAnimationFrame(this.animate)
	}

	stopAnimation() {
		if (this.animationFrameId) {
			cancelAnimationFrame(this.animationFrameId)
			this.animationFrameId = null
		}
	}

	animate(timestamp) {
		if (this.isPaused) {
			return
		}

		const elapsed = timestamp - this.startTime + this.lastPauseTime
		const svgWidth = this.svg.clientWidth
		const svgHeight = this.svg.clientHeight
		const centerY = svgHeight / 2

		this.paths.forEach((path, i) => {
			const lineProps = this.lineProperties[i]
			const breathCycle = Math.sin(elapsed * lineProps.amplitudeSpeed)
			const dynamicAmplitude = lineProps.amplitudeBase + breathCycle * lineProps.amplitudeVariation
			const frequencyCycle = Math.sin(elapsed * lineProps.frequencySpeed)
			const dynamicFrequency = lineProps.frequencyBase + frequencyCycle * lineProps.frequencyVariation
			const phase = elapsed * lineProps.speed + lineProps.initialPhase

			let pathData = `M -1 ${centerY}`
			// Iterate with a larger step to reduce the number of points in the path, improving performance.
			for (let x = -1; x <= svgWidth + 1; x += this.config.pathStep) {
				const y = centerY + dynamicAmplitude * Math.sin(x * dynamicFrequency + phase)
				pathData += ` L ${x} ${y}`
			}
			path.setAttribute("d", pathData)
		})
		this.animationFrameId = requestAnimationFrame(this.animate)
	}
}

customElements.define("ui-loader-bar", LoaderBar)
