import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AnalysisResult, EdgeCaseIssue, ScreenData } from './types';
import './styles.css';

// Demo mode: Local analysis without GitHub
const DEMO_MODE = true;

// Category labels
const severityIcons = {
    critical: '🔴',
    warning: '🟡',
    info: '🔵'
};

// Local analyzer (demo mode)
function analyzeLocally(screens: ScreenData[]): AnalysisResult {
    const patterns = {
        'form-submission': {
            keywords: ['form', 'submit', 'save', 'input', 'field', 'login', 'signup'],
            edgeCases: [
                { id: 'form-validation-error', name: 'Validation Error State', severity: 'critical' as const, suggestedComponents: ['Alert', 'Input (error)'] },
                { id: 'form-loading', name: 'Submission Loading', severity: 'critical' as const, suggestedComponents: ['Button (loading)'] },
                { id: 'form-success', name: 'Success Confirmation', severity: 'warning' as const, suggestedComponents: ['Toast', 'Alert'] }
            ]
        },
        'data-list': {
            keywords: ['list', 'table', 'grid', 'feed', 'items', 'cards'],
            edgeCases: [
                { id: 'list-empty', name: 'Empty State', severity: 'critical' as const, suggestedComponents: ['EmptyState', 'Card'] },
                { id: 'list-loading', name: 'Loading State', severity: 'critical' as const, suggestedComponents: ['Skeleton'] },
                { id: 'list-error', name: 'Error State', severity: 'critical' as const, suggestedComponents: ['Alert (error)'] }
            ]
        },
        'search-filter': {
            keywords: ['search', 'filter', 'query', 'find'],
            edgeCases: [
                { id: 'search-no-results', name: 'No Results Found', severity: 'critical' as const, suggestedComponents: ['EmptyState'] },
                { id: 'search-loading', name: 'Search Loading', severity: 'warning' as const, suggestedComponents: ['Skeleton'] }
            ]
        },
        'destructive-action': {
            keywords: ['delete', 'remove', 'clear', 'discard'],
            edgeCases: [
                { id: 'destructive-confirmation', name: 'Confirmation Dialog', severity: 'critical' as const, suggestedComponents: ['AlertDialog'] }
            ]
        }
    };

    const screenAnalyses = screens.map(screen => {
        const screenName = screen.name.toLowerCase();
        const childNames = JSON.stringify(screen.children).toLowerCase();
        const allText = screenName + ' ' + childNames;

        const detectedPatterns: string[] = [];
        const issues: EdgeCaseIssue[] = [];

        // Detect patterns and check for missing edge cases
        for (const [patternId, pattern] of Object.entries(patterns)) {
            const hasPattern = pattern.keywords.some(kw => allText.includes(kw));
            if (hasPattern) {
                detectedPatterns.push(patternId);

                // Check if edge cases exist
                for (const edgeCase of pattern.edgeCases) {
                    const hasEdgeCase =
                        allText.includes('error') ||
                        allText.includes('loading') ||
                        allText.includes('empty') ||
                        allText.includes('skeleton');

                    // Simple heuristic: if doesn't have obvious edge case indicators, flag it
                    if (!hasEdgeCase) {
                        issues.push({
                            id: `${edgeCase.id}-${screen.id}`,
                            patternId,
                            edgeCaseId: edgeCase.id,
                            name: edgeCase.name,
                            description: `Missing ${edgeCase.name.toLowerCase()} for ${patternId}`,
                            severity: edgeCase.severity,
                            suggestedComponents: edgeCase.suggestedComponents,
                            screenId: screen.id,
                            screenName: screen.name
                        });
                    }
                }
            }
        }

        return {
            screenId: screen.id,
            screenName: screen.name,
            detectedPatterns,
            issues,
            missingStates: issues.map(i => i.name)
        };
    });

    const allIssues = screenAnalyses.flatMap(s => s.issues);

    return {
        timestamp: new Date().toISOString(),
        totalScreens: screens.length,
        totalIssues: allIssues.length,
        criticalCount: allIssues.filter(i => i.severity === 'critical').length,
        warningCount: allIssues.filter(i => i.severity === 'warning').length,
        infoCount: allIssues.filter(i => i.severity === 'info').length,
        screens: screenAnalyses,
        flowIssues: {
            deadEnds: screens.filter(s => s.connections.length === 0).map(s => s.name),
            orphanScreens: []
        }
    };
}

function App() {
    const [frameCount, setFrameCount] = useState(0);
    const [frameNames, setFrameNames] = useState<string[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'summary' | 'screens'>('summary');

    useEffect(() => {
        window.onmessage = (event) => {
            const msg = event.data.pluginMessage;
            if (!msg) return;

            switch (msg.type) {
                case 'selection-changed':
                    setFrameCount(msg.payload.frameCount);
                    setFrameNames(msg.payload.frameNames);
                    setError(null);
                    break;
                case 'screens-exported':
                    // In demo mode, analyze locally
                    if (DEMO_MODE) {
                        const analysisResult = analyzeLocally(msg.payload.screens);
                        setResult(analysisResult);
                        setIsAnalyzing(false);
                        parent.postMessage({
                            pluginMessage: {
                                type: 'analysis-complete',
                                payload: { result: analysisResult }
                            }
                        }, '*');
                    }
                    break;
                case 'error':
                    setError(msg.payload.message);
                    setIsAnalyzing(false);
                    break;
            }
        };
    }, []);

    const handleAnalyze = () => {
        setIsAnalyzing(true);
        setError(null);
        setResult(null);
        parent.postMessage({ pluginMessage: { type: 'analyze' } }, '*');
    };

    const handleInsertAnnotations = () => {
        parent.postMessage({ pluginMessage: { type: 'insert-placeholders' } }, '*');
    };

    const groupIssuesBySeverity = (issues: EdgeCaseIssue[]) => {
        return {
            critical: issues.filter(i => i.severity === 'critical'),
            warning: issues.filter(i => i.severity === 'warning'),
            info: issues.filter(i => i.severity === 'info')
        };
    };

    return (
        <div className="container">
            <header className="header">
                <div className="logo">
                    <span className="logo-icon">⚡</span>
                    <h1>Edgy</h1>
                </div>
                <p className="subtitle">Find missing edge cases in your flows</p>
            </header>

            <section className="selection-info">
                <div className="stat-box">
                    <span className="stat-value">{frameCount}</span>
                    <span className="stat-label">Screens Selected</span>
                </div>
                {frameCount > 0 && (
                    <div className="frame-list">
                        {frameNames.slice(0, 4).map((name, i) => (
                            <span key={i} className="frame-tag">{name}</span>
                        ))}
                        {frameNames.length > 4 && (
                            <span className="frame-tag more">+{frameNames.length - 4}</span>
                        )}
                    </div>
                )}
            </section>

            {error && <div className="error-message">⚠️ {error}</div>}

            <div className="actions">
                <button
                    className="btn-primary"
                    onClick={handleAnalyze}
                    disabled={frameCount === 0 || isAnalyzing}
                >
                    {isAnalyzing ? '⏳ Analyzing...' : '🔍 Analyze Flow'}
                </button>
            </div>

            {result && (
                <>
                    <section className="results-summary">
                        <h3>Analysis Results</h3>
                        <div className="summary-stats">
                            <div className="summary-stat">
                                <span className="value">{result.totalIssues}</span>
                                <span className="label">Total</span>
                            </div>
                            <div className="summary-stat critical">
                                <span className="value">{result.criticalCount}</span>
                                <span className="label">Critical</span>
                            </div>
                            <div className="summary-stat warning">
                                <span className="value">{result.warningCount}</span>
                                <span className="label">Warning</span>
                            </div>
                            <div className="summary-stat info">
                                <span className="value">{result.infoCount}</span>
                                <span className="label">Info</span>
                            </div>
                        </div>
                    </section>

                    <div className="tabs">
                        <button
                            className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
                            onClick={() => setActiveTab('summary')}
                        >
                            All Issues
                        </button>
                        <button
                            className={`tab ${activeTab === 'screens' ? 'active' : ''}`}
                            onClick={() => setActiveTab('screens')}
                        >
                            By Screen
                        </button>
                    </div>

                    <section className="results-list">
                        {activeTab === 'summary' && (
                            <>
                                {result.screens.flatMap(s => s.issues).length === 0 ? (
                                    <div className="no-issues">
                                        <span className="celebration">🎉</span>
                                        <p>Great job! No edge case issues detected.</p>
                                    </div>
                                ) : (
                                    result.screens.flatMap(s => s.issues)
                                        .sort((a, b) => {
                                            const order = { critical: 0, warning: 1, info: 2 };
                                            return order[a.severity] - order[b.severity];
                                        })
                                        .map((issue, i) => (
                                            <div key={i} className={`issue-card ${issue.severity}`}>
                                                <div className="issue-header">
                                                    <span className="severity-icon">{severityIcons[issue.severity]}</span>
                                                    <span className="issue-title">{issue.name}</span>
                                                </div>
                                                <p className="issue-screen">📍 {issue.screenName}</p>
                                                <p className="issue-suggestion">
                                                    💡 Use: {issue.suggestedComponents.join(', ')}
                                                </p>
                                            </div>
                                        ))
                                )}
                            </>
                        )}

                        {activeTab === 'screens' && (
                            <>
                                {result.screens.map((screen) => (
                                    <div key={screen.screenId} className="screen-group">
                                        <h4 className="screen-title">
                                            📱 {screen.screenName}
                                            <span className={`issue-count ${screen.issues.length > 0 ? 'has-issues' : ''}`}>
                                                {screen.issues.length} issue{screen.issues.length !== 1 ? 's' : ''}
                                            </span>
                                        </h4>
                                        {screen.issues.length === 0 ? (
                                            <p className="no-screen-issues">✅ No issues</p>
                                        ) : (
                                            screen.issues.map((issue, i) => (
                                                <div key={i} className={`issue-card small ${issue.severity}`}>
                                                    <span className="severity-icon">{severityIcons[issue.severity]}</span>
                                                    <div>
                                                        <span className="issue-title">{issue.name}</span>
                                                        <span className="suggestion-inline">→ {issue.suggestedComponents[0]}</span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                ))}
                            </>
                        )}
                    </section>

                    {result.flowIssues.deadEnds.length > 0 && (
                        <section className="flow-issues">
                            <h4>🧭 Flow Issues</h4>
                            <p className="dead-ends">
                                🚫 Dead ends: {result.flowIssues.deadEnds.join(', ')}
                            </p>
                        </section>
                    )}

                    <div className="actions">
                        <button className="btn-secondary" onClick={handleInsertAnnotations}>
                            📌 Add Annotations to Canvas
                        </button>
                    </div>
                </>
            )}

            <footer className="footer">
                <p>Built with shadcn/ui patterns 💜</p>
                {DEMO_MODE && <span className="demo-badge">Demo Mode</span>}
            </footer>
        </div>
    );
}

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}
