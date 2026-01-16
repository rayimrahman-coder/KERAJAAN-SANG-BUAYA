// FIX: Use the THREE instance from MindAR to stop the "Multiple instances" warning
const THREE = window.MINDAR.IMAGE.THREE; 
import { DRACOLoader } from "../../libs/three.js-r132/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "../../libs/three.js-r132/examples/jsm/loaders/GLTFLoader.js";

const MindARThree = window.MINDAR.IMAGE.MindARThree;

const initializeMindAR = () => {
  return new MindARThree({ 
    container: document.body,
    imageTargetSrc: '../../assets/targets/Buaya.mind', 
  });
};

const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.4.3/'); 
loader.setDRACOLoader(dracoLoader);

const setupLighting = (scene) => {
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight.position.set(0, 5, 5);
  scene.add(dirLight);
};

const loadModel = async (path, scale = { x: 0.1, y: 0.1, z: 0.1 }, position = { x: 0, y: -0.4, z: 0 }) => {
  try {
    const model = await loader.loadAsync(path);
    model.scene.scale.set(scale.x, scale.y, scale.z);
    model.scene.position.set(position.x, position.y, position.z);
    
    model.scene.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
    return model;
  } catch (error) {
    console.error(`Error loading model at ${path}:`, error);
    return null;
  }
};

const enableZoomAndRotation = (camera, model) => {
  if (!model || !model.scene) return;
  let scaleFactor = model.scene.scale.x;
  let isDragging = false;
  let previousPosition = { x: 0, y: 0 };
  let initialDistance = null;

  const handleStart = (event) => {
    if (event.touches && event.touches.length === 1) {
      isDragging = true;
      previousPosition = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    } else if (event.touches && event.touches.length === 2) {
      isDragging = false;
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      initialDistance = Math.sqrt(dx * dx + dy * dy);
    } else if (event.type === 'mousedown') {
      isDragging = true;
      previousPosition = { x: event.clientX, y: event.clientY };
    }
  };

  const handleMove = (event) => {
    if (!model.scene.visible) return;
    if (isDragging && (event.type === 'mousemove' || (event.touches && event.touches.length === 1))) {
      const currentPosition = event.touches
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
        : { x: event.clientX, y: event.clientY };
      const deltaMove = { x: currentPosition.x - previousPosition.x };
      model.scene.rotation.y += deltaMove.x * 0.01;
      previousPosition = currentPosition;
    } else if (event.touches && event.touches.length === 2 && initialDistance) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);
      const zoomDelta = (currentDistance - initialDistance) * 0.005;
      scaleFactor = Math.min(Math.max(scaleFactor + zoomDelta, 0.2), 2.5);
      model.scene.scale.set(scaleFactor, scaleFactor, scaleFactor);
      initialDistance = currentDistance;
    }
  };

  const handleEnd = () => { isDragging = false; initialDistance = null; };
  window.addEventListener('mousedown', handleStart);
  window.addEventListener('mousemove', handleMove);
  window.addEventListener('mouseup', handleEnd);
  window.addEventListener('touchstart', handleStart);
  window.addEventListener('touchmove', handleMove);
  window.addEventListener('touchend', handleEnd);
};

const setupAnchorWithAutoAnimationAndAudio = async (mindarThree, model, anchorId, audioPath) => {
  if (!model) return null;
  const anchor = mindarThree.addAnchor(anchorId);
  anchor.group.add(model.scene);

  let mixer = null;
  let actions = [];
  if (model.animations && model.animations.length > 0) {
      mixer = new THREE.AnimationMixer(model.scene);
      actions = model.animations.map(clip => {
        const action = mixer.clipAction(clip);
        action.play();
        return action;
      });
  }

  const audio = new Audio(audioPath);
  audio.loop = true;

  anchor.onTargetFound = () => {
    model.scene.visible = true;
    actions.forEach(action => { action.paused = false; });
    audio.play().catch(e => console.warn(`Audio play failed for ${audioPath}:`, e.message));
  };

  anchor.onTargetLost = () => {
    model.scene.visible = false;
    actions.forEach(action => action.paused = true);
    audio.pause();
    audio.currentTime = 0;
  };

  return mixer;
};

const enablePlayOnInteraction = (renderer, scene, camera, model, mixer) => {
  if (!model || !mixer) return;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  window.addEventListener("pointerdown", (event) => {
    if (!model.scene.visible) return;
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    pointer.x = (clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(model.scene.children, true);
    if (intersects.length > 0) {
      mixer.timeScale = (mixer.timeScale === 0) ? 1 : 0;
    }
  });
};

const startRenderingLoop = (renderer, scene, camera, options) => {
  renderer.setAnimationLoop(() => {
    const delta = renderer.clock.getDelta();
    if (options.update) options.update(delta);
    renderer.render(scene, camera);
  });
};

document.addEventListener('DOMContentLoaded', () => {
  const start = async () => {
    const mindarThree = initializeMindAR();
    const { renderer, scene, camera } = mindarThree;
    renderer.clock = new THREE.Clock();
    setupLighting(scene);

    // FIX: Destructure all 10 models correctly
    const [
        Scene1Model, Scene2Model, Scene3Model, Scene4Model, 
        Scene5Model, Scene6Model, Scene7Model, Scene8Model, 
        Scene9Model, Scene10Model
    ] = await Promise.all([
        loadModel('../../assets/models/scene1.glb'),
        loadModel('../../assets/models/scene2.glb'),
        loadModel('../../assets/models/scene3.glb'),
        loadModel('../../assets/models/scene4.glb'),
        loadModel('../../assets/models/scene5.glb'),
        loadModel('../../assets/models/scene6.glb'),
        loadModel('../../assets/models/scene7.glb'),
        loadModel('../../assets/models/scene8.glb'),
        loadModel('../../assets/models/scene9.glb'),
        loadModel('../../assets/models/scene10.glb')
    ]);

    const Scene1Mixer = await setupAnchorWithAutoAnimationAndAudio(mindarThree, Scene1Model, 0, '../../assets/sounds/BI/SCENE 1-BI.mp3');
    const Scene2Mixer = await setupAnchorWithAutoAnimationAndAudio(mindarThree, Scene2Model, 1, '../../assets/sounds/BI/SCENE 2-BI.mp3');
    const Scene3Mixer = await setupAnchorWithAutoAnimationAndAudio(mindarThree, Scene3Model, 2, '../../assets/sounds/BI/SCENE 3-BI.mp3');
    const Scene4Mixer = await setupAnchorWithAutoAnimationAndAudio(mindarThree, Scene4Model, 3, '../../assets/sounds/BI/SCENE 4-BI.mp3');
    const Scene5Mixer = await setupAnchorWithAutoAnimationAndAudio(mindarThree, Scene5Model, 4, '../../assets/sounds/BI/SCENE 5-BI.mp3');
    const Scene6Mixer = await setupAnchorWithAutoAnimationAndAudio(mindarThree, Scene6Model, 5, '../../assets/sounds/BI/SCENE 6-BI.mp3');
    const Scene7Mixer = await setupAnchorWithAutoAnimationAndAudio(mindarThree, Scene7Model, 6, '../../assets/sounds/BI/SCENE 7-BI.mp3');
    const Scene8Mixer = await setupAnchorWithAutoAnimationAndAudio(mindarThree, Scene8Model, 7, '../../assets/sounds/BI/SCENE 8-BI.mp3');
    const Scene9Mixer = await setupAnchorWithAutoAnimationAndAudio(mindarThree, Scene9Model, 8, '../../assets/sounds/BI/SCENE 9-BI.mp3');
    const Scene10Mixer = await setupAnchorWithAutoAnimationAndAudio(mindarThree, Scene10Model, 9, '../../assets/sounds/BI/SCENE 10-BI.mp3');

    // Enable interactions for all
    const models = [Scene1Model, Scene2Model, Scene3Model, Scene4Model, Scene5Model, Scene6Model, Scene7Model, Scene8Model, Scene9Model, Scene10Model];
    const mixers = [Scene1Mixer, Scene2Mixer, Scene3Mixer, Scene4Mixer, Scene5Mixer, Scene6Mixer, Scene7Mixer, Scene8Mixer, Scene9Mixer, Scene10Mixer];

    models.forEach((model, index) => {
        if (model) {
            enablePlayOnInteraction(renderer, scene, camera, model, mixers[index]);
            enableZoomAndRotation(camera, model);
        }
    });

    await mindarThree.start();
    startRenderingLoop(renderer, scene, camera, {
      update: (delta) => {
        mixers.forEach(m => { if(m) m.update(delta); });
      },
    });
  };

  start();
});