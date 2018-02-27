var THREE = require( './lib/three.js' );
var constants = require( './constant.js' );

/*
   Scene
    \
    LayerContainer --light
     |      \
    Layer  Layer

    LayerContainer是所有图层的根节点，为了配合mapbox，LayerContainer还包含了坐标变换
    LayerContainer继承自Three的Group类
    @param map：Mapboxgl Map对象
*/
function LayerContainer( map ) {

  if( !map ) return;

  THREE.Group.call( this );

  this.map = map;

  // 漫反射光
  this.add( new THREE.AmbientLight( 0xcccccc ) );
  // 方向光
  var sunlight = new THREE.DirectionalLight(0xffffff, 0.5);
  sunlight.position.set(0,800,1000); // 没有设置target，默认指向scene原点的一个object3d对象
  sunlight.matrixWorldNeedsUpdate = true;
  this.add(sunlight);


  /****初始化顶层节点的变换矩阵，为了同步mapbox****/

  // 原点是在（256,256,0）？？？？？？这个目前还不太确定，不过对应于mapbox transform中的一步变换
  this.position.x = this.position.y = constants.WORLD_SIZE / 2;
  // 手动更新变换矩阵
  this.matrixAutoUpdate = false;
  // 开始与map保持同步
  this.syncStart();

}

LayerContainer.prototype = Object.assign( Object.create( THREE.Group.prototype ), {

	constructor: LayerContainer,

  syncStart: function() {

    var top = this;
    var transform = this.map.transform;
    var TILESIZE = 512;

    function _synchronize() {

      // 计算顶层layerContainer的变换矩阵，使其与地图的平移和缩放同步（同步model矩阵），（平移只在xoy面内）

      // transform.scale = Math.pow(2, zoom)，2的zoom次幂。zoom是地图的缩放级别，0-22，可以是小数
      var zoomPow = transform.scale;
      var scale = new THREE.Matrix4();
      var translateCenter = new THREE.Matrix4();
      var translateMap = new THREE.Matrix4();
      var rotateMap = new THREE.Matrix4();

      scale.makeScale( zoomPow, zoomPow , zoomPow );
      translateCenter.makeTranslation( TILESIZE / 2, -TILESIZE / 2, 0 ); // ????
      translateMap.makeTranslation( -transform.x, transform.y, 0 );
      rotateMap.makeRotationZ( Math.PI );
      top.matrix = new THREE.Matrix4();
      top.matrix
          .premultiply( rotateMap )
          .premultiply( translateCenter )
          .premultiply( scale )
          .premultiply( translateMap )

      top.matrixWorldNeedsUpdate = true; // 如果不设置为true就是不会更新matrixWorld，但是没影响啊，为啥？？？？？？
      /**
       * 为什么这里修改的是matrix而不是像相机一样修改matrixWorld？
       * 实际上是一样的。因为layerContainer的父节点就是scene了，而scene没有任何变换
       */

    }

    // 先同步一次
    _synchronize();
    // 保持同步
    this.map.on( 'move', function() { _synchronize(); } )

  },

} );

module.exports = LayerContainer;
