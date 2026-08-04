import React from "react";
import { Camera } from "lucide-react";
import { clamp } from "../nodeGeometry.js";
import { degreesToRadians, radiansToDegrees } from "../threeRuntime.js";
import { normalizeFrameItScene } from "../frameItState.js";

const MAP_WIDTH = 760;
const MAP_HEIGHT = 500;
const WORLD_RADIUS = 6;

export function FrameItBirdsEye({
  sceneData,
  selectedFigureId,
  onSceneChange,
  onSelectionChange,
  onInteractionStart
}) {
  const svgRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const scene = normalizeFrameItScene(sceneData);
  const selectedFigure = scene.figures.find((figure) => figure.id === selectedFigureId) || scene.figures[0];
  const cameraPoint = cameraWorldPoint(scene.camera);
  const cameraMap = worldToMap(cameraPoint.x, cameraPoint.z);
  const targetMap = worldToMap(scene.camera.targetX, scene.camera.targetZ);
  const halfFov = degreesToRadians(clamp(scene.camera.fov, 14, 90) / 2);
  const frustumLength = Math.max(62, Math.min(210, distance2d(cameraMap, targetMap)));
  const cameraAngle = Math.atan2(targetMap.y - cameraMap.y, targetMap.x - cameraMap.x);
  const frustumLeft = pointAt(cameraMap, cameraAngle - halfFov, frustumLength);
  const frustumRight = pointAt(cameraMap, cameraAngle + halfFov, frustumLength);

  function pointerToWorld(event) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, z: 0 };
    const mapX = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0.02, 0.98) * MAP_WIDTH;
    const mapY = clamp((event.clientY - rect.top) / Math.max(1, rect.height), 0.03, 0.97) * MAP_HEIGHT;
    return mapToWorld(mapX, mapY);
  }

  function beginDrag(event, kind, figureId = "") {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onInteractionStart?.();
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      figureId,
      scene: normalizeFrameItScene(sceneData)
    };
    if (figureId) onSelectionChange?.({ figureId, jointId: "hipsRot" });
  }

  function moveDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const world = pointerToWorld(event);
    const currentScene = normalizeFrameItScene(drag.scene);

    if (drag.kind === "camera") {
      const target = {
        x: currentScene.camera.targetX,
        z: currentScene.camera.targetZ
      };
      const dx = world.x - target.x;
      const dz = world.z - target.z;
      const horizontalDistance = Math.max(0.35, Math.hypot(dx, dz));
      const pitchCos = Math.max(0.18, Math.cos(degreesToRadians(currentScene.camera.pitch)));
      onSceneChange?.({
        ...currentScene,
        camera: {
          ...currentScene.camera,
          yaw: radiansToDegrees(Math.atan2(dx, dz)),
          distance: clamp(horizontalDistance / pitchCos, 1.5, 14)
        }
      });
      return;
    }

    if (drag.kind === "camera-target") {
      onSceneChange?.({
        ...currentScene,
        camera: {
          ...currentScene.camera,
          targetX: world.x,
          targetZ: world.z
        }
      });
      return;
    }

    const figure = currentScene.figures.find((item) => item.id === drag.figureId);
    if (!figure) return;
    if (drag.kind === "figure") {
      onSceneChange?.({
        ...currentScene,
        figures: currentScene.figures.map((item) => item.id === figure.id ? { ...item, x: world.x, z: world.z } : item)
      });
      return;
    }

    if (drag.kind === "figure-facing") {
      const rotation = radiansToDegrees(Math.atan2(world.x - figure.x, world.z - figure.z));
      onSceneChange?.({
        ...currentScene,
        figures: currentScene.figures.map((item) => item.id === figure.id ? { ...item, rotY: rotation } : item)
      });
    }
  }

  function endDrag(event) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  return (
    <div className="frame-it-birds-eye" aria-label="Bird's-eye camera blocking map">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="img"
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <defs>
          <pattern id="frame-it-map-grid-small" width="25" height="25" patternUnits="userSpaceOnUse">
            <path d="M 25 0 L 0 0 0 25" fill="none" stroke="rgba(255,255,255,.045)" strokeWidth="1" />
          </pattern>
          <pattern id="frame-it-map-grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <rect width="100" height="100" fill="url(#frame-it-map-grid-small)" />
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(255,255,255,.09)" strokeWidth="1" />
          </pattern>
          <linearGradient id="frame-it-camera-frustum" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4f75ff" stopOpacity=".42" />
            <stop offset="1" stopColor="#4f75ff" stopOpacity=".04" />
          </linearGradient>
          <filter id="frame-it-map-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodOpacity=".5" />
          </filter>
        </defs>
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} rx="12" fill="#12161d" />
        <rect x="18" y="18" width={MAP_WIDTH - 36} height={MAP_HEIGHT - 36} rx="8" fill="url(#frame-it-map-grid)" stroke="rgba(255,255,255,.08)" />
        <path
          d={`M ${cameraMap.x} ${cameraMap.y} L ${frustumLeft.x} ${frustumLeft.y} L ${frustumRight.x} ${frustumRight.y} Z`}
          fill="url(#frame-it-camera-frustum)"
          stroke="rgba(96,132,255,.42)"
          strokeWidth="1.5"
          pointerEvents="none"
        />
        <line x1={cameraMap.x} y1={cameraMap.y} x2={targetMap.x} y2={targetMap.y} stroke="#7492ff" strokeWidth="2" strokeDasharray="6 6" pointerEvents="none" />
        <g
          className="frame-it-map-camera"
          transform={`translate(${cameraMap.x} ${cameraMap.y}) rotate(${radiansToDegrees(cameraAngle) + 90})`}
          onPointerDown={(event) => beginDrag(event, "camera")}
          filter="url(#frame-it-map-shadow)"
        >
          <circle r="25" fill="#3159ee" stroke="#91a8ff" strokeWidth="2" />
          <path d="M -11 8 L 0 -12 L 11 8 Z" fill="#f3f6ff" />
          <circle cy="4" r="4" fill="#3159ee" />
        </g>
        <g className="frame-it-map-target" transform={`translate(${targetMap.x} ${targetMap.y})`} onPointerDown={(event) => beginDrag(event, "camera-target")}>
          <circle r="9" fill="#12161d" stroke="#8ea5ff" strokeWidth="2" />
          <circle r="3" fill="#8ea5ff" />
        </g>
        {scene.figures.map((figure, index) => {
          const point = worldToMap(figure.x, figure.z);
          const facingAngle = degreesToRadians(figure.rotY - 90);
          const facing = pointAt(point, facingAngle, 39);
          const selected = figure.id === selectedFigure?.id;
          return (
            <g key={figure.id}>
              <g
                className="frame-it-map-facing"
                transform={`translate(${facing.x} ${facing.y}) rotate(${radiansToDegrees(facingAngle) + 90})`}
                onPointerDown={(event) => beginDrag(event, "figure-facing", figure.id)}
              >
                <path d="M 0 -10 L 8 8 L -8 8 Z" fill={figure.color} stroke={selected ? "#ffffff" : "rgba(255,255,255,.48)"} strokeWidth={selected ? 2 : 1.5} />
              </g>
              <g
                className={`frame-it-map-figure ${selected ? "selected" : ""}`}
                transform={`translate(${point.x} ${point.y})`}
                onPointerDown={(event) => beginDrag(event, "figure", figure.id)}
                filter="url(#frame-it-map-shadow)"
              >
                <circle r="26" fill={figure.color} stroke={selected ? "#ffffff" : "rgba(255,255,255,.42)"} strokeWidth={selected ? 3 : 2} />
                <circle cy="-7" r="7" fill="rgba(12,15,20,.86)" />
                <path d="M -11 13 C -9 1 9 1 11 13" fill="rgba(12,15,20,.86)" />
                <text y="43" textAnchor="middle">{figure.name || `Figure ${index + 1}`}</text>
              </g>
            </g>
          );
        })}
      </svg>
      <div className="frame-it-map-legend"><Camera size={13} />Drag camera or subjects to move. Drag a subject arrow to rotate.</div>
    </div>
  );
}

function cameraWorldPoint(camera) {
  const yaw = degreesToRadians(camera.yaw);
  const pitch = degreesToRadians(camera.pitch);
  const horizontalDistance = Math.cos(pitch) * camera.distance;
  return {
    x: camera.targetX + Math.sin(yaw) * horizontalDistance,
    z: camera.targetZ + Math.cos(yaw) * horizontalDistance
  };
}

function worldToMap(x, z) {
  return {
    x: MAP_WIDTH / 2 + (clamp(x, -WORLD_RADIUS, WORLD_RADIUS) / WORLD_RADIUS) * (MAP_WIDTH * 0.44),
    y: MAP_HEIGHT / 2 + (clamp(z, -WORLD_RADIUS, WORLD_RADIUS) / WORLD_RADIUS) * (MAP_HEIGHT * 0.42)
  };
}

function mapToWorld(x, y) {
  return {
    x: clamp(((x - MAP_WIDTH / 2) / (MAP_WIDTH * 0.44)) * WORLD_RADIUS, -WORLD_RADIUS, WORLD_RADIUS),
    z: clamp(((y - MAP_HEIGHT / 2) / (MAP_HEIGHT * 0.42)) * WORLD_RADIUS, -WORLD_RADIUS, WORLD_RADIUS)
  };
}

function pointAt(point, angle, distance) {
  return { x: point.x + Math.cos(angle) * distance, y: point.y + Math.sin(angle) * distance };
}

function distance2d(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
