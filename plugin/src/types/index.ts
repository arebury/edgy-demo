// Type definitions for Edgy

export interface ScreenData {
    id: string;
    name: string;
    width: number;
    height: number;
    children: NodeData[];
    connections: ConnectionData[];
}

export interface NodeData {
    id: string;
    name: string;
    type: string;
    visible: boolean;
    children?: NodeData[];
}

export interface ConnectionData {
    triggerNodeId: string;
    triggerNodeName: string;
    targetFrameId: string;
    targetFrameName: string;
}

export interface AnalysisRequest {
    screens: ScreenData[];
    timestamp: string;
    projectName: string;
}

export interface EdgeCaseIssue {
    id: string;
    patternId: string;
    edgeCaseId: string;
    name: string;
    description: string;
    severity: 'critical' | 'warning' | 'info';
    suggestedComponents: string[];
    screenId: string;
    screenName: string;
}

export interface ScreenAnalysis {
    screenId: string;
    screenName: string;
    detectedPatterns: string[];
    issues: EdgeCaseIssue[];
    missingStates: string[];
}

export interface AnalysisResult {
    timestamp: string;
    totalScreens: number;
    totalIssues: number;
    criticalCount: number;
    warningCount: number;
    infoCount: number;
    screens: ScreenAnalysis[];
    flowIssues: {
        deadEnds: string[];
        orphanScreens: string[];
    };
}

export interface PluginMessage {
    type: 'analyze' | 'generate-report' | 'insert-placeholders' | 'selection-changed' | 'analysis-complete' | 'error' | 'config-update';
    payload?: unknown;
}

export interface PluginConfig {
    githubToken?: string;
    repoOwner: string;
    repoName: string;
}
