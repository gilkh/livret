import React, { useEffect, useState } from 'react';
import {
    ResponsiveContainer,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    CartesianGrid,
    Cell,
    PieChart,
    Pie
} from 'recharts';
import './ProgressionChart.css';

interface ProgressionChartProps {
    title: string;
    total: number;
    completed: number;
    breakdown: { label: string; total: number; completed: number }[];
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

const ProgressionChart: React.FC<ProgressionChartProps> = ({ title, total, completed, breakdown }) => {
    const [animatedPercentage, setAnimatedPercentage] = useState(0);
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const remaining = total - completed;
    const classCount = breakdown.length;

    // Animate the percentage on mount
    useEffect(() => {
        let start = 0;
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

    const barData = breakdown.map((item, idx) => ({
        name: item.label,
        Complété: item.completed,
        Restant: item.total - item.completed,
        Total: item.total,
        percentage: item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0,
        colorIndex: idx % GRADIENT_COLORS.length
    }));

    // Determine layout mode
    const isCompactMode = classCount <= 3;

    // Get status color based on percentage
    const getStatusColor = (pct: number) => {
        if (pct >= 100) return { bg: '#ecfdf5', border: '#10b981', text: '#059669' };
        if (pct >= 75) return { bg: '#f0fdf4', border: '#22c55e', text: '#16a34a' };
        if (pct >= 50) return { bg: '#fefce8', border: '#eab308', text: '#ca8a04' };
        if (pct >= 25) return { bg: '#fff7ed', border: '#f97316', text: '#ea580c' };
        return { bg: '#fef2f2', border: '#ef4444', text: '#dc2626' };
    };

    const globalStatus = getStatusColor(percentage);

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

            <div className={`progression-chart-content ${isCompactMode ? 'compact-mode' : 'full-mode'}`}>
                {/* Radial Progress Section */}
                <div className="progression-chart-radial">
                    <div className="radial-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                {renderGradientDefs()}
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={isCompactMode ? 55 : 65}
                                    outerRadius={isCompactMode ? 75 : 90}
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
                            <div className="radial-percentage">{animatedPercentage}%</div>
                            <div className="radial-label">Progression</div>
                        </div>
                    </div>

                    {/* Legend below donut */}
                    <div className="radial-legend">
                        <div className="legend-item">
                            <span className="legend-dot completed"></span>
                            <span className="legend-text">Complété ({completed})</span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-dot remaining"></span>
                            <span className="legend-text">Restant ({remaining})</span>
                        </div>
                    </div>
                </div>

                {/* Breakdown Section - Adaptive based on class count */}
                <div className="progression-chart-breakdown">
                    <h4 className="breakdown-title">
                        {classCount === 1 ? '📘 Votre Classe' : `📚 Détails par classe (${classCount})`}
                    </h4>

                    {isCompactMode ? (
                        // Compact Mode: Card-based layout for 1-3 classes
                        <div className="breakdown-cards">
                            {barData.map((item, idx) => {
                                const itemStatus = getStatusColor(item.percentage);
                                return (
                                    <div
                                        key={item.name}
                                        className="breakdown-card"
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
                                            <span className="card-stat">
                                                <span className="card-stat-icon">✓</span>
                                                {item.Complété} terminés
                                            </span>
                                            <span className="card-stat remaining">
                                                <span className="card-stat-icon">○</span>
                                                {item.Restant} restants
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        // Full Mode: Enhanced bar chart for 4+ classes
                        <div className="breakdown-chart">
                            <ResponsiveContainer width="100%" height={Math.max(280, classCount * 48)}>
                                <BarChart
                                    data={barData}
                                    layout="vertical"
                                    margin={{ top: 5, right: 30, left: 60, bottom: 10 }}
                                >
                                    {renderGradientDefs()}
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis
                                        type="number"
                                        tick={{ fill: '#64748b', fontSize: 12 }}
                                        axisLine={{ stroke: '#e2e8f0' }}
                                    />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        width={80}
                                        tick={{ fill: '#334155', fontSize: 13, fontWeight: 500 }}
                                        axisLine={{ stroke: '#e2e8f0' }}
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
                                    <Legend
                                        wrapperStyle={{ paddingTop: '16px' }}
                                        formatter={(value) => (
                                            <span style={{ color: '#475569', fontSize: 13 }}>{value}</span>
                                        )}
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
    );
};

export default ProgressionChart;
