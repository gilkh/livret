import React, { CSSProperties } from 'react';
import './GradebookPocket.css';
import pocketImage from '../pocket.png';

export interface GradebookPocketProps {
    /** The number/text to display on the pocket */
    number: number | string;
    /** Optional className for additional styling */
    className?: string;
    /** Whether the component is draggable */
    draggable?: boolean;
    /** Drag start handler */
    onDragStart?: (e: React.DragEvent) => void;
    /** Drag end handler */
    onDragEnd?: (e: React.DragEvent) => void;
    /** Click handler */
    onClick?: () => void;
    /** Component width (default: 120px) */
    width?: number;
    /** Font size for the number/text (optional) */
    fontSize?: number;
}

export const GradebookPocket: React.FC<GradebookPocketProps> = ({
    number,
    className = '',
    draggable = false,
    onDragStart,
    onDragEnd,
    onClick,
    width = 120,
    fontSize,
}) => {
    const cssVars = {
        '--pocket-width': `${width}px`,
        ...(fontSize ? { '--number-font-size': `${fontSize}px` } : {}),
    } as CSSProperties;

    return (
        <div
            className={`gradebook-pocket ${className}`}
            style={cssVars}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            {/* Layer 2: Pocket (Front Layer) */}
            <div className="pocket-body">
                <img src={pocketImage} alt="Pocket" className="pocket-image" />
            </div>

            {/* Layer 3: Number (Top Layer) */}
            <div className="pocket-number">
                {number}
            </div>
        </div>
    );
};

export default GradebookPocket;
