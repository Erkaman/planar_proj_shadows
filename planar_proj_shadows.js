const webglCanvas = document.body.appendChild(document.createElement('canvas'))
const fit = require('canvas-fit')
const regl = require('regl')({
  canvas: webglCanvas})
const mat4 = require('gl-mat4')
const vec3 = require('gl-vec3')
window.addEventListener('resize', fit(webglCanvas), false)
const bunny = require('bunny')
const normals = require('angle-normals')

const camera = require('regl-camera')(regl, {
  center: [0, 0, 0],
  distance: 130,
  theta:1.57,
  phi: 0.4,
  near: 0.01,
  far: 400
})

// plane geometry arrays.
const planeElements = []
var planePosition = []
var planeNormal = []

var d = 4.0 // plane constant.
var S = 130.0
planePosition.push([-S, -d, -S])
planePosition.push([+S, -d, -S])
planePosition.push([-S, -d, +S])
planePosition.push([+S, -d, +S])

var n = [0.0, 1.0, 0.0] // plane normal.
planeNormal.push(n)
planeNormal.push(n)
planeNormal.push(n)
planeNormal.push(n)

planeElements.push([3, 1, 0])
planeElements.push([0, 2, 3])

// create box geometry.
var boxPosition = [
  // side faces
  [-0.5, +0.5, +0.5], [+0.5, +0.5, +0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5], // positive z face.
  [+0.5, +0.5, +0.5], [+0.5, +0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], // positive x face
  [+0.5, +0.5, -0.5], [-0.5, +0.5, -0.5], [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], // negative z face
  [-0.5, +0.5, -0.5], [-0.5, +0.5, +0.5], [-0.5, -0.5, +0.5], [-0.5, -0.5, -0.5], // negative x face.
  [-0.5, +0.5, -0.5], [+0.5, +0.5, -0.5], [+0.5, +0.5, +0.5], [-0.5, +0.5, +0.5],  // top face
  [-0.5, -0.5, -0.5], [+0.5, -0.5, -0.5], [+0.5, -0.5, +0.5], [-0.5, -0.5, +0.5]  // bottom face
]

const boxElements = [
  [2, 1, 0], [2, 0, 3],
  [6, 5, 4], [6, 4, 7],
  [10, 9, 8], [10, 8, 11],
  [14, 13, 12], [14, 12, 15],
  [18, 17, 16], [18, 16, 19],
  [20, 21, 22], [23, 20, 22]
]

// all the normals of a single block.
var boxNormal = [
  // side faces
  [0.0, 0.0, +1.0], [0.0, 0.0, +1.0], [0.0, 0.0, +1.0], [0.0, 0.0, +1.0],
  [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0], [+1.0, 0.0, 0.0],
  [0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0, -1.0], [0.0, 0.0, -1.0],
  [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, 0.0, 0.0],
  // top
  [0.0, +1.0, 0.0], [0.0, +1.0, 0.0], [0.0, +1.0, 0.0], [0.0, +1.0, 0.0],
  // bottom
  [0.0, -1.0, 0.0], [0.0, -1.0, 0.0], [0.0, -1.0, 0.0], [0.0, -1.0, 0.0]
]

var shadowProj = new Float32Array(16)

// normally draw geometry.
const drawNormal = regl({
  uniforms: {
    lightPos: (_, props, batchId) => { return props.lightPos }
  },

  frag: `
  precision mediump float;
  varying vec3 vNormal;
  varying vec3 vPosition;
  uniform float ambientLightAmount;
  uniform float diffuseLightAmount;
  uniform vec3 color;
  uniform vec3 lightPos;
  void main () {
    // do ambient and diffuse lighting.
    vec3 lightDir = normalize(lightPos - vPosition);
    vec3 ambient = ambientLightAmount * color;
    float cosTheta = dot(vNormal, lightDir);
    vec3 diffuse = diffuseLightAmount * color * clamp(cosTheta , 0.0, 1.0 );

    gl_FragColor = vec4((ambient + diffuse), 1.0);
  }`,
  vert: `
  precision mediump float;
  attribute vec3 position;
  attribute vec3 normal;
  varying vec3 vPosition;
  varying vec3 vNormal;
  uniform mat4 projection, view, model;
  void main() {
    vec4 worldSpacePosition = model * vec4(position, 1);
    vPosition = worldSpacePosition.xyz;
    vNormal = normal;
    gl_Position = projection * view * worldSpacePosition;
  }`
})

// draw shadows by projecting the shadow-casting geometry onto the plane.
const drawShadow = regl({
  uniforms: {
    shadowProj: (_, props, batchId) => { return props.shadowProj }
  },
  depth: {
    enable: false
  },

  frag: `
  precision mediump float;

  void main () {
    gl_FragColor = vec4(vec3(0.4), 1.0);
  }`,
  vert: `
  precision mediump float;
  attribute vec3 position;

  uniform mat4 projection, view, model, shadowProj;

  void main() {
    vec4 worldSpacePosition = model * vec4(position, 1);

    // project onto plane using the shadow projection matrix.
    // then just use the usual view and projection matrices.
    gl_Position = projection * view * (shadowProj * worldSpacePosition);
  }`
})

function Mesh (elements, position, normal) {
  this.elements = elements
  this.position = position
  this.normal = normal
}

Mesh.prototype.draw = regl({
  uniforms: {
    model: (_, props, batchId) => {
      var m = mat4.identity([])

      mat4.translate(m, m, props.translate)

      var s = props.scale
      mat4.scale(m, m, [s, s, s])
      return m
    },
    ambientLightAmount: 0.3,
    diffuseLightAmount: 0.7,
    color: regl.prop('color')
  },
  attributes: {
    position: regl.this('position'),
    normal: regl.this('normal')
  },
  elements: regl.this('elements'),
  cull: {
    enable: true
  }
})

var bunnyMesh = new Mesh(bunny.cells, bunny.positions, normals(bunny.cells, bunny.positions))
var boxMesh = new Mesh(boxElements, boxPosition, boxNormal)
var planeMesh = new Mesh(planeElements, planePosition, planeNormal)

regl.frame(({tick}) => {
  var drawShadowCasters = () => {
    var i
    var theta
    var R
    var r, g, b
    var phi0 = 0.002 * tick
    var phi1 = -0.004 * tick

    // place out from bunnies in a circle.
    for (i = 0; i < 1.0; i += 0.1) {
      theta = Math.PI * 2 * i
      R = 20.0

      r = ((Math.abs(23232 * i * i + 100212) % 255) / 255) * 0.4 + 0.3
      g = ((Math.abs(32278 * i + 213) % 255) / 255) * 0.4 + 0.15
      b = ((Math.abs(3112 * i * i * i + 2137 + i) % 255) / 255) * 0.05 + 0.05

      bunnyMesh.draw({scale: 0.7, translate: [R * Math.cos(theta + phi0), 3.0, R * Math.sin(theta + phi0)], color: [r, g, b]})
    }

    // place out some boxes in a circle.
    for (i = 0; i < 1.0; i += 0.15) {
      theta = Math.PI * 2 * i
      R = 35

      r = ((Math.abs(23232 * i * i + 100212) % 255) / 255) * 0.4 + 0.05
      g = ((Math.abs(32278 * i + 213) % 255) / 255) * 0.3 + 0.4
      b = ((Math.abs(3112 * i * i * i + 2137 + i) % 255) / 255) * 0.4 + 0.4

      boxMesh.draw({scale: 4.2, translate: [R * Math.cos(theta + phi1), 9.0, R * Math.sin(theta + phi1)], color: [r, g, b]})
    }
  }

  // light pos. We move the light up and down.
  var lightPos = [0.0, 30 + 10.0 * Math.sin(0.01 * tick), 0.0]

  // define a matrix for projecting geometry onto a plane defined by the equation
  // dot(n, x) + d = 0,
  // where n is the plane normal.
  // and l is the light position.
  // A derivation of the matrix can be found on page 24 of the book "Real-Time Shadows"
  var l = [lightPos[0], lightPos[1], lightPos[2]]

  // row one.
  shadowProj[0]  = vec3.dot(n,l) + d - n[0]*l[0]
  shadowProj[1]  =                   - n[1]*l[0]
  shadowProj[2]  =                   - n[2]*l[0]
  shadowProj[3]  =                   -    d*l[0]

  // row two.
  shadowProj[4]  =                   - n[0]*l[1]
  shadowProj[5]  = vec3.dot(n,l) + d - n[1]*l[1]
  shadowProj[6]  =                   - n[2]*l[1]
  shadowProj[7]  =                   -    d*l[1]

  // row three
  shadowProj[8]  =                   - n[0]*l[2]
  shadowProj[9]  =                   - n[1]*l[2]
  shadowProj[10] = vec3.dot(n,l) + d - n[2]*l[2]
  shadowProj[11] =                   -    d*l[2]

  // row four.
  shadowProj[12] =                   - n[0]
  shadowProj[13] =                   - n[1]
  shadowProj[14] =                   - n[2]
  shadowProj[15] =                     vec3.dot(n, l)

  mat4.transpose(shadowProj, shadowProj)

  var drawShadowReceivers = () => {
    planeMesh.draw({scale: 1.0, translate: [0.0, 0.0, 0.0], color: [1.0, 1.0, 1.0]})
  }

  camera(() => {
    regl.clear({
      color: [0, 0, 0, 255],
      depth: 1
    })

    // We use the algorithm described in "Real-time shadows."
    // 1. draw shadow receiver.
    // 2. draw shadows, with no z-testing
    // 3. draw the shadow casters.
    // by doing this, we can avoid all z-fighting.
    drawNormal({lightPos: lightPos},() => {
      drawShadowReceivers()
    })
    drawShadow({shadowProj: shadowProj}, () => {
      drawShadowCasters()
    })
    drawNormal({lightPos: lightPos}, () => {
      drawShadowCasters()
    })
  })

})
