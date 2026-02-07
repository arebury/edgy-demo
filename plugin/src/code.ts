// Main Plugin Code - Edgy Flow Analyzer with Design System Links

import { ScreenData, NodeData, ConnectionData, AnalysisResult, PluginMessage, EdgeCaseIssue } from './types';

// Show the UI
figma.showUI(__html__, {
    width: 420,
    height: 700,
    themeColors: true
});

let lastAnalysisResult: AnalysisResult | null = null;
let enrichedScreensCache: EnrichedScreen[] = [];

// shadcn Figma file base URL
const SHADCN_FILE_BASE = 'https://www.figma.com/design/lmUgIGwdG2ZaVfvZzFuU2H/-shadcn-ui---Design-System--Community-?node-id=';

// Types for enriched data
interface LibraryMatch {
    name: string;
    libraryUrl?: string;
    libraryName?: string;
}

interface EnrichedIssue extends EdgeCaseIssue {
    libraryMatches?: LibraryMatch[];
}

interface EnrichedScreen {
    screenId: string;
    screenName: string;
    detectedPatterns: string[];
    issues: EnrichedIssue[];
    missingStates: string[];
}

// Component to shadcn Figma node mapping
interface ComponentLink {
    name: string;
    nodeId: string;
    aliases: string[];
}

const componentLinks: ComponentLink[] = [
    { name: 'Alert', nodeId: '4-6598', aliases: ['alert', 'error-message', 'warning', 'notification'] },
    { name: 'AlertDialog', nodeId: '4-6598', aliases: ['alert-dialog', 'confirm', 'confirmation'] },
    { name: 'Button', nodeId: '13-1070', aliases: ['button', 'btn', 'cta', 'submit'] },
    { name: 'Input', nodeId: '13-1256', aliases: ['input', 'text-field', 'form-field', 'textfield'] },
    { name: 'Dialog', nodeId: '13-1026', aliases: ['dialog', 'modal', 'popup', 'overlay'] },
    { name: 'Progress', nodeId: '13-1306', aliases: ['progress', 'loading-bar', 'progress-bar'] },
    { name: 'Tabs', nodeId: '13-1356', aliases: ['tabs', 'tab-bar', 'navigation'] },
    { name: 'Skeleton', nodeId: '13-1070', aliases: ['skeleton', 'loader', 'loading', 'placeholder'] },
    { name: 'Toast', nodeId: '4-6598', aliases: ['toast', 'snackbar', 'message'] },
    { name: 'Card', nodeId: '13-1026', aliases: ['card', 'container', 'box'] },
    { name: 'Badge', nodeId: '13-1070', aliases: ['badge', 'tag', 'label', 'status'] },
];

// Find component link by name
function findComponentLink(suggestedName: string): { name: string; url: string } | null {
    const normalized = suggestedName.toLowerCase();
    const link = componentLinks.find(c =>
        c.name.toLowerCase() === normalized ||
        c.aliases.some(a => normalized.includes(a))
    );

    if (link) {
        return {
            name: link.name,
            url: SHADCN_FILE_BASE + link.nodeId
        };
    }
    return null;
}

// Get library status for UI
function getLibraryStatus(): { available: number; components: string[] } {
    return {
        available: componentLinks.length,
        components: componentLinks.map(c => c.name)
    };
}

// Extract node data recursively
function extractNodeData(node: SceneNode): NodeData {
    const data: NodeData = {
        id: node.id,
        name: node.name,
        type: node.type,
        visible: node.visible
    };

    if ('children' in node && node.children.length > 0) {
        data.children = node.children.map(child => extractNodeData(child));
    }

    return data;
}

// Get prototype connections from a frame
function getConnections(frame: FrameNode): ConnectionData[] {
    const connections: ConnectionData[] = [];

    function traverse(node: SceneNode): void {
        if ('reactions' in node && node.reactions) {
            for (const reaction of node.reactions) {
                if (reaction.action?.type === 'NODE' && reaction.action.destinationId) {
                    const target = figma.getNodeById(reaction.action.destinationId);
                    if (target && target.type === 'FRAME') {
                        connections.push({
                            triggerNodeId: node.id,
                            triggerNodeName: node.name,
                            targetFrameId: target.id,
                            targetFrameName: target.name
                        });
                    }
                }
            }
        }
        if ('children' in node) {
            node.children.forEach(traverse);
        }
    }

    traverse(frame);
    return connections;
}

// Export selected frames as ScreenData
function exportSelectedFrames(): ScreenData[] {
    const frames = figma.currentPage.selection.filter(
        (node): node is FrameNode => node.type === 'FRAME'
    );

    return frames.map(frame => ({
        id: frame.id,
        name: frame.name,
        width: frame.width,
        height: frame.height,
        children: frame.children.map(child => extractNodeData(child)),
        connections: getConnections(frame)
    }));
}

// Get selected frame count
function getSelectedFrames(): FrameNode[] {
    return figma.currentPage.selection.filter(
        (node): node is FrameNode => node.type === 'FRAME'
    );
}

// Send selection update to UI
function sendSelectionUpdate(): void {
    const frames = getSelectedFrames();
    figma.ui.postMessage({
        type: 'selection-changed',
        payload: {
            frameCount: frames.length,
            frameNames: frames.map(f => f.name)
        }
    } as PluginMessage);
}

// Colors
const COLORS = {
    bg: { r: 0.08, g: 0.08, b: 0.1 },
    cardBg: { r: 0.12, g: 0.12, b: 0.14 },
    accent: { r: 0.486, g: 0.227, b: 0.929 }, // Purple #7c3aed
    accentLight: { r: 0.659, g: 0.333, b: 0.969 }, // Light purple
    critical: { r: 0.91, g: 0.3, b: 0.24 },
    warning: { r: 0.95, g: 0.61, b: 0.07 },
    info: { r: 0.2, g: 0.6, b: 0.86 },
    white: { r: 1, g: 1, b: 1 },
    gray: { r: 0.6, g: 0.6, b: 0.65 },
    lightGray: { r: 0.85, g: 0.85, b: 0.88 },
};

// Create beautiful report frame
async function createReportFrame(): Promise<FrameNode | null> {
    if (!lastAnalysisResult || enrichedScreensCache.length === 0) {
        figma.notify('⚠️ Please run analysis first', { error: true });
        return null;
    }

    // Load fonts
    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'SemiBold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

    const result = lastAnalysisResult;
    const screens = enrichedScreensCache;

    // Find the rightmost frame to position report
    const selectedFrames = getSelectedFrames();
    let maxX = 0;
    let minY = 0;
    selectedFrames.forEach(f => {
        if (f.x + f.width > maxX) maxX = f.x + f.width;
        if (minY === 0 || f.y < minY) minY = f.y;
    });

    // Main report container
    const report = figma.createFrame();
    report.name = '📋 Edge Case Report';
    report.x = maxX + 100;
    report.y = minY;
    report.fills = [{ type: 'SOLID', color: COLORS.bg }];
    report.cornerRadius = 24;
    report.layoutMode = 'VERTICAL';
    report.paddingTop = 32;
    report.paddingBottom = 32;
    report.paddingLeft = 32;
    report.paddingRight = 32;
    report.itemSpacing = 24;
    report.layoutSizingHorizontal = 'HUG';
    report.layoutSizingVertical = 'HUG';
    report.minWidth = 400;

    // ========== HEADER ==========
    const header = figma.createFrame();
    header.name = 'Header';
    header.fills = [];
    header.layoutMode = 'VERTICAL';
    header.itemSpacing = 8;
    header.layoutSizingHorizontal = 'FILL';
    header.layoutSizingVertical = 'HUG';

    const titleRow = figma.createFrame();
    titleRow.name = 'Title Row';
    titleRow.fills = [];
    titleRow.layoutMode = 'HORIZONTAL';
    titleRow.itemSpacing = 12;
    titleRow.layoutSizingHorizontal = 'FILL';
    titleRow.layoutSizingVertical = 'HUG';

    const logo = figma.createText();
    logo.characters = '⚡';
    logo.fontSize = 28;
    logo.fontName = { family: 'Inter', style: 'Bold' };
    titleRow.appendChild(logo);

    const title = figma.createText();
    title.characters = 'Edge Case Report';
    title.fontSize = 28;
    title.fontName = { family: 'Inter', style: 'Bold' };
    title.fills = [{ type: 'SOLID', color: COLORS.white }];
    titleRow.appendChild(title);

    header.appendChild(titleRow);

    const subtitle = figma.createText();
    subtitle.characters = `Generated ${new Date().toLocaleDateString()} • ${result.totalScreens} screens analyzed`;
    subtitle.fontSize = 14;
    subtitle.fontName = { family: 'Inter', style: 'Regular' };
    subtitle.fills = [{ type: 'SOLID', color: COLORS.gray }];
    header.appendChild(subtitle);

    report.appendChild(header);

    // ========== SUMMARY STATS ==========
    const statsRow = figma.createFrame();
    statsRow.name = 'Stats';
    statsRow.fills = [{ type: 'SOLID', color: COLORS.cardBg }];
    statsRow.cornerRadius = 16;
    statsRow.layoutMode = 'HORIZONTAL';
    statsRow.itemSpacing = 0;
    statsRow.layoutSizingHorizontal = 'FILL';
    statsRow.layoutSizingVertical = 'HUG';

    const createStat = (value: number, label: string, color: RGB): FrameNode => {
        const stat = figma.createFrame();
        stat.name = label;
        stat.fills = [];
        stat.layoutMode = 'VERTICAL';
        stat.itemSpacing = 4;
        stat.paddingTop = 20;
        stat.paddingBottom = 20;
        stat.paddingLeft = 24;
        stat.paddingRight = 24;
        stat.layoutSizingHorizontal = 'FILL';
        stat.layoutSizingVertical = 'HUG';
        stat.primaryAxisAlignItems = 'CENTER';
        stat.counterAxisAlignItems = 'CENTER';

        const valueText = figma.createText();
        valueText.characters = value.toString();
        valueText.fontSize = 32;
        valueText.fontName = { family: 'Inter', style: 'Bold' };
        valueText.fills = [{ type: 'SOLID', color }];
        stat.appendChild(valueText);

        const labelText = figma.createText();
        labelText.characters = label;
        labelText.fontSize = 12;
        labelText.fontName = { family: 'Inter', style: 'Medium' };
        labelText.fills = [{ type: 'SOLID', color: COLORS.gray }];
        stat.appendChild(labelText);

        return stat;
    };

    statsRow.appendChild(createStat(result.totalIssues, 'Total', COLORS.white));
    statsRow.appendChild(createStat(result.criticalCount, 'Critical', COLORS.critical));
    statsRow.appendChild(createStat(result.warningCount, 'Warning', COLORS.warning));
    statsRow.appendChild(createStat(result.infoCount, 'Info', COLORS.info));

    report.appendChild(statsRow);

    // ========== ISSUES BY SCREEN ==========
    for (const screen of screens) {
        if (screen.issues.length === 0) continue;

        const screenSection = figma.createFrame();
        screenSection.name = `Screen: ${screen.screenName}`;
        screenSection.fills = [{ type: 'SOLID', color: COLORS.cardBg }];
        screenSection.cornerRadius = 16;
        screenSection.layoutMode = 'VERTICAL';
        screenSection.itemSpacing = 16;
        screenSection.paddingTop = 20;
        screenSection.paddingBottom = 20;
        screenSection.paddingLeft = 20;
        screenSection.paddingRight = 20;
        screenSection.layoutSizingHorizontal = 'FILL';
        screenSection.layoutSizingVertical = 'HUG';

        // Screen title
        const screenTitle = figma.createText();
        screenTitle.characters = `📱 ${screen.screenName}`;
        screenTitle.fontSize = 16;
        screenTitle.fontName = { family: 'Inter', style: 'SemiBold' };
        screenTitle.fills = [{ type: 'SOLID', color: COLORS.white }];
        screenSection.appendChild(screenTitle);

        // Issues
        for (const issue of screen.issues) {
            const issueRow = figma.createFrame();
            issueRow.name = issue.name;
            issueRow.fills = [];
            issueRow.layoutMode = 'VERTICAL';
            issueRow.itemSpacing = 8;
            issueRow.layoutSizingHorizontal = 'FILL';
            issueRow.layoutSizingVertical = 'HUG';

            // Issue header row
            const issueHeader = figma.createFrame();
            issueHeader.name = 'Issue Header';
            issueHeader.fills = [];
            issueHeader.layoutMode = 'HORIZONTAL';
            issueHeader.itemSpacing = 8;
            issueHeader.layoutSizingHorizontal = 'FILL';
            issueHeader.layoutSizingVertical = 'HUG';

            const severityIcon = figma.createText();
            severityIcon.characters = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
            severityIcon.fontSize = 14;
            issueHeader.appendChild(severityIcon);

            const issueName = figma.createText();
            issueName.characters = issue.name;
            issueName.fontSize = 14;
            issueName.fontName = { family: 'Inter', style: 'Medium' };
            issueName.fills = [{ type: 'SOLID', color: COLORS.lightGray }];
            issueHeader.appendChild(issueName);

            issueRow.appendChild(issueHeader);

            // Component links row
            const componentsRow = figma.createFrame();
            componentsRow.name = 'Components';
            componentsRow.fills = [];
            componentsRow.layoutMode = 'HORIZONTAL';
            componentsRow.itemSpacing = 8;
            componentsRow.layoutSizingHorizontal = 'HUG';
            componentsRow.layoutSizingVertical = 'HUG';
            componentsRow.paddingLeft = 22; // Indent under icon

            const matches = issue.libraryMatches || issue.suggestedComponents.map(c => ({ name: c }));

            for (const match of matches) {
                const link = findComponentLink(match.name);

                const componentTag = figma.createFrame();
                componentTag.name = match.name;
                componentTag.fills = [{ type: 'SOLID', color: COLORS.accent }];
                componentTag.cornerRadius = 6;
                componentTag.layoutMode = 'HORIZONTAL';
                componentTag.itemSpacing = 4;
                componentTag.paddingTop = 4;
                componentTag.paddingBottom = 4;
                componentTag.paddingLeft = 8;
                componentTag.paddingRight = 8;
                componentTag.layoutSizingHorizontal = 'HUG';
                componentTag.layoutSizingVertical = 'HUG';

                const tagIcon = figma.createText();
                tagIcon.characters = '🔗';
                tagIcon.fontSize = 10;
                componentTag.appendChild(tagIcon);

                const tagName = figma.createText();
                tagName.characters = match.libraryName || match.name;
                tagName.fontSize = 10;
                tagName.fontName = { family: 'Inter', style: 'SemiBold' };
                tagName.fills = [{ type: 'SOLID', color: COLORS.white }];
                componentTag.appendChild(tagName);

                // Add hyperlink if available
                if (link) {
                    tagName.hyperlink = { type: 'URL', value: link.url };
                }

                componentsRow.appendChild(componentTag);
            }

            issueRow.appendChild(componentsRow);
            screenSection.appendChild(issueRow);
        }

        report.appendChild(screenSection);
    }

    // ========== FLOW ISSUES ==========
    if (result.flowIssues.deadEnds.length > 0) {
        const flowSection = figma.createFrame();
        flowSection.name = 'Flow Issues';
        flowSection.fills = [{ type: 'SOLID', color: COLORS.cardBg }];
        flowSection.cornerRadius = 16;
        flowSection.layoutMode = 'VERTICAL';
        flowSection.itemSpacing = 12;
        flowSection.paddingTop = 20;
        flowSection.paddingBottom = 20;
        flowSection.paddingLeft = 20;
        flowSection.paddingRight = 20;
        flowSection.layoutSizingHorizontal = 'FILL';
        flowSection.layoutSizingVertical = 'HUG';

        const flowTitle = figma.createText();
        flowTitle.characters = '🧭 Flow Issues';
        flowTitle.fontSize = 16;
        flowTitle.fontName = { family: 'Inter', style: 'SemiBold' };
        flowTitle.fills = [{ type: 'SOLID', color: COLORS.white }];
        flowSection.appendChild(flowTitle);

        const deadEndsText = figma.createText();
        deadEndsText.characters = `🚫 Dead ends: ${result.flowIssues.deadEnds.join(', ')}`;
        deadEndsText.fontSize = 12;
        deadEndsText.fontName = { family: 'Inter', style: 'Regular' };
        deadEndsText.fills = [{ type: 'SOLID', color: COLORS.warning }];
        flowSection.appendChild(deadEndsText);

        report.appendChild(flowSection);
    }

    // ========== FOOTER ==========
    const footer = figma.createFrame();
    footer.name = 'Footer';
    footer.fills = [];
    footer.layoutMode = 'HORIZONTAL';
    footer.itemSpacing = 8;
    footer.layoutSizingHorizontal = 'HUG';
    footer.layoutSizingVertical = 'HUG';
    footer.primaryAxisAlignItems = 'CENTER';

    const footerText = figma.createText();
    footerText.characters = 'Linked to';
    footerText.fontSize = 12;
    footerText.fontName = { family: 'Inter', style: 'Regular' };
    footerText.fills = [{ type: 'SOLID', color: COLORS.gray }];
    footer.appendChild(footerText);

    const footerLink = figma.createText();
    footerLink.characters = 'shadcn/ui 💜';
    footerLink.fontSize = 12;
    footerLink.fontName = { family: 'Inter', style: 'SemiBold' };
    footerLink.fills = [{ type: 'SOLID', color: COLORS.accentLight }];
    footerLink.hyperlink = { type: 'URL', value: 'https://www.figma.com/design/lmUgIGwdG2ZaVfvZzFuU2H/-shadcn-ui---Design-System--Community-' };
    footer.appendChild(footerLink);

    report.appendChild(footer);

    // Add to page and select
    figma.currentPage.appendChild(report);
    figma.currentPage.selection = [report];
    figma.viewport.scrollAndZoomIntoView([report]);

    return report;
}

// Handle messages from UI
figma.ui.onmessage = async (msg: PluginMessage) => {
    switch (msg.type) {
        case 'analyze': {
            const screens = exportSelectedFrames();

            if (screens.length === 0) {
                figma.ui.postMessage({
                    type: 'error',
                    payload: { message: 'Please select at least one frame to analyze' }
                });
                return;
            }

            // Send screen data to UI for analysis
            figma.ui.postMessage({
                type: 'screens-exported',
                payload: { screens, timestamp: new Date().toISOString() }
            });
            break;
        }

        case 'analysis-complete': {
            const resultPayload = msg.payload as { result: AnalysisResult };
            lastAnalysisResult = resultPayload.result;

            // Enrich results with library component links
            const enrichedScreens: EnrichedScreen[] = resultPayload.result.screens.map(screen => ({
                ...screen,
                issues: screen.issues.map(issue => {
                    const matches: LibraryMatch[] = issue.suggestedComponents.map(comp => {
                        const link = findComponentLink(comp);
                        return link
                            ? { name: comp, libraryUrl: link.url, libraryName: link.name }
                            : { name: comp };
                    });
                    return { ...issue, libraryMatches: matches };
                })
            }));

            enrichedScreensCache = enrichedScreens;

            figma.ui.postMessage({
                type: 'results-enriched',
                payload: { screens: enrichedScreens }
            });

            figma.notify(`✅ Analysis complete: ${resultPayload.result.totalIssues} issues found`, { timeout: 3000 });
            break;
        }

        case 'find-component': {
            const { componentName } = msg.payload as { componentName: string };
            const link = findComponentLink(componentName);
            figma.ui.postMessage({
                type: 'component-found',
                payload: link
                    ? { found: true, name: link.name, url: link.url }
                    : { found: false, name: componentName }
            });
            break;
        }

        case 'insert-placeholders': {
            const report = await createReportFrame();
            if (report) {
                figma.notify(`✅ Created report frame`, { timeout: 2000 });
            }
            break;
        }

        case 'generate-report': {
            const report = await createReportFrame();
            if (report) {
                figma.notify(`✅ Report generated!`, { timeout: 2000 });
            }
            break;
        }

        case 'load-library': {
            const status = getLibraryStatus();
            figma.ui.postMessage({
                type: 'library-loaded',
                payload: {
                    componentCount: status.available,
                    components: status.components
                }
            });
            break;
        }
    }
};

// Listen for selection changes
figma.on('selectionchange', sendSelectionUpdate);

// Initialize
sendSelectionUpdate();

// Send library status on load
const libStatus = getLibraryStatus();
figma.ui.postMessage({
    type: 'library-loaded',
    payload: {
        componentCount: libStatus.available,
        components: libStatus.components
    }
});
