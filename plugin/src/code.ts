// Main Plugin Code - Edgy Flow Analyzer with Component Suggestions

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

// Component data
interface ComponentInfo {
    name: string;
    nodeId: string;
    description: string;
    icon: string;
    aliases: string[];
}

const componentLibrary: ComponentInfo[] = [
    { name: 'Alert', nodeId: '4-6598', description: 'Error/warning messages', icon: '⚠️', aliases: ['alert', 'error', 'warning'] },
    { name: 'AlertDialog', nodeId: '4-6598', description: 'Confirmation dialogs', icon: '🗨️', aliases: ['alert-dialog', 'confirm'] },
    { name: 'Button', nodeId: '13-1070', description: 'Action buttons', icon: '🔘', aliases: ['button', 'btn', 'cta'] },
    { name: 'Input', nodeId: '13-1256', description: 'Form inputs', icon: '📝', aliases: ['input', 'text-field', 'form'] },
    { name: 'Dialog', nodeId: '13-1026', description: 'Modal windows', icon: '📋', aliases: ['dialog', 'modal', 'popup'] },
    { name: 'Progress', nodeId: '13-1306', description: 'Progress bars', icon: '⏳', aliases: ['progress', 'loading-bar'] },
    { name: 'Skeleton', nodeId: '13-1070', description: 'Loading placeholders', icon: '🦴', aliases: ['skeleton', 'loader'] },
    { name: 'Toast', nodeId: '4-6598', description: 'Notifications', icon: '🍞', aliases: ['toast', 'snackbar'] },
    { name: 'Card', nodeId: '13-1026', description: 'Content containers', icon: '📦', aliases: ['card', 'container'] },
    { name: 'Badge', nodeId: '13-1070', description: 'Status indicators', icon: '🏷️', aliases: ['badge', 'tag', 'label'] },
];

function findComponentInfo(name: string): ComponentInfo | null {
    const n = name.toLowerCase();
    return componentLibrary.find(c => c.name.toLowerCase() === n || c.aliases.some(a => n.includes(a))) || null;
}

function findComponentLink(name: string): { name: string; url: string } | null {
    const info = findComponentInfo(name);
    return info ? { name: info.name, url: SHADCN_FILE_BASE + info.nodeId } : null;
}

function getLibraryStatus() {
    return { available: componentLibrary.length, components: componentLibrary.map(c => c.name) };
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
                            triggerNodeId: node.id,
                            triggerNodeName: node.name,
                            targetFrameId: target.id,
                            targetFrameName: target.name
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
            id: frame.id,
            name: frame.name,
            width: frame.width,
            height: frame.height,
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
    } as PluginMessage);
}

// Colors
const COLORS = {
    bg: { r: 0.08, g: 0.08, b: 0.1 },
    cardBg: { r: 0.12, g: 0.12, b: 0.14 },
    accent: { r: 0.486, g: 0.227, b: 0.929 },
    accentLight: { r: 0.659, g: 0.333, b: 0.969 },
    critical: { r: 0.91, g: 0.3, b: 0.24 },
    warning: { r: 0.95, g: 0.61, b: 0.07 },
    info: { r: 0.2, g: 0.6, b: 0.86 },
    white: { r: 1, g: 1, b: 1 },
    gray: { r: 0.6, g: 0.6, b: 0.65 },
    lightGray: { r: 0.85, g: 0.85, b: 0.88 },
};

// Create the full report + components frame
async function createFullReport(): Promise<FrameNode | null> {
    // Check if we have analysis data
    if (!lastAnalysisResult) {
        figma.notify('⚠️ Please run Analyze Flow first!', { error: true });
        return null;
    }

    if (enrichedScreensCache.length === 0) {
        figma.notify('⚠️ No screens to report on', { error: true });
        return null;
    }

    try {
        // Load fonts
        await figma.loadFontAsync({ family: 'Roboto', style: 'Bold' });
        await figma.loadFontAsync({ family: 'Roboto', style: 'Bold' });
        await figma.loadFontAsync({ family: 'Roboto', style: 'Regular' });
        await figma.loadFontAsync({ family: 'Roboto', style: 'Regular' });
    } catch (e) {
        figma.notify('⚠️ Could not load fonts', { error: true });
        return null;
    }

    const result = lastAnalysisResult;
    const screens = enrichedScreensCache;

    // Get position (right of selected frames)
    const selectedFrames = getSelectedFrames();
    let maxX = 100, minY = 100;
    if (selectedFrames.length > 0) {
        selectedFrames.forEach(f => {
            if (f.x + f.width > maxX) maxX = f.x + f.width;
            if (minY === 100 || f.y < minY) minY = f.y;
        });
        maxX += 100;
    }

    // ============ MAIN CONTAINER ============
    const report = figma.createFrame();
    report.name = '📋 Edge Case Report + Components';
    report.x = maxX;
    report.y = minY;
    report.resize(450, 100); // Will auto-resize
    report.fills = [{ type: 'SOLID', color: COLORS.bg }];
    report.cornerRadius = 24;
    report.layoutMode = 'VERTICAL';
    report.primaryAxisSizingMode = 'AUTO';
    report.counterAxisSizingMode = 'FIXED';
    report.paddingTop = 32;
    report.paddingBottom = 32;
    report.paddingLeft = 32;
    report.paddingRight = 32;
    report.itemSpacing = 24;

    // ============ HEADER ============
    const header = figma.createFrame();
    header.name = 'Header';
    header.fills = [];
    header.layoutMode = 'VERTICAL';
    header.primaryAxisSizingMode = 'AUTO';
    header.counterAxisSizingMode = 'AUTO';
    header.itemSpacing = 8;

    const title = figma.createText();
    title.characters = '⚡ Edge Case Report';
    title.fontSize = 28;
    title.fontName = { family: 'Roboto', style: 'Bold' };
    title.fills = [{ type: 'SOLID', color: COLORS.white }];
    header.appendChild(title);

    const subtitle = figma.createText();
    subtitle.characters = `${new Date().toLocaleDateString()} • ${result.totalScreens} screens • ${result.totalIssues} issues`;
    subtitle.fontSize = 14;
    subtitle.fontName = { family: 'Roboto', style: 'Regular' };
    subtitle.fills = [{ type: 'SOLID', color: COLORS.gray }];
    header.appendChild(subtitle);

    report.appendChild(header);

    // ============ STATS ROW ============
    const statsRow = figma.createFrame();
    statsRow.name = 'Stats';
    statsRow.fills = [{ type: 'SOLID', color: COLORS.cardBg }];
    statsRow.cornerRadius = 16;
    statsRow.layoutMode = 'HORIZONTAL';
    statsRow.primaryAxisSizingMode = 'AUTO';
    statsRow.counterAxisSizingMode = 'AUTO';
    statsRow.itemSpacing = 0;

    const addStat = (value: number, label: string, color: RGB) => {
        const stat = figma.createFrame();
        stat.name = label;
        stat.fills = [];
        stat.layoutMode = 'VERTICAL';
        stat.primaryAxisSizingMode = 'AUTO';
        stat.counterAxisSizingMode = 'AUTO';
        stat.primaryAxisAlignItems = 'CENTER';
        stat.counterAxisAlignItems = 'CENTER';
        stat.paddingTop = 16;
        stat.paddingBottom = 16;
        stat.paddingLeft = 24;
        stat.paddingRight = 24;
        stat.itemSpacing = 4;

        const val = figma.createText();
        val.characters = value.toString();
        val.fontSize = 28;
        val.fontName = { family: 'Roboto', style: 'Bold' };
        val.fills = [{ type: 'SOLID', color }];
        stat.appendChild(val);

        const lbl = figma.createText();
        lbl.characters = label;
        lbl.fontSize = 11;
        lbl.fontName = { family: 'Roboto', style: 'Regular' };
        lbl.fills = [{ type: 'SOLID', color: COLORS.gray }];
        stat.appendChild(lbl);

        statsRow.appendChild(stat);
    };

    addStat(result.totalIssues, 'Total', COLORS.white);
    addStat(result.criticalCount, 'Critical', COLORS.critical);
    addStat(result.warningCount, 'Warning', COLORS.warning);
    addStat(result.infoCount, 'Info', COLORS.info);

    report.appendChild(statsRow);

    // ============ ISSUES BY SCREEN ============
    for (const screen of screens) {
        if (screen.issues.length === 0) continue;

        const section = figma.createFrame();
        section.name = screen.screenName;
        section.fills = [{ type: 'SOLID', color: COLORS.cardBg }];
        section.cornerRadius = 16;
        section.layoutMode = 'VERTICAL';
        section.primaryAxisSizingMode = 'AUTO';
        section.counterAxisSizingMode = 'FIXED';
        section.layoutAlign = 'STRETCH';
        section.paddingTop = 16;
        section.paddingBottom = 16;
        section.paddingLeft = 20;
        section.paddingRight = 20;
        section.itemSpacing = 12;

        const screenTitle = figma.createText();
        screenTitle.characters = `📱 ${screen.screenName}`;
        screenTitle.fontSize = 16;
        screenTitle.fontName = { family: 'Roboto', style: 'Bold' };
        screenTitle.fills = [{ type: 'SOLID', color: COLORS.white }];
        section.appendChild(screenTitle);

        for (const issue of screen.issues) {
            const issueRow = figma.createFrame();
            issueRow.name = issue.name;
            issueRow.fills = [];
            issueRow.layoutMode = 'VERTICAL';
            issueRow.primaryAxisSizingMode = 'AUTO';
            issueRow.counterAxisSizingMode = 'FIXED';
            issueRow.layoutAlign = 'STRETCH';
            issueRow.itemSpacing = 6;

            // Issue name with severity
            const issueHeader = figma.createFrame();
            issueHeader.name = 'Header';
            issueHeader.fills = [];
            issueHeader.layoutMode = 'HORIZONTAL';
            issueHeader.primaryAxisSizingMode = 'AUTO';
            issueHeader.counterAxisSizingMode = 'AUTO';
            issueHeader.itemSpacing = 8;

            const icon = figma.createText();
            icon.characters = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
            icon.fontSize = 14;
            issueHeader.appendChild(icon);

            const issueName = figma.createText();
            issueName.characters = issue.name;
            issueName.fontSize = 14;
            issueName.fontName = { family: 'Roboto', style: 'Regular' };
            issueName.fills = [{ type: 'SOLID', color: COLORS.lightGray }];
            issueHeader.appendChild(issueName);

            issueRow.appendChild(issueHeader);

            // Component tags with links
            const tagsRow = figma.createFrame();
            tagsRow.name = 'Tags';
            tagsRow.fills = [];
            tagsRow.layoutMode = 'HORIZONTAL';
            tagsRow.primaryAxisSizingMode = 'AUTO';
            tagsRow.counterAxisSizingMode = 'AUTO';
            tagsRow.itemSpacing = 8;
            tagsRow.paddingLeft = 22;

            for (const comp of issue.suggestedComponents) {
                const info = findComponentInfo(comp);
                if (!info) continue;

                const tag = figma.createFrame();
                tag.name = info.name;
                tag.fills = [{ type: 'SOLID', color: COLORS.accent }];
                tag.cornerRadius = 6;
                tag.layoutMode = 'HORIZONTAL';
                tag.primaryAxisSizingMode = 'AUTO';
                tag.counterAxisSizingMode = 'AUTO';
                tag.paddingTop = 4;
                tag.paddingBottom = 4;
                tag.paddingLeft = 8;
                tag.paddingRight = 8;
                tag.itemSpacing = 4;

                const tagText = figma.createText();
                tagText.characters = `🔗 ${info.name}`;
                tagText.fontSize = 10;
                tagText.fontName = { family: 'Roboto', style: 'Bold' };
                tagText.fills = [{ type: 'SOLID', color: COLORS.white }];
                tagText.hyperlink = { type: 'URL', value: SHADCN_FILE_BASE + info.nodeId };
                tag.appendChild(tagText);

                tagsRow.appendChild(tag);
            }

            issueRow.appendChild(tagsRow);
            section.appendChild(issueRow);
        }

        report.appendChild(section);
    }

    // ============ SUGGESTED COMPONENTS SECTION ============
    const compSection = figma.createFrame();
    compSection.name = '📦 Suggested Components';
    compSection.fills = [{ type: 'SOLID', color: COLORS.cardBg }];
    compSection.cornerRadius = 16;
    compSection.layoutMode = 'VERTICAL';
    compSection.primaryAxisSizingMode = 'AUTO';
    compSection.counterAxisSizingMode = 'FIXED';
    compSection.layoutAlign = 'STRETCH';
    compSection.paddingTop = 20;
    compSection.paddingBottom = 20;
    compSection.paddingLeft = 20;
    compSection.paddingRight = 20;
    compSection.itemSpacing = 16;

    const compTitle = figma.createText();
    compTitle.characters = '📦 Suggested Components';
    compTitle.fontSize = 18;
    compTitle.fontName = { family: 'Roboto', style: 'Bold' };
    compTitle.fills = [{ type: 'SOLID', color: COLORS.white }];
    compSection.appendChild(compTitle);

    // Collect unique components
    const uniqueComps = new Set<string>();
    for (const screen of screens) {
        for (const issue of screen.issues) {
            issue.suggestedComponents.forEach(c => {
                const info = findComponentInfo(c);
                if (info) uniqueComps.add(info.name);
            });
        }
    }

    // Component cards in a vertical list
    for (const compName of uniqueComps) {
        const info = componentLibrary.find(c => c.name === compName);
        if (!info) continue;

        const card = figma.createFrame();
        card.name = info.name;
        card.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.17 } }];
        card.cornerRadius = 10;
        card.layoutMode = 'HORIZONTAL';
        card.primaryAxisSizingMode = 'AUTO';
        card.counterAxisSizingMode = 'FIXED';
        card.layoutAlign = 'STRETCH';
        card.primaryAxisAlignItems = 'SPACE_BETWEEN';
        card.counterAxisAlignItems = 'CENTER';
        card.paddingTop = 12;
        card.paddingBottom = 12;
        card.paddingLeft = 16;
        card.paddingRight = 16;
        card.itemSpacing = 16;

        // Left: icon + name + desc
        const left = figma.createFrame();
        left.name = 'Info';
        left.fills = [];
        left.layoutMode = 'HORIZONTAL';
        left.primaryAxisSizingMode = 'AUTO';
        left.counterAxisSizingMode = 'AUTO';
        left.counterAxisAlignItems = 'CENTER';
        left.itemSpacing = 10;

        const cardIcon = figma.createText();
        cardIcon.characters = info.icon;
        cardIcon.fontSize = 20;
        left.appendChild(cardIcon);

        const nameCol = figma.createFrame();
        nameCol.name = 'Name';
        nameCol.fills = [];
        nameCol.layoutMode = 'VERTICAL';
        nameCol.primaryAxisSizingMode = 'AUTO';
        nameCol.counterAxisSizingMode = 'AUTO';
        nameCol.itemSpacing = 2;

        const cardName = figma.createText();
        cardName.characters = info.name;
        cardName.fontSize = 14;
        cardName.fontName = { family: 'Roboto', style: 'Bold' };
        cardName.fills = [{ type: 'SOLID', color: COLORS.white }];
        nameCol.appendChild(cardName);

        const cardDesc = figma.createText();
        cardDesc.characters = info.description;
        cardDesc.fontSize = 11;
        cardDesc.fontName = { family: 'Roboto', style: 'Regular' };
        cardDesc.fills = [{ type: 'SOLID', color: COLORS.gray }];
        nameCol.appendChild(cardDesc);

        left.appendChild(nameCol);
        card.appendChild(left);

        // Right: link button
        const linkBtn = figma.createFrame();
        linkBtn.name = 'Link';
        linkBtn.fills = [{ type: 'SOLID', color: COLORS.accent }];
        linkBtn.cornerRadius = 6;
        linkBtn.layoutMode = 'HORIZONTAL';
        linkBtn.primaryAxisSizingMode = 'AUTO';
        linkBtn.counterAxisSizingMode = 'AUTO';
        linkBtn.paddingTop = 6;
        linkBtn.paddingBottom = 6;
        linkBtn.paddingLeft = 12;
        linkBtn.paddingRight = 12;

        const linkText = figma.createText();
        linkText.characters = '🔗 View';
        linkText.fontSize = 11;
        linkText.fontName = { family: 'Roboto', style: 'Bold' };
        linkText.fills = [{ type: 'SOLID', color: COLORS.white }];
        linkText.hyperlink = { type: 'URL', value: SHADCN_FILE_BASE + info.nodeId };
        linkBtn.appendChild(linkText);

        card.appendChild(linkBtn);
        compSection.appendChild(card);
    }

    report.appendChild(compSection);

    // ============ FOOTER ============
    const footer = figma.createFrame();
    footer.name = 'Footer';
    footer.fills = [];
    footer.layoutMode = 'HORIZONTAL';
    footer.primaryAxisSizingMode = 'AUTO';
    footer.counterAxisSizingMode = 'AUTO';
    footer.itemSpacing = 6;

    const footerText = figma.createText();
    footerText.characters = 'Linked to';
    footerText.fontSize = 12;
    footerText.fontName = { family: 'Roboto', style: 'Regular' };
    footerText.fills = [{ type: 'SOLID', color: COLORS.gray }];
    footer.appendChild(footerText);

    const footerLink = figma.createText();
    footerLink.characters = 'shadcn/ui 💜';
    footerLink.fontSize = 12;
    footerLink.fontName = { family: 'Roboto', style: 'Bold' };
    footerLink.fills = [{ type: 'SOLID', color: COLORS.accentLight }];
    footerLink.hyperlink = { type: 'URL', value: 'https://www.figma.com/design/lmUgIGwdG2ZaVfvZzFuU2H/-shadcn-ui---Design-System--Community-' };
    footer.appendChild(footerLink);

    report.appendChild(footer);

    // Add to page
    figma.currentPage.appendChild(report);
    figma.currentPage.selection = [report];
    figma.viewport.scrollAndZoomIntoView([report]);

    return report;
}

// Handle messages from UI
figma.ui.onmessage = async (msg: PluginMessage) => {
    console.log('Received message:', msg.type);

    switch (msg.type) {
        case 'analyze': {
            const screens = exportSelectedFrames();
            if (screens.length === 0) {
                figma.ui.postMessage({ type: 'error', payload: { message: 'Please select at least one frame' } });
                return;
            }
            figma.ui.postMessage({ type: 'screens-exported', payload: { screens, timestamp: new Date().toISOString() } });
            break;
        }

        case 'analysis-complete': {
            const { result } = msg.payload as { result: AnalysisResult };
            lastAnalysisResult = result;

            const enrichedScreens: EnrichedScreen[] = result.screens.map(screen => ({
                ...screen,
                issues: screen.issues.map(issue => {
                    const matches: LibraryMatch[] = issue.suggestedComponents.map(comp => {
                        const link = findComponentLink(comp);
                        return link ? { name: comp, libraryUrl: link.url, libraryName: link.name } : { name: comp };
                    });
                    return { ...issue, libraryMatches: matches };
                })
            }));

            enrichedScreensCache = enrichedScreens;
            figma.ui.postMessage({ type: 'results-enriched', payload: { screens: enrichedScreens } });
            figma.notify(`✅ ${result.totalIssues} issues found`, { timeout: 3000 });
            break;
        }

        case 'insert-placeholders':
        case 'generate-report': {
            console.log('Creating report...');
            const report = await createFullReport();
            if (report) {
                figma.notify(`✅ Report created!`, { timeout: 2000 });
            }
            break;
        }

        case 'load-library': {
            const status = getLibraryStatus();
            figma.ui.postMessage({ type: 'library-loaded', payload: { componentCount: status.available, components: status.components } });
            break;
        }
    }
};

figma.on('selectionchange', sendSelectionUpdate);
sendSelectionUpdate();

const libStatus = getLibraryStatus();
figma.ui.postMessage({ type: 'library-loaded', payload: { componentCount: libStatus.available, components: libStatus.components } });
