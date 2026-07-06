import React from 'react';

// Cubic bezier path generator
function cubicBezier(x1: number, y1: number, x2: number, y2: number, offset = 100) {
  return `M ${x1},${y1} C ${x1 + offset},${y1} ${x2 - offset},${y2} ${x2},${y2}`;
}

export const AnimatedSankeyFunnel = ({
  totalFound = 54196,
  processed = 1420,
}: {
  totalFound?: number;
  processed?: number;
}) => {
  const matches = Math.floor(processed * 0.05); // Simulated matched subset
  const discarded = totalFound - matches;

  // Nodes Coordinates (ViewBox 800 x 400)
  const leftX = 140;
  const centerX = 400;
  const rightX = 660;

  // Left Nodes (Sources)
  const nodeL1 = { x: leftX, y: 80, label: 'LinkedIn', value: Math.floor(totalFound * 0.55) };
  const nodeL2 = { x: leftX, y: 200, label: 'RemoteOK', value: Math.floor(totalFound * 0.25) };
  const nodeL3 = { x: leftX, y: 320, label: 'Glassdoor', value: Math.floor(totalFound * 0.20) };

  // Center Node (Engine)
  const nodeCenter = { x: centerX, y: 200, label: 'Applica Engine', value: totalFound };

  // Right Nodes (Results)
  const nodeR1 = { x: rightX, y: 100, label: 'Selección Final', value: matches };
  const nodeR2 = { x: rightX, y: 300, label: 'Descartadas', value: discarded };

  // Paths
  const pathL1 = cubicBezier(nodeL1.x, nodeL1.y, nodeCenter.x, nodeCenter.y - 40, 100);
  const pathL2 = cubicBezier(nodeL2.x, nodeL2.y, nodeCenter.x, nodeCenter.y, 100);
  const pathL3 = cubicBezier(nodeL3.x, nodeL3.y, nodeCenter.x, nodeCenter.y + 40, 100);

  const pathR1 = cubicBezier(nodeCenter.x, nodeCenter.y - 20, nodeR1.x, nodeR1.y, 100);
  const pathR2 = cubicBezier(nodeCenter.x, nodeCenter.y + 20, nodeR2.x, nodeR2.y, 100);

  // Generate random particles for a path
  const renderParticles = (pathId: string, count: number, durMin: number, durMax: number, color: string) => {
    return Array.from({ length: count }).map((_, i) => {
      const duration = durMin + Math.random() * (durMax - durMin);
      const delay = Math.random() * 5;
      return (
        <circle key={`${pathId}-p-${i}`} r="2.5" fill={color} filter="url(#glow)">
          <animateMotion
            dur={`${duration}s`}
            begin={`-${delay}s`}
            repeatCount="indefinite"
            path={document.getElementById(pathId)?.getAttribute('d') || ''}
          >
            <mpath href={`#${pathId}`} />
          </animateMotion>
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.9;1" dur={`${duration}s`} begin={`-${delay}s`} repeatCount="indefinite" />
        </circle>
      );
    });
  };

  return (
    <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto', overflow: 'hidden', padding: '1rem' }}>
      <svg viewBox="0 0 800 400" style={{ width: '100%', height: 'auto', display: 'block' }}>
        <defs>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <linearGradient id="grad-main" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--text-3)" stopOpacity="0.1" />
            <stop offset="100%" stopColor="var(--text-3)" stopOpacity="0.4" />
          </linearGradient>

          <linearGradient id="grad-success" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--text-3)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.8" />
          </linearGradient>

          <linearGradient id="grad-fail" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--text-3)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="var(--danger)" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* Thick Flow Paths */}
        <path id="pathL1" d={pathL1} fill="none" stroke="url(#grad-main)" strokeWidth="40" strokeLinecap="round" opacity="0.8" />
        <path id="pathL2" d={pathL2} fill="none" stroke="url(#grad-main)" strokeWidth="30" strokeLinecap="round" opacity="0.8" />
        <path id="pathL3" d={pathL3} fill="none" stroke="url(#grad-main)" strokeWidth="20" strokeLinecap="round" opacity="0.8" />

        <path id="pathR1" d={pathR1} fill="none" stroke="url(#grad-success)" strokeWidth="15" strokeLinecap="round" />
        <path id="pathR2" d={pathR2} fill="none" stroke="url(#grad-fail)" strokeWidth="60" strokeLinecap="round" />

        {/* Particles */}
        <g opacity="0.8">
          {renderParticles('pathL1', 15, 2, 4, '#ffffff')}
          {renderParticles('pathL2', 10, 2, 4, '#ffffff')}
          {renderParticles('pathL3', 8, 2, 4, '#ffffff')}
          {renderParticles('pathR1', 3, 3, 5, 'var(--gold-light)')}
          {renderParticles('pathR2', 25, 2, 4, 'rgba(255,255,255,0.4)')}
        </g>

        {/* Nodes rendering helper */}
        {(() => {
          const drawNode = (node: {x: number, y: number, label: string, value: number | string}, align: 'left' | 'right' | 'center', color: string = 'var(--text)') => (
            <g transform={`translate(${node.x}, ${node.y})`}>
              <circle r="4" fill={color} />
              <text
                x={align === 'right' ? 12 : align === 'left' ? -12 : 0}
                y="-10"
                textAnchor={align === 'center' ? 'middle' : align === 'left' ? 'end' : 'start'}
                fill="var(--text)"
                fontSize="14"
                fontWeight="700"
                fontFamily="var(--font-display)"
              >
                {node.label}
              </text>
              <text
                x={align === 'right' ? 12 : align === 'left' ? -12 : 0}
                y="8"
                textAnchor={align === 'center' ? 'middle' : align === 'left' ? 'end' : 'start'}
                fill="var(--text-3)"
                fontSize="12"
                fontWeight="500"
              >
                {typeof node.value === 'number' ? node.value.toLocaleString() : node.value} vacantes
              </text>
            </g>
          );

          return (
            <>
              {drawNode(nodeL1, 'left')}
              {drawNode(nodeL2, 'left')}
              {drawNode(nodeL3, 'left')}

              {/* Center Box instead of simple circle */}
              <g transform={`translate(${nodeCenter.x}, ${nodeCenter.y})`}>
                <rect x="-60" y="-80" width="120" height="160" fill="var(--bg)" stroke="var(--petrol)" strokeWidth="2" rx="12" />
                <text x="0" y="-15" textAnchor="middle" fill="var(--text)" fontSize="14" fontWeight="700" fontFamily="var(--font-display)">
                  {nodeCenter.label}
                </text>
                <text x="0" y="5" textAnchor="middle" fill="var(--petrol)" fontSize="12" fontWeight="600">
                  Procesando...
                </text>
                <text x="0" y="25" textAnchor="middle" fill="var(--text-2)" fontSize="11">
                  {nodeCenter.value.toLocaleString()} analizadas
                </text>
              </g>

              {drawNode(nodeR1, 'right', 'var(--gold)')}
              {drawNode(nodeR2, 'right', 'var(--text-3)')}
            </>
          );
        })()}
      </svg>
    </div>
  );
};
