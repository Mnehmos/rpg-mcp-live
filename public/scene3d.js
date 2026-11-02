import * as THREE from "/vendor/three/three.module.js";
import { HERO_RADIUS, moveDirection, nearestInteraction, planScene, stepHero } from "./scene-layout.js";

/**
 * The 3D scene view: the hero's current room, walkable with WASD/arrows or a
 * tap on the floor, with a third-person camera you can drag to look around.
 * Walking up to a person or an exit offers it as a move; E (or a tap on the
 * prompt, or a tap on the person) sends that move to the DM.
 *
 * Movement inside a room is presentation: the engine has no positions here,
 * so nothing is sent until the hero acts on something.
 */
var WALK_SPEED = 3.6;
var RUN_SPEED = 6.2;
var KEYMAP = {
  KeyW: "forward", ArrowUp: "forward",
  KeyS: "back", ArrowDown: "back",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
};

export function createSceneStage(root, options) {
  var host = root.querySelector(".scene-stage-canvas");
  var roomLabel = root.querySelector(".scene-stage-room");
  var promptButton = root.querySelector(".scene-stage-prompt");
  var emptyNote = root.querySelector(".scene-stage-empty");
  var onInteract = options && options.onInteract ? options.onInteract : function () {};

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (error) {
    root.hidden = true;
    return { setScene: function () {}, setBusy: function () {}, dispose: function () {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  var roomGroup = new THREE.Group();
  scene.add(roomGroup);

  var hero = buildHero();
  scene.add(hero.group);

  var view = { yaw: 0, pitch: 0.82, distance: 10 };
  var keys = { forward: false, back: false, left: false, right: false, run: false };
  var plan = null;
  var heroPosition = { x: 0, z: 0 };
  var heroFacing = Math.PI;
  var moveTarget = null;
  var pendingInteraction = null;
  var interaction = null;
  var busy = false;
  var walkPhase = 0;
  var pickables = [];
  var running = true;
  var lastTime = performance.now();
  var lights = buildLights(scene);

  function resize() {
    var width = host.clientWidth || 1;
    var height = host.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  var resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  function setScene(sceneView, heroName) {
    var next = planScene(sceneView);
    hero.setName(heroName || "You");
    if (!next) {
      plan = null;
      clearGroup(roomGroup);
      pickables = [];
      hero.group.visible = false;
      roomLabel.textContent = "";
      emptyNote.hidden = false;
      updatePrompt(null);
      return;
    }
    emptyNote.hidden = true;
    hero.group.visible = true;
    var sameRoom = plan && plan.roomId === next.roomId;
    plan = next;
    roomLabel.textContent = next.name;
    clearGroup(roomGroup);
    pickables = buildRoom(roomGroup, next, lights, scene);
    if (!sameRoom) {
      heroPosition = { x: next.spawn.x, z: next.spawn.z };
      heroFacing = Math.PI;
      moveTarget = null;
      pendingInteraction = null;
    } else {
      heroPosition = stepHero(heroPosition, 0, 0, next);
    }
  }

  function setBusy(value) {
    busy = Boolean(value);
    updatePrompt(interaction);
  }

  function updatePrompt(target) {
    interaction = target;
    if (!target) {
      promptButton.hidden = true;
      return;
    }
    promptButton.hidden = false;
    promptButton.disabled = busy;
    promptButton.innerHTML = '<kbd>E</kbd><span></span>';
    promptButton.querySelector("span").textContent = busy ? "The DM is working…" : target.verb;
  }

  function act(target) {
    if (!target || busy) return;
    onInteract(target.prompt);
  }

  // Keyboard: only while the scene has focus, so typing in the composer never moves the hero.
  function onKey(event, down) {
    if (event.code === "ShiftLeft" || event.code === "ShiftRight") { keys.run = down; return; }
    var key = KEYMAP[event.code];
    if (key) {
      keys[key] = down;
      if (down) { moveTarget = null; pendingInteraction = null; }
      event.preventDefault();
      return;
    }
    if (down && (event.code === "KeyE" || event.code === "Enter")) {
      event.preventDefault();
      act(interaction);
    }
  }
  var keyDown = function (event) { onKey(event, true); };
  var keyUp = function (event) { onKey(event, false); };
  host.addEventListener("keydown", keyDown);
  host.addEventListener("keyup", keyUp);
  host.addEventListener("blur", function () { keys.forward = keys.back = keys.left = keys.right = keys.run = false; });

  // Pointer: a tap walks there (or to a person/exit, acting on arrival); a drag looks around.
  var raycaster = new THREE.Raycaster();
  var floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  var drag = null;
  host.addEventListener("pointerdown", function (event) {
    host.focus({ preventScroll: true });
    drag = { x: event.clientX, y: event.clientY, yaw: view.yaw, pitch: view.pitch, moved: false, id: event.pointerId };
    host.setPointerCapture(event.pointerId);
  });
  host.addEventListener("pointermove", function (event) {
    if (!drag || drag.id !== event.pointerId) return;
    var dx = event.clientX - drag.x;
    var dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    drag.moved = true;
    view.yaw = drag.yaw - dx * 0.008;
    view.pitch = Math.max(0.35, Math.min(1.35, drag.pitch + dy * 0.005));
  });
  host.addEventListener("pointerup", function (event) {
    if (!drag || drag.id !== event.pointerId) return;
    var wasDrag = drag.moved;
    drag = null;
    if (wasDrag || !plan) return;
    var rect = renderer.domElement.getBoundingClientRect();
    var pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    var hit = raycaster.intersectObjects(pickables, true)[0];
    var target = hit ? findTarget(hit.object) : null;
    if (target) {
      moveTarget = { x: target.x, z: target.z };
      pendingInteraction = target;
      return;
    }
    var point = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(floorPlane, point)) {
      moveTarget = { x: point.x, z: point.z };
      pendingInteraction = null;
    }
  });
  host.addEventListener("wheel", function (event) {
    event.preventDefault();
    view.distance = Math.max(5, Math.min(20, view.distance + event.deltaY * 0.01));
  }, { passive: false });
  promptButton.addEventListener("click", function () { act(interaction); });

  function findTarget(object) {
    while (object) {
      if (object.userData && object.userData.target) return object.userData.target;
      object = object.parent;
    }
    return null;
  }

  function tick(now) {
    if (!running) return;
    requestAnimationFrame(tick);
    var dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    if (document.hidden || !root.isConnected || root.hidden) return;

    var moving = false;
    if (plan) {
      var speed = keys.run ? RUN_SPEED : WALK_SPEED;
      var direction = moveDirection(keys, view.yaw);
      if (!direction.x && !direction.z && moveTarget) {
        var tx = moveTarget.x - heroPosition.x;
        var tz = moveTarget.z - heroPosition.z;
        var remaining = Math.sqrt(tx * tx + tz * tz);
        var stopAt = pendingInteraction ? pendingInteraction.r + HERO_RADIUS + 0.35 : 0.08;
        if (remaining <= stopAt) {
          moveTarget = null;
          if (pendingInteraction) { var arrived = pendingInteraction; pendingInteraction = null; heroFacing = Math.atan2(tx, tz); act(arrived); }
        } else {
          direction = { x: tx / remaining, z: tz / remaining };
        }
      }
      if (direction.x || direction.z) {
        var before = heroPosition;
        heroPosition = stepHero(heroPosition, direction.x * speed * dt, direction.z * speed * dt, plan);
        var travelled = Math.abs(heroPosition.x - before.x) + Math.abs(heroPosition.z - before.z);
        // Stuck against something while walking to a tapped spot: give up rather than push forever.
        if (moveTarget && travelled < speed * dt * 0.1) { moveTarget = null; pendingInteraction = null; }
        heroFacing = turnToward(heroFacing, Math.atan2(direction.x, direction.z), dt * 12);
        moving = travelled > 0.0001;
      }
      var near = nearestInteraction(heroPosition, plan);
      if (near !== interaction) updatePrompt(near);
    }

    walkPhase += moving ? dt * (keys.run ? 14 : 10) : 0;
    hero.group.position.set(heroPosition.x, moving ? Math.abs(Math.sin(walkPhase)) * 0.08 : 0, heroPosition.z);
    hero.group.rotation.y = heroFacing;
    lights.heroLight.position.set(heroPosition.x, 2.2, heroPosition.z);
    lights.sun.target.position.set(heroPosition.x, 0, heroPosition.z);

    // Aim a little ahead of the hero, so the room in front fills the frame
    // rather than the wall behind them.
    var focus = new THREE.Vector3(heroPosition.x - Math.sin(view.yaw) * 2, 1, heroPosition.z - Math.cos(view.yaw) * 2);
    var offset = new THREE.Vector3(
      Math.sin(view.yaw) * Math.cos(view.pitch),
      Math.sin(view.pitch),
      Math.cos(view.yaw) * Math.cos(view.pitch)
    ).multiplyScalar(view.distance);
    camera.position.lerp(focus.clone().add(offset), 1 - Math.pow(0.001, dt));
    camera.lookAt(focus);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);

  function dispose() {
    running = false;
    resizeObserver.disconnect();
    host.removeEventListener("keydown", keyDown);
    host.removeEventListener("keyup", keyUp);
    clearGroup(roomGroup);
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { setScene: setScene, setBusy: setBusy, dispose: dispose };
}

function turnToward(current, target, maxStep) {
  var delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + Math.max(-maxStep, Math.min(maxStep, delta));
}

function clearGroup(group) {
  while (group.children.length) {
    var child = group.children.pop();
    child.traverse(function (node) {
      // Sprites share one internal geometry; only their materials are ours.
      if (node.geometry && !node.isSprite) node.geometry.dispose();
      if (node.material) {
        (Array.isArray(node.material) ? node.material : [node.material]).forEach(function (material) {
          if (material.map) material.map.dispose();
          material.dispose();
        });
      }
    });
  }
}

function buildLights(scene) {
  var hemisphere = new THREE.HemisphereLight(0xfff1dc, 0x1a1510, 1.1);
  scene.add(hemisphere);
  var sun = new THREE.DirectionalLight(0xffe2b8, 1.4);
  sun.position.set(-6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  scene.add(sun);
  scene.add(sun.target);
  var heroLight = new THREE.PointLight(0xffb15c, 0, 9, 1.6);
  scene.add(heroLight);
  return { hemisphere: hemisphere, sun: sun, heroLight: heroLight };
}

function material(color, extra) {
  return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: 0.85, metalness: 0.05 }, extra || {}));
}

function labelSprite(text, color) {
  var canvas = document.createElement("canvas");
  var context = canvas.getContext("2d");
  var font = "600 44px Georgia, serif";
  context.font = font;
  var width = Math.ceil(context.measureText(text).width) + 48;
  canvas.width = width;
  canvas.height = 76;
  context.font = font;
  context.fillStyle = "rgba(14, 11, 7, 0.78)";
  context.fillRect(0, 0, width, 76);
  context.fillStyle = color || "#f2ecdf";
  context.textBaseline = "middle";
  context.fillText(text, 24, 40);
  var texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  var sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.scale.set(width / 140, 76 / 140, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function buildHero() {
  var group = new THREE.Group();
  var body = new THREE.Mesh(new THREE.CapsuleGeometry(HERO_RADIUS * 0.85, 0.9, 6, 14), material(0x9bc8ac, { roughness: 0.6 }));
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  var cloak = new THREE.Mesh(new THREE.ConeGeometry(HERO_RADIUS * 1.15, 1.1, 14, 1, true), material(0x2f4a3a, { side: THREE.DoubleSide }));
  cloak.position.y = 0.75;
  cloak.castShadow = true;
  group.add(cloak);
  var nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 10), material(0xe9a75b, { emissive: 0x6b3d12 }));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.45, HERO_RADIUS * 0.9);
  group.add(nose);
  var ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 32), new THREE.MeshBasicMaterial({ color: 0xe9a75b, transparent: true, opacity: 0.7 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);
  var label = null;
  return {
    group: group,
    setName: function (name) {
      if (label && label.userData.name === name) return;
      if (label) { group.remove(label); label.material.map.dispose(); label.material.dispose(); }
      label = labelSprite(name, "#9bc8ac");
      label.userData.name = name;
      label.position.y = 2.35;
      group.add(label);
    },
  };
}

function buildRoom(group, plan, lights, scene) {
  var style = plan.style;
  var pickables = [];
  var halfW = plan.size.w / 2;
  var halfD = plan.size.d / 2;

  scene.background = new THREE.Color(style.sky);
  scene.fog = plan.fog
    ? new THREE.FogExp2(style.sky, 0.045)
    : new THREE.Fog(style.sky, 22, 48);
  lights.hemisphere.intensity = plan.dark ? 0.12 : plan.bright ? 2.1 : 1.6;
  lights.sun.intensity = plan.dark ? 0.05 : plan.bright ? 2.6 : 1.9;
  lights.heroLight.intensity = plan.dark || plan.lit ? 14 : 3;

  // Ground beyond the walls, so the camera never looks out into a void.
  var outside = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), material(new THREE.Color(style.floor).multiplyScalar(0.55), { roughness: 1 }));
  outside.rotation.x = -Math.PI / 2;
  outside.position.y = -0.02;
  outside.receiveShadow = true;
  group.add(outside);
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(plan.size.w, plan.size.d, 1, 1), material(style.floor, { roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  var grid = new THREE.GridHelper(Math.max(plan.size.w, plan.size.d), Math.max(plan.size.w, plan.size.d), 0x000000, 0x000000);
  grid.material.opacity = 0.12;
  grid.material.transparent = true;
  grid.position.y = 0.01;
  group.add(grid);

  // Low walls with a gap wherever an exit sits.
  var wallMaterial = material(style.wall);
  var gaps = { north: [], south: [], east: [], west: [] };
  plan.exits.forEach(function (exit) { gaps[exit.wall].push(exit.wall === "north" || exit.wall === "south" ? exit.x : exit.z); });
  function wallRun(side, from, to) {
    var length = to - from;
    if (length <= 0.05) return;
    var horizontal = side === "north" || side === "south";
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? length : 0.4, 1.3, horizontal ? 0.4 : length), wallMaterial);
    var mid = (from + to) / 2;
    if (side === "north") mesh.position.set(mid, 0.65, -halfD);
    if (side === "south") mesh.position.set(mid, 0.65, halfD);
    if (side === "east") mesh.position.set(halfW, 0.65, mid);
    if (side === "west") mesh.position.set(-halfW, 0.65, mid);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  ["north", "south", "east", "west"].forEach(function (side) {
    var half = side === "north" || side === "south" ? halfW : halfD;
    var cursor = -half;
    gaps[side].sort(function (a, b) { return a - b; }).forEach(function (center) {
      wallRun(side, cursor, center - 1.1);
      cursor = center + 1.1;
    });
    wallRun(side, cursor, half);
  });

  plan.exits.forEach(function (exit) {
    var arch = new THREE.Group();
    var stone = material(style.wall, { roughness: 0.7 });
    var glow = new THREE.MeshBasicMaterial({ color: style.accent, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    var left = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.4, 0.3), stone);
    var right = left.clone();
    left.position.set(-1.05, 1.2, 0);
    right.position.set(1.05, 1.2, 0);
    var lintel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 0.3), stone);
    lintel.position.set(0, 2.45, 0);
    var veil = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.3), glow);
    veil.position.set(0, 1.15, 0);
    [left, right, lintel].forEach(function (mesh) { mesh.castShadow = true; arch.add(mesh); });
    arch.add(veil);
    var label = labelSprite(exit.label, "#e9a75b");
    label.position.set(0, 3.1, 0);
    arch.add(label);
    var edge = exit.wall === "north" ? -halfD : exit.wall === "south" ? halfD : exit.wall === "east" ? halfW : -halfW;
    if (exit.wall === "north" || exit.wall === "south") arch.position.set(exit.x, 0, edge);
    else { arch.position.set(edge, 0, exit.z); arch.rotation.y = Math.PI / 2; }
    arch.userData.target = exit;
    group.add(arch);
    pickables.push(arch);
  });

  plan.actors.forEach(function (actor) {
    var figure = new THREE.Group();
    var color = actor.kind === "enemy" ? 0xcd685a : 0x7fb3c4;
    var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.9, 6, 12), material(color, { roughness: 0.55 }));
    body.position.y = 0.9;
    body.castShadow = true;
    figure.add(body);
    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.08, 24), material(0x15110b));
    base.position.y = 0.04;
    figure.add(base);
    var label = labelSprite(actor.name, actor.kind === "enemy" ? "#f0b0a5" : "#f2ecdf");
    label.position.y = 2.25;
    figure.add(label);
    figure.position.set(actor.x, 0, actor.z);
    figure.rotation.y = Math.atan2(plan.spawn.x - actor.x, plan.spawn.z - actor.z);
    figure.userData.target = actor;
    group.add(figure);
    pickables.push(figure);
  });

  plan.props.forEach(function (prop) {
    var mesh = buildProp(prop, style);
    mesh.position.set(prop.x, 0, prop.z);
    mesh.rotation.y = prop.rotation;
    mesh.scale.setScalar(prop.scale);
    group.add(mesh);
  });

  return pickables;
}

function buildProp(prop, style) {
  var group = new THREE.Group();
  function add(geometry, color, y, extra) {
    var mesh = new THREE.Mesh(geometry, material(color, extra));
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  switch (prop.kind) {
    case "tree":
      add(new THREE.CylinderGeometry(0.16, 0.22, 1.4, 8), 0x4a3524, 0.7);
      add(new THREE.ConeGeometry(0.9, 2.2, 9), 0x2f5a2c, 2.3);
      break;
    case "bush":
      add(new THREE.IcosahedronGeometry(0.5, 0), 0x3d6b36, 0.4);
      break;
    case "rock":
      add(new THREE.DodecahedronGeometry(0.5, 0), 0x6b665e, 0.35);
      break;
    case "boulder":
      add(new THREE.DodecahedronGeometry(0.85, 0), 0x5e5953, 0.6);
      break;
    case "crate":
      add(new THREE.BoxGeometry(0.85, 0.85, 0.85), 0x7a5634, 0.43);
      break;
    case "barrel":
      add(new THREE.CylinderGeometry(0.36, 0.36, 0.95, 14), 0x6a4a2c, 0.48);
      break;
    case "post":
      add(new THREE.CylinderGeometry(0.12, 0.14, 1.6, 8), 0x4f3c2a, 0.8);
      break;
    case "pillar":
      add(new THREE.CylinderGeometry(0.38, 0.42, 3.2, 12), 0x8a8170, 1.6);
      break;
    case "rubble":
      add(new THREE.DodecahedronGeometry(0.32, 0), 0x57524c, 0.2);
      add(new THREE.DodecahedronGeometry(0.22, 0), 0x57524c, 0.15).position.x = 0.35;
      break;
    case "stalagmite":
      add(new THREE.ConeGeometry(0.35, 1.6, 7), 0x5a5249, 0.8);
      break;
    case "crystal":
      add(new THREE.OctahedronGeometry(0.42, 0), new THREE.Color(style.accent).getHex(), 0.7, { emissive: new THREE.Color(style.accent).multiplyScalar(0.5), roughness: 0.3 });
      break;
    case "brazier": {
      add(new THREE.CylinderGeometry(0.3, 0.18, 0.7, 10), 0x3b3530, 0.35);
      var flame = add(new THREE.ConeGeometry(0.2, 0.45, 8), 0xffa54a, 0.95, { emissive: 0xff7a1a, emissiveIntensity: 1.5 });
      flame.castShadow = false;
      var light = new THREE.PointLight(0xff9a40, 6, 6, 1.8);
      light.position.y = 1.2;
      group.add(light);
      break;
    }
    default:
      add(new THREE.BoxGeometry(0.6, 0.6, 0.6), 0x6b665e, 0.3);
  }
  return group;
}
