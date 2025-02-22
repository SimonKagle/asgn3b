'use strict';

// ColoredPoint.js (c) 2012 matsuda
// Vertex shader program
var VSHADER_SOURCE =`
attribute vec4 a_Position;
attribute vec2 a_UV;
varying vec2 v_UV;
uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;

uniform vec3 u_minAABB;
uniform vec3 u_maxAABB;

uniform int u_doingInstances;
attribute vec3 a_offset;
void main() {
  if (u_doingInstances == 1){

    if (
      u_minAABB.x - 1. > a_offset.x || u_maxAABB.x + 1. < a_offset.x ||
      u_minAABB.y - 1. > a_offset.y || u_maxAABB.y + 1. < a_offset.y ||
      u_minAABB.z - 1. > a_offset.z || u_maxAABB.z + 1. < a_offset.z
    ) return;

    gl_Position = u_ProjectionMatrix * u_ViewMatrix * (a_Position + vec4(a_offset, 0));
    v_UV = a_UV;
  } else {
    gl_Position = u_ProjectionMatrix * u_ViewMatrix * u_ModelMatrix * a_Position;
    v_UV = a_UV;
  }
  
}`;

// Fragment shader program
var FSHADER_SOURCE =`
precision mediump float;
uniform vec4 u_FragColor;
uniform sampler2D u_Sampler0;
uniform sampler2D u_Sampler1;
uniform int u_colorSrc;
varying vec2 v_UV;

void main() {
  if (u_colorSrc == 1) {
    gl_FragColor = u_FragColor;
  } else if (u_colorSrc == 3){
    gl_FragColor = texture2D(u_Sampler0, v_UV);
  } else if (u_colorSrc == 4){
    gl_FragColor = texture2D(u_Sampler1, v_UV);
  }
}`;

let a_Position, a_UV, a_offset, u_ModelMatrix, u_FragColor, 
    u_ViewMatrix, u_ProjectionMatrix, u_Sampler0,
    u_ColorSrc, u_Sampler1, u_doingInstances, u_minAABB, u_maxAABB;

/** @type {Camera} */
let camera;

const moveSpeed = .2;
const panSpeed = 5;

/**
 * Get the canvas and gl context
 * @returns {[WebGLRenderingContext, HTMLCanvasElement]} gl context
 */
function setupWebGL(){
  var canvas = document.getElementById('webgl');

  // Get the rendering context for WebGL
  // var gl = getWebGLContext(canvas);
  var gl = canvas.getContext("webgl", {preserveDrawingBuffer: false});
  if (!gl) {
    throw new Error('Failed to get the rendering context for WebGL');
  }

  return [gl, canvas];
}

/**
 * Compile the shader programs, attach the javascript variables to the GLSL variables
 * @param {WebGLRenderingContext} gl Rendering context
 * @param {string[]} attrs Attributes to locate
 * @param {string[]} unifs Uniforms to locate
 * @returns {[GLint[], WebGLUniformLocation[]]} attribute variables and uniform vairabl
 */
function connectVariablesToGLSL(gl, attrs, unifs){
  var out = [[], []];

  // Initialize shaders
  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    throw new Error('Failed to intialize shaders.');
  }

  // Get the storage location of attributes
  for (var i = 0; i < attrs.length; i++){
    var attr = gl.getAttribLocation(gl.program, attrs[i]);
    if (attr < 0) {
      throw new Error(`Failed to get the storage location of attribute ${attrs[i]}`);
    }
    out[0].push(attr);
  }

  // Get the storage location of uniforms
  for (var i = 0; i < unifs.length; i++){
    var unif = gl.getUniformLocation(gl.program, unifs[i]);
    if (unif < 0) {
      throw new Error(`Failed to get the storage location of uniform ${unifs[i]}`);
    }
    out[1].push(unif);
  }

  return out;
}

/**
 * 
 * @param {WebGLRenderingContext} gl 
 * @param {WebGLTexture} texture 
 * @param {WebGLUniformLocation} u_Sampler 
 * @param {HTMLImageElement} image 
 */
function loadTexture(gl, texture, u_Sampler, image, num) {
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1); // Flip the image's y axis
  // Enable the texture unit num
  gl.activeTexture(gl.TEXTURE0 + num);
  // Bind the texture object to the target
  gl.bindTexture(gl.TEXTURE_2D, texture);
 
  // Set the texture parameters
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, !num ? gl.LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  // Set the texture image
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  gl.generateMipmap(gl.TEXTURE_2D);

  // Set the texture unit 0 to the sampler
  gl.uniform1i(u_Sampler, num);
}

/**
 * Clears canvas
 * @param {WebGLRenderingContext} gl 
 */
function clearCanvas(gl){
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

/**
 * 
 * @param {WebGLRenderingContext} gl 
 * @param {WebGLUniformLocation} u_Sampler 
 */
function initTextures(gl, src, u_Sampler, num){

  var texture = gl.createTexture();
  if (!texture) {
    throw new Error("Could not create texture!");
  }

  // Load image
  var image = new Image();
  if (!image){
    throw new Error("Could not create image");
  }
  image.onload = () => loadTexture(gl, texture, u_Sampler, image, num);
  image.src = src;

}

var world = [
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 4],
  [4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4],
  [4, 2, 0, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 0, 2, 0, 0, 2, 0, 4, 0, 4, 4, 4, 4, 4, 4, 4, 4, 0, 2, 4],
  [4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 2, 0, 4, 0, 4, 0, 0, 0, 0, 0, 0, 4, 0, 2, 4],
  [4, 2, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 0, 2, 2, 0, 2, 0, 4, 0, 4, 0, 4, 4, 4, 4, 0, 4, 0, 2, 4],
  [4, 2, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 2, 0, 2, 0, 4, 0, 4, 0, 4, 0, 0, 4, 0, 4, 0, 2, 4],
  [4, 2, 0, 3, 0, 3, 4, 3, 4, 3, 4, 0, 2, 0, 0, 1, 0, 2, 0, 4, 0, 4, 0, 0, 0, 0, 4, 0, 4, 0, 2, 4],
  [4, 2, 0, 3, 0, 3, 0, 0, 0, 0, 2, 0, 2, 0, 0, 2, 0, 1, 0, 4, 0, 4, 4, 4, 4, 4, 4, 0, 4, 0, 2, 4],
  [4, 2, 0, 2, 0, 3, 0, 1, 0, 0, 2, 0, 2, 0, 0, 1, 0, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 2, 4],
  [4, 2, 0, 1, 0, 3, 0, 0, 2, 0, 2, 0, 2, 0, 0, 2, 0, 1, 0, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 2, 4],
  [4, 2, 0, 1, 0, 3, 0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4],
  [4, 2, 0, 2, 0, 3, 0, 0, 2, 0, 2, 0, 1, 0, 0, 2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4],
  [4, 2, 0, 2, 0, 3, 0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 4],
  [4, 2, 0, 3, 0, 3, 0, 0, 2, 0, 2, 0, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 2, 1, 2, 4],
  [4, 2, 0, 3, 0, 3, 0, 2, 0, 0, 2, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4, 3, 2, 1, 3, 0, 0, 0, 3, 1, 2, 4],
  [4, 2, 0, 3, 0, 3, 0, 0, 1, 0, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 1, 2, 4],
  [4, 2, 0, 3, 0, 3, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 3, 4, 3, 2, 1, 3, 0, 0, 0, 3, 1, 2, 4],
  [4, 2, 0, 4, 0, 2, 0, 0, 2, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 2, 1, 2, 4],
  [4, 2, 0, 4, 0, 2, 0, 1, 0, 2, 0, 1, 0, 1, 0, 4, 0, 4, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 4],
  [4, 2, 0, 4, 0, 2, 0, 0, 2, 0, 2, 0, 2, 0, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4],
  [4, 2, 0, 4, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 4, 4, 4, 4, 4, 4, 4, 4, 0, 2, 0, 2, 4],
  [4, 2, 0, 4, 0, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 1, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 4, 0, 3, 0, 2, 4],
  [4, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 4, 0, 5, 5, 5, 5, 0, 4, 0, 5, 0, 2, 4],
  [4, 2, 0, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 0, 1, 0, 0, 0, 4, 0, 5, 8, 7, 5, 0, 4, 0, 7, 0, 2, 4],
  [4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 0, 0, 0, 4, 0, 5, 9, 6, 5, 0, 4, 0, 9, 0, 2, 4],
  [4, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 1, 1, 1, 1, 1, 0, 5, 5, 5, 5, 0, 4, 0, 7, 0, 2, 4],
  [4, 2, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 5, 0, 2, 4],
  [4, 2, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 4, 4, 0, 3, 0, 2, 4],
  [4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4],
  [4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 4],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
];



var ground = null;
var skybox = null;
var wObj = null;
const cubeSize = .5;
var mouseSensitivity = 0.5;

const frameTimeText = document.getElementById("frameTime");
const fpsText = document.getElementById("fps");
const blockCountText = document.getElementById("blockCount");
const totalCountText = document.getElementById("totalCount");


let cone1 = new Cone(new Matrix4(), [1, 0, 0], .5, 2);
let cone2 = new Cone(new Matrix4(), [0, 1, 0], .5, 1);
let cone3 = new Cone(new Matrix4(), [0, 0, 1], .5, .5);
let cat = new Cat();

var ext;
var ext2;

function main() {


  var [gl, canvas] = setupWebGL();
  init_world();

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(.5, .75, 1, 1.0);

  ext = gl.getExtension('ANGLE_instanced_arrays');
  if (!ext) {
    throw Error("Could not get extension ''ANGLE_instanced_arrays''");
  }

  // ext2 = gl.getExtension('GMAN_webgl_memory');
  // if (!ext) {
  //   throw Error("Could not get extension 'GMAN_webgl_memory'");
  // }

  // setInterval(() => console.log(ext2.getMemoryInfo()), 2000);

  
  [[a_Position, a_UV, a_offset], 
    [u_FragColor, u_ModelMatrix, u_ViewMatrix, 
     u_ProjectionMatrix, u_Sampler0, u_ColorSrc,
     u_Sampler1, u_doingInstances, u_minAABB, u_maxAABB]] = connectVariablesToGLSL(
      gl, ["a_Position", "a_UV", "a_offset"], 
      ["u_FragColor", "u_ModelMatrix", "u_ViewMatrix", 
       "u_ProjectionMatrix", "u_Sampler0", "u_colorSrc", "u_Sampler1",
      "u_doingInstances", "u_minAABB", "u_maxAABB"]
  );

  camera = new Camera(canvas.width/canvas.height);
  gl.uniformMatrix4fv(u_ProjectionMatrix, false, camera.projectionMatrix.elements);

  initTextures(gl, "stonev2.png", u_Sampler0, 0);
  initTextures(gl, "grassv2.png", u_Sampler1, 1);

  // Clear <canvas>
  clearCanvas(gl);

  document.onkeydown = function(ev){
    switch (ev.key){
      case "w":
        camera.moveForwards(moveSpeed);
        break;
      case "s":
        camera.moveBackwards(moveSpeed);
        break;
      case "a":
        camera.moveLeft(moveSpeed);
        break;
      case "d":
        camera.moveRight(moveSpeed);
        break;
      case "q":
        camera.panLeft(panSpeed);
        break;
      case "e":
        camera.panRight(panSpeed);
        break;
      case "k":
        console.log(camera.getSphereInFrustum(new Vector3([1, 1, 1]), cubeSize));
        break;
    }
    wObj.cull(camera);

  }

  canvas.onmousedown = function(ev){
    if (ev.button == 0){
      wObj.changePoint(...camera.at.elements, false);
    } else if (ev.button == 2){
      wObj.changePoint(...camera.at.elements, true);
    }
    wObj.cull(camera);
  }

  canvas.onclick = async (ev) => {
    await canvas.requestPointerLock();
  }

  let yPan = 0;
  const MAX_Y_PAN = 85;
  canvas.onmousemove = (ev) => {

    // Don't pan if mouse is not locked
    if (document.pointerLockElement != canvas) return;

    camera.panRight(ev.movementX * mouseSensitivity);
    yPan += ev.movementY * mouseSensitivity;
    if (Math.abs(yPan) > MAX_Y_PAN){
      yPan = Math.sign(yPan) * MAX_Y_PAN;
    } else {
      camera.panUp(ev.movementY * mouseSensitivity);
    }
    wObj.cull(camera);
  }

  wObj.cull(camera);
  tick(gl);

}

function terrainHeight(x, y){
  let n = Math.floor(Math.sin(y * 0.1) * 5 + 5) + Math.floor(Math.sin(x * 0.1) * 5 + 5);
  return n;
}

const fullWorldSize = 1 << 9;

function init_world(){

  const wallHeight = 1000;
  world[0] = Array(32).fill(wallHeight);
  world[31] = Array(32).fill(wallHeight);
  for (var y = 0; y < world.length; y++){
    world[y][0] = wallHeight;
    world[y][31] = wallHeight;
  }

  let padding = (fullWorldSize - world.length) / 2;
  let newWorld = [];
  for (let y = 0; y < fullWorldSize; y++){
    newWorld.push([])
    for (let x = 0; x < fullWorldSize; x++){
      if (padding <= y && y < fullWorldSize - padding && padding <= x && x < fullWorldSize - padding){
        newWorld[y].push(world[y - padding][x - padding]);
      } else {
        newWorld[y].push(terrainHeight(x, y));
      }
    }
  }

  world = newWorld;

  console.log(world);

  wObj = new World(world, cubeSize);

  skybox = new Cube(new Matrix4(), [.5, .75, 1], [100, wallHeight, 100]);

  ground = new TexCube(new Matrix4(), null, [world[0].length * cubeSize, 0.001, world.length * cubeSize]);
  ground.uvs = ground.uvs.map((i) => i * world[0].length * cubeSize);
  ground.matrix.translate(-cubeSize, -cubeSize, -cubeSize);
  
}

let acc_frame_time = 0;

/**
 * Renders scene
 * @param {WebGLRenderingContext} gl 
 */
function renderScene(gl){

  let start = performance.now();

  clearCanvas(gl);
  gl.uniform1i(u_ColorSrc, 4);
  ground.render(gl, a_Position, a_UV, u_ModelMatrix);
  gl.uniform1i(u_ColorSrc, 3);

  // wObj.render(gl, a_Position, a_UV, u_ModelMatrix);
  let [minPt, maxPt] = camera.getAABB();
  gl.uniform3fv(u_maxAABB, maxPt.elements);
  gl.uniform3fv(u_minAABB, minPt.elements);
  wObj.renderFast(gl, ext, a_Position, a_UV, a_offset, u_doingInstances);

  gl.uniform1i(u_ColorSrc, 1);
  // skybox.render(gl, a_Position, u_FragColor, u_ModelMatrix);

  let catMat = new Matrix4();
  catMat.translate(10, -.2, 0);
  catMat.rotate(0.1 * Date.now(), 0, 1, 0);
  catMat.translate(1, 0, 0);
  cat.render(gl, catMat, 0.1 * Date.now(), a_Position, u_FragColor, u_ModelMatrix);

  catMat.setTranslate(10, -.2, 0);
  catMat.rotate(0.1 * Date.now() + 120, 0, 1, 0);
  catMat.translate(1, 0, 0);
  cat.render(gl, catMat, 0.1 * Date.now(), a_Position, u_FragColor, u_ModelMatrix);

  catMat.setTranslate(10, -.2, 0);
  catMat.rotate(0.1 * Date.now() + 240, 0, 1, 0);
  catMat.translate(1, 0, 0);
  cat.render(gl, catMat, 0.1 * Date.now(), a_Position, u_FragColor, u_ModelMatrix);

  let adjTime = Date.now() * 0.001;
  cone1.matrix.setTranslate(10, .1 * Math.sin(adjTime) + 1, 0);
  cone2.matrix.setTranslate(10, .1 * Math.sin(adjTime + 1.5) + 2, 0);
  cone3.matrix.setTranslate(10, .1 * Math.sin(adjTime + 3) + 3, 0);
  cone1.render(gl, a_Position, u_FragColor, u_ModelMatrix);
  cone2.render(gl, a_Position, u_FragColor, u_ModelMatrix);
  cone3.render(gl, a_Position, u_FragColor, u_ModelMatrix);

  let t = new Cube(new Matrix4(), [1, 0, 1], [cubeSize, cubeSize, cubeSize]);
  t.matrix.translate(1, 1, 1);
  t.render(gl, a_Position, u_FragColor, u_ModelMatrix);

  let curr_frame_time = performance.now() - start
  acc_frame_time += curr_frame_time;
  if (curr_frame_time > 1000/60){
    console.log(curr_frame_time);
  }
  blockCountText.innerText = wObj.block_count.toLocaleString();
  totalCountText.innerHTML = wObj.total_blocks.toLocaleString();
}

var last_time = 0;
var frameNumber = 0;

function tick(gl) {
  gl.uniformMatrix4fv(u_ViewMatrix, false, camera.viewMatrix.elements);
  renderScene(gl);

  function do_frame(ts){
    tick(gl);
    frameNumber++;
  }
  requestAnimationFrame(do_frame);
}

setInterval(()=>{
  let frameTime = 1000 / frameNumber;
  frameTimeText.innerText = Math.round((acc_frame_time / frameNumber) * 100) / 100;
  fpsText.innerText = Math.round(1000 / frameTime);
  frameNumber = 0;
  acc_frame_time = 0;
}, 1000);