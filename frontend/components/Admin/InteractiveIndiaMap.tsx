import React, { useRef, useEffect, useState, useCallback } from 'react';
import { INDIA_STATES, SVG_VIEWBOX } from './indiaStatesData';
import { Order } from '../../types';

// ── State-level data aggregated from orders ──
interface StateData {
  orders: number;
  revenue: number;
  distributors: Set<string>;
  cartons: number;
}

// ── Tooltip data ──
interface TooltipInfo {
  name: string;
  stateCode: string;
  orders: number;
  revenue: number;
  distributors: number;
  cartons: number;
  x: number;
  y: number;
  flipBelow: boolean;
}

// ── Map distributor locations to SVG state codes ──
// Extend this as more distributors are added
const LOCATION_TO_STATE: Record<string, string> = {
  'new delhi': 'dl',
  'delhi': 'dl',
  'mumbai': 'mh',
  'maharashtra': 'mh',
  'kolkata': 'wb',
  'west bengal': 'wb',
  'chennai': 'tn',
  'tamil nadu': 'tn',
  'bangalore': 'ka',
  'bengaluru': 'ka',
  'karnataka': 'ka',
  'hyderabad': 'tg',
  'telangana': 'tg',
  'ahmedabad': 'gj',
  'gujarat': 'gj',
  'jaipur': 'rj',
  'rajasthan': 'rj',
  'lucknow': 'up',
  'uttar pradesh': 'up',
  'patna': 'br',
  'bihar': 'br',
  'bhopal': 'mp',
  'madhya pradesh': 'mp',
  'chandigarh': 'ch',
  'punjab': 'pb',
  'haryana': 'hr',
  'goa': 'ga',
  'kerala': 'kl',
  'odisha': 'or',
  'assam': 'as',
  'jharkhand': 'jh',
  'chhattisgarh': 'ct',
  'uttarakhand': 'ut',
  'himachal pradesh': 'hp',
  'andhra pradesh': 'ap',
  'arunachal pradesh': 'ar',
  'manipur': 'mn',
  'meghalaya': 'ml',
  'mizoram': 'mz',
  'nagaland': 'nl',
  'sikkim': 'sk',
  'tripura': 'tr',
};

function resolveStateCode(location?: string): string | null {
  if (!location) return null;
  const lower = location.toLowerCase().trim();
  // Try direct match
  if (LOCATION_TO_STATE[lower]) return LOCATION_TO_STATE[lower];
  // Try matching any key as substring
  for (const [key, code] of Object.entries(LOCATION_TO_STATE)) {
    if (lower.includes(key) || key.includes(lower)) return code;
  }
  return null;
}

// ── Props ──
interface InteractiveIndiaMapProps {
  orders: Order[];
}

const InteractiveIndiaMap: React.FC<InteractiveIndiaMapProps> = ({ orders }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [centroids, setCentroids] = useState<Record<string, { cx: number; cy: number }>>({});
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [hoveredState, setHoveredState] = useState<string | null>(null);

  // ── Compute centroids using getBBox after paths render ──
  useEffect(() => {
    if (!svgRef.current) return;
    const computed: Record<string, { cx: number; cy: number }> = {};
    INDIA_STATES.forEach((state) => {
      const el = svgRef.current?.querySelector(`#state-${state.id}`) as SVGPathElement | null;
      if (el) {
        try {
          const bbox = el.getBBox();
          computed[state.id] = {
            cx: bbox.x + bbox.width / 2,
            cy: bbox.y + bbox.height / 2,
          };
        } catch {
          // getBBox can fail if element has no geometry
        }
      }
    });
    setCentroids(computed);
  }, []);

  // ── Aggregate order data by state ──
  const stateDataMap = React.useMemo(() => {
    const map = new Map<string, StateData>();
    orders.forEach((order) => {
      // Prefer actual address fields from the populated distributorId object
      const distObj = typeof order.distributorId === 'object' && order.distributorId !== null
        ? (order.distributorId as any)
        : null;
      const addrState = distObj?.distributorId?.shippingAddress?.state
        || distObj?.distributorId?.billingAddress?.state;
      const addrCity = distObj?.distributorId?.shippingAddress?.city
        || distObj?.distributorId?.billingAddress?.city;
      const locationText = addrState || addrCity || order.distributorName;
      const code = resolveStateCode(locationText);
      if (code) {
        const existing = map.get(code) || { orders: 0, revenue: 0, distributors: new Set<string>(), cartons: 0 };
        existing.orders += 1;
        existing.revenue += order.totalAmount;
        const distKey = typeof order.distributorId === 'string' ? order.distributorId : (order.distributorId as any)?.id || String(order.distributorId);
        existing.distributors.add(distKey);
        existing.cartons += order.totalCartons || 0;
        map.set(code, existing);
      }
    });
    return map;
  }, [orders]);

  // ── Handle hover ──
  const handleMarkerEnter = useCallback(
    (stateId: string, e: React.MouseEvent) => {
      const state = INDIA_STATES.find((s) => s.id === stateId);
      if (!state) return;
      const data = stateDataMap.get(stateId);
      const svgEl = svgRef.current;
      const container = containerRef.current;
      if (!svgEl || !container) return;

      // Convert SVG coordinates to screen coordinates
      const centroid = centroids[stateId];
      if (!centroid) return;

      const svgPoint = svgEl.createSVGPoint();
      svgPoint.x = centroid.cx;
      svgPoint.y = centroid.cy;
      const screenCTM = svgEl.getScreenCTM();
      if (!screenCTM) return;
      const screenPoint = svgPoint.matrixTransform(screenCTM);
      const containerRect = container.getBoundingClientRect();

      const rawX = screenPoint.x - containerRect.left;
      const rawY = screenPoint.y - containerRect.top;

      // Clamp X so tooltip (min-width ~180px) stays within container
      const tooltipHalfWidth = 100;
      const padding = 8;
      const clampedX = Math.max(tooltipHalfWidth + padding, Math.min(rawX, containerRect.width - tooltipHalfWidth - padding));

      // If near the top, flip tooltip below the marker
      const flipBelow = rawY < 120;

      setTooltip({
        name: state.name,
        stateCode: stateId,
        orders: data?.orders || 0,
        revenue: data?.revenue || 0,
        distributors: data?.distributors.size || 0,
        cartons: data?.cartons || 0,
        x: clampedX,
        y: rawY,
        flipBelow,
      });
      setHoveredState(stateId);
    },
    [centroids, stateDataMap]
  );

  const handleMarkerLeave = useCallback(() => {
    setTooltip(null);
    setHoveredState(null);
  }, []);

  // ── Revenue tiers for state fill and marker color ──
  const maxRevenue = React.useMemo(() => {
    let max = 0;
    stateDataMap.forEach((d) => { if (d.revenue > max) max = d.revenue; });
    return max;
  }, [stateDataMap]);

  const getStateFill = (stateId: string, hovered: boolean): string => {
    if (hovered) return '#c7d2fe'; // indigo-200 on hover
    const data = stateDataMap.get(stateId);
    if (!data || data.revenue === 0) return '#f1f5f9'; // slate-100 — no orders
    const ratio = maxRevenue > 0 ? data.revenue / maxRevenue : 0;
    if (ratio >= 0.6) return '#bbf7d0'; // green-200 — high
    if (ratio >= 0.25) return '#fef08a'; // yellow-200 — medium
    return '#e2e8f0'; // slate-200 — low (slightly tinted)
  };

  // ── Determine marker color based on data ──
  const getMarkerColor = (stateId: string): string => {
    const data = stateDataMap.get(stateId);
    if (!data || data.revenue === 0) return '#94a3b8'; // slate-400 — no data
    const ratio = maxRevenue > 0 ? data.revenue / maxRevenue : 0;
    if (ratio >= 0.6) return '#16a34a'; // green-600 — high
    if (ratio >= 0.25) return '#ca8a04'; // yellow-600 — medium
    return '#64748b'; // slate-500 — low
  };

  const getMarkerRadius = (stateId: string): number => {
    const data = stateDataMap.get(stateId);
    if (!data) return 4;
    if (data.revenue > 50000) return 7;
    if (data.revenue > 10000) return 6;
    return 5;
  };

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col">
      <svg
        ref={svgRef}
        viewBox="-15 -5 642 720"
        className="w-full flex-1 min-h-0"
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ── State paths ── */}
        <g>
          {INDIA_STATES.map((state) => (
            <path
              key={state.id}
              id={`state-${state.id}`}
              d={state.d}
              fill={getStateFill(state.id, hoveredState === state.id)}
              stroke="#cbd5e1"
              strokeWidth="0.8"
              className="transition-colors duration-200 cursor-pointer"
              onMouseEnter={(e) => handleMarkerEnter(state.id, e)}
              onMouseLeave={handleMarkerLeave}
            />
          ))}
        </g>

        {/* ── Centroid markers ── */}
        <g>
          {Object.entries(centroids).map(([stateId, pos]) => {
            const data = stateDataMap.get(stateId);
            const r = getMarkerRadius(stateId);
            const color = getMarkerColor(stateId);

            return (
              <g key={`marker-${stateId}`}>
                {/* Ping animation for states with data */}
                {data && (
                  <circle
                    cx={pos.cx}
                    cy={pos.cy}
                    r={r + 3}
                    fill={color}
                    opacity="0.3"
                    className="animate-ping"
                    style={{ transformOrigin: `${pos.cx}px ${pos.cy}px`, animationDuration: '2s' }}
                  />
                )}
                {/* Main dot */}
                <circle
                  cx={pos.cx}
                  cy={pos.cy}
                  r={r}
                  fill={color}
                  stroke="white"
                  strokeWidth="1.5"
                  className="cursor-pointer transition-all duration-200"
                  onMouseEnter={(e) => handleMarkerEnter(stateId, e)}
                  onMouseLeave={handleMarkerLeave}
                  style={{ filter: data ? 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))' : 'none' }}
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* ── HTML Tooltip ── */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: tooltip.flipBelow
              ? 'translate(-50%, 12px)'
              : 'translate(-50%, -100%) translateY(-12px)',
          }}
        >
          {/* Arrow on top (when flipped below) */}
          {tooltip.flipBelow && (
            <div className="flex justify-center">
              <div className="w-3 h-3 bg-white border-l border-t border-slate-200 rotate-45 mb-[-6px] relative z-10" />
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xl px-4 py-3 min-w-[180px]">
            <div className="flex items-center gap-2 mb-2 border-b border-slate-100 pb-2">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: getMarkerColor(tooltip.stateCode) }}
              />
              <span className="font-bold text-sm text-slate-800">{tooltip.name}</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Orders</span>
                <span className="font-semibold text-slate-700">{tooltip.orders}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Revenue</span>
                <span className="font-semibold text-slate-700">
                  ₹{tooltip.revenue.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Distributors</span>
                <span className="font-semibold text-slate-700">{tooltip.distributors}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cartons</span>
                <span className="font-semibold text-slate-700">{tooltip.cartons.toLocaleString()}</span>
              </div>
            </div>
            {tooltip.orders === 0 && (
              <p className="text-[10px] text-slate-400 mt-2 italic">No orders yet</p>
            )}
          </div>
          {/* Arrow on bottom (default, above marker) */}
          {!tooltip.flipBelow && (
            <div className="flex justify-center">
              <div className="w-3 h-3 bg-white border-r border-b border-slate-200 rotate-45 -mt-1.5" />
            </div>
          )}
        </div>
      )}

      {/* ── Legend ── */}
      <div className="flex items-center justify-center gap-4 flex-wrap px-3 py-2 border-t border-slate-100 bg-white/80">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-200 border border-green-400" />
          <span className="text-[10px] text-slate-600">High Revenue</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-yellow-200 border border-yellow-400" />
          <span className="text-[10px] text-slate-600">Medium</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-slate-200 border border-slate-300" />
          <span className="text-[10px] text-slate-600">Low</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-slate-100 border border-slate-200" />
          <span className="text-[10px] text-slate-600">No Orders</span>
        </div>
      </div>
    </div>
  );
};

export default InteractiveIndiaMap;
