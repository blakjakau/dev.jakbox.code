
const observers = new Map(); // Map to store observers: fileHandle.name -> FileSystemObserver instance

export const observeFile = async (fileHandle, callback) => {
    if (!fileHandle || !fileHandle.name) {
        console.warn("Invalid fileHandle provided for observation.");
        return;
    }

    if (observers.has(fileHandle.name)) {
        console.debug(`Already observing file: ${fileHandle.name}`);
        return;
    }

    try {
        // Check if the File System Access API is supported
        if (!('FileSystemObserver' in window)) {
            console.warn("FileSystemObserver API not supported in this browser.");
            // Fallback or graceful degradation if the API is not available
            return;
        }

        const observer = new FileSystemObserver(async (changes) => {
            for (const change of changes) {
                if (change.changedHandle.name === fileHandle.name && change.type === 'modified') {
                    console.log(`File modified: ${fileHandle.name}`);
                    callback(fileHandle);
                }
            }
        });

        await observer.observe(fileHandle);
        observers.set(fileHandle.name, observer);
        console.log(`Started observing file: ${fileHandle.name}`);
    } catch (error) {
        console.error(`Error observing file ${fileHandle.name}:`, error);
    }
};

export const unobserveFile = (fileHandle) => {
    if (!fileHandle || !fileHandle.name) {
        console.warn("Invalid fileHandle provided for unobservation.");
        return;
    }

    const observer = observers.get(fileHandle.name);
    if (observer) {
        observer.unobserve(fileHandle);
        observers.delete(fileHandle.name);
        console.log(`Stopped observing file: ${fileHandle.name}`);
    } else {
        console.debug(`No observer found for file: ${fileHandle.name}`);
    }
};
