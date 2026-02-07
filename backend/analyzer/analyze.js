/**
 * Edgy Analyzer - Analyzes Figma screens against edge case patterns
 * Run via GitHub Action or locally with: node analyze.js
 */

const fs = require('fs');
const path = require('path');

// Load knowledge base
const componentsPath = path.join(__dirname, '../knowledge/shadcn-components.json');
const patternsPath = path.join(__dirname, '../knowledge/edge-case-patterns.json');

const components = JSON.parse(fs.readFileSync(componentsPath, 'utf-8'));
const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));

// Find all screen files
const screensDir = path.join(__dirname, '../../screens');
const resultsDir = path.join(__dirname, '../../results');

// Ensure directories exist
if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
}

function getTextContent(node, accumulated = []) {
    if (!node) return accumulated;

    accumulated.push(node.name.toLowerCase());

    if (node.children) {
        for (const child of node.children) {
            getTextContent(child, accumulated);
        }
    }

    return accumulated;
}

function detectPatterns(screen) {
    const textContent = getTextContent(screen).join(' ');
    const detected = [];

    for (const [patternId, pattern] of Object.entries(patterns.patterns)) {
        const hasPattern = pattern.detectionKeywords.some(kw =>
            textContent.includes(kw.toLowerCase())
        );

        if (hasPattern) {
            detected.push({ id: patternId, pattern });
        }
    }

    return detected;
}

function checkMissingEdgeCases(screen, detectedPatterns) {
    const textContent = getTextContent(screen).join(' ');
    const issues = [];

    for (const { id: patternId, pattern } of detectedPatterns) {
        for (const edgeCase of pattern.requiredEdgeCases) {
            // Check if this edge case might exist
            const edgeCaseIndicators = [
                edgeCase.id.replace(/-/g, ' '),
                ...edgeCase.suggestedComponents.map(c => c.toLowerCase())
            ];

            const hasEdgeCase = edgeCaseIndicators.some(indicator =>
                textContent.includes(indicator.toLowerCase())
            );

            // Also check for common patterns
            const commonIndicators = ['error', 'loading', 'empty', 'skeleton', 'spinner', 'alert', 'toast'];
            const hasCommonIndicator = commonIndicators.some(ci => textContent.includes(ci));

            if (!hasEdgeCase && !hasCommonIndicator) {
                issues.push({
                    id: `${edgeCase.id}-${screen.id}`,
                    patternId,
                    edgeCaseId: edgeCase.id,
                    name: edgeCase.name,
                    description: edgeCase.description || `Missing ${edgeCase.name}`,
                    severity: edgeCase.severity,
                    suggestedComponents: edgeCase.suggestedComponents,
                    screenId: screen.id,
                    screenName: screen.name
                });
            }
        }
    }

    return issues;
}

function analyzeScreens(screens) {
    const screenAnalyses = screens.map(screen => {
        const detectedPatterns = detectPatterns(screen);
        const issues = checkMissingEdgeCases(screen, detectedPatterns);

        return {
            screenId: screen.id,
            screenName: screen.name,
            detectedPatterns: detectedPatterns.map(p => p.id),
            issues,
            missingStates: issues.map(i => i.name)
        };
    });

    const allIssues = screenAnalyses.flatMap(s => s.issues);

    // Find dead ends (screens with no connections)
    const deadEnds = screens
        .filter(s => !s.connections || s.connections.length === 0)
        .map(s => s.name);

    // Find orphan screens (not targeted by any connection)
    const targetedIds = new Set(
        screens.flatMap(s => (s.connections || []).map(c => c.targetFrameId))
    );
    const orphanScreens = screens
        .filter(s => !targetedIds.has(s.id))
        .map(s => s.name);

    return {
        timestamp: new Date().toISOString(),
        totalScreens: screens.length,
        totalIssues: allIssues.length,
        criticalCount: allIssues.filter(i => i.severity === 'critical').length,
        warningCount: allIssues.filter(i => i.severity === 'warning').length,
        infoCount: allIssues.filter(i => i.severity === 'info').length,
        screens: screenAnalyses,
        flowIssues: {
            deadEnds,
            orphanScreens
        }
    };
}

// Main execution
function main() {
    console.log('🔍 Edgy Analyzer Starting...\n');

    // Check if screens directory exists
    if (!fs.existsSync(screensDir)) {
        console.log('No screens directory found. Creating placeholder...');
        fs.mkdirSync(screensDir, { recursive: true });
        fs.writeFileSync(
            path.join(screensDir, '.gitkeep'),
            '# Screen exports will appear here\n'
        );
        return;
    }

    // Find all JSON files in screens directory
    const screenFiles = fs.readdirSync(screensDir)
        .filter(f => f.endsWith('.json'));

    if (screenFiles.length === 0) {
        console.log('No screen files found to analyze.');
        return;
    }

    // Process each project
    for (const file of screenFiles) {
        console.log(`📋 Analyzing: ${file}`);

        const data = JSON.parse(fs.readFileSync(path.join(screensDir, file), 'utf-8'));
        const screens = data.screens || data;

        const result = analyzeScreens(Array.isArray(screens) ? screens : [screens]);

        // Write results
        const resultPath = path.join(resultsDir, file.replace('.json', '-results.json'));
        fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

        console.log(`   ✅ ${result.totalIssues} issues found (${result.criticalCount} critical)`);
        console.log(`   📁 Results saved to: ${resultPath}\n`);
    }

    console.log('🎉 Analysis complete!');
}

main();
