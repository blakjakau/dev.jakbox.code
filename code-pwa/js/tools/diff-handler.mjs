class DiffHandler {

    /**
     * Renders a diff string into formatted HTML or Markdown.
     * @param {string} diffString The diff in unified format.
     * @param {"html" | "markdown"} format The desired output format ("html" or "markdown").
     * @returns {string} The formatted rendering of the diff.
     */
    renderStateless(diffString, format = "html") {
        const diffLines = diffString.split(/\r\n|\n|\r/);
        const outputLines = [];

        const escapeHtml = (text) => {
            const div = document.createElement('div');
            div.appendChild(document.createTextNode(text));
            return div.innerHTML;
        };

        for (let i = 0; i < diffLines.length; i++) {
            const line = diffLines[i];
            if (format === "html") {
                if (line.startsWith('--- ') || line.startsWith('+++ ')) {
                    outputLines.push(`<div class="header">${escapeHtml(line)}</div>`);
                } else if (line.startsWith('@@ ')) {
                    outputLines.push(`<div class="header">${escapeHtml(line)}</div>`);
                } else if (line.startsWith('+')) {
                    outputLines.push(`<div class="add">${escapeHtml(line.substr(1))}</div>`);
                } else if (line.startsWith('-')) {
                    outputLines.push(`<div class="remove">${escapeHtml(line).substr(1)}</div>`);
                } else if (line.startsWith(' ')) {
                    outputLines.push(`<div class="neutral">${escapeHtml(line)}</div>`);
                } else if (line.trim() === '') {
                    outputLines.push(`<div class="neutral"></div>`);
                } else {
                    outputLines.push(`<div class="neutral">${escapeHtml(line)}</div>`);
                }
            } else if (format === "markdown") {
                if (line.startsWith('--- ') || line.startsWith('+++ ')) {
                    outputLines.push(`\`\`\`diff\n${line}\n\`\`\``);
                } else if (line.startsWith('@@ ')) {
                    outputLines.push(`\`\`\`\n${line}\n\`\`\``);
                } else if (line.startsWith('+')) {
                    outputLines.push(`+ ${line.substring(1)}`);
                } else if (line.startsWith('-')) {
                    outputLines.push(`- ${line.substring(1)}`);
                } else if (line.startsWith(' ')) {
                    outputLines.push(`${line.substring(1)}`);
                } else if (line.trim() === '') {
                    outputLines.push('');
                } else {
                    outputLines.push(line);
                }
            }
        }

        if (format === "html") {
            return `<pre class="diff-output">${outputLines.join('')}</pre>`;
        } else if (format === "markdown") {
            return outputLines.join('\n');
        } else {
            console.warn(`Unsupported format: ${format}. Returning plain text.`);
            return diffString;
        }
    }

     /**
     * Finds all occurrences of a pattern (an array of strings) within a larger array of strings.
     * @param {string[]} pattern The sequence of lines to search for.
     * @param {string[]} sourceLines The lines to search within.
     * @param {number} searchStartIndex The index in sourceLines to begin searching from.
     * @returns {number[]} An array of starting indices where the pattern was found.
     * @private
     */
    _findPatternIndices(pattern, sourceLines, searchStartIndex) {
        if (pattern.length === 0) return [];
        const foundIndices = [];
        for (let i = searchStartIndex; i <= sourceLines.length - pattern.length; i++) {
            let match = true;
            for (let j = 0; j < pattern.length; j++) {
                if (sourceLines[i + j] !== pattern[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                foundIndices.push(i);
            }
        }
        return foundIndices;
    }

    /**
     * Applies a unified diff patch to an original string using fuzzy content matching, ignoring line numbers.
     * This is more robust against AI inaccuracies in hunk headers.
     *
     * @param {string} originalString The original string to which the diff will be applied.
     * @param {string} diffString The diff in unified format.
     * @returns {string | null} The string after applying the diff, or null if the diff cannot be applied uniquely.
     */
    applyStatelessFuzzy(originalString, diffString) {
        const originalLines = originalString.split(/\r?\n/);
        const diffLines = diffString.split(/\r\n|\n|\r/);
        
        const resultLines = [];
        let originalIdx = 0; // Tracks our current read position in originalLines

        let diffIdx = 0;
        while (diffIdx < diffLines.length) {
            const line = diffLines[diffIdx];

            // Skip header lines
            if (line.startsWith('--- ') || line.startsWith('+++ ')) {
                diffIdx++;
                continue;
            }

            // Process a hunk
            if (line.startsWith('@@ ')) {
                diffIdx++; // Move past the '@@' line
                
                // Collect all lines in the current hunk
                const hunkLines = [];
                while(diffIdx < diffLines.length && !diffLines[diffIdx].startsWith('@@ ')) {
                    hunkLines.push(diffLines[diffIdx]);
                    diffIdx++;
                }

                // Create a search pattern from the hunk's context and deletion lines
                const searchPattern = hunkLines
                    .filter(hLine => hLine.startsWith(' ') || hLine.startsWith('-'))
                    .map(hLine => hLine.substring(1)); // Remove the diff prefix

                // A hunk with only additions cannot be reliably placed by content alone.
                if (searchPattern.length === 0) { // This implies all hunkLines were additions or headers
                    console.error("Error: Cannot apply a diff hunk that only contains additions or non-context/deletion lines, as its location is ambiguous without a context pattern.", { hunkLines });
                    return null;
                }

                // Find where this pattern exists in the original document
                // Start searching from the current `originalIdx` to ensure we don't apply patches out of order
                // for multiple hunks, or re-apply an already processed hunk.
                const foundIndices = this._findPatternIndices(searchPattern, originalLines, originalIdx);

                if (foundIndices.length === 0) {
                    console.error("Error: Cannot apply diff. A hunk's context could not be found in the original file. The file may have changed too much.", { searchPattern, originalIdx, originalLinesDebug: originalLines.slice(originalIdx, originalIdx + searchPattern.length + 5) });
                    return null;
                }
                if (foundIndices.length > 1) {
                    console.error("Error: Cannot apply diff. A hunk's context is ambiguous (found in multiple locations).", { searchPattern, foundIndices });
                    return null;
                }

                const applyAtIndex = foundIndices[0]; // This is the starting line in originalLines for our pattern

                // Add the lines from the original file that come BEFORE this hunk's starting context
                while (originalIdx < applyAtIndex) {
                    if (originalIdx >= originalLines.length) {
                         console.error(`Error: Unexpected end of original file while preparing for hunk at index ${applyAtIndex}.`);
                         return null;
                    }
                    resultLines.push(originalLines[originalIdx]);
                    originalIdx++;
                }
                
                // Now, apply the hunk's changes
                // Iterate through the hunk lines, applying changes based on prefix
                let patternIdx = 0; // Tracks our position within the searchPattern
                for (const hunkLine of hunkLines) {
                    if (hunkLine.startsWith('+')) {
                        // Addition: add the new line content
                        resultLines.push(hunkLine.substring(1));
                    } else if (hunkLine.startsWith(' ')) {
                        // Context: add the original line content
                        if (originalIdx >= originalLines.length || originalLines[originalIdx] !== hunkLine.substring(1)) {
                            // This should ideally not happen if _findPatternIndices was accurate,
                            // but serves as a safeguard.
                            console.error(`Error: Context line mismatch during hunk application at original_idx ${originalIdx}. Expected: '${hunkLine.substring(1)}', Got: '${originalLines[originalIdx]}'`);
                            return null;
                        }
                        resultLines.push(originalLines[originalIdx]); // Add the original line
                        originalIdx++; // Advance originalIdx for the consumed line
                        patternIdx++; // Advance patternIdx for the consumed context
                    } else if (hunkLine.startsWith('-')) {
                        // Deletion: skip the original line content (do not add to resultLines)
                        if (originalIdx >= originalLines.length || originalLines[originalIdx] !== hunkLine.substring(1)) {
                             console.error(`Error: Deletion line mismatch during hunk application at original_idx ${originalIdx}. Expected: '${hunkLine.substring(1)}', Got: '${originalLines[originalIdx]}'`);
                             return null;
                        }
                        originalIdx++; // Advance originalIdx for the consumed line
                        patternIdx++; // Advance patternIdx for the consumed deletion
                    }
                    // Any other prefixes would indicate an invalid hunk format at this point.
                }
                
            } else {
                // If not in a hunk or header, just advance (shouldn't really happen for valid unified diffs, but for robustness)
                diffIdx++;
            }
        }
        
        // Add any remaining lines from the original file after all hunks have been processed
        while (originalIdx < originalLines.length) {
            resultLines.push(originalLines[originalIdx]);
            originalIdx++;
        }

        return resultLines.join('\n');
    }

	/**
	* Applies a unified diff formatted patch to an original string using strict line numbers.
	* @param {string} originalString The original string to which the diff will be applied.
	* @param {string} diffString The diff in unified format.
	* @returns {string | null} The string after applying the diff, or null if the diff cannot be applied due to a mismatch.
	*/
	applyStateless(originalString, diffString) {
	    const originalLines = originalString.split(/\r?\n/);
	    const diffLines = diffString.split(/\r\n|\n|\r/);
	
	    const newLines = [];
	    let originalIdx = 0;
	
	    let i = 0;
	    while (i < diffLines.length) {
	        const line = diffLines[i];
	
	        if (line.startsWith('--- ') || line.startsWith('+++ ')) {
	            i++;
	            continue;
	        }
	
	        if (line.startsWith('@@ ')) {
	            const parts = line.split(' ');
	            const oldRangeStr = parts[1];
	
	            let oldStart;
	            if (oldRangeStr.includes(',')) {
	                oldStart = parseInt(oldRangeStr.substring(1).split(',')[0], 10) - 1; // 0-indexed
	            } else {
	                oldStart = parseInt(oldRangeStr.substring(1), 10) - 1;
	            }
	            
	            while (originalIdx < oldStart) {
	                if (originalIdx >= originalLines.length) {
	                    console.error(`Error: Original content ended unexpectedly before hunk start. Original Index: ${originalIdx}, Hunk Start: ${oldStart}`);
	                    return null;
	                }
	                newLines.push(originalLines[originalIdx]);
	                originalIdx++;
	            }
	
	            i++; 
	
	            while (i < diffLines.length) {
	                const hunkLine = diffLines[i];
	
	                if (hunkLine.startsWith('@@ ')) {
	                    break;
	                }
	
	                if (hunkLine.startsWith(' ')) { 
	                    if (originalIdx >= originalLines.length || originalLines[originalIdx] !== hunkLine.substring(1)) {
	                        console.error(`Error: Context line mismatch at original_idx ${originalIdx}. Expected: '${originalLines[originalIdx]}', Got: '${hunkLine.substring(1)}'`);
	                        return null; 
	                    }
	                    newLines.push(originalLines[originalIdx]);
	                    originalIdx++;
	                } else if (hunkLine.startsWith('-')) { 
	                    if (originalIdx >= originalLines.length || originalLines[originalIdx] !== hunkLine.substring(1)) {
	                        console.error(`Error: Deletion line mismatch at original_idx ${originalIdx}. Expected: '${originalLines[originalIdx]}', Got: '${hunkLine.substring(1)}'`);
	                        return null;
	                    }
	                    originalIdx++;
	                } else if (hunkLine.startsWith('+')) {
	                    newLines.push(hunkLine.substring(1));
	                } 
	                i++;
	            }
	        } else {
	            i++;
	        }
	    }
	
	    while (originalIdx < originalLines.length) {
	        newLines.push(originalLines[originalIdx]);
	        originalIdx++;
	    }
	
	    return newLines.join('\n');
	}
}

export default new DiffHandler();
