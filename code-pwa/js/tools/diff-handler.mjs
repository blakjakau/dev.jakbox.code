class DiffHandler {


    /**
     * Renders a diff string into formatted HTML or Markdown.
     * @param {string} diffString The diff in unified format.
     * @param {"html" | "markdown"} format The desired output format ("html" or "markdown").
     * @param (false) wheather the rendering should include linenumbers (function redirect)
     * @returns {string} The formatted rendering of the diff.
     */
    renderStateless(diffString, format = "html", highlightLanguage = null, hljsInstance = null) {

        const escapeHtml = (text) => {
            const div = document.createElement('div');
            div.appendChild(document.createTextNode(text));
            return div.innerHTML;
        };

        if (format !== "html") {
            // Fallback for non-html formats, as this logic is HTML-specific.
            console.warn(`Block comment highlighting is only supported for HTML format.`);
            return `<pre class="diff-output">${escapeHtml(diffString)}</pre>`;
        }

        const diffLines = diffString.split(/\r\n|\n|\r/);
        const outputLines = [];
        
        const commentDelimiters = {
            javascript: { start: '/*', end: '*/' },
            java: { start: '/*', end: '*/' },
            typescript: { start: '/*', end: '*/' },
            c: { start: '/*', end: '*/' },
            cpp: { start: '/*', end: '*/' },
            csharp: { start: '/*', end: '*/' },
            css: { start: '/*', end: '*/' },
            xml: { start: '<!--', end: '-->' },
            html: { start: '<!--', end: '-->' },
        };

        const delimiters = highlightLanguage ? commentDelimiters[highlightLanguage] : null;
        let inBlockComment = false;

        for (let i = 0; i < diffLines.length; i++) {
            const line = diffLines[i];
            let highlightedContentHtml = '';

            if (line.startsWith('--- ') || line.startsWith('+++ ') || line.startsWith('@@ ')) {
                outputLines.push(`<div class="header">${escapeHtml(line)}</div>`);
                continue;
            }

            const linePrefix = line.charAt(0);
            const lineText = ['+', '-', ' '].includes(linePrefix) ? line.substring(1) : line;
            const lineClass = linePrefix === '+' ? 'add' : (linePrefix === '-' ? 'remove' : 'neutral');

            if (delimiters && hljsInstance && hljsInstance.getLanguage(highlightLanguage)) {
                if (inBlockComment) {
                    const endPos = lineText.indexOf(delimiters.end);
                    if (endPos === -1) {
                        highlightedContentHtml = `<span class="hljs-comment">${escapeHtml(lineText)}</span>`;
                    } else {
                        const commentPart = lineText.substring(0, endPos + delimiters.end.length);
                        const restOfLine = lineText.substring(endPos + delimiters.end.length);
                        highlightedContentHtml = `<span class="hljs-comment">${escapeHtml(commentPart)}</span>`;
                        if (restOfLine) {
                            highlightedContentHtml += hljsInstance.highlight(restOfLine, { language: highlightLanguage, ignoreIllegals: true }).value;
                        }
                        inBlockComment = false;
                    }
                } else {
                    const startPos = lineText.indexOf(delimiters.start);
                    const endPos = lineText.indexOf(delimiters.end, startPos);
                    if (startPos !== -1 && endPos === -1) {
                        const beforePart = lineText.substring(0, startPos);
                        const commentPart = lineText.substring(startPos);
                        highlightedContentHtml = beforePart ? hljsInstance.highlight(beforePart, { language: highlightLanguage, ignoreIllegals: true }).value : '';
                        highlightedContentHtml += `<span class="hljs-comment">${escapeHtml(commentPart)}</span>`;
                        inBlockComment = true;
                    } else {
                        // No multi-line comment detected, or it's self-contained. Highlight normally.
                        highlightedContentHtml = hljsInstance.highlight(lineText, { language: highlightLanguage, ignoreIllegals: true }).value;
                    }
                }
            } else {
                highlightedContentHtml = escapeHtml(lineText);
            }
            outputLines.push(`<div class="${lineClass}">${highlightedContentHtml}</div>`);
        }

        return `<pre class="diff-output">${outputLines.join('')}</pre>`;
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
	 * Aligns an AI generated diff with the source code by finding and correcting line numbers
	 * updates the hunk heaaders in the output string based on found matches in the source
	 *
	 * @param {string} originalString The original string to which the diff will be applied.
	 * @param {string} diffString The diff in unified format.
	 * @returns {string | null} The corercted diffString (corrected hunk headers), or null if the diff cannot be correctly updated
	**/    
	fuzzyToUnified(originalString, diffString) {
	    const originalLines = originalString.split(/\r?\n/);
	    const diffLines = diffString.split(/\r\n|\n|\r/);
	    const correctedDiffOutput = [];
	    let originalFilePtr = 0; // Tracks current line index in originalLines
	    let newFilePtr = 0;     // Tracks current line index in the _conceptual_ new file
	    let diffIdx = 0;
	    let currentHunkContentLines = []; // Store lines belonging to the current hunk (with +, -, ' ' prefixes)
	    let inHunk = false; // Flag to indicate if we are currently collecting hunk content
	    // Helper to process collected hunk content, determine true position, and write a new hunk block
	    const processAndWriteHunk = () => {
	        if (currentHunkContentLines.length === 0) return true; // Nothing to process, or previous block was headers
	        // Create a search pattern from the hunk's context and deletion lines
	        const searchPattern = currentHunkContentLines
	            .filter(hLine => hLine.startsWith(' ') || hLine.startsWith('-'))
	            .map(hLine => hLine.substring(1)); // Remove the diff prefix
	        // If a hunk consists only of additions, its position is ambiguous for fuzzy matching.
	        if (searchPattern.length === 0) {
	            console.error("Error: Cannot re-align a diff hunk that only contains additions, as its precise location is ambiguous without context or deletions.");
	            return null; // Indicate failure to correct
	        }
	        // Find the actual starting line of this pattern in the original file
	        // Search from current `originalFilePtr` to ensure sequential hunks are applied correctly
	        const foundIndices = this._findPatternIndices(searchPattern, originalLines, originalFilePtr);
	        if (foundIndices.length === 0) {
	            console.error("Error: Cannot re-align diff. A hunk's context could not be found in the original file at or after current position.");
	            return null;
	        }
	        if (foundIndices.length > 1) {
	            console.error("Error: Cannot re-align diff. A hunk's context is ambiguous (found in multiple locations).");
	            return null;
	        }
	        const actualOldStartIdx = foundIndices[0]; // 0-indexed start of the pattern in originalLines
	        // Add any original lines *before* this hunk that haven't been added yet as neutral lines
	        while (originalFilePtr < actualOldStartIdx) {
	            if (originalFilePtr >= originalLines.length) {
	                console.error(`Error: Unexpected end of original file while preparing for hunk at index ${actualOldStartIdx}.`);
	                return null;
	            }
	            correctedDiffOutput.push(' ' + originalLines[originalFilePtr]);
	            originalFilePtr++;
	            newFilePtr++;
	        }
	        // Now, `originalFilePtr` points to the start of the actual hunk content in the original file.
	        // Calculate the old and new lengths for the new hunk header.
	        let actualOldLen = 0; // Number of lines consumed from original (context + deletions)
	        let actualNewLen = 0; // Number of lines contributed to new (context + additions)
	        for (const hunkLine of currentHunkContentLines) {
	            if (hunkLine.startsWith(' ') || hunkLine.startsWith('-')) {
	                actualOldLen++;
	            }
	            if (hunkLine.startsWith(' ') || hunkLine.startsWith('+')) {
	                actualNewLen++;
	            }
	        }
	        // Construct the new @@ header (1-indexed for display)
	        correctedDiffOutput.push(`@@ -${actualOldStartIdx + 1},${actualOldLen} +${newFilePtr + 1},${actualNewLen} @@`);
	        // Add the hunk's content lines to the output and update pointers
	        for (const hunkLine of currentHunkContentLines) {
	            correctedDiffOutput.push(hunkLine); // Keep prefix (+, -, ' ')
	            if (hunkLine.startsWith(' ')) {
	                originalFilePtr++;
	                newFilePtr++;
	            } else if (hunkLine.startsWith('-')) {
	                originalFilePtr++;
	            } else if (hunkLine.startsWith('+')) {
	                newFilePtr++;
	            }
	        }
	        currentHunkContentLines = []; // Reset for next hunk
	        inHunk = false; // Exited the hunk content collection phase
	        return true; // Hunk processed successfully
	    };
	    while (diffIdx < diffLines.length) {
	        const line = diffLines[diffIdx];
	        if (line.startsWith('--- ') || line.startsWith('+++ ')) {
	            // If we were in a hunk, process it before adding new header
	            if (inHunk) {
	                const result = processAndWriteHunk();
	                if (result === null) return null;
	            }
	            correctedDiffOutput.push(line);
	        } else if (line.startsWith('@@ ')) {
	            // If a new hunk header, process the previous hunk's collected content (if any)
	            if (inHunk) { // This handles cases where hunks are consecutive without headers in between
	                const result = processAndWriteHunk();
	                if (result === null) return null;
	            }
	            inHunk = true; // Start collecting content for a new hunk
	            // The '@@' line itself is not added yet; it will be re-generated by processAndWriteHunk.
	        } else if (inHunk) {
	            // Collect content lines for the current hunk
	            currentHunkContentLines.push(line);
	        } else {
	            // Lines that are not headers and not part of a hunk (e.g., blank lines before first hunk)
	            // These are typically ignored in unified diff processing, or implicitly handled by pre-hunk content
	            // adding in `processAndWriteHunk`.
	        }
	        diffIdx++;
	    }
	    // Process the last hunk if one was being collected
	    if (inHunk) {
	        const result = processAndWriteHunk();
	        if (result === null) return null;
	    }
	    // Add any remaining original lines that were not part of any hunk (as neutral lines)
	    while (originalFilePtr < originalLines.length) {
	        correctedDiffOutput.push(' ' + originalLines[originalFilePtr]);
	        originalFilePtr++;
	        newFilePtr++;
	    }
		return correctedDiffOutput.join('\n');
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
