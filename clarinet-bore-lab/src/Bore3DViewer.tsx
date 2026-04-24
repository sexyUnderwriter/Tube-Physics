import { useEffect, useRef } from "react";
import * as THREE from "three";
import { BoreSegment, BoreBend, calculateBorePathPoints } from "./model";

interface Bore3DViewerProps {
  segments: BoreSegment[];
  bends: BoreBend[];
}

export function Bore3DViewer({ segments, bends }: Bore3DViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const bendHelperRef = useRef<Map<string, THREE.Object3D>>(new Map());

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);
    sceneRef.current = scene;

    // Camera
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 5000);
    camera.position.set(150, 100, 150);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 100);
    scene.add(directionalLight);

    // Axes helper
    const axesHelper = new THREE.AxesHelper(200);
    scene.add(axesHelper);

    // Grid helper
    const gridHelper = new THREE.GridHelper(400, 20, 0x444444, 0x222222);
    scene.add(gridHelper);

    // Render loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

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

    const points = calculateBorePathPoints(segments, bends);
    if (points.length < 2) return;

    // Draw bore tube as a line
    const lineGeometry = new THREE.BufferGeometry();
    const linePositions = points.flatMap((p) => [p.x, p.y, p.z]);
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(linePositions), 3));
    
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 3 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.name = "bore-path";
    sceneRef.current.add(line);

    // Draw bore as a tube with varying diameter
    const tubeSegments = 32;
    for (let i = 0; i < points.length - 1; i += 1) {
      const p1 = points[i];
      const p2 = points[i + 1];

      // Get diameter at this segment
      const segment = segments[Math.min(i, segments.length - 1)];
      const diameter = segment.diameterMm;
      const radius = diameter * 0.5;

      // Create a cylinder for this segment
      const direction = new THREE.Vector3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
      const length = direction.length();
      direction.normalize();

      const geometry = new THREE.CylinderGeometry(radius, radius, length, tubeSegments);
      const material = new THREE.MeshPhongMaterial({ 
        color: 0x8b4513,
        wireframe: false,
        opacity: 0.7,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, material);

      // Position at midpoint
      const midpoint = new THREE.Vector3(
        (p1.x + p2.x) * 0.5,
        (p1.y + p2.y) * 0.5,
        (p1.z + p2.z) * 0.5
      );
      mesh.position.copy(midpoint);

      // Orient along the path
      const up = new THREE.Vector3(0, 1, 0);
      if (Math.abs(direction.y) > 0.99) {
        up.set(1, 0, 0);
      }
      const right = new THREE.Vector3().crossVectors(direction, up).normalize();
      up.crossVectors(right, direction);

      const quaternion = new THREE.Quaternion();
      const matrix = new THREE.Matrix4();
      matrix.makeBasis(right, up, direction.clone().multiplyScalar(-1));
      quaternion.setFromRotationMatrix(matrix);
      mesh.quaternion.copy(quaternion);

      mesh.name = `bore-tube-${i}`;
      sceneRef.current.add(mesh);
    }
  }, [segments, bends]);

  // Draw bend controllers
  useEffect(() => {
    if (!sceneRef.current) return;

    // Clear previous bend helpers
    bendHelperRef.current.forEach((obj) => sceneRef.current?.remove(obj));
    bendHelperRef.current.clear();

    bends.forEach((bend) => {
      if (!sceneRef.current) return;
      // Placeholder position - would need proper interpolation
      const geometry = new THREE.SphereGeometry(10, 16, 16);
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(0, 0, bend.pathDistanceMm);
      sphere.userData.bendId = bend.id;
      sceneRef.current.add(sphere);
      bendHelperRef.current.set(bend.id, sphere);
    });
  }, [bends]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "600px",
        border: "1px solid #ccc",
        position: "relative",
      }}
    />
  );
}
