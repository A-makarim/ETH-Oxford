import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { graphBlueprintNodes } from "../data/mockApplications";
import type { GraphBlueprintNode } from "../data/mockApplications";

type GraphNode = {
  id: string;
  label: string;
  subLabel: string;
  ring: number;
  x?: number;
  y?: number;
  z?: number;
  fx?: number;
  fy?: number;
  fz?: number;
};

type GraphLink = {
  source: string | GraphNode;
  target: string | GraphNode;
  distance: number;
};

type ClaimGraph3DProps = {
  activeNodeId: string;
  onSelectNode: (nodeId: string) => void;
  blueprintNodes?: GraphBlueprintNode[];
};

function refitGraphCamera(graph: any): void {
  if (!graph) {
    return;
  }
  window.requestAnimationFrame(() => {
    graph.zoomToFit(460, 44);
  });
}

function createRadialGlowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
    const fallback = new THREE.CanvasTexture(canvas);
    fallback.needsUpdate = true;
    return fallback;
  }

  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
  gradient.addColorStop(0.18, "rgba(255, 255, 255, 0.9)");
  gradient.addColorStop(0.45, "rgba(255, 255, 255, 0.38)");
  gradient.addColorStop(0.72, "rgba(255, 255, 255, 0.12)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  context.clearRect(0, 0, size, size);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function getNodeId(value: string | GraphNode): string {
  return typeof value === "string" ? value : value.id;
}

export function ClaimGraph3D({ activeNodeId, onSelectNode, blueprintNodes }: ClaimGraph3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<any>(null);
  const didFitRef = useRef<boolean>(false);
  const [size, setSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const nodesSource = blueprintNodes && blueprintNodes.length ? blueprintNodes : graphBlueprintNodes;

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = nodesSource.map((node) => {
      const angle = (node.angle * Math.PI) / 180;
      const radial = node.ring === 0 ? 0 : 70 + (node.ring - 1) * 52;
      const depth = node.ring === 0 ? 0 : Math.sin(angle * 1.7) * (node.ring === 1 ? 26 : 42);
      return {
        id: node.id,
        label: node.label,
        subLabel: node.subLabel,
        ring: node.ring,
        x: Math.cos(angle) * radial,
        y: Math.sin(angle) * radial,
        z: depth,
      };
    });

    const links: GraphLink[] = nodesSource
      .filter((node) => node.parentId)
      .map((node) => ({
        source: node.parentId!,
        target: node.id,
        distance: node.ring === 1 ? 86 : 72,
      }));

    return { nodes, links };
  }, [nodesSource]);
  const graphKey = useMemo(
    () => `${graphData.nodes.length}-${graphData.links.length}`,
    [graphData.nodes.length, graphData.links.length]
  );

  const glowTexture = useMemo(() => createRadialGlowTexture(), []);

  function readContainerSize(): { width: number; height: number } | null {
    const element = containerRef.current;
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }
    return {
      width: Math.max(280, Math.floor(rect.width)),
      height: Math.max(380, Math.floor(rect.height)),
    };
  }

  const nodeObjects = useMemo(() => {
    const map = new Map<string, THREE.Object3D>();

    graphData.nodes.forEach((node) => {
      const group = new THREE.Group();

      const glowMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xd6e0f0,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMaterial);
      glow.scale.set(14.5, 14.5, 1);
      glow.frustumCulled = false;

      group.add(glow);
      group.frustumCulled = false;
      group.userData = { glow, glowMaterial };
      map.set(node.id, group);
    });

    return map;
  }, [graphData.nodes, glowTexture]);

  useEffect(() => {
    nodeObjects.forEach((object, nodeId) => {
      const isActive = nodeId === activeNodeId;
      const glow = object.userData.glow as THREE.Sprite;
      const glowMaterial = object.userData.glowMaterial as THREE.SpriteMaterial;

      glow.scale.set(14.5, 14.5, 1);
      glowMaterial.color.setHex(isActive ? 0xffffff : 0xd6e0f0);
      glowMaterial.opacity = isActive ? 0.72 : 0.48;
    });
  }, [activeNodeId, nodeObjects]);

  useEffect(() => {
    return () => {
      glowTexture.dispose();
    };
  }, [glowTexture]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const next = readContainerSize();
      if (!next) {
        return;
      }
      setSize(next);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    const linkForce = graph.d3Force("link");
    if (linkForce && typeof linkForce.distance === "function") {
      linkForce.distance((link: GraphLink) => link.distance);
      linkForce.strength(0.85);
    }

    const charge = graph.d3Force("charge");
    if (charge && typeof charge.strength === "function") {
      charge.strength(-300);
    }

    graph.d3VelocityDecay(0.2);
    graph.cooldownTicks(180);
    graph.numDimensions(3);
    graph.cameraPosition({ x: 0, y: 0, z: 420 }, { x: 0, y: 0, z: 0 }, 0);
  }, [graphData]);

  useEffect(() => {
    didFitRef.current = false;
  }, [graphKey]);

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) {
      return;
    }

    const graph = graphRef.current;
    if (!graph) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      refitGraphCamera(graph);
    }, 120);

    function handleViewportChange(): void {
      const next = readContainerSize();
      if (!next) {
        return;
      }
      setSize(next);
      const current = graphRef.current;
      if (!current) {
        return;
      }
      const renderer = current.renderer?.();
      const camera = current.camera?.();
      if (renderer && camera) {
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(next.width, next.height, false);
        camera.aspect = next.width / next.height;
        camera.updateProjectionMatrix();
      }
      refitGraphCamera(current);
    }

    window.addEventListener("resize", handleViewportChange);
    document.addEventListener("fullscreenchange", handleViewportChange);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", handleViewportChange);
      document.removeEventListener("fullscreenchange", handleViewportChange);
    };
  }, [size.width, size.height]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) {
      return;
    }
    const renderer = graph.renderer?.();
    const canvas = renderer?.domElement;
    if (!canvas) {
      return;
    }

    function handleContextLost(event: Event): void {
      event.preventDefault();
    }

    function handleContextRestored(): void {
      const next = readContainerSize();
      if (next) {
        setSize(next);
      }
      refitGraphCamera(graphRef.current);
    }

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    return () => {
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    };
  }, []);

  return (
    <div className="graph-force-wrap" ref={containerRef}>
      {size.width > 0 && size.height > 0 && (
        <ForceGraph3D
          key={graphKey}
          ref={graphRef}
          graphData={graphData}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          showNavInfo={false}
          enableNodeDrag
          nodeLabel={(node) => `${(node as GraphNode).label}: ${(node as GraphNode).subLabel}`}
          nodeOpacity={1}
          nodeThreeObject={(node) => nodeObjects.get((node as GraphNode).id) ?? null}
          nodeThreeObjectExtend
          nodeColor={() => "#ffffff"}
          nodeVal={() => 0.45}
          linkColor={(link) => {
            const sourceId = getNodeId(link.source as string | GraphNode);
            const targetId = getNodeId(link.target as string | GraphNode);
            return sourceId === activeNodeId || targetId === activeNodeId
              ? "rgba(255, 255, 255, 0.98)"
              : "rgba(235, 242, 255, 0.55)";
          }}
          linkWidth={() => 0.35}
          linkOpacity={0.8}
          linkDirectionalParticles={() => 1}
          linkDirectionalParticleWidth={0.62}
          linkDirectionalParticleSpeed={0.0044}
          linkDirectionalParticleColor={() => "#ffffff"}
          onNodeClick={(node) => onSelectNode((node as GraphNode).id)}
          onNodeDragEnd={(node) => {
            const current = node as GraphNode;
            current.fx = current.x;
            current.fy = current.y;
            current.fz = current.z;
            window.setTimeout(() => {
              current.fx = undefined;
              current.fy = undefined;
              current.fz = undefined;
            }, 110);
          }}
          onEngineStop={() => {
            if (didFitRef.current) {
              return;
            }
            graphRef.current?.zoomToFit(460, 44);
            didFitRef.current = true;
          }}
        />
      )}
    </div>
  );
}
