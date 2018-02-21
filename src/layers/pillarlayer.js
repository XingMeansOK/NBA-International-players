var THREE = require( '../lib/three.js' );
var Layer = require( '../layer.js' );
var createjs = require( '../lib/tweenjs.js' );

/*
  柱子图层，继承自layer
*/
function PillarLayer( options ) {

  Layer.call( this );

  var pillar = new Pillar( 3000000 );
  var planePosition = [ -102.41356, 37.77577 ]; // 可以有第三个元素，表示离地面的高度
  this.addAtCoordinate(pillar, planePosition, {scaleToLatitude: true});

  pillar = new Pillar( 2000000 );
  planePosition = [ -112.41356, 37.77577 ]; // 可以有第三个元素，表示离地面的高度
  this.addAtCoordinate(pillar, planePosition, {scaleToLatitude: true});

  pillar = new Pillar( 1000000 );
  planePosition = [ -132.41356, 37.77577 ]; // 可以有第三个元素，表示离地面的高度
  this.addAtCoordinate(pillar, planePosition, {scaleToLatitude: true});

}

PillarLayer.prototype = Object.assign( Object.create( Layer.prototype ), {

  constructor: PillarLayer,



} );

/*
  柱子
*/
function Pillar( height ) {

  var SIDE = 100000;

  var geometry = new THREE.BoxGeometry( SIDE, SIDE, 1 );

  geometry.applyMatrix( new THREE.Matrix4().makeTranslation( 0, 0, 0.5 ) ); // x,y,z方向上的平移量
  // 初始的几何体的中心是和世界坐标的原点重合的，这里沿z轴正方向平移，立方体的nz面和世界坐标的原点重合
  // 相当于修改几何体的中心点位置，原来的中心是在几何体的中心，现在是在nz面的中心

  // 柱子的材质
  var material = new THREE.MeshBasicMaterial( {color: 0x00ff00} );
  THREE.Mesh.call( this, geometry, material );

  // this.scale.z就代表了柱子所代表的数据大小
  this.scale.z = 1; // 因为tween是从当前值变化到目标值，所以要先设置下当前值
  this.updateMatrix();

  // 柱子动态生长的特效
  createjs.Tween.get( this )
    .wait( 500 )
    .to( { height: height || 1 }, 1000, createjs.Ease.quartInOut );

}

Pillar.prototype = Object.create( THREE.Mesh.prototype );
Object.defineProperties( Pillar.prototype, {

  height: {
    set: function( newValue ) {
      // 除了这种方式，morphTargetInfluences可以做到更广义的变形，将来研究下
      this.scale.z = Math.max( newValue, 1 );
      // 每次修改之后都要更新矩阵
      this.updateMatrix();
    },
    get: function() {
      return this.scale.z;
    }
  }
} )


module.exports = PillarLayer;
