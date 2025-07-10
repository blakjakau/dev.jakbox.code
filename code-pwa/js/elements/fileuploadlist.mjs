import { ContentFill } from './element.mjs';
import { isFunction } from './utils.mjs';

export class FileUploadList extends ContentFill {
	constructor(content) {
		super(content)

		const inner = (this._inner = document.createElement("div"))
		inner.classList.add("inner")

		this._autoUpload = false
		this._uploadURL = null
		this._uploadFilter = (f) => {
			return true
		}

		const progress = document.createElement("div")
		progress.classList.add("progress")
		progress.innerHTML = "progress"
		inner.appendChild(progress)

		this._dragItemStart = function (e) {
			let file = this.getAttribute("download")
			e.dataTransfer.dropEffect = "copy"
			e.dataTransfer.effectAllowed = "all"
			e.dataTransfer.setData("DownloadURL", file)
			console.debug(file)
		}

		const uploadFile = (file) => {
			let url = this._uploadURL
			let formData = new FormData()

			formData.append("upload", file)
			formData.append("path", this._list.path)

			return new Promise((accept, reject) => {
				if (!this._uploadFilter(file)) {
					return reject("wrong file type")
				}
				fetch(url, {
					method: "POST",
					body: formData,
				})
					.then(async (response) => {
						if (response.status == 200) {
							accept(await response.text())
						} else {
							reject(await response.text())
						}
					})
					.catch((e) => {
						reject(e)
					})
			})
		}

		const dragenter = (e) => {
			e.stopPropagation()
			e.preventDefault()
		}
		const dragover = (e) => {
			e.stopPropagation()
			e.preventDefault()
			inner.classList.add("hover")
		}
		const dragleave = (e) => {
			e.stopPropagation()
			e.preventDefault()
			inner.classList.remove("hover")
		}
		const drop = (e) => {
			inner.classList.remove("hover")
			e.stopPropagation()
			e.preventDefault()
			const dt = e.dataTransfer
			const files = dt.files
			// handleFiles(files);

			if (this._autoUpload && this._uploadURL && files && files.length > 0) {
				// handle uploading to a server...
				// use 1 connection per file upload
				let count = files.length
				let complete = 0

				const updateProgress = (res) => {
					progress.style.width = `${(complete / (count - 1)) * 100}%`
					complete++
					console.debug(res)
					if (complete == count) {
						setTimeout(() => {
							progress.style.opacity = "0"
							setTimeout(() => {
								progress.style.width = "0px"
								progress.style.height = "0px"
							}, 333)
						}, 250)
						if ("function" == typeof this._onuploaded) {
							this._onuploaded(files)
						}
					}
				}

				progress.style.opacity = "1"
				progress.style.width = "8px"
				progress.style.height = "8px"
				;[...files].forEach((file) => {
					uploadFile(file).then(updateProgress).catch(console.warn)
				})
			} else {
				if (files && files.length > 0) {
					if ("function" == typeof this._onupload) {
						this._onupload(files)
					} else {
						console.debug("Upload request ", files)
					}
				}
			}
		}

		inner.addEventListener("dragleave", dragleave, false)
		inner.addEventListener("dragenter", dragenter, false)
		inner.addEventListener("dragover", dragover, false)
		inner.addEventListener("drop", drop, false)

		this._tiles = []
		this._renderList = () => {
			let list = this._list
			list.files.forEach((item) => {
				let base = document.createElement("a")
				let filename = item.split("/").pop()
				let ext = filename.split(".").pop().toLowerCase()
				let type = "text/plain"
				switch (ext) {
					case "jpg":
					case "jpeg":
						type = "image/jpg"
						break
					case "png":
						type = "image/png"
						break
					case "model":
					case "zip":
						type = "application/zip"
						break
					default:
						type = "text/plain"
						break
				}
				let downloadURL = `${type}:${filename}:${window.location.origin}${list.path}${item}`

				base.src = `${window.location.origin}${list.path}${item}`
				base.setAttribute("href", `${window.location.origin}${list.path}${item}`)
				base.innerHTML = `<label>${filename}</label>`
				base.setAttribute("title", filename)
				base.setAttribute("draggable", true)
				base.setAttribute("download", downloadURL)

				if (list.thumbpath) {
					base.style.backgroundImage = `url(${list.thumbpath}${item})`
				} else {
					base.style.backgroundImage = `url(${list.path}${item})`
				}
				base.ondragstart = this._dragItemStart
				inner.append(base)
			})
		}

		return this
	}

	connectedCallback() {
		this.append(this._inner)
	}

	on(e, f, o) {
		if (e == "upload" && "function" == typeof f) {
			this._onupload = f
		} else {
			super.on.apply(this, [e, f, o])
		}
	}

	set uploadURL(v) {
		this._uploadURL = v
	}
	set autoUpload(v) {
		this._autoUpload = v ? true : false
	}
	set uploadFilter(f) {
		if ("function" == typeof f) {
			this._uploadFilter = f
		}
	}
	set onuploaded(f) {
		if ("function" == typeof f) {
			this._onuploaded = f
		}
	}
	set onupload(f) {
		if ("function" == typeof f) {
			this._onupload = f
		}
	}

	get list() {
		return this._list
	}
	set list(v) {
		if (v && v.path && v.files && Array.isArray(v.files)) {
			this._list = v
			// generate child elements base on v.files
			this._renderList()
		}
	}

	set ondrop(f) {
		if (!isFunction(f)) throw new Error("ondrop must be a function")
		this._ondrop = f
	}
}

customElements.define("ui-file-upload-list", FileUploadList);