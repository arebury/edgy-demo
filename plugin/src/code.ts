// Main Plugin Code - Edgy Flow Analyzer

import { ScreenData, NodeData, ConnectionData, AnalysisResult, PluginMessage } from './types';

// Show the UI
figma.showUI(__html__, {
    width: 420,
    height: 650,
    themeColors: true
});

let lastAnalysisResult: AnalysisResult | null = null;

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

// Generate annotation card for a screen
async function createAnnotationCard(
    screenId: string,
    issues: Array<{ name: string; severity: string; suggestedComponents: string[] }>
): Promise<FrameNode | null> {
    const targetFrame = figma.getNodeById(screenId);
    if (!targetFrame || targetFrame.type !== 'FRAME') return null;

    await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });

    const card = figma.createFrame();
    card.name = `⚠️ Edge Case Issues - ${targetFrame.name}`;
    card.resize(280, 40 + issues.length * 60);
    card.x = targetFrame.x + targetFrame.width + 20;
    card.y = targetFrame.y;
    card.fills = [{ type: 'SOLID', color: { r: 0.12, g: 0.12, b: 0.14 } }];
    card.cornerRadius = 12;
    card.layoutMode = 'VERTICAL';
    card.paddingTop = 16;
    card.paddingBottom = 16;
    card.paddingLeft = 16;
    card.paddingRight = 16;
    card.itemSpacing = 12;
    card.layoutSizingVertical = 'HUG';

    // Title
    const title = figma.createText();
    title.characters = `⚠️ ${issues.length} Issue${issues.length > 1 ? 's' : ''} Found`;
    title.fontSize = 14;
    title.fontName = { family: 'Inter', style: 'Bold' };
    title.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    card.appendChild(title);

    // Issues
    for (const issue of issues) {
        const issueFrame = figma.createFrame();
        issueFrame.name = issue.name;
        issueFrame.fills = [];
        issueFrame.layoutMode = 'VERTICAL';
        issueFrame.itemSpacing = 4;
        issueFrame.layoutSizingHorizontal = 'FILL';
        issueFrame.layoutSizingVertical = 'HUG';

        const severityColor =
            issue.severity === 'critical' ? { r: 0.91, g: 0.3, b: 0.24 } :
                issue.severity === 'warning' ? { r: 0.95, g: 0.61, b: 0.07 } :
                    { r: 0.2, g: 0.6, b: 0.86 };

        const issueName = figma.createText();
        issueName.characters = `${issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : '🔵'} ${issue.name}`;
        issueName.fontSize = 12;
        issueName.fontName = { family: 'Inter', style: 'Bold' };
        issueName.fills = [{ type: 'SOLID', color: severityColor }];
        issueFrame.appendChild(issueName);

        const suggestion = figma.createText();
        suggestion.characters = `→ ${issue.suggestedComponents.join(', ')}`;
        suggestion.fontSize = 10;
        suggestion.fontName = { family: 'Inter', style: 'Regular' };
        suggestion.fills = [{ type: 'SOLID', color: { r: 0.7, g: 0.7, b: 0.7 } }];
        issueFrame.appendChild(suggestion);

        card.appendChild(issueFrame);
    }

    figma.currentPage.appendChild(card);
    return card;
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

            // Send screen data to UI for GitHub upload
            figma.ui.postMessage({
                type: 'screens-exported',
                payload: { screens, timestamp: new Date().toISOString() }
            });
            break;
        }

        case 'analysis-complete': {
            const result = msg.payload as { result: AnalysisResult };
            lastAnalysisResult = result.result;
            figma.notify(`✅ Analysis complete: ${result.result.totalIssues} issues found`, { timeout: 3000 });
            break;
        }

        case 'insert-placeholders': {
            if (!lastAnalysisResult) {
                figma.ui.postMessage({
                    type: 'error',
                    payload: { message: 'Please run analysis first' }
                });
                return;
            }

            let cardsCreated = 0;
            for (const screen of lastAnalysisResult.screens) {
                if (screen.issues.length > 0) {
                    await createAnnotationCard(screen.screenId, screen.issues);
                    cardsCreated++;
                }
            }

            figma.notify(`✅ Created ${cardsCreated} annotation cards`, { timeout: 2000 });
            break;
        }

        case 'generate-report': {
            // Generate comprehensive report frame
            // (Implementation similar to annotation cards but comprehensive)
            figma.notify('📋 Report generation coming soon!', { timeout: 2000 });
            break;
        }
    }
};

// Listen for selection changes
figma.on('selectionchange', sendSelectionUpdate);

// Send initial selection state
sendSelectionUpdate();
