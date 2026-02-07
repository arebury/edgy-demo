// Edgy Plugin - Complete Rewrite with bulletproof report generation

import { ScreenData, NodeData, ConnectionData, AnalysisResult, PluginMessage, EdgeCaseIssue } from './types';

figma.showUI(__html__, { width: 420, height: 700, themeColors: true });

let lastAnalysisResult: AnalysisResult | null = null;
let enrichedScreensCache: any[] = [];

const SHADCN_BASE = 'https://www.figma.com/design/lmUgIGwdG2ZaVfvZzFuU2H/-shadcn-ui---Design-System--Community-?node-id=';

const componentLibrary = [
    { name: 'Alert', nodeId: '4-6598', icon: '⚠️', aliases: ['alert', 'error', 'warning'], searchTerms: ['alert', 'Alert'] },
    { name: 'Button', nodeId: '13-1070', icon: '🔘', aliases: ['button', 'btn', 'cta'], searchTerms: ['button', 'Button'] },
    { name: 'Input', nodeId: '13-1256', icon: '📝', aliases: ['input', 'text-field', 'form'], searchTerms: ['input', 'Input'] },
    { name: 'Dialog', nodeId: '13-1026', icon: '📋', aliases: ['dialog', 'modal', 'popup'], searchTerms: ['dialog', 'Dialog', 'alert dialog'] },
    { name: 'Progress', nodeId: '13-1306', icon: '⏳', aliases: ['progress', 'loading'], searchTerms: ['progress', 'Progress'] },
    { name: 'Skeleton', nodeId: '13-1070', icon: '🦴', aliases: ['skeleton', 'loader'], searchTerms: ['skeleton', 'Skeleton'] },
    { name: 'Toast', nodeId: '4-6598', icon: '🍞', aliases: ['toast', 'snackbar'], searchTerms: ['toast', 'Toast'] },
    { name: 'Card', nodeId: '13-1026', icon: '📦', aliases: ['card', 'container'], searchTerms: ['card', 'Card'] },
];

// ==================== AUTO-INSERT FROM TEAM LIBRARY ====================

async function findAndInsertComponent(searchName: string): Promise<InstanceNode | null> {
    try {
        // Search for components in enabled Team Libraries
        const results = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
        console.log('Available libraries:', results);

        // Try searching with the component API
        const components = await figma.teamLibrary.getComponentsAsync({
            query: searchName
        });

        console.log(`Found ${components.length} components for "${searchName}"`);

        if (components.length === 0) {
            figma.notify(`⚠️ No component found for "${searchName}"`, { error: true });
            return null;
        }

        // Get the first matching component
        const compMeta = components[0];
        console.log('Using component:', compMeta.name, compMeta.key);

        // Import the component
        const component = await figma.importComponentByKeyAsync(compMeta.key);

        // Create an instance
        const instance = component.createInstance();

        return instance;
    } catch (err: any) {
        console.error('Auto-insert error:', err);
        figma.notify(`❌ Auto-insert failed: ${err.message || err}`, { error: true });
        return null;
    }
}

async function insertComponentsIntoReport(container: FrameNode, componentNames: string[]): Promise<void> {
    let yOffset = container.height + 20;

    for (const name of componentNames) {
        try {
            figma.notify(`⏳ Inserting ${name}...`, { timeout: 1000 });
            const instance = await findAndInsertComponent(name);

            if (instance) {
                // Position the instance below the report
                instance.x = container.x;
                instance.y = container.y + yOffset;
                yOffset += instance.height + 20;

                figma.notify(`✅ ${name} inserted!`, { timeout: 1500 });
            }
        } catch (err) {
            console.error(`Failed to insert ${name}:`, err);
        }
    }
}

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

// ==================== BULLETPROOF REPORT GENERATION ====================

async function createBeautifulReport(): Promise<FrameNode | null> {
    // Check data first
    if (!lastAnalysisResult || enrichedScreensCache.length === 0) {
        figma.notify('⚠️ Run Analyze Flow first!', { error: true });
        return null;
    }

    const result = lastAnalysisResult;
    const screens = enrichedScreensCache;

    // Step 1: Load ALL fonts we might need upfront
    const fontsToLoad = [
        { family: 'Inter', style: 'Bold' },
        { family: 'Inter', style: 'Regular' },
        { family: 'Inter', style: 'Medium' },
    ];

    let fontFamily = 'Inter';
    let loadedFont = false;

    for (const font of fontsToLoad) {
        try {
            await figma.loadFontAsync(font);
            loadedFont = true;
        } catch {
            // Try next font
        }
    }

    // Fallback fonts
    if (!loadedFont) {
        const fallbacks = [
            { family: 'Roboto', style: 'Regular' },
            { family: 'Arial', style: 'Regular' },
            { family: 'Helvetica', style: 'Regular' },
        ];
        for (const font of fallbacks) {
            try {
                await figma.loadFontAsync(font);
                fontFamily = font.family;
                loadedFont = true;
                break;
            } catch {
                // Try next
            }
        }
    }

    if (!loadedFont) {
        figma.notify('❌ No fonts available', { error: true });
        return null;
    }

    // Step 2: Calculate position
    const selectedFrames = getSelectedFrames();
    let posX = 100, posY = 100;
    if (selectedFrames.length > 0) {
        let maxX = 0, minY = Infinity;
        for (const f of selectedFrames) {
            if (f.x + f.width > maxX) maxX = f.x + f.width;
            if (f.y < minY) minY = f.y;
        }
        posX = maxX + 80;
        posY = minY;
    }

    // Step 3: Create the main container with Auto Layout
    const container = figma.createFrame();
    container.name = '📋 Edgy Report';
    container.x = posX;
    container.y = posY;

    // Dark theme
    container.fills = [{ type: 'SOLID', color: { r: 0.067, g: 0.067, b: 0.09 } }];
    container.cornerRadius = 16;

    // Auto Layout setup
    container.layoutMode = 'VERTICAL';
    container.primaryAxisSizingMode = 'AUTO';
    container.counterAxisSizingMode = 'AUTO';
    container.paddingTop = 24;
    container.paddingBottom = 24;
    container.paddingLeft = 24;
    container.paddingRight = 24;
    container.itemSpacing = 20;
    container.minWidth = 380;

    // Helper to create text
    const createText = (content: string, size: number, color: RGB, bold = false): TextNode => {
        const text = figma.createText();
        text.fontName = { family: fontFamily, style: bold ? 'Bold' : 'Regular' };
        text.characters = content;
        text.fontSize = size;
        text.fills = [{ type: 'SOLID', color }];
        return text;
    };

    // Colors
    const WHITE = { r: 1, g: 1, b: 1 };
    const GRAY = { r: 0.6, g: 0.6, b: 0.65 };
    const RED = { r: 0.95, g: 0.3, b: 0.3 };
    const YELLOW = { r: 0.95, g: 0.75, b: 0.2 };
    const BLUE = { r: 0.3, g: 0.6, b: 0.95 };
    const PURPLE = { r: 0.6, g: 0.4, b: 0.95 };

    // ========== HEADER ==========
    const header = figma.createFrame();
    header.name = 'Header';
    header.fills = [];
    header.layoutMode = 'VERTICAL';
    header.primaryAxisSizingMode = 'AUTO';
    header.counterAxisSizingMode = 'AUTO';
    header.itemSpacing = 4;

    const title = createText('⚡ Edge Case Report', 22, WHITE, true);
    header.appendChild(title);

    const subtitle = createText(
        `${new Date().toLocaleDateString()} • ${result.totalScreens} screens • ${result.totalIssues} issues`,
        12, GRAY
    );
    header.appendChild(subtitle);

    container.appendChild(header);

    // ========== STATS ROW ==========
    const statsRow = figma.createFrame();
    statsRow.name = 'Stats';
    statsRow.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.12 } }];
    statsRow.cornerRadius = 12;
    statsRow.layoutMode = 'HORIZONTAL';
    statsRow.primaryAxisSizingMode = 'AUTO';
    statsRow.counterAxisSizingMode = 'AUTO';
    statsRow.itemSpacing = 0;

    const addStat = (value: number, label: string, color: RGB) => {
        const stat = figma.createFrame();
        stat.fills = [];
        stat.layoutMode = 'VERTICAL';
        stat.primaryAxisSizingMode = 'AUTO';
        stat.counterAxisSizingMode = 'AUTO';
        stat.primaryAxisAlignItems = 'CENTER';
        stat.counterAxisAlignItems = 'CENTER';
        stat.paddingTop = 16;
        stat.paddingBottom = 16;
        stat.paddingLeft = 20;
        stat.paddingRight = 20;
        stat.itemSpacing = 2;

        const val = createText(value.toString(), 28, color, true);
        const lbl = createText(label, 10, GRAY);

        stat.appendChild(val);
        stat.appendChild(lbl);
        statsRow.appendChild(stat);
    };

    addStat(result.totalIssues, 'Total', WHITE);
    addStat(result.criticalCount, 'Critical', RED);
    addStat(result.warningCount, 'Warning', YELLOW);
    addStat(result.infoCount, 'Info', BLUE);

    container.appendChild(statsRow);

    // ========== ISSUES BY SCREEN ==========
    for (const screen of screens) {
        if (screen.issues.length === 0) continue;

        const section = figma.createFrame();
        section.name = screen.screenName;
        section.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.12 } }];
        section.cornerRadius = 12;
        section.layoutMode = 'VERTICAL';
        section.primaryAxisSizingMode = 'AUTO';
        section.counterAxisSizingMode = 'AUTO';
        section.paddingTop = 16;
        section.paddingBottom = 16;
        section.paddingLeft = 16;
        section.paddingRight = 16;
        section.itemSpacing = 12;

        const screenTitle = createText(`📱 ${screen.screenName}`, 14, WHITE, true);
        section.appendChild(screenTitle);

        for (const issue of screen.issues) {
            const issueRow = figma.createFrame();
            issueRow.fills = [];
            issueRow.layoutMode = 'VERTICAL';
            issueRow.primaryAxisSizingMode = 'AUTO';
            issueRow.counterAxisSizingMode = 'AUTO';
            issueRow.itemSpacing = 6;

            // Issue name with icon
            const icon = issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵';
            const issueName = createText(`${icon} ${issue.name}`, 12, { r: 0.9, g: 0.9, b: 0.92 });
            issueRow.appendChild(issueName);

            // Component tags
            const tagsRow = figma.createFrame();
            tagsRow.fills = [];
            tagsRow.layoutMode = 'HORIZONTAL';
            tagsRow.primaryAxisSizingMode = 'AUTO';
            tagsRow.counterAxisSizingMode = 'AUTO';
            tagsRow.itemSpacing = 6;
            tagsRow.paddingLeft = 20;

            for (const comp of issue.suggestedComponents) {
                const info = findComponentInfo(comp);
                if (!info) continue;

                const tag = figma.createFrame();
                tag.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.2, b: 0.8 } }];
                tag.cornerRadius = 4;
                tag.layoutMode = 'HORIZONTAL';
                tag.primaryAxisSizingMode = 'AUTO';
                tag.counterAxisSizingMode = 'AUTO';
                tag.paddingTop = 4;
                tag.paddingBottom = 4;
                tag.paddingLeft = 8;
                tag.paddingRight = 8;

                const tagText = createText(`🔗 ${info.name}`, 10, WHITE);
                tagText.hyperlink = { type: 'URL', value: SHADCN_BASE + info.nodeId };
                tag.appendChild(tagText);

                tagsRow.appendChild(tag);
            }

            issueRow.appendChild(tagsRow);
            section.appendChild(issueRow);
        }

        container.appendChild(section);
    }

    // ========== SUGGESTED COMPONENTS ==========
    const uniqueComps = new Set<string>();
    for (const screen of screens) {
        for (const issue of screen.issues) {
            issue.suggestedComponents.forEach((c: string) => {
                const info = findComponentInfo(c);
                if (info) uniqueComps.add(info.name);
            });
        }
    }

    if (uniqueComps.size > 0) {
        const compSection = figma.createFrame();
        compSection.name = 'Components';
        compSection.fills = [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.12 } }];
        compSection.cornerRadius = 12;
        compSection.layoutMode = 'VERTICAL';
        compSection.primaryAxisSizingMode = 'AUTO';
        compSection.counterAxisSizingMode = 'AUTO';
        compSection.paddingTop = 16;
        compSection.paddingBottom = 16;
        compSection.paddingLeft = 16;
        compSection.paddingRight = 16;
        compSection.itemSpacing = 10;

        const compTitle = createText(`📦 ${uniqueComps.size} Suggested Components`, 14, WHITE, true);
        compSection.appendChild(compTitle);

        for (const compName of uniqueComps) {
            const info = componentLibrary.find(c => c.name === compName);
            if (!info) continue;

            const row = figma.createFrame();
            row.fills = [{ type: 'SOLID', color: { r: 0.15, g: 0.15, b: 0.18 } }];
            row.cornerRadius = 8;
            row.layoutMode = 'HORIZONTAL';
            row.primaryAxisSizingMode = 'FIXED';
            row.counterAxisSizingMode = 'AUTO';
            row.resize(320, 40);
            row.primaryAxisAlignItems = 'SPACE_BETWEEN';
            row.counterAxisAlignItems = 'CENTER';
            row.paddingTop = 10;
            row.paddingBottom = 10;
            row.paddingLeft = 12;
            row.paddingRight = 12;

            const label = createText(`${info.icon} ${info.name}`, 12, WHITE);
            row.appendChild(label);

            const link = createText('View →', 11, PURPLE);
            link.hyperlink = { type: 'URL', value: SHADCN_BASE + info.nodeId };
            row.appendChild(link);

            compSection.appendChild(row);
        }

        container.appendChild(compSection);
    }

    // ========== FOOTER ==========
    const footer = figma.createFrame();
    footer.fills = [];
    footer.layoutMode = 'HORIZONTAL';
    footer.primaryAxisSizingMode = 'AUTO';
    footer.counterAxisSizingMode = 'AUTO';
    footer.primaryAxisAlignItems = 'CENTER';
    footer.itemSpacing = 6;

    const footerText = createText('Powered by', 10, GRAY);
    footer.appendChild(footerText);

    const footerLink = createText('shadcn/ui 💜', 10, PURPLE);
    footerLink.hyperlink = { type: 'URL', value: 'https://ui.shadcn.com' };
    footer.appendChild(footerLink);

    container.appendChild(footer);

    // Add to page and focus
    figma.currentPage.appendChild(container);
    figma.currentPage.selection = [container];
    figma.viewport.scrollAndZoomIntoView([container]);

    return container;
}

// ==================== MESSAGE HANDLERS ====================

figma.ui.onmessage = async (msg: any) => {
    console.log('Message received:', msg.type);

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
            figma.notify('⏳ Generating report...', { timeout: 1000 });
            try {
                const report = await createBeautifulReport();
                if (report) {
                    figma.notify('✅ Report created! Now inserting components...', { timeout: 2000 });

                    // Collect unique components to insert
                    const uniqueComps = new Set<string>();
                    for (const screen of enrichedScreensCache) {
                        for (const issue of screen.issues) {
                            for (const comp of issue.suggestedComponents) {
                                const info = findComponentInfo(comp);
                                if (info) uniqueComps.add(info.name);
                            }
                        }
                    }

                    // Insert components below the report
                    if (uniqueComps.size > 0) {
                        await insertComponentsIntoReport(report, Array.from(uniqueComps));
                        figma.notify(`✅ Done! Report + ${uniqueComps.size} components inserted`, { timeout: 3000 });
                    }
                }
            } catch (err: any) {
                console.error('Report error:', err);
                figma.notify(`❌ Error: ${err.message || err}`, { error: true, timeout: 5000 });
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
