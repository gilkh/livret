import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

interface ProgressionChartProps {
    title: string;
    total: number;
    completed: number;
    breakdown: { label: string; total: number; completed: number }[];
}

const ProgressionChart: React.FC<ProgressionChartProps> = ({ title, total, completed, breakdown }) => {
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const remaining = total - completed;

    const pieData = [
        { name: 'Complété', value: completed },
        { name: 'Restant', value: remaining },
    ];

    const COLORS = ['#10b981', '#e2e8f0'];

    const barData = breakdown.map(item => ({
        name: item.label,
        Complété: item.completed,
        Restant: item.total - item.completed,
        Total: item.total,
        percentage: item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0
    }));

    return (
        <div style={{ 
            marginBottom: 32, 
            padding: 24, 
            background: 'white', 
            borderRadius: 16, 
            border: '1px solid #e2e8f0',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}>
            <h3 style={{ margin: '0 0 24px 0', fontSize: 20, color: '#1e293b', fontWeight: 600 }}>{title}</h3>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48 }}>
                {/* Donut Chart Section */}
                <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: '100%', height: 250, position: 'relative' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                    startAngle={90}
                                    endAngle={-270}
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div style={{ 
                            position: 'absolute', 
                            top: '50%', 
                            left: '50%', 
                            transform: 'translate(-50%, -50%)',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: 32, fontWeight: 700, color: '#1e293b' }}>{percentage}%</div>
                            <div style={{ fontSize: 14, color: '#64748b' }}>Global</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#10b981' }} />
                            <span style={{ fontSize: 14, color: '#475569' }}>Complété ({completed})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#e2e8f0' }} />
                            <span style={{ fontSize: 14, color: '#475569' }}>Restant ({remaining})</span>
                        </div>
                    </div>
                </div>

                {/* Bar Chart Section */}
                <div style={{ flex: '2 1 400px', minHeight: 300 }}>
                    <h4 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#64748b', fontWeight: 500 }}>Détails par groupe</h4>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={barData}
                            layout="vertical"
                            margin={{ top: 5, right: 30, left: 40, bottom: 30 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" />
                            <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                            <Tooltip 
                                cursor={{ fill: '#f8fafc' }}
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div style={{ background: 'white', padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                                <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>{label}</p>
                                                <p style={{ margin: 0, color: '#10b981' }}>Complété: {data.Complété}</p>
                                                <p style={{ margin: 0, color: '#64748b' }}>Total: {data.Total}</p>
                                                <p style={{ margin: '4px 0 0 0', fontWeight: 500 }}>{data.percentage}%</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Bar dataKey="Complété" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="Restant" stackId="a" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default ProgressionChart;
