import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { GraphData, GraphNode } from '@neobee/shared';
import '../styles/GraphVisualization.css';

interface GraphVisualizationProps {
  graph: GraphData;
}

const NODE_COLORS: Record<GraphNode['type'], string> = {
  topic: 'var(--accent, #6c5ce7)',
  expert: 'var(--expert-color, #0984e3)',
  insight: 'var(--insight-color, #00b894)',
  idea: 'var(--idea-color, #e17055)'
};

const NODE_RADII: Record<GraphNode['type'], number> = {
  topic: 12,
  expert: 8,
  insight: 6,
  idea: 10
};

export default function GraphVisualization({ graph }: GraphVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const svg = d3.select(svgRef.current);
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Clear previous render
    svg.selectAll('*').remove();

    if (graph.nodes.length === 0) return;

    // Build lookup map to filter valid edges
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const validEdges = graph.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

    // D3 force simulation needs mutable data with x/y
    const nodes: any[] = graph.nodes.map((n) => ({ ...n }));
    const links: any[] = validEdges.map((e) => ({ ...e }));

    // Zoom & pan group
    const g = svg.append('g');
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    // Edges
    const linkElements = g.append('g')
      .selectAll<SVGLineElement, any>('line')
      .data(links)
      .join('line')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.3)
      .attr('stroke-width', 1);

    // Nodes
    const nodeElements = g.append('g')
      .selectAll<SVGCircleElement, any>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', (d: any) => NODE_RADII[d.type as GraphNode['type']] ?? 6)
      .attr('fill', (d: any) => NODE_COLORS[d.type as GraphNode['type']] ?? '#999')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer');

    // Hover tooltip
    nodeElements.append('title').text((d: any) => d.label);

    // Force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d: any) => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-250))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(18))
      .on('tick', () => {
        linkElements
          .attr('x1', (d: any) => d.source.x)
          .attr('y1', (d: any) => d.source.y)
          .attr('x2', (d: any) => d.target.x)
          .attr('y2', (d: any) => d.target.y);

        nodeElements
          .attr('cx', (d: any) => d.x)
          .attr('cy', (d: any) => d.y);
      });

    // Initial zoom to fit
    svg.call(zoom.transform, d3.zoomIdentity);

    return () => {
      simulation.stop();
    };
  }, [graph]);

  return (
    <div className="nb-graph-viz-container" ref={containerRef}>
      {graph.nodes.length === 0 ? (
        <div className="nb-empty">No graph data to visualize</div>
      ) : (
        <svg ref={svgRef} className="nb-graph-viz-svg" />
      )}
    </div>
  );
}