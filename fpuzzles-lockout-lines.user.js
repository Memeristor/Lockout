// ==UserScript==
// @name         Fpuzzles-LockoutLines
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds LockoutLines constraint to f-puzzles.
// @author       Memeristor
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
            name: 'Lockout',
            type: 'line',
            color: '#006CBA',
            colorDark: '#0094FF',
            lineWidth: 0.2,
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
                            if (index > 0 && index < line.length - 1) {
                                if ((n <= outerCell0.value && n >= outerCell1.value) || (n <= outerCell1.value && n >= outerCell0.value)) {
                                    return false;
                                }
                            } else if (outerCell0.value && outerCell1.value && Math.abs(outerCell0.value - outerCell1.value) < lockoutDiff) {
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

        const drawDiamond = function(end, color, colorDark, lineWidth, sideLength){
            ctx.beginPath();
            ctx.translate(end.x + cellSL / 2, end.y + cellSL * (0.5 - Math.sqrt(2)* sideLength/2));
            ctx.rotate(45 * Math.PI / 180);
            ctx.translate(-end.x- cellSL / 2, -end.y - cellSL * (0.5 - Math.sqrt(2)* sideLength/2));
            ctx.lineWidth = cellSL * lineWidth * 0.5;
            ctx.strokeStyle = boolSettings['Dark Mode'] ? colorDark : color;
            ctx.fillStyle = boolSettings['Dark Mode'] ? '#000000' : '#FFFFFF';
            ctx.fillRect(end.x+ cellSL / 2 , end.y + cellSL * (0.5 - Math.sqrt(2)* sideLength/2) , sideLength * cellSL, sideLength * cellSL);
            ctx.strokeRect(end.x+ cellSL / 2 , end.y + cellSL * (0.5 - Math.sqrt(2)* sideLength/2) , sideLength * cellSL, sideLength * cellSL);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }

        // Constraint classes

        // Lockout
        window.lockout = function(cell) {
            this.lines = [
                [cell]
            ];

            this.show = function() {
                const lockoutInfo = newConstraintInfo.filter(c => c.name === 'Lockout')[0];

                for (var a = 0; a < this.lines.length; a++) {
                    drawLine(this.lines[a], lockoutInfo.color, lockoutInfo.colorDark, lockoutInfo.lineWidth);
                    ctx.save();
                    drawDiamond(this.lines[a][0], lockoutInfo.color, lockoutInfo.colorDark, 0.1, 0.55);
                    ctx.restore();
                    ctx.save();
                    drawDiamond(this.lines[a][this.lines[a].length-1], lockoutInfo.color, lockoutInfo.colorDark, 0.1, 0.55);
                    ctx.restore();
                }

            }

            this.addCellToLine = function(cell) {
                this.lines[this.lines.length - 1].push(cell);
            }
        }

        const origCategorizeTools = categorizeTools;
        categorizeTools = function() {
            origCategorizeTools();

            let toolLineIndex = toolConstraints.indexOf('Palindrome');
            for (let info of newConstraintInfo) {
                if (info.type === 'line') {
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