import React from "react";
import { Camera, LockKeyhole } from "lucide-react";
import { THREE, useThreeRuntimeReady } from "../threeRuntime.js";
import { coverageTravelPosition, coverageTravelPose, coverageTravelLimits } from "../cameraCoverage.js";

const radians = value => value * Math.PI / 180;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function CameraCoverageViewport({ imageUrl, position, positions = [], pathMode = "orbit", index, onChange }) {
  const ready = useThreeRuntimeReady(), host = React.useRef(null), sceneRef = React.useRef(null);
  const latest = React.useRef({ position, onChange, index });
  latest.current = { position, positions, pathMode, onChange, index };
  const travelMode = pathMode === "travel", xyz = coverageTravelPosition(position), positionsKey = JSON.stringify(positions);
  const changeTravel = values => onChange(coverageTravelPose(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, clamp(value, ...coverageTravelLimits[key])]))));
  const [failed, setFailed] = React.useState(false);
  const [labels, setLabels] = React.useState({});
  const drag = React.useRef(null);

  React.useEffect(() => {
    if (!ready || !host.current) return;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { setFailed(true); return; }
    setFailed(false);
    const element = host.current;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x171b1d);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(6.4, 5.8, 9.4); camera.lookAt(0, 1, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x59626b, 2.4));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(3, 8, 6); scene.add(light);
    const materials = [], geometries = [];
    const material = (color, extra = {}) => { const value = new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...extra }); materials.push(value); return value; };
    const mesh = (geometry, mat, parent = scene) => { geometries.push(geometry); const value = new THREE.Mesh(geometry, mat); parent.add(value); return value; };
    const ground = mesh(new THREE.PlaneGeometry(16, 16), material(0x202629)); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.04;
    const grid = new THREE.GridHelper(16, 32, 0x465155, 0x30393d); scene.add(grid);
    const target = new THREE.Vector3(0, 1.55, 0);
    const imageGroup = new THREE.Group(); imageGroup.position.copy(target); scene.add(imageGroup);
    const imageMaterial = new THREE.MeshBasicMaterial({ color: 0x57646c, side: THREE.DoubleSide }); materials.push(imageMaterial);
    const picture = mesh(new THREE.PlaneGeometry(2.9, 1.8), imageMaterial, imageGroup);
    const frame = mesh(new THREE.BoxGeometry(3.02, 1.92, 0.06), material(0xc5cfd0), imageGroup); frame.position.z = -0.045;
    const post = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.55), material(0x768589)); post.position.y = 0.775; post.position.z = -0.08;
    const foot = mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.04, 48), material(0x374346));
    foot.position.y = 0.02;
    const rig = new THREE.Group(); scene.add(rig);
    mesh(new THREE.BoxGeometry(0.64, 0.42, 0.4), material(0xd9c942), rig);
    const lens = mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.3, 32), material(0x313d43), rig); lens.rotation.x = Math.PI / 2; lens.position.z = 0.31;
    const glass = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.015, 32), material(0x72c3d8, { metalness: 0.35, roughness: 0.2 }), rig); glass.rotation.x = Math.PI / 2; glass.position.z = 0.47;
    const handle = mesh(new THREE.BoxGeometry(0.3, 0.07, 0.12), material(0xd9c942), rig); handle.position.y = 0.32;
    [-0.11, 0.11].forEach(x => { const support = mesh(new THREE.BoxGeometry(0.04, 0.1, 0.1), material(0xd9c942), rig); support.position.set(x, 0.25, 0); });
    const monitor = mesh(new THREE.BoxGeometry(0.04, 0.28, 0.32), material(0x0b161b), rig); monitor.position.x = -0.34;
    const rearScreen = mesh(new THREE.BoxGeometry(0.42, 0.26, 0.02), material(0x20343d), rig); rearScreen.position.z = -0.21;
    let guides = new THREE.Group(); scene.add(guides);
    let imageHeight = 1.8, alive = true, texture;
    const disposeGuides = () => { guides.traverse(obj => { obj.geometry?.dispose(); obj.material?.dispose(); }); scene.remove(guides); };
    const point = (azimuth, elevation, radius) => new THREE.Vector3(
      Math.sin(radians(azimuth)) * Math.cos(radians(elevation)) * radius,
      target.y + Math.sin(radians(elevation)) * radius,
      Math.cos(radians(azimuth)) * Math.cos(radians(elevation)) * radius
    );
    const render = () => {
      if (!alive) return;
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false); camera.aspect = width / height;
      // Keep the whole orbit in view even in a narrow node.
      camera.position.set(6.4, 5.8, 9.4).multiplyScalar(Math.max(1, 1.5 / camera.aspect));
      camera.lookAt(0, 1, 0); camera.zoom = 1; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      const { position: pose, pathMode: mode, positions: poses } = latest.current, radius = pose.distance * 3.6;
      rig.position.copy(point(pose.azimuth, pose.elevation, radius)); rig.lookAt(target);
      const bounds = [rig.position.clone().add(new THREE.Vector3(0, 0.75, 0)), target.clone().add(new THREE.Vector3(0, imageHeight / 2 + 0.4, 0)),
        ...(mode === "travel" ? poses.map(p => point(p.azimuth, p.elevation, p.distance * 3.6).add(new THREE.Vector3(0, 0.4, 0))) : []),
        ...Array.from({ length: 32 }, (_, i) => point(i * 360 / 32, 0, radius + 0.25).setY(0))].map(p => p.project(camera));
      camera.zoom = Math.min(1, ...bounds.map(p => Math.min(0.88 / Math.abs(p.x), 0.74 / Math.abs(p.y))));
      camera.updateProjectionMatrix();
      disposeGuides(); guides = new THREE.Group(); scene.add(guides);
      const guideLine = (points, color, opacity = 1) => {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
        const value = new THREE.Line(geometry, mat); guides.add(value); return value;
      };
      if (mode === "travel") {
        const local = coverageTravelPosition(pose);
        const world = p => new THREE.Vector3(p.slide * 3.6, target.y + p.boom * 3.6, p.dolly * 3.6);
        for (const [key, color] of [["slide", 0x6fb5c4], ["boom", 0xb4a2db], ["dolly", 0x8ac792]]) {
          guideLine(coverageTravelLimits[key].map(value => world({ ...local, [key]: value })), color, 0.8);
        }
        guideLine(poses.map(p => world(coverageTravelPosition(p))), 0xd9c942, 0.65);
        poses.forEach(p => {
          const marker = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xd9c942 }));
          marker.position.copy(world(coverageTravelPosition(p))); guides.add(marker);
        });
      } else {
        guideLine(Array.from({ length: 129 }, (_, i) => point(i * 360 / 128, 0, radius).setY(0.055)), 0x6fb5c4, 0.75);
        for (let angle = -180; angle < 180; angle += 15) {
          guideLine([point(angle, 0, radius).setY(0.06), point(angle, 0, radius + (angle % 90 === 0 ? 0.22 : 0.1)).setY(0.06)], 0x99c6cb, 0.55);
        }
        const arcStart = Math.min(-10, pose.elevation), arcEnd = Math.max(25, pose.elevation);
        guideLine(Array.from({ length: 46 }, (_, i) => point(pose.azimuth, arcStart + i / 45 * (arcEnd - arcStart), radius)), 0xb4a2db, 0.75);
      }
      guideLine([rig.position.clone(), rig.position.clone().setY(0.07)], 0xd9c942, 0.5);
      guideLine([rig.position.clone(), target], 0xd9c942, 0.5);
      // A short, restrained frustum makes the lens direction legible without obscuring the image.
      rig.updateMatrixWorld(true);
      const corners = [[-0.48, -0.28, 1.2], [0.48, -0.28, 1.2], [0.48, 0.28, 1.2], [-0.48, 0.28, 1.2]].map(p => rig.localToWorld(new THREE.Vector3(...p)));
      guideLine([...corners, corners[0]], 0xd9c942, 0.45);
      corners.forEach(corner => guideLine([rig.localToWorld(new THREE.Vector3(0, 0, 0.47)), corner], 0xd9c942, 0.25));
      renderer.render(scene, camera);
      const project = value => { const p = value.clone().project(camera); return { left: `${clamp((p.x + 1) * 50, 12, 88)}%`, top: `${clamp((1 - p.y) * 50, 20, 82)}%` }; };
      setLabels({ master: project(target.clone().add(new THREE.Vector3(0, imageHeight / 2 + 0.28, 0))), camera: project(rig.position.clone().add(new THREE.Vector3(0, 0.65, 0))) });
    };
    sceneRef.current = { render };
    const observer = new ResizeObserver(render); observer.observe(element);
    if (imageUrl) new THREE.TextureLoader().load(imageUrl, loaded => {
      if (!alive) { loaded.dispose(); return; }
      texture = loaded; texture.colorSpace = THREE.SRGBColorSpace;
      const ratio = loaded.image.width / loaded.image.height;
      const width = ratio >= 1 ? 2.9 : 2.1 * ratio; imageHeight = width / ratio;
      picture.scale.set(width / 2.9, imageHeight / 1.8, 1); frame.scale.set((width + 0.12) / 3.02, (imageHeight + 0.12) / 1.92, 1);
      imageMaterial.map = texture; imageMaterial.color.set(0xffffff); imageMaterial.needsUpdate = true; render();
    }, undefined, () => { /* Sliders remain usable when an old master file is missing. */ });
    render();
    return () => {
      alive = false; observer.disconnect(); sceneRef.current = null;
      disposeGuides(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      grid.geometry.dispose(); grid.material.dispose(); texture?.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, [ready, imageUrl]);
  React.useEffect(() => sceneRef.current?.render(), [position.azimuth, position.elevation, position.distance, pathMode, positionsKey]);

  return <div className="coverage-camera-stage" aria-label="Requested camera position diagram">
    <div className="coverage-camera-caption"><span><Camera size={15} />{index ? `Camera ${index + 1}` : "Master camera"}</span>
      <span>{travelMode ? `X ${xyz.slide.toFixed(2)} / Y ${xyz.boom.toFixed(2)} / Z ${xyz.dolly.toFixed(2)}` : `${Math.round(position.azimuth)}° / ${Math.round(position.elevation)}° / ${position.distance.toFixed(2)}x`}</span></div>
    <div ref={host} className="coverage-camera-webgl" tabIndex={0} role="application" aria-label={travelMode ? "Camera slide and boom" : "Camera orbit and elevation"}
      title={index ? travelMode ? "Drag or use arrow keys to slide and boom. Shift makes larger steps. Dolly sets depth. Positions are relative; H3 tracks the subject, not a locked heading." : "Drag to orbit and change elevation. Arrow keys adjust one degree; Shift adjusts five. Use Distance below to move closer or farther." : "Master camera is locked to the source image"}
      onPointerDown={event => { event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); if (!index || event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, position: { ...position }, width: event.currentTarget.getBoundingClientRect().width }; }}
      onPointerMove={event => { if (!drag.current) return; const start = drag.current;
        if (travelMode) { const from = coverageTravelPosition(start.position); changeTravel({ ...from, slide: from.slide + (event.clientX - start.x) / start.width * 2,
          boom: from.boom - (event.clientY - start.y) / start.width * 2 }); return; }
        onChange({ azimuth: Math.round(clamp(start.position.azimuth + (event.clientX - start.x) / start.width * 240, -180, 180)),
          elevation: Math.round(clamp(start.position.elevation - (event.clientY - start.y) / start.width * 120, -30, 60)) }); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => { if (!index || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation(); const amount = event.shiftKey ? 5 : 1;
        if (travelMode) { const key = ["ArrowLeft", "ArrowRight"].includes(event.key) ? "slide" : "boom";
          changeTravel({ ...xyz, [key]: xyz[key] + (["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1) * amount * 0.01 }); return; }
        onChange(event.key === "ArrowLeft" || event.key === "ArrowRight" ? { azimuth: clamp(position.azimuth + (event.key === "ArrowRight" ? amount : -amount), -180, 180) }
          : { elevation: clamp(position.elevation + (event.key === "ArrowUp" ? amount : -amount), -30, 60) }); }} />
    {(!ready || failed) && <span className="coverage-camera-fallback">{failed ? "3D preview unavailable" : "Loading camera view..."}</span>}
    {ready && !failed && <div className="coverage-camera-annotations" aria-hidden="true">
      <span style={labels.master}>Master image</span><span className="coverage-camera-tag" style={labels.camera}>{index ? `Camera ${index + 1}` : <LockKeyhole size={13} />}</span>
    </div>}
    <div className="coverage-camera-legend"><span><i />{travelMode ? "Slide" : "Orbit"}</span><span><i />{travelMode ? "Boom" : "Elevation"}</span>
      {travelMode && <span><i style={{ background: "#8ac792" }} />Dolly</span>}<span>{travelMode ? "Subject tracking" : "Requested position"}</span></div>
  </div>;
}
