// Main Plugin Code - Edgy Flow Analyzer (Simplified)

import { ScreenData, NodeData, ConnectionData, AnalysisResult, PluginMessage, EdgeCaseIssue } from './types';

figma.showUI(__html__, { width: 420, height: 700, themeColors: true });

let lastAnalysisResult: AnalysisResult | null = null;
let enrichedScreensCache: any[] = [];

const SHADCN_BASE = 'https://www.figma.com/design/lmUgIGwdG2ZaVfvZzFuU2H/-shadcn-ui---Design-System--Community-?node-id=';

const componentLibrary = [
    { name: 'Alert', nodeId: '4-6598', icon: '⚠️', aliases: ['alert', 'error', 'warning'] },
    { name: 'Button', nodeId: '13-1070', icon: '🔘', aliases: ['button', 'btn', 'cta'] },
    { name: 'Input', nodeId: '13-1256', icon: '📝', aliases: ['input', 'text-field', 'form'] },
    { name: 'Dialog', nodeId: '13-1026', icon: '📋', aliases: ['dialog', 'modal', 'popup'] },
    { name: 'Progress', nodeId: '13-1306', icon: '⏳', aliases: ['progress', 'loading'] },
    { name: 'Skeleton', nodeId: '13-1070', icon: '🦴', aliases: ['skeleton', 'loader'] },
    { name: 'Toast', nodeId: '4-6598', icon: '🍞', aliases: ['toast', 'snackbar'] },
    { name: 'Card', nodeId: '13-1026', icon: '📦', aliases: ['card', 'container'] },
];

function findComponentInfo(name: string) {
    const n = name.toLowerCase();
    return componentLibrary.find(c => c.name.toLowerCase() === n || c.aliases.some(a => n.includes(a)));
}

function extractNodeData(node: SceneNode): NodeData {
    const data: NodeData = { id: node.id, name: node.name, type: node.type, visible: node.visible };
    if ('children' in node && node.children.length > 0) {
        data.children = node.children.map(child => extractNodeData(child));
    }
    return data;
}

function getConnections(frame: FrameNode): ConnectionData[] {
    const connections: ConnectionData[] = [];
    function traverse(node: SceneNode): void {
        if ('reactions' in node && node.reactions) {
            for (const reaction of node.reactions) {
                if (reaction.action?.type === 'NODE' && reaction.action.destinationId) {
                    const target = figma.getNodeById(reaction.action.destinationId);
                    if (target && target.type === 'FRAME') {
                        connections.push({
                            triggerNodeId: node.id, triggerNodeName: node.name,
                            targetFrameId: target.id, targetFrameName: target.name
                        });
                    }
                }
            }
        }
        if ('children' in node) node.children.forEach(traverse);
    }
    traverse(frame);
    return connections;
}

function exportSelectedFrames(): ScreenData[] {
    return figma.currentPage.selection
        .filter((node): node is FrameNode => node.type === 'FRAME')
        .map(frame => ({
            id: frame.id, name: frame.name, width: frame.width, height: frame.height,
            children: frame.children.map(child => extractNodeData(child)),
            connections: getConnections(frame)
        }));
}

function getSelectedFrames(): FrameNode[] {
    return figma.currentPage.selection.filter((node): node is FrameNode => node.type === 'FRAME');
}

function sendSelectionUpdate(): void {
    const frames = getSelectedFrames();
    figma.ui.postMessage({
        type: 'selection-changed',
        payload: { frameCount: frames.length, frameNames: frames.map(f => f.name) }
    });
}

// Simple report creation WITHOUT auto layout
async function createSimpleReport(): Promise<FrameNode | null> {
    if (!lastAnalysisResult || enrichedScreensCache.length === 0) {
        figma.notify('⚠️ Please run Analyze Flow first!', { error: true });
        return null;
    }

    // CRITICAL: Load fonts FIRST before any text creation
    try {
        await figma.loadFontAsync({ family: 'Roboto', style: 'Regular' });
    } catch (e) {
        // Fallback to system font if Roboto not available
        try {
            await figma.loadFontAsync({ family: 'Arial', style: 'Regular' });
        } catch (e2) {
            figma.notify('⚠️ Could not load fonts', { error: true });
            return null;
        }
    }

    const result = lastAnalysisResult;
    const screens = enrichedScreensCache;

    // Get position
    const selectedFrames = getSelectedFrames();
    let startX = 200, startY = 100;
    if (selectedFrames.length > 0) {
        let maxX = 0;
        selectedFrames.forEach(f => {
            if (f.x + f.width > maxX) { maxX = f.x + f.width; startY = f.y; }
        });
        startX = maxX + 100;
    }

    // Create main frame - simple rectangle, NO auto layout
    const report = figma.createFrame();
    report.name = '📋 Edge Case Report';
    report.x = startX;
    report.y = startY;
    report.resize(400, 600);
    report.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.12 } }];
    report.cornerRadius = 20;

    let yPos = 30;

    // Title - using rectangle + text approach
    const titleBg = figma.createRectangle();
    titleBg.resize(360, 50);
    titleBg.x = 20;
    titleBg.y = yPos;
    titleBg.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.18 } }];
    titleBg.cornerRadius = 10;
    report.appendChild(titleBg);

    const titleText = figma.createText();
    titleText.characters = `⚡ Edge Case Report - ${result.totalIssues} issues`;
    titleText.fontSize = 18;
    titleText.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    titleText.x = 35;
    titleText.y = yPos + 15;
    report.appendChild(titleText);

    yPos += 70;

    // Stats row
    const statsData = [
        { label: 'Total', value: result.totalIssues, color: { r: 1, g: 1, b: 1 } },
        { label: 'Critical', value: result.criticalCount, color: { r: 0.9, g: 0.3, b: 0.3 } },
        { label: 'Warning', value: result.warningCount, color: { r: 0.95, g: 0.7, b: 0.2 } },
        { label: 'Info', value: result.infoCount, color: { r: 0.3, g: 0.6, b: 0.9 } },
    ];

    let statX = 25;
    for (const stat of statsData) {
        const statBg = figma.createRectangle();
        statBg.resize(85, 60);
        statBg.x = statX;
        statBg.y = yPos;
        statBg.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.18 } }];
        statBg.cornerRadius = 8;
        report.appendChild(statBg);

        const statValue = figma.createText();
        statValue.characters = stat.value.toString();
        statValue.fontSize = 24;
        statValue.fills = [{ type: 'SOLID', color: stat.color }];
        statValue.x = statX + 30;
        statValue.y = yPos + 8;
        report.appendChild(statValue);

        const statLabel = figma.createText();
        statLabel.characters = stat.label;
        statLabel.fontSize = 10;
        statLabel.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.65 } }];
        statLabel.x = statX + 20;
        statLabel.y = yPos + 40;
        report.appendChild(statLabel);

        statX += 92;
    }

    yPos += 80;

    // Issues section
    for (const screen of screens) {
        if (screen.issues.length === 0) continue;

        // Screen header
        const screenText = figma.createText();
        screenText.characters = `📱 ${screen.screenName}`;
        screenText.fontSize = 14;
        screenText.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
        screenText.x = 25;
        screenText.y = yPos;
        report.appendChild(screenText);

        yPos += 25;

        // Issues
        for (const issue of screen.issues) {
            const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';

            const issueText = figma.createText();
            issueText.characters = `${icon} ${issue.name}`;
            issueText.fontSize = 12;
            issueText.fills = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.88 } }];
            issueText.x = 35;
            issueText.y = yPos;
            report.appendChild(issueText);

            yPos += 18;

            // Component links
            for (const comp of issue.suggestedComponents) {
                const info = findComponentInfo(comp);
                if (!info) continue;

                const linkBg = figma.createRectangle();
                linkBg.resize(80, 20);
                linkBg.x = 50;
                linkBg.y = yPos;
                linkBg.fills = [{ type: 'SOLID', color: { r: 0.48, g: 0.23, b: 0.93 } }];
                linkBg.cornerRadius = 4;
                report.appendChild(linkBg);

                const linkText = figma.createText();
                linkText.characters = `🔗 ${info.name}`;
                linkText.fontSize = 10;
                linkText.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
                linkText.x = 55;
                linkText.y = yPos + 4;
                linkText.hyperlink = { type: 'URL', value: SHADCN_BASE + info.nodeId };
                report.appendChild(linkText);

                yPos += 25;
            }

            yPos += 5;
        }

        yPos += 15;
    }

    // Footer
    const footerText = figma.createText();
    footerText.characters = 'Linked to shadcn/ui 💜';
    footerText.fontSize = 11;
    footerText.fills = [{ type: 'SOLID', color: { r: 0.6, g: 0.4, b: 0.9 } }];
    footerText.x = 140;
    footerText.y = yPos + 10;
    footerText.hyperlink = { type: 'URL', value: 'https://www.figma.com/design/lmUgIGwdG2ZaVfvZzFuU2H/-shadcn-ui---Design-System--Community-' };
    report.appendChild(footerText);

    // Resize frame to fit content
    report.resize(400, yPos + 50);

    figma.currentPage.appendChild(report);
    figma.currentPage.selection = [report];
    figma.viewport.scrollAndZoomIntoView([report]);

    return report;
}

// Handle messages
figma.ui.onmessage = async (msg: any) => {
    switch (msg.type) {
        case 'analyze': {
            const screens = exportSelectedFrames();
            if (screens.length === 0) {
                figma.ui.postMessage({ type: 'error', payload: { message: 'Select at least one frame' } });
                return;
            }
            figma.ui.postMessage({ type: 'screens-exported', payload: { screens, timestamp: new Date().toISOString() } });
            break;
        }

        case 'analysis-complete': {
            const { result } = msg.payload;
            lastAnalysisResult = result;
            enrichedScreensCache = result.screens.map((screen: any) => ({
                ...screen,
                issues: screen.issues.map((issue: any) => {
                    const matches = issue.suggestedComponents.map((comp: string) => {
                        const info = findComponentInfo(comp);
                        return info ? { name: comp, libraryUrl: SHADCN_BASE + info.nodeId, libraryName: info.name } : { name: comp };
                    });
                    return { ...issue, libraryMatches: matches };
                })
            }));
            figma.ui.postMessage({ type: 'results-enriched', payload: { screens: enrichedScreensCache } });
            figma.notify(`✅ ${result.totalIssues} issues found`, { timeout: 3000 });
            break;
        }

        case 'insert-placeholders':
        case 'generate-report': {
            try {
                const report = await createSimpleReport();
                if (report) {
                    figma.notify(`✅ Report created!`, { timeout: 2000 });
                }
            } catch (err) {
                figma.notify(`❌ Error: ${err}`, { error: true });
                console.error(err);
            }
            break;
        }

        case 'load-library': {
            figma.ui.postMessage({
                type: 'library-loaded',
                payload: { componentCount: componentLibrary.length, components: componentLibrary.map(c => c.name) }
            });
            break;
        }
    }
};

figma.on('selectionchange', sendSelectionUpdate);
sendSelectionUpdate();
figma.ui.postMessage({ type: 'library-loaded', payload: { componentCount: componentLibrary.length, components: componentLibrary.map(c => c.name) } });
