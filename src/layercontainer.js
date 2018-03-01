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
/**
 *     LayerContainer是所有图层的根节点，为了配合mapbox，LayerContainer还包含了坐标变换
 *     LayerContainer继承自Three的Group类
 * @param       {Mapboxgl Map} map    Mapboxgl Map对象
 * @param       {THREE.PespectiveCamera} camera THREE场景的摄像机
 * @constructor
 */
function LayerContainer( map, camera ) {

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

  /**
   * 添加raycaster鼠标交互
   */
  this.raycasterStart( camera );

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

  /**
   * 执行该函数之后，raycaster开始工作
   * @param {THREE.PespectiveCamera} camera Three场景的摄像机
   * @return {[type]} [description]
   *
   * 将来需要处理下兼容性问题
   */
  raycasterStart: function( camera ) {

    // 初始化射线
    var raycaster = new THREE.Raycaster();
    // 用于保存鼠标位置的向量
    var mouse = new THREE.Vector2();
    // 用于保存three画布的宽高
    var SCREEN_WIDTH, SCREEN_HEIGHT;
    // 持有当前LayerContainer对象的引用
    var top = this;
    // picking ray找到的离摄像机最近的Object3D对象
    var nearest;

    // 处理鼠标移动
    document.addEventListener( 'mousemove', _r, false );

    function _r( event ) {

      if( top.children.length < 3 ) return; // 除了两个灯光之外没有其他子节点了，也就是没有加任何图层

      event.preventDefault();

      if( nearest && 'highlight' in nearest ) nearest.highlight = false;

      // 获取canvas尺寸（可能由于窗口变化而变化）
      SCREEN_WIDTH = top.map.transform.width;
      SCREEN_HEIGHT = top.map.transform.height;

      // 鼠标的屏幕坐标转化为规格化设备坐标：坐标范围在-1到1之间
      mouse.x = ( event.clientX / SCREEN_WIDTH ) * 2 - 1;
      mouse.y = - ( event.clientY / SCREEN_HEIGHT ) * 2 + 1;
      /*
        屏幕坐标（原点在左上角，x指向右，y指向下）到规格化设备坐标NDC（原点在屏幕中心，xy都是-1到1）的坐标转换
        x，y为屏幕坐标，XY为NDC坐标，WH为屏幕宽高，这里认为画布是充满整个window
        1.屏幕坐标区间长度映射到2：
          2x/w，2y/h，也就是x坐标区间由0-W变为0-2，y由0-H变为0-2
        2.变换坐标原点：
          2x/w - 1, 2y/h -1
        3.改变y轴方向：
          2x/w - 1, -2y/h + 1
      */

      raycaster.setFromCamera( mouse, camera );
      // 获取LayerContainer中与picking ray相交的子节点的集合； 第二个true表示同时迭代子节点
      var intersects = raycaster.intersectObjects( top.children, true ); // 返回结果[ { distance, point, face, faceIndex, indices, object }, ... ]

      if (!intersects[0]) return

      nearest = intersects[0].object;
      // 高光显示选中的物体
      if( 'highlight' in nearest ) nearest.highlight = true;
      // console.log( nearest );


    }

  }

} );

module.exports = LayerContainer;
