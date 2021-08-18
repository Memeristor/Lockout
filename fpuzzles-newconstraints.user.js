// ==UserScript==
// @name         Fpuzzles-NewConstraints
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Adds more constraints to f-puzzles.
// @author       Rangsk
// @match        https://*.f-puzzles.com/*
// @match        https://f-puzzles.com/*
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // Adding a new constraint:
    // 1. Add a new entry to the newConstraintInfo array
    // 2. If the type is not already supported, add it to the following:
    //      a. exportPuzzle
    //      b. importPuzzle
    //      c. categorizeTools
    //      d. Add a drawing helper function for what it looks like
    // 3. Add conflict highlighting logic to candidatePossibleInCell
    // 4. Add a new constraint class (see 'Constraint classes' comment)
    const newConstraintInfo = [{
            name: 'Renban',
            type: 'line',
            color: '#C060C0',
            colorDark: '#603060',
            lineWidth: 0.4,
            tooltip: [
                'Numbers on a renban line must be consecutive, but in any order.',
                'Digits cannot repeat on a renban line.',
                '',
                'Click and drag to draw a renban line.',
                'Click on a renban line to remove it.',
                'Shift click and drag to draw overlapping renban lines.',
            ]
        },
        {
            name: 'Whispers',
            type: 'line',
            color: '#60C060',
            colorDark: '#306030',
            lineWidth: 0.3,
            tooltip: [
                'Adjacent numbers on a whispers line must have a difference of 5 or greater.',
                '[For non-9x9 grid sizes, this adjust to be (size / 2) rounded up.]',
                '',
                'Click and drag to draw a whispers line.',
                'Click on a whispers line to remove it.',
                'Shift click and drag to draw overlapping whispers lines.',
            ]
        },
        {
            name: 'Lockout',
            type: 'lineWithEnds',
            color: '#006CBA',
            colorDark: '#0094FF',
            lineWidth: 0.2,
            width: 0.55,
            height: 0.55,
            angle: 45,
            tooltip: [
                'Numbers along a lockout line must not be between or equal to the numbers in the diamond ends.',
                'These endpoints must differ by 4 or greater.',
                '[For sizes other than 9, these differ by (size / 2) rounded down.]',
                'When endpoints are shared, each lockout segment is treated as an independent lockout line.',
                '',
                'Click and drag to draw a lockout line.',
                'Click on a lockout line to remove it.',
            ]
        },
    ]

    const doShim = function() {
        // Additional import/export data
        const origExportPuzzle = exportPuzzle;
        exportPuzzle = function(includeCandidates) {
            const compressed = origExportPuzzle(includeCandidates);
            const puzzle = JSON.parse(compressor.decompressFromBase64(compressed));

            // Add cosmetic version of constraints for those not using the solver plugin
            for (let constraintInfo of newConstraintInfo) {
                const id = cID(constraintInfo.name);
                const puzzleEntry = puzzle[id];
                if (puzzleEntry && puzzleEntry.length > 0) {
                    if (constraintInfo.type === 'line') {
                        if (!puzzle.line) {
                            puzzle.line = [];
                        }
                        for (let instance of puzzleEntry) {
                            puzzle.line.push({
                                lines: instance.lines,
                                outlineC: constraintInfo.color,
                                width: constraintInfo.lineWidth,
                                isNewConstraint: true
                            });
                        }
                    }
                    if (constraintInfo.type === 'lineWithEnds') {
                        if (!puzzle.line) {
                            puzzle.line = [];
                        }
                        if (!puzzle.rectangle){
                            puzzle.rectangle = [];
                        }
                        for (let instance of puzzleEntry) {
                            puzzle.line.push({
                                lines: instance.lines,
                                outlineC: constraintInfo.color,
                                width: constraintInfo.lineWidth,
                                isNewConstraint: true
                            });
                            puzzle.rectangle.push({
                                cells: [instance.cells[0]],
                                baseC: '#FFFFFF',
                                outlineC: constraintInfo.color,
                                fontC: '#000000',
                                width: constraintInfo.width,
                                height: constraintInfo.height,
                                angle: constraintInfo.angle,
                                isNewConstraint: true
                            });
                            puzzle.rectangle.push({
                                cells: [instance.cells[instance.cells.length-1]],
                                baseC: '#FFFFFF',
                                outlineC: constraintInfo.color,
                                fontC: '#000000',
                                width: constraintInfo.width,
                                height: constraintInfo.height,
                                angle: constraintInfo.angle,
                                isNewConstraint: true
                            });
                        }
                    }
                }
            }
            return compressor.compressToBase64(JSON.stringify(puzzle));
        }

        const origImportPuzzle = importPuzzle;
        importPuzzle = function(string, clearHistory) {
            // Remove any generated cosmetics
            const puzzle = JSON.parse(compressor.decompressFromBase64(string));
            if (puzzle.line) {
                puzzle.line = puzzle.line.filter(line => !line.isNewConstraint);
                if (puzzle.line.length === 0) {
                    delete puzzle.line;
                }
            }
            if (puzzle.rectangle) {
                puzzle.rectangle = puzzle.rectangle.filter(rectangle => !rectangle.isNewConstraint);
                if (puzzle.rectangle.length === 0) {
                    delete puzzle.rectangle;
                }
            }

            string = compressor.compressToBase64(JSON.stringify(puzzle));
            origImportPuzzle(string, clearHistory);
        }

        // Draw the new constraints
        const origDrawConstraints = drawConstraints;
        drawConstraints = function(layer) {
            if (layer === 'Bottom') {
                for (let info of newConstraintInfo) {
                    const id = cID(info.name);
                    const constraint = constraints[id];
                    if (constraint) {
                        for (let a = 0; a < constraint.length; a++) {
                            constraint[a].show();
                        }
                    }
                }
            }
            origDrawConstraints(layer);
        }

        // Conflict highlighting for new constraints
        const origCandidatePossibleInCell = candidatePossibleInCell;
        candidatePossibleInCell = function(n, cell, options) {
            if (!options) {
                options = {};
            }
            if (!options.bruteForce && cell.value) {
                return cell.value === n;
            }

            if (!origCandidatePossibleInCell(n, cell, options)) {
                return false;
            }

            // Renban
            const constraintsRenban = constraints[cID('Renban')];
            if (constraintsRenban && constraintsRenban.length > 0) {
                for (let renban of constraintsRenban) {
                    for (let line of renban.lines) {
                        const index = line.indexOf(cell);
                        if (index > -1) {
                            let numMatchingValue = 0;
                            let minValue = -1;
                            let maxValue = -1;
                            for (let lineCell of line) {
                                if (lineCell.value) {
                                    minValue = minValue === -1 || minValue > lineCell.value ? lineCell.value : minValue;
                                    maxValue = maxValue === -1 || maxValue < lineCell.value ? lineCell.value : maxValue;
                                    if (lineCell.value === n) {
                                        numMatchingValue++;
                                        if (numMatchingValue > 1) {
                                            return false;
                                        }
                                    }
                                }
                            }
                            if (minValue !== -1 && maxValue !== -1) {
                                if (n - minValue > line.length - 1 || maxValue - n > line.length - 1) {
                                    return false;
                                }
                            }
                        }
                    }
                }
            }

            // Whispers
            const constraintsWhispers = constraints[cID('Whispers')];
            if (constraintsWhispers && constraintsWhispers.length > 0) {
                const whispersDiff = Math.ceil(size / 2);
                for (let whispers of constraintsWhispers) {
                    for (let line of whispers.lines) {
                        const index = line.indexOf(cell);
                        if (index > -1) {
                            if (n - whispersDiff <= 0 && n + whispersDiff > size) {
                                return false;
                            }

                            if (index > 0) {
                                const prevCell = line[index - 1];
                                if (prevCell.value && Math.abs(prevCell.value - n) < whispersDiff) {
                                    return false;
                                }
                            }
                            if (index < line.length - 1) {
                                const nextCell = line[index + 1];
                                if (nextCell.value && Math.abs(nextCell.value - n) < whispersDiff) {
                                    return false;
                                }
                            }
                        }
                    }
                }
            }

            // Lockout
            const constraintsLockout = constraints[cID('Lockout')];
            if (constraintsLockout && constraintsLockout.length > 0) {
                const lockoutDiff = Math.floor(size / 2);
                for (let lockout of constraintsLockout) {
                    for (let line of lockout.lines) {
                        const index = line.indexOf(cell);
                        if (index > -1) {
                            const outerCell0 = line[0]
                            const outerCell1 = line[line.length - 1]
                            if (outerCell0.value && outerCell1.value){
                                if (index > 0 && index < line.length - 1) {
                                    if ((n <= outerCell0.value && n >= outerCell1.value) || (n <= outerCell1.value && n >= outerCell0.value)) {
                                        return false;
                                    }
                                    if ((lockoutDiff == 4 && n == 5) || (lockoutDiff == 3 && (n == 3 || n == 4)) || (lockoutDiff == 2 && (n == 2 || n == 3))){
                                        return false;
                                    }
                                } else if (Math.abs(outerCell0.value - outerCell1.value) < lockoutDiff) {
                                    return false;
                                }
                            } else if ( (outerCell0.value && n == outerCell0.value) || (outerCell1.value && n == outerCell1.value)) {
                                return false;
                            }
                        }
                    }
                }
            }

            return true;
        }

        // Drawing helpers
        const drawLine = function(line, color, colorDark, lineWidth) {
            ctx.lineWidth = cellSL * lineWidth * 0.5;
            ctx.fillStyle = boolSettings['Dark Mode'] ? colorDark : color;
            ctx.strokeStyle = boolSettings['Dark Mode'] ? colorDark : color;
            ctx.beginPath();
            ctx.arc(line[0].x + cellSL / 2, line[0].y + cellSL / 2, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(line[0].x + cellSL / 2, line[0].y + cellSL / 2);
            for (var b = 1; b < line.length; b++) {
                ctx.lineTo(line[b].x + cellSL / 2, line[b].y + cellSL / 2);
            }
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(line[line.length - 1].x + cellSL / 2, line[line.length - 1].y + cellSL / 2, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
        }

        const drawDiamond = function(end, color, colorDark, width, angle){
            ctx.beginPath();
            ctx.translate(end.x + cellSL / 2, end.y + cellSL * (0.5 - Math.sqrt(2)* width/2));
            ctx.rotate(angle * Math.PI / 180);
            ctx.translate(-end.x- cellSL / 2, -end.y - cellSL * (0.5 - Math.sqrt(2)* width/2));
            ctx.lineWidth = cellSL * 0.1 * 0.5;
            ctx.strokeStyle = boolSettings['Dark Mode'] ? colorDark : color;
            ctx.fillStyle = boolSettings['Dark Mode'] ? '#000000' : '#FFFFFF';
            ctx.fillRect(end.x+ cellSL / 2 , end.y + cellSL * (0.5 - Math.sqrt(2)* width/2) , width * cellSL, width * cellSL);
            ctx.strokeRect(end.x+ cellSL / 2 , end.y + cellSL * (0.5 - Math.sqrt(2)* width/2) , width * cellSL, width * cellSL);
            ctx.resetTransform();
        }

        // Constraint classes

        // Renban
        window.renban = function(cell) {
            this.lines = [
                [cell]
            ];

            this.show = function() {
                const renbanInfo = newConstraintInfo.filter(c => c.name === 'Renban')[0];
                for (var a = 0; a < this.lines.length; a++) {
                    drawLine(this.lines[a], renbanInfo.color, renbanInfo.colorDark, renbanInfo.lineWidth);
                }
            }

            this.addCellToLine = function(cell) {
                if (this.lines[this.lines.length - 1].length < size) {
                    this.lines[this.lines.length - 1].push(cell);
                }
            }
        }

        // Whispers
        window.whispers = function(cell) {
            this.lines = [
                [cell]
            ];

            this.show = function() {
                const whispersInfo = newConstraintInfo.filter(c => c.name === 'Whispers')[0];
                for (var a = 0; a < this.lines.length; a++) {
                    drawLine(this.lines[a], whispersInfo.color, whispersInfo.colorDark, whispersInfo.lineWidth);
                }
            }

            this.addCellToLine = function(cell) {
                this.lines[this.lines.length - 1].push(cell);
            }
        }

        // Lockout
        window.lockout = function(cell) {
            this.lines = [
                [cell]
            ];

            this.cells = [
                cell
            ];

            this.show = function() {
                const lockoutInfo = newConstraintInfo.filter(c => c.name === 'Lockout')[0];

                for (var a = 0; a < this.lines.length; a++) {
                    drawLine(this.lines[a], lockoutInfo.color, lockoutInfo.colorDark, lockoutInfo.lineWidth);
                    ctx.save();
                    drawDiamond(this.lines[a][0], lockoutInfo.color, lockoutInfo.colorDark, lockoutInfo.width, lockoutInfo.angle);
                    ctx.restore();
                    ctx.save();
                    drawDiamond(this.lines[a][this.lines[a].length-1], lockoutInfo.color, lockoutInfo.colorDark, lockoutInfo.width, lockoutInfo.angle);
                    ctx.restore();
                }
            }

            this.addCellToLine = function(cell) {
                this.lines[this.lines.length - 1].push(cell);
                this.cells.push(cell);
            }

        }

        const origCategorizeTools = categorizeTools;
        categorizeTools = function() {
            origCategorizeTools();

            let toolLineIndex = toolConstraints.indexOf('Palindrome');
            for (let info of newConstraintInfo) {
                if (info.type === 'line' || info.type === 'lineWithEnds') {
                    toolConstraints.splice(++toolLineIndex, 0, info.name);
                    lineConstraints.push(info.name);
                }
            }

            draggableConstraints = [...new Set([...lineConstraints, ...regionConstraints])];
            multicellConstraints = [...new Set([...lineConstraints, ...regionConstraints, ...borderConstraints, ...cornerConstraints])];
            betweenCellConstraints = [...borderConstraints, ...cornerConstraints];
            allConstraints = [...boolConstraints, ...toolConstraints];

            tools = [...toolConstraints, ...toolCosmetics];
            selectableTools = [...selectableConstraints, ...selectableCosmetics];
            lineTools = [...lineConstraints, ...lineCosmetics];
            regionTools = [...regionConstraints, ...regionCosmetics];
            diagonalRegionTools = [...diagonalRegionConstraints, ...diagonalRegionCosmetics];
            outsideTools = [...outsideConstraints, ...outsideCosmetics];
            outsideCornerTools = [...outsideCornerConstraints, ...outsideCornerCosmetics];
            oneCellAtATimeTools = [...perCellConstraints, ...draggableConstraints, ...draggableCosmetics];
            draggableTools = [...draggableConstraints, ...draggableCosmetics];
            multicellTools = [...multicellConstraints, ...multicellCosmetics];
        }

        // Tooltips
        for (let info of newConstraintInfo) {
            descriptions[info.name] = info.tooltip;
        }

        // Puzzle title
        // Unfortuantely, there's no way to shim this so it's duplicated in full.
        getPuzzleTitle = function() {
            var title = '';

            ctx.font = titleLSize + 'px Arial';

            if (customTitle.length) {
                title = customTitle;
            } else {
                if (size !== 9)
                    title += size + 'x' + size + ' ';
                if (getCells().some(a => a.region !== (Math.floor(a.i / regionH) * regionH) + Math.floor(a.j / regionW)))
                    title += 'Irregular ';
                if (constraints[cID('Extra Region')].length)
                    title += 'Extra-Region ';
                if (constraints[cID('Odd')].length && !constraints[cID('Even')].length)
                    title += 'Odd ';
                if (!constraints[cID('Odd')].length && constraints[cID('Even')].length)
                    title += 'Even ';
                if (constraints[cID('Odd')].length && constraints[cID('Even')].length)
                    title += 'Odd-Even ';
                if (constraints[cID('Diagonal +')] !== constraints[cID('Diagonal -')])
                    title += 'Single-Diagonal ';
                if (constraints[cID('Nonconsecutive')] && !(constraints[cID('Difference')].length && constraints[cID('Difference')].some(a => ['', '1'].includes(a.value))) && !constraints[cID('Ratio')].negative)
                    title += 'Nonconsecutive ';
                if (constraints[cID('Nonconsecutive')] && constraints[cID('Difference')].length && constraints[cID('Difference')].some(a => ['', '1'].includes(a.value)) && !constraints[cID('Ratio')].negative)
                    title += 'Consecutive ';
                if (!constraints[cID('Nonconsecutive')] && constraints[cID('Difference')].length && constraints[cID('Difference')].every(a => ['', '1'].includes(a.value)))
                    title += 'Consecutive-Pairs ';
                if (constraints[cID('Antiknight')])
                    title += 'Antiknight ';
                if (constraints[cID('Antiking')])
                    title += 'Antiking ';
                if (constraints[cID('Disjoint Groups')])
                    title += 'Disjoint-Group ';
                if (constraints[cID('XV')].length || constraints[cID('XV')].negative)
                    title += 'XV ' + (constraints[cID('XV')].negative ? '(-) ' : '');
                if (constraints[cID('Little Killer Sum')].length)
                    title += 'Little Killer ';
                if (constraints[cID('Sandwich Sum')].length)
                    title += 'Sandwich ';
                if (constraints[cID('Thermometer')].length)
                    title += 'Thermo ';
                if (constraints[cID('Palindrome')].length)
                    title += 'Palindrome ';
                if (constraints[cID('Difference')].length && constraints[cID('Difference')].some(a => !['', '1'].includes(a.value)) && !(constraints[cID('Nonconsecutive')] && constraints[cID('Ratio')].negative))
                    title += 'Difference ';
                if ((constraints[cID('Ratio')].length || constraints[cID('Ratio')].negative) && !(constraints[cID('Nonconsecutive')] && constraints[cID('Ratio')].negative))
                    title += 'Ratio ' + (constraints[cID('Ratio')].negative ? '(-) ' : '');;
                if (constraints[cID('Nonconsecutive')] && constraints[cID('Ratio')].negative)
                    title += 'Kropki ';
                if (constraints[cID('Killer Cage')].length)
                    title += 'Killer ';
                if (constraints[cID('Clone')].length)
                    title += 'Clone ';
                if (constraints[cID('Arrow')].length)
                    title += 'Arrow ';
                if (constraints[cID('Between Line')].length)
                    title += 'Between ';
                if (constraints[cID('Quadruple')].length)
                    title += 'Quadruples '
                if (constraints[cID('Minimum')].length || constraints[cID('Maximum')].length)
                    title += 'Extremes '

                for (let info of newConstraintInfo) {
                    if (constraints[cID(info.name)] && constraints[cID(info.name)].length > 0) {
                        title += `${info.name} `;
                    }
                }

                title += 'Sudoku';

                if (constraints[cID('Diagonal +')] && constraints[cID('Diagonal -')])
                    title += ' X';

                if (title === 'Sudoku')
                    title = 'Classic Sudoku';

                if (ctx.measureText(title).width > (canvas.width - 711))
                    title = 'Extreme Variant Sudoku';
            }

            buttons[buttons.findIndex(a => a.id === 'EditInfo')].x = canvas.width / 2 + ctx.measureText(title).width / 2 + 40;

            return title;
        }
    }

    if (window.grid) {
        doShim();
    } else {
        document.addEventListener('DOMContentLoaded', (event) => {
            doShim();
        });
    }
})();
