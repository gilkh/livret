import React, { useState } from 'react';
import { TrendingUp, Layers, ChevronDown, ChevronRight, BookOpen } from 'lucide-react';
import './RPPYearProgress.css';

interface PendingTemplate {
    _id: string;
    level?: string;
    className?: string;
    signatures?: {
        standard?: any;
        final?: any;
    };
    signature?: any; // Standard signature fallback
}

interface RPPYearProgressProps {
    pending: PendingTemplate[];
}

const RPPYearProgress: React.FC<RPPYearProgressProps> = ({ pending }) => {
    const [expandedLevels, setExpandedLevels] = useState<Record<string, boolean>>({});

    const toggleLevel = (level: string) => {
        setExpandedLevels(prev => ({ ...prev, [level]: !prev[level] }));
    };

    const isSem1Signed = (p: PendingTemplate) => !!(p.signatures?.standard || p.signature);
    const isSem2Signed = (p: PendingTemplate) => !!p.signatures?.final;

    // Grouping and calculations
    const levelsMap: Record<string, {
        s1Count: number;
        s2Count: number;
        total: number;
        classes: Record<string, {
            s1Count: number;
            s2Count: number;
            total: number;
        }>;
    }> = {};

    let globalS1 = 0;
    let globalS2 = 0;
    const globalTotal = pending.length;

    pending.forEach(p => {
        const level = p.level || 'Non défini';
        const className = p.className || 'Sans classe';

        if (!levelsMap[level]) {
            levelsMap[level] = { s1Count: 0, s2Count: 0, total: 0, classes: {} };
        }
        if (!levelsMap[level].classes[className]) {
            levelsMap[level].classes[className] = { s1Count: 0, s2Count: 0, total: 0 };
        }

        const s1 = isSem1Signed(p);
        const s2 = isSem2Signed(p);

        levelsMap[level].total++;
        if (s1) {
            levelsMap[level].s1Count++;
            levelsMap[level].classes[className].s1Count++;
            globalS1++;
        }
        if (s2) {
            levelsMap[level].s2Count++;
            levelsMap[level].classes[className].s2Count++;
            globalS2++;
        }
        levelsMap[level].classes[className].total++;
    });

    const sortedLevels = Object.keys(levelsMap).sort();

    const getPercentage = (count: number, total: number) => {
        return total > 0 ? Math.round((count / total) * 100) : 0;
    };

    const getIntensityClass = (pct: number) => {
        if (pct >= 90) return 'high';
        if (pct >= 40) return 'mid';
        return 'low';
    };

    return (
        <div className="rpp-progress-container">
            <div className="rpp-progress-header">
                <div className="rpp-progress-title">
                    <TrendingUp size={18} className="icon-box" />
                    <h3>Progression Annuelle</h3>
                </div>

                <div className="rpp-summary-minimal">
                    <div className="summary-pill s1">
                        <span className="label">Semestre 1</span>
                        <span className={`value ${getIntensityClass(getPercentage(globalS1, globalTotal))}`}>
                            {getPercentage(globalS1, globalTotal)}%
                        </span>
                    </div>
                    <div className="summary-pill s2">
                        <span className="label">Semestre 2</span>
                        <span className={`value ${getIntensityClass(getPercentage(globalS2, globalTotal))}`}>
                            {getPercentage(globalS2, globalTotal)}%
                        </span>
                    </div>
                </div>
            </div>

            <div className="rpp-level-list">
                {sortedLevels.map(level => {
                    const lData = levelsMap[level];
                    const s1Pct = getPercentage(lData.s1Count, lData.total);
                    const s2Pct = getPercentage(lData.s2Count, lData.total);
                    const isExpanded = expandedLevels[level] ?? true; // default expanded

                    return (
                        <div key={level} className={`rpp-level-item ${isExpanded ? 'expanded' : ''}`}>
                            <div className="rpp-level-header" onClick={() => toggleLevel(level)}>
                                <div className="level-name-wrap">
                                    {isExpanded ? <ChevronDown size={16} className="chevron" /> : <ChevronRight size={16} className="chevron" />}
                                    <div className="level-name">
                                        <span>{level}</span>
                                        <span className="level-count">{lData.total} élèves</span>
                                    </div>
                                </div>
                                <div className="level-stats">
                                    <div className="level-pct-badge s1">
                                        <span>S1:</span> <strong>{s1Pct}%</strong>
                                    </div>
                                    <div className="level-pct-badge s2">
                                        <span>S2:</span> <strong>{s2Pct}%</strong>
                                    </div>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="rpp-class-list">
                                    {Object.keys(lData.classes).sort().map(className => {
                                    const cData = lData.classes[className];
                                    const cs1Pct = getPercentage(cData.s1Count, cData.total);
                                    const cs2Pct = getPercentage(cData.s2Count, cData.total);
                                    return (
                                        <div key={className} className="rpp-class-card">
                                            <div className="class-name">{className}</div>
                                            <div className="class-bars">
                                                <div className="class-bar-row">
                                                    <div className="micro-bar s1">
                                                        <div className={`fill ${cs1Pct === 100 ? 'complete' : cs1Pct === 0 ? 'none' : ''}`} style={{ width: `${cs1Pct}%` }} />
                                                    </div>
                                                    <span className="mini-pct s1">{cs1Pct}%</span>
                                                </div>
                                                <div className="class-bar-row">
                                                    <div className="micro-bar s2">
                                                        <div className={`fill ${cs2Pct === 100 ? 'complete' : cs2Pct === 0 ? 'none' : ''}`} style={{ width: `${cs2Pct}%` }} />
                                                    </div>
                                                    <span className="mini-pct s2">{cs2Pct}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default RPPYearProgress;
