
const observers = new Map();

export const observeFile = async (fileHandle, callback) => {
    if (!fileHandle || typeof fileHandle.createWritable !== 'function') {
        // console.warn("Invalid fileHandle provided for observation:", fileHandle);
        return;
    }

    if (observers.has(fileHandle)) {
        // console.debug("Already observing file:", fileHandle.name);
        return;
    }

    try {
        const observer = new FileSystemObserver(async (changes) => {
            for (const { type, changedHandle } of changes) {
                if (changedHandle.name === fileHandle.name && type === 'modified') {
                    // console.log(`File modified: ${fileHandle.name}`);
                    callback(fileHandle);
                }
            }
        });

        observer.observe(fileHandle);
        observers.set(fileHandle, observer);
        // console.log("Started observing file:", fileHandle.name);
    } catch (error) {
        console.error(`Error observing file ${fileHandle.name}:`, error);
    }
};

export const unobserveFile = (fileHandle) => {
    if (!fileHandle) {
        // console.warn("Invalid fileHandle provided for unobservation.");
        return;
    }

    const observer = observers.get(fileHandle);
    if (observer) {
        observer.disconnect(fileHandle);
        observers.delete(fileHandle);
        // console.log("Stopped observing file:", fileHandle.name);
    }
};
