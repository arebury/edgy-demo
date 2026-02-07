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

// Component data with visual representation info
interface ComponentInfo {
    name: string;
    nodeId: string;
    description: string;
    color: RGB;
    icon: string;
    aliases: string[];
}

const componentLibrary: ComponentInfo[] = [
    {
        name: 'Alert',
        nodeId: '4-6598',
        description: 'Error messages, warnings, success notifications',
        color: { r: 0.91, g: 0.3, b: 0.24 },
        icon: '⚠️',
        aliases: ['alert', 'error-message', 'warning', 'notification']
    },
    {
        name: 'AlertDialog',
        nodeId: '4-6598',
        description: 'Confirmation dialogs, destructive action warnings',
        color: { r: 0.91, g: 0.3, b: 0.24 },
        icon: '🗨️',
        aliases: ['alert-dialog', 'confirm', 'confirmation']
    },
    {
        name: 'Button',
        nodeId: '13-1070',
        description: 'Primary, secondary, destructive actions',
        color: { r: 0.486, g: 0.227, b: 0.929 },
        icon: '🔘',
        aliases: ['button', 'btn', 'cta', 'submit']
    },
    {
        name: 'Input',
        nodeId: '13-1256',
        description: 'Text fields, form inputs with validation',
        color: { r: 0.2, g: 0.6, b: 0.86 },
        icon: '📝',
        aliases: ['input', 'text-field', 'form-field', 'textfield']
    },
    {
        name: 'Dialog',
        nodeId: '13-1026',
        description: 'Modal windows, popups',
        color: { r: 0.4, g: 0.4, b: 0.5 },
        icon: '📋',
        aliases: ['dialog', 'modal', 'popup', 'overlay']
    },
    {
        name: 'Progress',
        nodeId: '13-1306',
        description: 'Loading bars, progress indicators',
        color: { r: 0.2, g: 0.7, b: 0.4 },
        icon: '⏳',
        aliases: ['progress', 'loading-bar', 'progress-bar']
    },
    {
        name: 'Skeleton',
        nodeId: '13-1070',
        description: 'Loading placeholders',
        color: { r: 0.5, g: 0.5, b: 0.55 },
        icon: '🦴',
        aliases: ['skeleton', 'loader', 'loading', 'placeholder']
    },
    {
        name: 'Toast',
        nodeId: '4-6598',
        description: 'Temporary notifications',
        color: { r: 0.2, g: 0.7, b: 0.4 },
        icon: '🍞',
        aliases: ['toast', 'snackbar', 'message']
    },
    {
        name: 'Card',
        nodeId: '13-1026',
        description: 'Content containers, empty states',
        color: { r: 0.3, g: 0.3, b: 0.35 },
        icon: '📦',
        aliases: ['card', 'container', 'box']
    },
    {
        name: 'Badge',
        nodeId: '13-1070',
        description: 'Status indicators, tags',
        color: { r: 0.95, g: 0.61, b: 0.07 },
        icon: '🏷️',
        aliases: ['badge', 'tag', 'label', 'status']
    },
];

// Find component info by name
function findComponentInfo(suggestedName: string): ComponentInfo | null {
    const normalized = suggestedName.toLowerCase();
    return componentLibrary.find(c =>
        c.name.toLowerCase() === normalized ||
        c.aliases.some(a => normalized.includes(a))
    ) || null;
}

// Find component link by name
function findComponentLink(suggestedName: string): { name: string; url: string } | null {
    const info = findComponentInfo(suggestedName);
    if (info) {
        return {
            name: info.name,
            url: SHADCN_FILE_BASE + info.nodeId
        };
    }
    return null;
}

// Get library status for UI
function getLibraryStatus(): { available: number; components: string[] } {
    return {
        available: componentLibrary.length,
        components: componentLibrary.map(c => c.name)
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
    accent: { r: 0.486, g: 0.227, b: 0.929 },
    accentLight: { r: 0.659, g: 0.333, b: 0.969 },
    critical: { r: 0.91, g: 0.3, b: 0.24 },
    warning: { r: 0.95, g: 0.61, b: 0.07 },
    info: { r: 0.2, g: 0.6, b: 0.86 },
    white: { r: 1, g: 1, b: 1 },
    gray: { r: 0.6, g: 0.6, b: 0.65 },
    lightGray: { r: 0.85, g: 0.85, b: 0.88 },
};

// Create a single component card
async function createComponentCard(info: ComponentInfo, forIssue: string): Promise<FrameNode> {
    const card = figma.createFrame();
    card.name = `${info.icon} ${info.name}`;
    card.fills = [{ type: 'SOLID', color: COLORS.cardBg }];
    card.cornerRadius = 12;
    card.layoutMode = 'VERTICAL';
    card.itemSpacing = 8;
    card.paddingTop = 16;
    card.paddingBottom = 16;
    card.paddingLeft = 16;
    card.paddingRight = 16;
    card.layoutSizingHorizontal = 'FIXED';
    card.layoutSizingVertical = 'HUG';
    card.resize(160, 100);

    // Color accent bar at top
    const accent = figma.createFrame();
    accent.name = 'Accent';
    accent.resize(128, 4);
    accent.fills = [{ type: 'SOLID', color: info.color }];
    accent.cornerRadius = 2;
    accent.layoutSizingHorizontal = 'FILL';
    card.appendChild(accent);

    // Icon and name row
    const nameRow = figma.createFrame();
    nameRow.name = 'Name';
    nameRow.fills = [];
    nameRow.layoutMode = 'HORIZONTAL';
    nameRow.itemSpacing = 6;
    nameRow.layoutSizingHorizontal = 'FILL';
    nameRow.layoutSizingVertical = 'HUG';

    const icon = figma.createText();
    icon.characters = info.icon;
    icon.fontSize = 16;
    nameRow.appendChild(icon);

    const name = figma.createText();
    name.characters = info.name;
    name.fontSize = 14;
    name.fontName = { family: 'Inter', style: 'Bold' };
    name.fills = [{ type: 'SOLID', color: COLORS.white }];
    nameRow.appendChild(name);

    card.appendChild(nameRow);

    // Description
    const desc = figma.createText();
    desc.characters = info.description;
    desc.fontSize = 10;
    desc.fontName = { family: 'Inter', style: 'Regular' };
    desc.fills = [{ type: 'SOLID', color: COLORS.gray }];
    desc.layoutSizingHorizontal = 'FILL';
    desc.textAutoResize = 'HEIGHT';
    card.appendChild(desc);

    // For issue label
    const issueLabel = figma.createText();
    issueLabel.characters = `← ${forIssue}`;
    issueLabel.fontSize = 9;
    issueLabel.fontName = { family: 'Inter', style: 'Medium' };
    issueLabel.fills = [{ type: 'SOLID', color: info.color }];
    card.appendChild(issueLabel);

    // Link text
    const link = figma.createText();
    link.characters = '🔗 View in shadcn';
    link.fontSize = 10;
    link.fontName = { family: 'Inter', style: 'SemiBold' };
    link.fills = [{ type: 'SOLID', color: COLORS.accentLight }];
    link.hyperlink = { type: 'URL', value: SHADCN_FILE_BASE + info.nodeId };
    card.appendChild(link);

    return card;
}

// Create Suggested Components frame
async function createSuggestedComponentsFrame(): Promise<FrameNode | null> {
    if (!lastAnalysisResult || enrichedScreensCache.length === 0) {
        figma.notify('⚠️ Please run analysis first', { error: true });
        return null;
    }

    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'SemiBold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

    // Collect unique components needed
    const componentsNeeded = new Map<string, { info: ComponentInfo; issues: string[] }>();

    for (const screen of enrichedScreensCache) {
        for (const issue of screen.issues) {
            for (const comp of issue.suggestedComponents) {
                const info = findComponentInfo(comp);
                if (info) {
                    const existing = componentsNeeded.get(info.name);
                    if (existing) {
                        existing.issues.push(issue.name);
                    } else {
                        componentsNeeded.set(info.name, { info, issues: [issue.name] });
                    }
                }
            }
        }
    }

    if (componentsNeeded.size === 0) {
        figma.notify('✅ No components needed!', { timeout: 2000 });
        return null;
    }

    // Position to the right of selected frames
    const selectedFrames = getSelectedFrames();
    let maxX = 0, minY = 0;
    selectedFrames.forEach(f => {
        if (f.x + f.width > maxX) maxX = f.x + f.width;
        if (minY === 0 || f.y < minY) minY = f.y;
    });

    // Main container
    const container = figma.createFrame();
    container.name = '📦 Suggested Components';
    container.x = maxX + 100;
    container.y = minY;
    container.fills = [{ type: 'SOLID', color: COLORS.bg }];
    container.cornerRadius = 24;
    container.layoutMode = 'VERTICAL';
    container.itemSpacing = 20;
    container.paddingTop = 24;
    container.paddingBottom = 24;
    container.paddingLeft = 24;
    container.paddingRight = 24;
    container.layoutSizingHorizontal = 'HUG';
    container.layoutSizingVertical = 'HUG';

    // Header
    const header = figma.createFrame();
    header.name = 'Header';
    header.fills = [];
    header.layoutMode = 'VERTICAL';
    header.itemSpacing = 4;
    header.layoutSizingHorizontal = 'HUG';
    header.layoutSizingVertical = 'HUG';

    const titleRow = figma.createFrame();
    titleRow.name = 'Title';
    titleRow.fills = [];
    titleRow.layoutMode = 'HORIZONTAL';
    titleRow.itemSpacing = 8;
    titleRow.layoutSizingHorizontal = 'HUG';
    titleRow.layoutSizingVertical = 'HUG';

    const icon = figma.createText();
    icon.characters = '📦';
    icon.fontSize = 24;
    titleRow.appendChild(icon);

    const title = figma.createText();
    title.characters = 'Suggested Components';
    title.fontSize = 24;
    title.fontName = { family: 'Inter', style: 'Bold' };
    title.fills = [{ type: 'SOLID', color: COLORS.white }];
    titleRow.appendChild(title);

    header.appendChild(titleRow);

    const subtitle = figma.createText();
    subtitle.characters = `${componentsNeeded.size} components from shadcn/ui • Click links to view`;
    subtitle.fontSize = 12;
    subtitle.fontName = { family: 'Inter', style: 'Regular' };
    subtitle.fills = [{ type: 'SOLID', color: COLORS.gray }];
    header.appendChild(subtitle);

    container.appendChild(header);

    // Components grid
    const grid = figma.createFrame();
    grid.name = 'Components Grid';
    grid.fills = [];
    grid.layoutMode = 'HORIZONTAL';
    grid.layoutWrap = 'WRAP';
    grid.itemSpacing = 12;
    grid.counterAxisSpacing = 12;
    grid.layoutSizingHorizontal = 'HUG';
    grid.layoutSizingVertical = 'HUG';
    grid.maxWidth = 520;

    for (const [, data] of componentsNeeded) {
        const card = await createComponentCard(data.info, data.issues[0]);
        grid.appendChild(card);
    }

    container.appendChild(grid);

    // Footer
    const footer = figma.createFrame();
    footer.name = 'Footer';
    footer.fills = [];
    footer.layoutMode = 'HORIZONTAL';
    footer.itemSpacing = 4;
    footer.layoutSizingHorizontal = 'HUG';
    footer.layoutSizingVertical = 'HUG';

    const footerText = figma.createText();
    footerText.characters = 'From';
    footerText.fontSize = 11;
    footerText.fontName = { family: 'Inter', style: 'Regular' };
    footerText.fills = [{ type: 'SOLID', color: COLORS.gray }];
    footer.appendChild(footerText);

    const footerLink = figma.createText();
    footerLink.characters = 'shadcn/ui Design System 💜';
    footerLink.fontSize = 11;
    footerLink.fontName = { family: 'Inter', style: 'SemiBold' };
    footerLink.fills = [{ type: 'SOLID', color: COLORS.accentLight }];
    footerLink.hyperlink = { type: 'URL', value: 'https://www.figma.com/design/lmUgIGwdG2ZaVfvZzFuU2H/-shadcn-ui---Design-System--Community-' };
    footer.appendChild(footerLink);

    container.appendChild(footer);

    figma.currentPage.appendChild(container);
    figma.currentPage.selection = [container];
    figma.viewport.scrollAndZoomIntoView([container]);

    return container;
}

// Create beautiful report frame with issues
async function createReportFrame(): Promise<FrameNode | null> {
    if (!lastAnalysisResult || enrichedScreensCache.length === 0) {
        figma.notify('⚠️ Please run analysis first', { error: true });
        return null;
    }

    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'SemiBold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

    const result = lastAnalysisResult;
    const screens = enrichedScreensCache;

    const selectedFrames = getSelectedFrames();
    let maxX = 0, minY = 0;
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

    // Header
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

    // Stats row
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

    // Issues by screen
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

        const screenTitle = figma.createText();
        screenTitle.characters = `📱 ${screen.screenName}`;
        screenTitle.fontSize = 16;
        screenTitle.fontName = { family: 'Inter', style: 'SemiBold' };
        screenTitle.fills = [{ type: 'SOLID', color: COLORS.white }];
        screenSection.appendChild(screenTitle);

        for (const issue of screen.issues) {
            const issueRow = figma.createFrame();
            issueRow.name = issue.name;
            issueRow.fills = [];
            issueRow.layoutMode = 'VERTICAL';
            issueRow.itemSpacing = 8;
            issueRow.layoutSizingHorizontal = 'FILL';
            issueRow.layoutSizingVertical = 'HUG';

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

            // Component links in a row
            const componentsRow = figma.createFrame();
            componentsRow.name = 'Components';
            componentsRow.fills = [];
            componentsRow.layoutMode = 'HORIZONTAL';
            componentsRow.itemSpacing = 8;
            componentsRow.layoutSizingHorizontal = 'HUG';
            componentsRow.layoutSizingVertical = 'HUG';
            componentsRow.paddingLeft = 22;

            for (const comp of issue.suggestedComponents) {
                const info = findComponentInfo(comp);
                if (!info) continue;

                const tag = figma.createFrame();
                tag.name = info.name;
                tag.fills = [{ type: 'SOLID', color: COLORS.accent }];
                tag.cornerRadius = 6;
                tag.layoutMode = 'HORIZONTAL';
                tag.itemSpacing = 4;
                tag.paddingTop = 4;
                tag.paddingBottom = 4;
                tag.paddingLeft = 8;
                tag.paddingRight = 8;
                tag.layoutSizingHorizontal = 'HUG';
                tag.layoutSizingVertical = 'HUG';

                const tagIcon = figma.createText();
                tagIcon.characters = '🔗';
                tagIcon.fontSize = 10;
                tag.appendChild(tagIcon);

                const tagName = figma.createText();
                tagName.characters = info.name;
                tagName.fontSize = 10;
                tagName.fontName = { family: 'Inter', style: 'SemiBold' };
                tagName.fills = [{ type: 'SOLID', color: COLORS.white }];
                tagName.hyperlink = { type: 'URL', value: SHADCN_FILE_BASE + info.nodeId };
                tag.appendChild(tagName);

                componentsRow.appendChild(tag);
            }

            issueRow.appendChild(componentsRow);
            screenSection.appendChild(issueRow);
        }

        report.appendChild(screenSection);
    }

    // Footer
    const footer = figma.createFrame();
    footer.name = 'Footer';
    footer.fills = [];
    footer.layoutMode = 'HORIZONTAL';
    footer.itemSpacing = 8;
    footer.layoutSizingHorizontal = 'HUG';
    footer.layoutSizingVertical = 'HUG';

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

            figma.ui.postMessage({
                type: 'screens-exported',
                payload: { screens, timestamp: new Date().toISOString() }
            });
            break;
        }

        case 'analysis-complete': {
            const resultPayload = msg.payload as { result: AnalysisResult };
            lastAnalysisResult = resultPayload.result;

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
            // Create both the report AND the component suggestions
            const report = await createReportFrame();
            if (report) {
                // Position component suggestions below report
                const components = await createSuggestedComponentsFrame();
                if (components) {
                    components.x = report.x;
                    components.y = report.y + report.height + 40;
                    figma.currentPage.selection = [report, components];
                    figma.viewport.scrollAndZoomIntoView([report, components]);
                }
                figma.notify(`✅ Created report + suggested components!`, { timeout: 2000 });
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
