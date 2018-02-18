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

    }

    // 先同步一次
    _synchronize();
    // 保持同步
    this.map.on( 'move', function() { _synchronize(); } )

  },

} );

module.exports = LayerContainer;
