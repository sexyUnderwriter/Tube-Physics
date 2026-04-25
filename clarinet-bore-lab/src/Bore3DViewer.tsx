import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  BoreSegment,
  BoreBend,
  PathPoint,
  ToneHole,
  calculateBorePathPoints,
  HoleEvaluation,
} from "./model";

interface Bore3DViewerProps {
  segments: BoreSegment[];
  bends: BoreBend[];
  holes: ToneHole[];
  results?: HoleEvaluation[];
  showHolePitch?: boolean;
  mouthpieceOverallLengthMm?: number;
  mouthpieceBoreMm?: number;
  cameraState?: { positionX: number; positionY: number; positionZ: number; targetX: number; targetY: number; targetZ: number };
  onCameraChange?: (state: { positionX: number; positionY: number; positionZ: number; targetX: number; targetY: number; targetZ: number }) => void;
}

export function Bore3DViewer({
  segments,
  bends,
  holes,
  results = [],
  showHolePitch = false,
  mouthpieceOverallLengthMm = 0,
  mouthpieceBoreMm = 0,
  cameraState = undefined,
  onCameraChange,
}: Bore3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraInitializedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
    camera.position.set(0, 200, 600);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Orbit controls — enables mouse drag, scroll-zoom, right-click pan
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight.position.set(300, 500, 300);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-200, -100, -200);
    scene.add(fillLight);

    const axesHelper = new THREE.AxesHelper(50);
    scene.add(axesHelper);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Restore camera state if provided
  useEffect(() => {
    if (cameraState && cameraRef.current && controlsRef.current && cameraInitializedRef.current) {
      cameraRef.current.position.set(cameraState.positionX, cameraState.positionY, cameraState.positionZ);
      controlsRef.current.target.set(cameraState.targetX, cameraState.targetY, cameraState.targetZ);
      cameraRef.current.updateProjectionMatrix();
      controlsRef.current.update();
    }
  }, [cameraState]);

  // Monitor camera changes and report them
  useEffect(() => {
    if (!cameraRef.current || !controlsRef.current || !onCameraChange) return;

    let lastReportTime = 0;
    const reportInterval = 100; // Report at most every 100ms

    const handleCameraChange = () => {
      const now = Date.now();
      if (now - lastReportTime > reportInterval) {
        lastReportTime = now;
        onCameraChange({
          positionX: cameraRef.current!.position.x,
          positionY: cameraRef.current!.position.y,
          positionZ: cameraRef.current!.position.z,
          targetX: controlsRef.current!.target.x,
          targetY: controlsRef.current!.target.y,
          targetZ: controlsRef.current!.target.z,
        });
      }
    };

    controlsRef.current.addEventListener("change", handleCameraChange);

    return () => {
      controlsRef.current?.removeEventListener("change", handleCameraChange);
    };
  }, [onCameraChange]);

  // Draw bore geometry
  useEffect(() => {
    if (!sceneRef.current) return;

    // Clear previous bore geometry
    const objectsToRemove: THREE.Object3D[] = [];
    sceneRef.current.children.forEach((child: THREE.Object3D) => {
      if (child.name.startsWith("bore-")) {
        objectsToRemove.push(child);
      }
    });
    objectsToRemove.forEach((obj) => sceneRef.current?.remove(obj));

    const pathPoints = calculateBorePathPoints(segments, bends);
    if (pathPoints.length < 2) return;

    const sortedSegs = [...segments].sort((a, b) => a.zMm - b.zMm);
    const totalZLength = sortedSegs.length > 0 ? sortedSegs[sortedSegs.length - 1].zMm : 0;
    if (totalZLength <= 0) return;

    const normalizedGroup = (value: string | undefined): string => (value ?? "").trim();
    const canInterpolatePair = (a: BoreSegment, b: BoreSegment): boolean => {
      const ga = normalizedGroup(a.interpolationGroup);
      return ga.length > 0 && ga === normalizedGroup(b.interpolationGroup);
    };

    const innerDiameterAtAcousticZ = (az: number): number => {
      if (az <= sortedSegs[0].zMm) return sortedSegs[0].diameterMm;
      for (let i = 0; i < sortedSegs.length - 1; i += 1) {
        const a = sortedSegs[i];
        const b = sortedSegs[i + 1];
        if (az <= b.zMm) {
          if (canInterpolatePair(a, b) && b.zMm > a.zMm) {
            const t = (az - a.zMm) / (b.zMm - a.zMm);
            return a.diameterMm + t * (b.diameterMm - a.diameterMm);
          }
          return a.diameterMm;
        }
      }
      return sortedSegs[sortedSegs.length - 1].diameterMm;
    };

    const outerDiameterAtAcousticZ = (az: number): number => {
      const outerOf = (s: BoreSegment) => s.outerDiameterMm ?? s.diameterMm;
      if (az <= sortedSegs[0].zMm) return outerOf(sortedSegs[0]);
      for (let i = 0; i < sortedSegs.length - 1; i += 1) {
        const a = sortedSegs[i];
        const b = sortedSegs[i + 1];
        if (az <= b.zMm) {
          if (canInterpolatePair(a, b) && b.zMm > a.zMm) {
            const t = (az - a.zMm) / (b.zMm - a.zMm);
            return outerOf(a) + t * (outerOf(b) - outerOf(a));
          }
          return outerOf(a);
        }
      }
      return outerOf(sortedSegs[sortedSegs.length - 1]);
    };

    const innerRadiusAtAcousticZ = (az: number): number =>
      Math.max(innerDiameterAtAcousticZ(az) * 0.5, 0.2);

    const outerRadiusAtAcousticZ = (az: number): number =>
      Math.max(outerDiameterAtAcousticZ(az) * 0.5, 0.2);

    // Build cumulative 3D arc lengths along the path
    const arcLengths: number[] = [0];
    for (let i = 1; i < pathPoints.length; i++) {
      const p1 = pathPoints[i - 1], p2 = pathPoints[i];
      arcLengths.push(
        arcLengths[i - 1] + Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2)
      );
    }
    const totalArcLen = arcLengths[arcLengths.length - 1];

    // Sample the path at arc-length s: returns 3D position + interpolated acoustic z
    const sampleAtArc = (s: number): { pos: THREE.Vector3; acousticZ: number } => {
      const clamped = Math.min(Math.max(s, 0), totalArcLen);
      for (let i = 0; i < pathPoints.length - 1; i++) {
        if (arcLengths[i + 1] >= clamped) {
          const segLen = arcLengths[i + 1] - arcLengths[i];
          const t = segLen > 0 ? (clamped - arcLengths[i]) / segLen : 0;
          const p1: PathPoint = pathPoints[i], p2: PathPoint = pathPoints[i + 1];
          return {
            pos: new THREE.Vector3(
              p1.x + t * (p2.x - p1.x),
              p1.y + t * (p2.y - p1.y),
              p1.z + t * (p2.z - p1.z)
            ),
            acousticZ: p1.acousticZ + t * (p2.acousticZ - p1.acousticZ),
          };
        }
      }
      const last = pathPoints[pathPoints.length - 1];
      return { pos: new THREE.Vector3(last.x, last.y, last.z), acousticZ: last.acousticZ };
    };

    const sampleAtAcousticZ = (
      targetZ: number
    ): { pos: THREE.Vector3; tangent: THREE.Vector3; uAxis: THREE.Vector3; vAxis: THREE.Vector3 } => {
      const z = Math.min(Math.max(targetZ, 0), totalZLength);
      for (let i = 0; i < pathPoints.length - 1; i++) {
        const p1 = pathPoints[i];
        const p2 = pathPoints[i + 1];
        const z1 = p1.acousticZ;
        const z2 = p2.acousticZ;
        const dz = z2 - z1;
        if (Math.abs(dz) < 1e-9) continue;
        const lo = Math.min(z1, z2);
        const hi = Math.max(z1, z2);
        if (z >= lo && z <= hi) {
          const t = (z - z1) / dz;
          const pos = new THREE.Vector3(
            p1.x + t * (p2.x - p1.x),
            p1.y + t * (p2.y - p1.y),
            p1.z + t * (p2.z - p1.z)
          );
          const tangent = new THREE.Vector3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z).normalize();
          const uAxis = new THREE.Vector3(
            p1.uAxisX + t * (p2.uAxisX - p1.uAxisX),
            p1.uAxisY + t * (p2.uAxisY - p1.uAxisY),
            p1.uAxisZ + t * (p2.uAxisZ - p1.uAxisZ)
          ).normalize();
          const vAxis = new THREE.Vector3(
            p1.vAxisX + t * (p2.vAxisX - p1.vAxisX),
            p1.vAxisY + t * (p2.vAxisY - p1.vAxisY),
            p1.vAxisZ + t * (p2.vAxisZ - p1.vAxisZ)
          ).normalize();
          return { pos, tangent, uAxis, vAxis };
        }
      }

      let bestIdx = 0;
      let bestDiff = Number.POSITIVE_INFINITY;
      for (let i = 0; i < pathPoints.length; i++) {
        const d = Math.abs(pathPoints[i].acousticZ - z);
        if (d < bestDiff) {
          bestDiff = d;
          bestIdx = i;
        }
      }
      const at = pathPoints[bestIdx];
      const prev = pathPoints[Math.max(0, bestIdx - 1)];
      const next = pathPoints[Math.min(pathPoints.length - 1, bestIdx + 1)];
      const tangent = new THREE.Vector3(next.x - prev.x, next.y - prev.y, next.z - prev.z);
      if (tangent.lengthSq() < 1e-9) tangent.set(0, 0, 1);
      tangent.normalize();
      const uAxis = new THREE.Vector3(at.uAxisX, at.uAxisY, at.uAxisZ).normalize();
      const vAxis = new THREE.Vector3(at.vAxisX, at.vAxisY, at.vAxisZ).normalize();
      return { pos: new THREE.Vector3(at.x, at.y, at.z), tangent, uAxis, vAxis };
    };

    // Build rings uniformly along 3D arc length (correct for both straight and curved sections)
    const RING_SEGMENTS = 32;
    const NUM_RINGS = 300;
    const positionsArr: number[] = [];
    const indicesArr: number[] = [];
    let prevU = new THREE.Vector3();

    for (let ri = 0; ri <= NUM_RINGS; ri++) {
      const s = (ri / NUM_RINGS) * totalArcLen;
      const { pos: center, acousticZ } = sampleAtArc(s);

      // Tangent: finite difference in arc-length space
      const ds = totalArcLen * 0.004;
      const cA = sampleAtArc(Math.max(0, s - ds)).pos;
      const cB = sampleAtArc(Math.min(totalArcLen, s + ds)).pos;
      const tangent = cB.clone().sub(cA).normalize();

      let uAxis: THREE.Vector3;
      let vAxis: THREE.Vector3;
      if (ri === 0) {
        const seed = Math.abs(tangent.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        uAxis = new THREE.Vector3().crossVectors(tangent, seed).normalize();
        vAxis = new THREE.Vector3().crossVectors(tangent, uAxis).normalize();
      } else {
        uAxis = prevU.clone().addScaledVector(tangent, -prevU.dot(tangent)).normalize();
        vAxis = new THREE.Vector3().crossVectors(tangent, uAxis).normalize();
      }
      prevU = uAxis.clone();

      const r = outerRadiusAtAcousticZ(acousticZ);
      for (let si = 0; si < RING_SEGMENTS; si++) {
        const angle = (si / RING_SEGMENTS) * Math.PI * 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        positionsArr.push(
          center.x + r * (cos * uAxis.x + sin * vAxis.x),
          center.y + r * (cos * uAxis.y + sin * vAxis.y),
          center.z + r * (cos * uAxis.z + sin * vAxis.z)
        );
      }
    }

    // Stitch rings into triangles
    for (let ri = 0; ri < NUM_RINGS; ri++) {
      for (let si = 0; si < RING_SEGMENTS; si++) {
        const a = ri * RING_SEGMENTS + si;
        const b = ri * RING_SEGMENTS + (si + 1) % RING_SEGMENTS;
        const c = (ri + 1) * RING_SEGMENTS + si;
        const d = (ri + 1) * RING_SEGMENTS + (si + 1) % RING_SEGMENTS;
        indicesArr.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positionsArr), 3));
    geometry.setIndex(indicesArr);
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
      color: 0x8b4513,
      opacity: 0.82,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "bore-tube-0";
    sceneRef.current.add(mesh);

    // Add physical mouthpiece extension beyond acoustic endpoint, matching the 2D tip treatment.
    let mouthpieceTipMesh: THREE.Mesh | null = null;
    const tipLength = Math.max(mouthpieceOverallLengthMm, 0);
    if (tipLength > 0) {
      const tail = sampleAtArc(totalArcLen);
      const beforeTail = sampleAtArc(Math.max(0, totalArcLen - Math.max(totalArcLen * 0.01, 1)));
      const tailDir = tail.pos.clone().sub(beforeTail.pos).normalize();
      if (tailDir.lengthSq() > 1e-9) {
        const tipStart = tail.pos.clone();
        const tipEnd = tail.pos.clone().add(tailDir.clone().multiplyScalar(tipLength));
        const tipStartRadius = Math.max(mouthpieceBoreMm * 0.5, 0.3);
        const tipEndRadius = 2;
        const tipGeom = new THREE.CylinderGeometry(tipEndRadius, tipStartRadius, tipLength, 20);
        const tipMat = new THREE.MeshPhongMaterial({
          color: 0x7a5326,
          opacity: 0.9,
          transparent: true,
          side: THREE.DoubleSide,
        });
        mouthpieceTipMesh = new THREE.Mesh(tipGeom, tipMat);
        mouthpieceTipMesh.position.copy(tipStart.clone().add(tipEnd).multiplyScalar(0.5));
        mouthpieceTipMesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          tipEnd.clone().sub(tipStart).normalize()
        );
        mouthpieceTipMesh.name = "bore-mouthpiece-tip";
        sceneRef.current.add(mouthpieceTipMesh);
      }
    }

    // Tone holes: chimney tube + inner aperture + outer opening.
    holes.forEach((hole, idx) => {
      const holeZ = Math.min(Math.max(hole.zMm, 0), totalZLength);
      const { pos: centerPos, tangent, uAxis, vAxis } = sampleAtAcousticZ(holeZ);
      const holeRadius = Math.max(hole.diameterMm * 0.5, 0.3);
      const localBoreRadius = innerRadiusAtAcousticZ(holeZ);

      const circumfRad = (hole.angleDeg * Math.PI) / 180;
      const radialDir = uAxis.clone().multiplyScalar(Math.cos(circumfRad)).add(vAxis.clone().multiplyScalar(Math.sin(circumfRad))).normalize();

      const aperturePos = centerPos.clone().add(radialDir.clone().multiplyScalar(localBoreRadius));

      const outerZ = hole.outerZMm ?? hole.zMm;
      const axialMm = outerZ - hole.zMm;
      const cappedAxial = Math.max(-hole.chimneyMm, Math.min(hole.chimneyMm, axialMm));
      const radialMm = Math.sqrt(Math.max(0, hole.chimneyMm ** 2 - cappedAxial ** 2));
      const openingPos = aperturePos
        .clone()
        .add(tangent.clone().multiplyScalar(cappedAxial))
        .add(radialDir.clone().multiplyScalar(radialMm));

      const chimneyVec = openingPos.clone().sub(aperturePos);
      const chimneyLen = chimneyVec.length();
      if (chimneyLen > 0.05) {
        const chimneyGeom = new THREE.CylinderGeometry(holeRadius, holeRadius, chimneyLen, 16);
        const chimneyMat = new THREE.MeshPhongMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.9 });
        const chimneyMesh = new THREE.Mesh(chimneyGeom, chimneyMat);
        chimneyMesh.position.copy(aperturePos.clone().add(openingPos).multiplyScalar(0.5));
        chimneyMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), chimneyVec.clone().normalize());
        chimneyMesh.name = `bore-hole-chimney-${idx}`;
        sceneRef.current?.add(chimneyMesh);
      }

      const apertureGeom = new THREE.SphereGeometry(Math.max(holeRadius * 0.45, 0.6), 12, 12);
      const apertureMat = new THREE.MeshBasicMaterial({ color: 0xffcaa4 });
      const apertureMesh = new THREE.Mesh(apertureGeom, apertureMat);
      apertureMesh.position.copy(aperturePos);
      apertureMesh.name = `bore-hole-aperture-${idx}`;
      sceneRef.current?.add(apertureMesh);

      const openingGeom = new THREE.SphereGeometry(Math.max(holeRadius * 0.6, 0.75), 12, 12);
      const openingMat = new THREE.MeshBasicMaterial({ color: 0xff6a00 });
      const openingMesh = new THREE.Mesh(openingGeom, openingMat);
      openingMesh.position.copy(openingPos);
      openingMesh.name = `bore-hole-opening-${idx}`;
      sceneRef.current?.add(openingMesh);

      // Add pitch label if enabled
      if (showHolePitch) {
        const evaluation = results.find((r) => r.id === hole.id);
        let labelText = hole.label;
        if (evaluation) {
          const cents =
            evaluation.centsErrorToTarget !== null
              ? evaluation.centsErrorToTarget
              : evaluation.centsErrorToNearest;
          const noteLabel =
            evaluation.centsErrorToTarget !== null
              ? hole.targetNote.trim() || evaluation.nearestNote
              : evaluation.nearestNote;
          const sign = cents >= 0 ? "+" : "-";
          labelText = `${noteLabel} ${sign}${Math.abs(cents).toFixed(1)}c`;
        }

        // Create canvas texture with label
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#1a1a1a";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 24px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(labelText, canvas.width / 2, canvas.height / 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.copy(openingPos.clone().add(radialDir.clone().multiplyScalar(15)));
        sprite.scale.set(40, 10, 1);
        sprite.name = `bore-hole-label-${idx}`;
        sceneRef.current?.add(sprite);
      }
    });

    // Bend markers: orange spheres at the arc midpoint of each bend
    bends.forEach((bend, idx) => {
      if (!sceneRef.current) return;
      const bendAcousticZ = totalZLength - bend.pathDistanceMm;
      const arcPts = pathPoints.filter((p) => Math.abs(p.acousticZ - bendAcousticZ) < 0.5);
      if (arcPts.length === 0) return;
      const mid = arcPts[Math.floor(arcPts.length / 2)];
      const markerGeo = new THREE.SphereGeometry(6, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.position.set(mid.x, mid.y, mid.z);
      marker.name = `bore-bend-${idx}`;
      sceneRef.current.add(marker);
    });

    // Auto-fit camera to the bore bounding box on first load only
    if (cameraRef.current && controlsRef.current && !cameraInitializedRef.current) {
      cameraInitializedRef.current = true;
      const bbox = new THREE.Box3().setFromBufferAttribute(
        geometry.getAttribute("position") as THREE.BufferAttribute
      );
      if (mouthpieceTipMesh) {
        bbox.union(new THREE.Box3().setFromObject(mouthpieceTipMesh));
      }
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const cam = cameraRef.current;
      cam.near = maxDim * 0.001;
      cam.far = maxDim * 20;
      cam.position.set(center.x + maxDim * 0.8, center.y + maxDim * 0.4, center.z + maxDim * 0.8);
      cam.lookAt(center);
      cam.updateProjectionMatrix();
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    } else if (cameraRef.current && controlsRef.current && cameraInitializedRef.current) {
      // Update camera near/far planes for new geometry bounds, but preserve position
      const bbox = new THREE.Box3().setFromBufferAttribute(
        geometry.getAttribute("position") as THREE.BufferAttribute
      );
      if (mouthpieceTipMesh) {
        bbox.union(new THREE.Box3().setFromObject(mouthpieceTipMesh));
      }
      const size = new THREE.Vector3();
      bbox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const cam = cameraRef.current;
      cam.near = maxDim * 0.001;
      cam.far = maxDim * 20;
      cam.updateProjectionMatrix();
    }
  }, [segments, bends, holes, results, showHolePitch]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "900px",
        border: "1px solid #333",
        position: "relative",
        borderRadius: "4px",
        overflow: "hidden",
      }}
    />
  );
}
