var THREE = require( './lib/three.js' );

/*
  MapboxWrapper:  mapboxgl.Map的包装类
  封装了使用threejs对mapboxgl.Map的操作
  @param map MapboxGL的Map对象

        ******实际上，所有的可视化绘制和mapboxgl的绘图上下文没有任何关系，因为根本就不在一个canvas里。
        两个canvas相当于两个图层，我们绘制的三维要素在上层的canvas里，地图在下层的canvas里，然后两者叠加在一起
        看了一下uber的deckgl，也是用了两个canvas，地图一个，三维要素一个
        而echarts-gl甚至用了三个canvas
*/
function MapboxWrapper( map ) {

  // 保存当前对象包装的Map实例的引用
  this.map = map;


  /********初始化自定义三维要素的绘图环境********/

  // 创建渲染器，开启透明绘制和抗锯齿。
  var renderer = this.renderer = new THREE.WebGLRenderer( { alpha: true, antialias: true } );
  // 设置画布尺寸
  // Map对象的transform属性中保存了大量与地图相关的信息，还有很多和Webgl相关的信息
  renderer.setSize( map.transform.width, map.transform.height );
  // 当map大小改变的时候，renderer的canvas也跟着改变
  map.on( 'resize', function() {
    renderer.setSize( map.transform.width, map.transform.height );
  } )
  // 开启阴影贴图
  renderer.shadowMap.enabled = true;

  /*********将渲染器的canvas节点添加到Map的父节点下********/

  map._container.appendChild( renderer.domElement );
  // 修改样式使其覆盖在Map的canvas上
  renderer.domElement.style[ 'position' ] = 'relative';
  // 鼠标事件在传播（捕获、冒泡）过程中将无视renderer的canvas。
  // 如果想让这个canvas的子节点响应鼠标事件，单独设置子节点的pointer-events属性就可以了
  renderer.domElement.style[ 'pointer-events' ] = 'none';
  renderer.domElement.style[ 'z-index' ] = '999';

  /********创建一个和mapboxgl的摄像机完全同步的摄像机*********/

  this.camera = new THREE.PerspectiveCamera( 90, map.transform.width / map.transform.height, 0.1, 10000 ); // 摄像机的初始化参数无所谓
  this.synchronizeCameras(); // 同步three.js摄像机和mapboxgl摄像机，这个函数调用之后两个摄像机将一直保持同步

  /*****创建场景*****/

  this.scene = new THREE.Scene();

  /********渲染场景*********/

  this.animate();

}

Object.assign( MapboxWrapper.prototype, {

  /*
    同步three.js摄像机和mapboxgl摄像机，并保持同步
  */
  synchronizeCameras: function() {

    var map = this.map;
    var camera = this.camera;

    // 确保three摄像机和mapboxgl.map都绑定了
    if( !map || !camera ) return;
    // 同步摄像机的函数，先同步一次
    ( function _synchronizeCameras() {

    }() )

    // 地图从一个视图到另一个视图的转换过程中重复触发
    map.on( 'move', function() { _synchronizeCameras(); } );
  },

  /*
    逐帧渲染
  */
  animate: function () {

    // 传入requestAnimationFrame内的函数的调用者是window，所以要确保这个函数在他的作用域链中能找到当前mapboxWrapper对象的引用
    var scope = this;
    requestAnimationFrame( function() { scope.animate() } );

    this.render();

  },

  /*
    渲染函数
  */
  render: function() {

    // 函数私有的变量

    var lastFrame, currentFrame; // 渲染上一帧的时间，渲染当前帧的时间（用于计算两帧间的时间差）

    return function() {
        this.renderer.render( this.scene, this.camera );
    }

  }(),



} )

module.exports = MapboxWrapper;
