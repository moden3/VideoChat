//import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.154.0/three.min.js";

window.addEventListener('DOMContentLoaded', init);
/*window.onload = () => {
  init();
};*/

const width = window.innerWidth;
const height = window.innerHeight;

function init() {
  
  const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector("#myCanvas"),
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);

  // scene
  const scene = new THREE.Scene();

  // camera
  const camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000);
  //const camera = new THREE.OrthographicCamera(-480, +480, 270, -270, 1, 2000);
  camera.position.set(0, 0, 1000);

  // Sphere
  const geometry = new THREE.SphereGeometry(350, 30, 30);

  // Texture
  const material = new THREE.MeshStandardMaterial({
    map: new THREE.TextureLoader().load(
      "https://raw.githubusercontent.com/watataku8911/threejs-earth/default-earth/earthmap1k.jpeg"
    ),
  });

  // Mesh
  const earthMesh = new THREE.Mesh(geometry, material);
  scene.add(earthMesh);

  // create stardust
  const createStarField = () => {
    // 1000 stars
    const vertices = [];
    const colors = [];
    for (let i = 0; i < 1000; i++) {
      // vertices
      const x = 3000 * (Math.random()- 0.5);
      const y = 3000 * (Math.random() - 0.5);
      const z = 3000 * (Math.random() - 0.5);
      vertices.push(x, y, z);
      // colors
      const colorX = Math.random();
      const colorY = Math.random();
      const colorZ = Math.random();
      colors.push(colorX, colorY, colorZ);
    }

    // set shape
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    // set color
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    // create material
    const material = new THREE.PointsMaterial({
      size: 10,
      color: 0xffffff,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
    });

    // add mesh
    const mesh = new THREE.Points(geometry, material);
    scene.add(mesh);
  };

  createStarField();

  // parallel light
  const directionalLight = new THREE.DirectionalLight(0xffffff);
  //directionalLight.intensity - 2;
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  // loop event
  tick();

  function tick() {
    requestAnimationFrame(tick);
    
    earthMesh.rotation.y += 0.01;
    renderer.render(scene, camera);
  }
}
