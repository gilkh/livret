import React, { useEffect, useState } from 'react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Cell,
    PieChart,
    Pie
} from 'recharts';
import './ProgressionChart.css';

interface BreakdownItem {
    label: string;
    total: number;
    completed: number;
}

interface ProgressionChartProps {
    title: string;
    total: number;
    completed: number;
    perLevelBreakdown: BreakdownItem[];
    perClassBreakdown: BreakdownItem[];
    promuBreakdown?: BreakdownItem[];
    showPromu?: boolean;
}

const GRADIENT_COLORS = [
    { start: '#6366f1', end: '#8b5cf6' },  // Indigo to Purple
    { start: '#06b6d4', end: '#0891b2' },  // Cyan
    { start: '#10b981', end: '#059669' },  // Emerald
    { start: '#f59e0b', end: '#d97706' },  // Amber
    { start: '#f43f5e', end: '#e11d48' },  // Rose
    { start: '#8b5cf6', end: '#7c3aed' },  // Violet
    { start: '#3b82f6', end: '#2563eb' },  // Blue
    { start: '#ec4899', end: '#db2777' },  // Pink
];

type TabType = 'level' | 'class' | 'promu';

const ProgressionChart: React.FC<ProgressionChartProps> = ({
    title,
    total,
    completed,
    perLevelBreakdown,
    perClassBreakdown,
    promuBreakdown = [],
    showPromu = true
}) => {
    const [animatedPercentage, setAnimatedPercentage] = useState(0);
    const [activeTab, setActiveTab] = useState<TabType>('level');
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const remaining = total - completed;

    // Animate the percentage on mount
    useEffect(() => {
        const duration = 1200;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(eased * percentage);
            setAnimatedPercentage(current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [percentage]);

    const pieData = [
        { name: 'Complété', value: completed },
        { name: 'Restant', value: remaining || 0.001 }, // Prevent empty chart
    ];

    // Get the current breakdown based on active tab
    const getCurrentBreakdown = (): BreakdownItem[] => {
        switch (activeTab) {
            case 'level':
                return perLevelBreakdown;
            case 'class':
                return perClassBreakdown;
            case 'promu':
                return promuBreakdown;
            default:
                return perLevelBreakdown;
        }
    };

    const currentBreakdown = getCurrentBreakdown();
    const barData = currentBreakdown.map((item, idx) => ({
        name: item.label,
        Complété: item.completed,
        Restant: item.total - item.completed,
        Total: item.total,
        percentage: item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0,
        colorIndex: idx % GRADIENT_COLORS.length
    }));

    // Get status color based on percentage
    const getStatusColor = (pct: number) => {
        if (pct >= 100) return { bg: '#ecfdf5', border: '#10b981', text: '#059669' };
        if (pct >= 75) return { bg: '#f0fdf4', border: '#22c55e', text: '#16a34a' };
        if (pct >= 50) return { bg: '#fefce8', border: '#eab308', text: '#ca8a04' };
        if (pct >= 25) return { bg: '#fff7ed', border: '#f97316', text: '#ea580c' };
        return { bg: '#fef2f2', border: '#ef4444', text: '#dc2626' };
    };

    const globalStatus = getStatusColor(percentage);

    // Tab configuration
    const tabs: { id: TabType; label: string; icon: string; count: number }[] = [
        { id: 'level', label: 'Par Niveau', icon: '📊', count: perLevelBreakdown.length },
        { id: 'class', label: 'Par Classe', icon: '📚', count: perClassBreakdown.length },
        ...(showPromu ? [{ id: 'promu' as TabType, label: 'Promus', icon: '🎓', count: promuBreakdown.length }] : [])
    ];

    // Custom radial gradient for the donut
    const renderGradientDefs = () => (
        <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                {percentage >= 100 ? (
                    <>
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#059669" />
                    </>
                ) : (
                    <>
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="100%" stopColor="#8b5cf6" />
                    </>
                )}
            </linearGradient>
            <linearGradient id="remainingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f1f5f9" />
                <stop offset="100%" stopColor="#e2e8f0" />
            </linearGradient>
            {GRADIENT_COLORS.map((color, idx) => (
                <linearGradient key={idx} id={`barGradient${idx}`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor={color.start} />
                    <stop offset="100%" stopColor={color.end} />
                </linearGradient>
            ))}
        </defs>
    );

    // Calculate dynamic height for bar chart based on item count
    const calculateChartHeight = () => {
        const itemCount = barData.length;
        if (itemCount <= 3) return 180;
        if (itemCount <= 6) return 240;
        if (itemCount <= 10) return Math.max(280, itemCount * 40);
        return Math.min(500, itemCount * 36);
    };

    return (
        <div className="progression-chart-container">
            {/* Header Section */}
            <div className="progression-chart-header">
                <div className="progression-chart-title-section">
                    <h3 className="progression-chart-title">{title}</h3>
                    <span
                        className="progression-chart-badge"
                        style={{
                            background: globalStatus.bg,
                            borderColor: globalStatus.border,
                            color: globalStatus.text
                        }}
                    >
                        {percentage >= 100 ? '✓ Terminé' : percentage >= 75 ? '🎯 En bonne voie' : percentage >= 50 ? '📈 En cours' : '🚀 À compléter'}
                    </span>
                </div>
                <div className="progression-chart-summary">
                    <span className="progression-chart-stat">
                        <span className="stat-number">{completed}</span>
                        <span className="stat-label">terminés</span>
                    </span>
                    <span className="progression-chart-divider">/</span>
                    <span className="progression-chart-stat">
                        <span className="stat-number">{total}</span>
                        <span className="stat-label">total</span>
                    </span>
                </div>
            </div>

            <div className="progression-chart-content unified-mode">
                {/* Radial Progress Section */}
                <div className="progression-chart-radial">
                    <div className="radial-container compact">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                {renderGradientDefs()}
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={70}
                                    fill="#8884d8"
                                    paddingAngle={3}
                                    dataKey="value"
                                    startAngle={90}
                                    endAngle={-270}
                                    animationBegin={0}
                                    animationDuration={1200}
                                >
                                    <Cell fill="url(#progressGradient)" />
                                    <Cell fill="url(#remainingGradient)" />
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="radial-center">
                            <div className="radial-percentage compact">{animatedPercentage}%</div>
                            <div className="radial-label">Progression</div>
                        </div>
                    </div>

                    {/* Legend below donut */}
                    <div className="radial-legend compact">
                        <div className="legend-item">
                            <span className="legend-dot completed"></span>
                            <span className="legend-text">{completed}</span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-dot remaining"></span>
                            <span className="legend-text">{remaining}</span>
                        </div>
                    </div>
                </div>

                {/* Breakdown Section with Tabs */}
                <div className="progression-chart-breakdown">
                    {/* Tab Navigation */}
                    <div className="breakdown-tabs">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`breakdown-tab ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <span className="tab-icon">{tab.icon}</span>
                                <span className="tab-label">{tab.label}</span>
                                <span className="tab-count">{tab.count}</span>
                            </button>
                        ))}
                    </div>

                    {/* Breakdown Content */}
                    <div className="breakdown-content">
                        {barData.length === 0 ? (
                            <div className="breakdown-empty">
                                <span className="empty-icon">📭</span>
                                <span className="empty-text">Aucune donnée disponible</span>
                            </div>
                        ) : barData.length <= 4 ? (
                            // Card layout for small number of items
                            <div className="breakdown-cards compact">
                                {barData.map((item, idx) => {
                                    const itemStatus = getStatusColor(item.percentage);
                                    return (
                                        <div
                                            key={item.name}
                                            className="breakdown-card compact"
                                            style={{
                                                '--card-gradient-start': GRADIENT_COLORS[idx % GRADIENT_COLORS.length].start,
                                                '--card-gradient-end': GRADIENT_COLORS[idx % GRADIENT_COLORS.length].end,
                                            } as React.CSSProperties}
                                        >
                                            <div className="breakdown-card-header">
                                                <span className="breakdown-card-name">{item.name}</span>
                                                <span
                                                    className="breakdown-card-percentage"
                                                    style={{ color: itemStatus.text }}
                                                >
                                                    {item.percentage}%
                                                </span>
                                            </div>
                                            <div className="breakdown-card-progress">
                                                <div
                                                    className="breakdown-card-progress-fill"
                                                    style={{
                                                        width: `${item.percentage}%`,
                                                        background: `linear-gradient(90deg, ${GRADIENT_COLORS[idx % GRADIENT_COLORS.length].start}, ${GRADIENT_COLORS[idx % GRADIENT_COLORS.length].end})`
                                                    }}
                                                />
                                            </div>
                                            <div className="breakdown-card-stats">
                                                <span className="card-stat">✓ {item.Complété}</span>
                                                <span className="card-stat remaining">○ {item.Restant}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            // Bar chart for larger number of items
                            <div className="breakdown-chart">
                                <ResponsiveContainer width="100%" height={calculateChartHeight()}>
                                    <BarChart
                                        data={barData}
                                        layout="vertical"
                                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                    >
                                        {renderGradientDefs()}
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                        <XAxis
                                            type="number"
                                            tick={{ fill: '#64748b', fontSize: 11 }}
                                            axisLine={{ stroke: '#e2e8f0' }}
                                        />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            width={100}
                                            tick={{ fill: '#334155', fontSize: 12, fontWeight: 500 }}
                                            axisLine={{ stroke: '#e2e8f0' }}
                                            tickFormatter={(value) => value.length > 14 ? value.substring(0, 14) + '…' : value}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                                            content={({ active, payload, label }) => {
                                                if (active && payload && payload.length) {
                                                    const data = payload[0].payload;
                                                    const tooltipStatus = getStatusColor(data.percentage);
                                                    return (
                                                        <div className="custom-tooltip">
                                                            <div className="tooltip-header">{label}</div>
                                                            <div
                                                                className="tooltip-percentage"
                                                                style={{ color: tooltipStatus.text }}
                                                            >
                                                                {data.percentage}% complété
                                                            </div>
                                                            <div className="tooltip-stats">
                                                                <div className="tooltip-stat completed">
                                                                    <span className="tooltip-dot"></span>
                                                                    Complété: {data.Complété}
                                                                </div>
                                                                <div className="tooltip-stat remaining">
                                                                    <span className="tooltip-dot"></span>
                                                                    Restant: {data.Restant}
                                                                </div>
                                                            </div>
                                                            <div className="tooltip-total">
                                                                Total: {data.Total} élèves
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        <Bar
                                            dataKey="Complété"
                                            stackId="a"
                                            radius={[0, 0, 0, 0]}
                                            animationDuration={1000}
                                        >
                                            {barData.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={`url(#barGradient${entry.colorIndex})`}
                                                />
                                            ))}
                                        </Bar>
                                        <Bar
                                            dataKey="Restant"
                                            stackId="a"
                                            fill="#e2e8f0"
                                            radius={[0, 4, 4, 0]}
                                            animationDuration={1000}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProgressionChart;
