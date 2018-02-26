var THREE = require( './lib/three.js' );

/*
  继承自three PerspectiveCamera的摄像机类
  会自动同步mapboxgl 的摄影矩阵和视图矩阵
  @param map：Mapboxgl Map实例，要同步到的map实例
*/
function AutoCamera( map ) {

  if( !map ) return;

  // 相机的初始化参数无所谓，马上就会同步
	THREE.PerspectiveCamera.call( this, 90, map.transform.width / map.transform.height, 0.1, 10000 );

  this.map = map;

  // 设置为true时，每一帧都会重新计算matrix矩阵，并重新计算matrixWorld，这里要手动控制摄像机姿态，所以设置为false。
  this.matrixAutoUpdate = false;
  // 开启同步
  this.syncStart();

}

AutoCamera.prototype = Object.assign( Object.create( THREE.PerspectiveCamera.prototype ), {

	constructor: AutoCamera,

  syncStart: function() {

    var FOV = 0.6435011087932844; // 摄像机fovy，是个固定值
    var HALFFOV = FOV / 2; // 摄像机fovy的一半
    var camera = this;
    var transform = this.map.transform;
    // mapboxgl的map有一个transform属性，是一个Transform类型的对象实例，其源码位于mapbox-gl-js/src/geo/transform.js
    // transform记录了MVP矩阵信息，每次改变姿态都会调用transform._calcMatrices()方法
    // 来重新计算mapbox的mvp矩阵
    // 重构transform._calcMatrices()方法，将mvp矩阵分离成m和vp矩阵分别同步，同步摄像机就是同步v、p矩阵，m矩阵的同步在layerContainer内完成

    function _synchronize() {
     // mapboxgl的摄像机运动规律：
     /*
       前提：map的canvas大小不变。
       视锥：视锥只有在摄像机与地图平面的倾角（map.transform.pitch）改变时，改变远截面的位置。其余都不变
       摄像机位置：摄像机相对世界坐标原点的距离始终不变，改变视线方向是使摄像机，绕x轴或z轴旋转（想象下手柄摇杆，手动挡那种）
       平移：移动的是地图，但是仅限于xy平面内。改变地图的全局变换矩阵
       缩放：改变的是地图，因为摄像机的距离和fov都没变。缩放的过程中还有地图的分级问题
     */

     /*****计算视锥（投影矩阵）******/

     // 摄像机到世界坐标原点的距离
     var cameraToCenterDistance = 0.5 / Math.tan( FOV / 2 ) * transform.height; // height是mapboxgl canvas的高度（pixel）

     /*
       只要窗口尺寸不变，canvas大小就不变，map.transform.height就不变
       至于为什么一个像素单位等于webgl世界坐标系中一个单位长度，_calcMatrices中有这样一句注释：
       1 Z unit is equivalent to 1 horizontal px at the center of the map
       (the distance between[width/2, height/2] and [width/2 + 1, height/2])

       1米单位长度与像素的换算关系为
       1米 = 屏幕分辨率的高/裁剪面的高 = h / (2*tan(HALFFOV)*z) = 1的话，所以z = h/(2*tan(HALFFOV))
       这样就保证了一个单位长度转换成了一个像素
     */

     var groundAngle = Math.PI / 2 + transform._pitch; // pitch只能绕x轴正方向旋转（右手定则），最大60度
     // 视锥上截面与xoy平面交线的中点到世界坐标原点的距离
     var topHalfSurfaceDistance = Math.sin( HALFFOV ) * cameraToCenterDistance / Math.sin( Math.PI - groundAngle - HALFFOV );
     // Calculate z distance of the farthest fragment that should be rendered.
     var furthestDistance = Math.cos( Math.PI / 2 - transform._pitch ) * topHalfSurfaceDistance + cameraToCenterDistance;
     // Add a bit extra to avoid precision problems when a fragment's distance is exactly `furthestDistance`
     var farZ = furthestDistance * 1.01; // 视锥远截面位置get

     // 计算投影矩阵
     camera.projectionMatrix = _calcPerspectiveMatrix( FOV, transform.width / transform.height, 1, farZ );

     /*****计算摄像机的位置姿态（视图矩阵）*****/

     // 参照threebox的代码，将投影矩阵和坐标变换分开
     var cameraWorldMatrix = new THREE.Matrix4();
     var cameraTranslateZ = new THREE.Matrix4().makeTranslation( 0, 0, cameraToCenterDistance );
     var cameraRotateX = new THREE.Matrix4().makeRotationX( transform._pitch );
     var cameraRotateZ = new THREE.Matrix4().makeRotationZ( transform.angle );

     // mapboxgl中的做法是将地图的投影、平移旋转等变换都弄在一个矩阵里
     cameraWorldMatrix
         .premultiply( cameraTranslateZ )
         .premultiply( cameraRotateX )
         .premultiply( cameraRotateZ )

     camera.matrixWorld.copy( cameraWorldMatrix ); // 平移和缩放都不会改变这个矩阵，只有旋转会

   }

   /**
    * 计算投影矩阵的函数
    * @param       {Number} fovy   视锥上下截面夹
    * @param       {Number} aspect 宽高比
    * @param       {Number} near   近截面
    * @param       {Number} far    远截面
    * @constructor
    * @return      {THREE.Matrix4}  投影矩阵
    */
   function _calcPerspectiveMatrix( fovy, aspect, near, far ) {
      var out = new THREE.Matrix4();
      var f = 1.0 / Math.tan( fovy / 2 ),
      nf = 1 / ( near - far );
      out.elements[0] = f / aspect;
      out.elements[1] = 0;
      out.elements[2] = 0;
      out.elements[3] = 0;
      out.elements[4] = 0;
      out.elements[5] = f;
      out.elements[6] = 0;
      out.elements[7] = 0;
      out.elements[8] = 0;
      out.elements[9] = 0;
      out.elements[10] = ( far + near ) * nf;
      out.elements[11] = -1;
      out.elements[12] = 0;
      out.elements[13] = 0;
      out.elements[14] = ( 2 * far * near ) * nf;
      out.elements[15] = 0;
      return out;
    }

   _synchronize();

   this.map.on( 'move', function() { _synchronize(); } )

  },


} );

module.exports = AutoCamera;
